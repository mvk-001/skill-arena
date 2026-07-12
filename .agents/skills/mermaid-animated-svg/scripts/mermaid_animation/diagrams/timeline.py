#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from typing import Iterable

from mermaid_animation.common import (
    Candidate,
    ancestor_has_class_fragment,
    class_tokens,
    collapsed_text,
    edge_endpoints,
    effect_for,
    has_class_fragment,
    has_lower_class,
    local_name,
    normalized,
    translate_position,
)


def is_timeline_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "timeline"


def discover_timeline_candidates(
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    dom_order: dict[ET.Element, int],
) -> list[Candidate]:
    selected: set[ET.Element] = set()
    candidates: list[Candidate] = []

    def add_candidate(element: ET.Element, role: str, extra_classes: Iterable[str] = ()) -> None:
        if element in selected:
            return
        selected.add(element)
        classes = class_tokens(element)
        for extra_class in extra_classes:
            if extra_class not in classes:
                classes.append(extra_class)
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

    for element in root.iter():
        tag = local_name(element.tag)
        lower_tokens = {token.lower() for token in class_tokens(element)}

        if "taskwrapper" in lower_tokens:
            add_candidate(element, "label", ["timeline-date"])
            continue

        if "eventwrapper" in lower_tokens:
            add_candidate(element, "item", ["timeline-event"])
            continue

        if "linewrapper" in lower_tokens:
            for child in element:
                if local_name(child.tag) == "line":
                    add_candidate(child, "edge", ["lineWrapper", "timeline-line"])
            continue

        if tag == "text" and collapsed_text(element):
            if not ancestor_has_class_fragment(element, parent_map, "timeline-node"):
                add_candidate(element, "label", ["timeline-title"])
            continue

        if tag != "g" or "timeline-node" in lower_tokens or lower_tokens:
            continue
        if ancestor_has_class_fragment(element, parent_map, "taskWrapper") or ancestor_has_class_fragment(
            element, parent_map, "eventWrapper"
        ):
            continue
        if collapsed_text(element) and any(has_lower_class(child, "timeline-node") for child in element):
            add_candidate(element, "label", ["timeline-section-title"])

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


def first_node_line_center_x(element: ET.Element) -> float | None:
    for child in element.iter():
        if local_name(child.tag) != "line" or not has_class_fragment(child, "node-line"):
            continue
        x1 = numeric_attribute(child, "x1")
        x2 = numeric_attribute(child, "x2")
        if x1 is not None and x2 is not None:
            return (x1 + x2) / 2
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


def timeline_candidate_position(candidate: Candidate) -> tuple[float, float] | None:
    if candidate.role == "edge":
        endpoints = edge_endpoints(candidate)
        if endpoints is None:
            return None
        start, end = endpoints
        return min(start[0], end[0]), min(start[1], end[1])

    translated = translate_position(candidate.element)
    if translated is not None:
        center_x = first_node_line_center_x(candidate.element)
        if center_x is not None:
            return translated[0] + center_x, translated[1]
        return translated

    if local_name(candidate.element.tag) == "text":
        x = numeric_attribute(candidate.element, "x")
        y = numeric_attribute(candidate.element, "y")
        if x is not None and y is not None:
            return x, y

    return first_text_position(candidate.element)


def timeline_dynamic_key(candidate: Candidate) -> tuple[int, float, int, float, int]:
    position = timeline_candidate_position(candidate)
    if position is None:
        return 1, 0.0, 0 if candidate.role == "edge" else 1, 0.0, candidate.dom_index
    return (
        0,
        position[0],
        0 if candidate.role == "edge" else 1,
        position[1],
        candidate.dom_index,
    )


def plan_timeline_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    if args.animation == "auto":
        static_labels = sorted(
            [candidate for candidate in candidates if candidate_has_class(candidate, "timeline-title")],
            key=lambda candidate: candidate.dom_index,
        )
        static_ids = {id(candidate) for candidate in static_labels}

        def auto_dynamic_key(candidate: Candidate) -> tuple[int, float, int, float, int]:
            position = timeline_candidate_position(candidate)
            if position is None:
                return 1, 0.0, 99, 0.0, candidate.dom_index
            if candidate_has_class(candidate, "timeline-section-title"):
                role_rank = 0
                effective_x = position[0] - 200.0
            elif candidate_has_class(candidate, "timeline-date"):
                role_rank = 1
                effective_x = position[0]
            elif candidate.role == "edge":
                role_rank = 2
                effective_x = position[0]
            else:
                role_rank = 3
                effective_x = position[0]
            return 0, effective_x, role_rank, position[1], candidate.dom_index

        dynamic_candidates = sorted(
            [candidate for candidate in candidates if id(candidate) not in static_ids],
            key=auto_dynamic_key,
        )

        if not static_labels and not dynamic_candidates:
            return []

        for candidate in static_labels:
            candidate.effect = "none"
            candidate.delay_ms = 0.0
            candidate.duration_ms = 0.0

        duration = float(args.duration_ms)
        if args.total_ms is not None and len(dynamic_candidates) > 1:
            available = float(args.total_ms) - float(args.initial_delay_ms) - duration
            stagger = max(duration + float(args.stagger_ms), available / (len(dynamic_candidates) - 1))
        else:
            stagger = float(args.stagger_ms)

        for index, candidate in enumerate(dynamic_candidates):
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = float(args.initial_delay_ms) + (index * stagger)
            candidate.duration_ms = duration
            candidate.stage = index

        return [*static_labels, *dynamic_candidates]

    static_labels = sorted(
        [
            candidate
            for candidate in candidates
            if candidate_has_class(candidate, "timeline-title")
            or candidate_has_class(candidate, "timeline-section-title")
            or candidate_has_class(candidate, "timeline-date")
        ],
        key=lambda candidate: (timeline_candidate_position(candidate) or (0.0, 0.0), candidate.dom_index),
    )
    static_ids = {id(candidate) for candidate in static_labels}
    dynamic_candidates = sorted(
        [candidate for candidate in candidates if id(candidate) not in static_ids],
        key=timeline_dynamic_key,
    )

    if not static_labels and not dynamic_candidates:
        return []

    for candidate in static_labels:
        candidate.effect = "none"
        candidate.delay_ms = 0.0
        candidate.duration_ms = 0.0

    duration = float(args.duration_ms)
    if args.total_ms is not None and len(dynamic_candidates) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stagger = max(0.0, available / (len(dynamic_candidates) - 1))
    else:
        stagger = float(args.stagger_ms)

    for index, candidate in enumerate(dynamic_candidates):
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * stagger)
        candidate.duration_ms = duration
        candidate.stage = index

    return [*static_labels, *dynamic_candidates]
