#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET
from typing import Iterable

from mermaid_animation.common import Candidate, class_tokens, effect_for, local_name, normalized


def is_journey_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "journey"


def has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def class_starts_with(element: ET.Element, prefix: str) -> bool:
    return any(value.lower().startswith(prefix.lower()) for value in class_tokens(element))


def visible_text(element: ET.Element) -> str:
    parts: list[str] = []
    seen: set[str] = set()

    def visit(node: ET.Element) -> None:
        if local_name(node.tag) in {"title", "desc"}:
            return
        if node.text:
            add_text(node.text)
        for child in node:
            visit(child)
            if child.tail:
                add_text(child.tail)

    def add_text(value: str) -> None:
        text = re.sub(r"\s+", " ", value.strip())
        key = normalized(text)
        if text and key not in seen:
            seen.add(key)
            parts.append(text)

    visit(element)
    return " ".join(parts)


def direct_child_with_class(element: ET.Element, token: str) -> ET.Element | None:
    for child in element:
        if has_class(child, token):
            return child
    return None


def is_section_group(element: ET.Element) -> bool:
    return local_name(element.tag) == "g" and direct_child_with_class(element, "journey-section") is not None


def is_task_group(element: ET.Element) -> bool:
    if local_name(element.tag) != "g":
        return False
    if direct_child_with_class(element, "task-line") is not None:
        return True
    return any(
        local_name(child.tag) == "rect" and has_class(child, "task") and class_starts_with(child, "task-type-")
        for child in element
    )


def inherited_classes(element: ET.Element, extra_classes: Iterable[str]) -> list[str]:
    classes = class_tokens(element)
    for child in element:
        for token in class_tokens(child):
            if (
                token in {"journey-section", "task", "task-line", "face"}
                or token.startswith("section-type-")
                or token.startswith("task-type-")
            ) and token not in classes:
                classes.append(token)
    for extra_class in extra_classes:
        if extra_class not in classes:
            classes.append(extra_class)
    return classes


def discover_journey_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        if is_section_group(element):
            candidates.append(
                Candidate(
                    element=element,
                    role="cluster",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=inherited_classes(element, ["journey-section-column"]),
                    text=visible_text(element),
                )
            )
            continue

        if is_task_group(element):
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=inherited_classes(element, ["journey-task-column"]),
                    text=visible_text(element),
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


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def section_position(candidate: Candidate) -> tuple[float, float] | None:
    section = direct_child_with_class(candidate.element, "journey-section")
    if section is None:
        return None
    x = numeric_attribute(section, "x")
    y = numeric_attribute(section, "y")
    if x is None or y is None:
        return None
    return x, y


def task_position(candidate: Candidate) -> tuple[float, float] | None:
    for child in candidate.element:
        if local_name(child.tag) == "rect" and has_class(child, "task") and class_starts_with(child, "task-type-"):
            x = numeric_attribute(child, "x")
            y = numeric_attribute(child, "y")
            if x is not None and y is not None:
                return x, y

    line = direct_child_with_class(candidate.element, "task-line")
    if line is None:
        return None
    x = numeric_attribute(line, "x1")
    y = numeric_attribute(line, "y1")
    if x is None or y is None:
        return None
    return x, y


def journey_position(candidate: Candidate) -> tuple[float, float] | None:
    if candidate_has_class(candidate, "journey-section-column"):
        return section_position(candidate)
    if candidate_has_class(candidate, "journey-task-column"):
        return task_position(candidate)
    return None


def journey_role_rank(candidate: Candidate) -> int:
    if candidate_has_class(candidate, "journey-section-column"):
        return 0
    if candidate_has_class(candidate, "journey-task-column"):
        return 1
    return 2


def column_key(candidate: Candidate) -> float:
    position = journey_position(candidate)
    if position is None:
        return float("inf")
    return round(position[0], 3)


def candidate_key(candidate: Candidate) -> tuple[int, float, int, float, int]:
    position = journey_position(candidate)
    if position is None:
        return 1, 0.0, journey_role_rank(candidate), 0.0, candidate.dom_index
    return 0, position[0], journey_role_rank(candidate), position[1], candidate.dom_index


def plan_journey_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    ordered = sorted(candidates, key=candidate_key)
    if not ordered:
        return []

    stage_keys = sorted({column_key(candidate) for candidate in ordered})
    stage_by_key = {key: index for index, key in enumerate(stage_keys)}
    duration = float(args.duration_ms)

    if args.total_ms is not None and len(stage_keys) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stagger = max(0.0, available / (len(stage_keys) - 1))
    else:
        stagger = float(args.stagger_ms)

    for candidate in ordered:
        stage = stage_by_key[column_key(candidate)]
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (stage * stagger)
        candidate.duration_ms = duration
        candidate.stage = stage

    return ordered
