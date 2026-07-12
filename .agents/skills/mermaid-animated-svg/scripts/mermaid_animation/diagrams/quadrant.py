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
    class_tokens,
    collapsed_text,
    effect_for,
    has_lower_class,
    local_name,
    normalized,
)


def is_quadrant_chart_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "quadrantchart"


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def add_classes(classes: list[str], extra_classes: Iterable[str]) -> list[str]:
    result = [*classes]
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def first_circle_position(element: ET.Element) -> tuple[float, float] | None:
    for child in element.iter():
        if local_name(child.tag) != "circle":
            continue
        x = numeric_attribute(child, "cx")
        y = numeric_attribute(child, "cy")
        if x is not None and y is not None:
            return x, y
    return None


def quadrant_rect_bounds(root: ET.Element) -> tuple[float, float, float, float] | None:
    rect_bounds: list[tuple[float, float, float, float]] = []
    for element in root.iter():
        if local_name(element.tag) != "g" or not has_lower_class(element, "quadrant"):
            continue
        for child in element:
            if local_name(child.tag) != "rect":
                continue
            x = numeric_attribute(child, "x")
            y = numeric_attribute(child, "y")
            width = numeric_attribute(child, "width")
            height = numeric_attribute(child, "height")
            if x is not None and y is not None and width is not None and height is not None:
                rect_bounds.append((x, y, width, height))
                break

    if len(rect_bounds) < 4:
        return None

    min_x = min(x for x, _, _, _ in rect_bounds)
    min_y = min(y for _, y, _, _ in rect_bounds)
    max_x = max(x + width for x, _, width, _ in rect_bounds)
    max_y = max(y + height for _, y, _, height in rect_bounds)
    return min_x, min_y, max_x, max_y


def quadrant_for_position(
    position: tuple[float, float], bounds: tuple[float, float, float, float] | None
) -> int | None:
    if bounds is None:
        return None

    min_x, min_y, max_x, max_y = bounds
    x, y = position
    mid_x = min_x + ((max_x - min_x) / 2)
    mid_y = min_y + ((max_y - min_y) / 2)

    if x >= mid_x and y < mid_y:
        return 1
    if x < mid_x and y < mid_y:
        return 2
    if x < mid_x and y >= mid_y:
        return 3
    return 4


def discover_quadrant_chart_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []
    bounds = quadrant_rect_bounds(root)

    for element in root.iter():
        if local_name(element.tag) != "g" or not has_lower_class(element, "data-point"):
            continue

        position = first_circle_position(element)
        quadrant = quadrant_for_position(position, bounds) if position is not None else None
        extra_classes = ["quadrant-chart-point"]
        if quadrant is not None:
            extra_classes.append(f"quadrant-{quadrant}")

        candidates.append(
            Candidate(
                element=element,
                role="node",
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=add_classes(class_tokens(element), extra_classes),
                text=collapsed_text(element),
                branch_index=quadrant - 1 if quadrant is not None else None,
            )
        )

    return candidates


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def point_position(candidate: Candidate) -> tuple[float, float] | None:
    return first_circle_position(candidate.element)


def quadrant_index(candidate: Candidate) -> int:
    for index in range(1, 5):
        if candidate_has_class(candidate, f"quadrant-{index}"):
            return index
    return 99


def point_order_key(candidate: Candidate) -> tuple[int, float, float, int]:
    position = point_position(candidate)
    if position is None:
        return quadrant_index(candidate), 0.0, 0.0, candidate.dom_index
    x, y = position
    return quadrant_index(candidate), y, x, candidate.dom_index


def reading_point_order_key(candidate: Candidate) -> tuple[int, float, float, int]:
    position = point_position(candidate)
    quadrant_order = {2: 0, 1: 1, 3: 2, 4: 3}
    quadrant = quadrant_index(candidate)
    if position is None:
        return quadrant_order.get(quadrant, 99), 0.0, 0.0, candidate.dom_index
    x, y = position
    return quadrant_order.get(quadrant, 99), y, x, candidate.dom_index


def plan_quadrant_chart_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    ordered = sorted(
        candidates,
        key=reading_point_order_key if effective_animation == "quadrant-points" else point_order_key,
    )
    if not ordered:
        return []

    animation = "sequence" if effective_animation == "quadrant-points" else effective_animation
    duration = float(args.duration_ms)
    if args.total_ms is not None and len(ordered) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stagger = max(0.0, available / (len(ordered) - 1))
    else:
        stagger = float(args.stagger_ms)

    for index, candidate in enumerate(ordered):
        quadrant = quadrant_index(candidate)
        candidate.effect = effect_for(animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * stagger)
        candidate.duration_ms = duration
        candidate.stage = index
        candidate.branch_index = quadrant - 1 if quadrant <= 4 else None

    return ordered
