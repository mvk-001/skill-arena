#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET

from mermaid_animation.common import (
    Candidate,
    TRANSFORM_EFFECTS,
    class_tokens,
    collapsed_text,
    effect_for,
    has_lower_class,
    local_name,
    normalized,
    ordered_reveal_key,
    slug,
)


def is_venn_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    return role == "venn" or has_lower_class(root, "venn")


def discover_venn_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        if local_name(element.tag) != "g":
            continue
        lower_tokens = {token.lower() for token in class_tokens(element)}
        if "venn-area" not in lower_tokens:
            continue
        classes = class_tokens(element)
        data_sets = element.get("data-venn-sets", "")
        if data_sets:
            classes.append(f"venn-sets-{slug(data_sets.replace('_', ' '))}")
        if "venn-circle" in lower_tokens:
            role = "node"
        elif "venn-intersection" in lower_tokens:
            role = "label"
        else:
            role = "item"
        candidates.append(
            Candidate(
                element=element,
                role=role,
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=classes,
                text=collapsed_text(element),
            )
        )

    return candidates


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def first_path_move_position(element: ET.Element) -> tuple[float, float] | None:
    number = r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?"
    for child in element.iter():
        if local_name(child.tag) != "path":
            continue
        match = re.search(rf"[Mm]\s*({number})(?:[,\s]+)({number})", child.get("d", ""))
        if match:
            return float(match.group(1)), float(match.group(2))
    return None


def first_text_position(element: ET.Element) -> tuple[float, float] | None:
    for child in element.iter():
        if local_name(child.tag) != "text":
            continue
        x = numeric_attribute(child, "x")
        y = numeric_attribute(child, "y")
        if x is not None and y is not None:
            return x, y
    return None


def venn_candidate_position(candidate: Candidate) -> tuple[float, float] | None:
    if "venn-circle" in {token.lower() for token in candidate.classes}:
        return first_path_move_position(candidate.element) or first_text_position(candidate.element)
    return first_text_position(candidate.element) or first_path_move_position(candidate.element)


def venn_set_count(candidate: Candidate) -> int:
    raw_sets = candidate.element.get("data-venn-sets", "")
    if not raw_sets:
        return 1
    return len([name for name in raw_sets.split("_") if name])


def effect_for_venn_candidate(animation: str, candidate: Candidate) -> str:
    effect = effect_for(animation, candidate.role)
    if "venn-circle" in {token.lower() for token in candidate.classes} and effect in TRANSFORM_EFFECTS:
        return "fade"
    return effect


def plan_venn_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    set_candidates = [
        candidate
        for candidate in candidates
        if "venn-circle" in {token.lower() for token in candidate.classes}
    ]
    union_candidates = [
        candidate
        for candidate in candidates
        if "venn-intersection" in {token.lower() for token in candidate.classes}
    ]
    special_ids = {id(candidate) for candidate in [*set_candidates, *union_candidates]}
    other_candidates = [candidate for candidate in candidates if id(candidate) not in special_ids]

    if not set_candidates and not union_candidates:
        return []

    def set_key(candidate: Candidate) -> tuple[int, float, int]:
        position = venn_candidate_position(candidate)
        if position is None:
            return 1, 0.0, candidate.dom_index
        return 0, -position[1], candidate.dom_index

    ordered = [
        *sorted(set_candidates, key=set_key),
        *sorted(other_candidates, key=ordered_reveal_key),
        *sorted(union_candidates, key=lambda candidate: (venn_set_count(candidate), candidate.dom_index)),
    ]

    duration = float(args.duration_ms)
    step_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(ordered) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        step_gap = max(step_gap, available / (len(ordered) - 1))

    for index, candidate in enumerate(ordered):
        candidate.effect = effect_for_venn_candidate(effective_animation, candidate)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * step_gap)
        candidate.duration_ms = duration
        candidate.stage = index

    return ordered
