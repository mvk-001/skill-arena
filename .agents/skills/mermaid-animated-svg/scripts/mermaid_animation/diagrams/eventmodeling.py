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
    edge_endpoints,
    effect_for,
    local_name,
    nearest_candidate,
    normalized,
    plan_staged_items_with_following_connections,
)


def is_event_modeling_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "eventmodeling"


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def first_rect_bounds(element: ET.Element) -> tuple[float, float, float, float] | None:
    for child in element.iter():
        if local_name(child.tag) != "rect":
            continue
        x = numeric_attribute(child, "x")
        y = numeric_attribute(child, "y")
        width = numeric_attribute(child, "width")
        height = numeric_attribute(child, "height")
        if x is not None and y is not None and width is not None and height is not None:
            return x, y, width, height
    return None


def center_of_bounds(bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    x, y, width, height = bounds
    return x + (width / 2), y + (height / 2)


def contains_y(bounds: tuple[float, float, float, float], y: float) -> bool:
    _, top, _, height = bounds
    return top <= y <= top + height


def add_classes(classes: list[str], extra_classes: Iterable[str]) -> list[str]:
    result = [*classes]
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def discover_event_modeling_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    event_lane_bounds: tuple[float, float, float, float] | None = None
    for element in root.iter():
        lower_tokens = {token.lower() for token in class_tokens(element)}
        if "em-swimlane" not in lower_tokens:
            continue
        if normalized(collapsed_text(element)) == "events":
            event_lane_bounds = first_rect_bounds(element)
            break

    candidates: list[Candidate] = []
    for element in root.iter():
        lower_tokens = {token.lower() for token in class_tokens(element)}
        classes = class_tokens(element)
        extra_classes: list[str] = []
        role: str | None = None

        if "em-swimlane" in lower_tokens:
            role = "row"
            extra_classes.append("eventmodeling-swimlane")
        elif "em-box" in lower_tokens:
            role = "node"
            extra_classes.append("eventmodeling-box")
            bounds = first_rect_bounds(element)
            if bounds is not None and event_lane_bounds is not None:
                _, center_y = center_of_bounds(bounds)
                if contains_y(event_lane_bounds, center_y):
                    extra_classes.append("eventmodeling-event")
        elif "em-relation" in lower_tokens:
            role = "edge"
            extra_classes.append("eventmodeling-relation")

        if role is None:
            continue

        candidates.append(
            Candidate(
                element=element,
                role=role,
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=add_classes(classes, extra_classes),
                text=collapsed_text(element),
            )
        )

    return candidates


def candidate_position(candidate: Candidate) -> tuple[float, float] | None:
    if candidate.role == "edge":
        endpoints = edge_endpoints(candidate)
        if endpoints is not None:
            return endpoints[0]

    bounds = first_rect_bounds(candidate.element)
    if bounds is not None:
        return center_of_bounds(bounds)

    return None


def dynamic_key(candidate: Candidate) -> tuple[int, float, int, float, int]:
    position = candidate_position(candidate)
    if position is None:
        return 1, 0.0, 0 if candidate.role == "edge" else 1, 0.0, candidate.dom_index
    x, y = position
    return (
        0,
        x,
        1 if candidate.role == "edge" else 0,
        y,
        candidate.dom_index,
    )


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def event_index_for_position(position_x: float, event_positions: list[float]) -> int | None:
    if not event_positions:
        return None
    for index, event_x in enumerate(event_positions):
        if position_x <= event_x:
            return index
    return len(event_positions) - 1


def edge_event_index(candidate: Candidate, event_positions: list[float]) -> int | None:
    endpoints = edge_endpoints(candidate)
    if endpoints is None:
        position = candidate_position(candidate)
        if position is None:
            return None
        return event_index_for_position(position[0], event_positions)

    start, end = endpoints
    left = min(start[0], end[0])
    right = max(start[0], end[0])
    for index, event_x in enumerate(event_positions):
        if left <= event_x <= right:
            return index
    return event_index_for_position((left + right) / 2, event_positions)


def event_order_key(candidate: Candidate, event_positions: list[float]) -> tuple[int, int, float, int, float, int]:
    position = candidate_position(candidate)
    if candidate.role == "edge":
        event_index = edge_event_index(candidate, event_positions)
    elif position is not None:
        event_index = event_index_for_position(position[0], event_positions)
    else:
        event_index = None

    base_key = dynamic_key(candidate)
    return (
        1 if event_index is None else 0,
        event_index if event_index is not None else 0,
        base_key[1],
        base_key[2],
        base_key[3],
        base_key[4],
    )


def plan_event_modeling_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    row_candidates = sorted(
        [candidate for candidate in candidates if candidate.role == "row"],
        key=lambda candidate: (candidate_position(candidate) or (0.0, 0.0), candidate.dom_index),
    )
    dynamic_candidates = [candidate for candidate in candidates if candidate.role != "row"]
    event_candidates = sorted(
        [candidate for candidate in dynamic_candidates if candidate_has_class(candidate, "eventmodeling-event")],
        key=dynamic_key,
    )
    event_positions = [
        position[0]
        for candidate in event_candidates
        if (position := candidate_position(candidate)) is not None
    ]
    node_candidates = sorted(
        [candidate for candidate in dynamic_candidates if candidate.role == "node"],
        key=lambda candidate: event_order_key(candidate, event_positions),
    )
    edge_candidates = sorted(
        [candidate for candidate in dynamic_candidates if candidate.role == "edge"],
        key=lambda candidate: event_order_key(candidate, event_positions),
    )

    if not row_candidates and not dynamic_candidates:
        return []

    for candidate in row_candidates:
        candidate.effect = "none"
        candidate.delay_ms = 0.0
        candidate.duration_ms = 0.0
        candidate.stage = 0

    if not node_candidates or not edge_candidates:
        duration = float(args.duration_ms)
        minimum_stagger = duration + float(args.stagger_ms)
        if args.total_ms is not None and len(dynamic_candidates) > 1:
            available = float(args.total_ms) - float(args.initial_delay_ms) - duration
            stagger = max(minimum_stagger, available / (len(dynamic_candidates) - 1))
        else:
            stagger = minimum_stagger

        dynamic_candidates = sorted(dynamic_candidates, key=lambda candidate: event_order_key(candidate, event_positions))
        for index, candidate in enumerate(dynamic_candidates):
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = float(args.initial_delay_ms) + (index * stagger)
            candidate.duration_ms = duration
            candidate.stage = index + 1
            position = candidate_position(candidate)
            if candidate_has_class(candidate, "eventmodeling-event") and position is not None:
                candidate.branch_index = event_index_for_position(position[0], event_positions)
            elif candidate.role == "edge":
                candidate.branch_index = edge_event_index(candidate, event_positions)
        return [*row_candidates, *dynamic_candidates]

    node_positions = {
        id(candidate): position
        for candidate in node_candidates
        if (position := candidate_position(candidate)) is not None
    }
    positioned_nodes = [candidate for candidate in node_candidates if id(candidate) in node_positions]
    if not positioned_nodes:
        return []

    node_stage = {id(candidate): index + 1 for index, candidate in enumerate(node_candidates)}
    edge_nodes: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        endpoints = edge_endpoints(edge)
        if endpoints is None:
            continue
        source = nearest_candidate(endpoints[0], positioned_nodes, node_positions)
        target = nearest_candidate(endpoints[1], positioned_nodes, node_positions)
        if source is None or target is None:
            continue
        edge_nodes[id(edge)] = (source, target)

    if not edge_nodes:
        return [*row_candidates, *node_candidates]

    stage_items: dict[int, list[Candidate]] = {
        node_stage[id(candidate)]: [candidate] for candidate in node_candidates
    }

    for edge in edge_candidates:
        source, target = edge_nodes.get(id(edge), (None, None))
        if source is None or target is None:
            continue
        source_stage = node_stage.get(id(source), len(node_candidates))
        target_stage = node_stage.get(id(target), len(node_candidates))
        stage = max(source_stage, target_stage)
        edge.source_index = source_stage
        edge.target_index = target_stage
        stage_items.setdefault(stage, []).append(edge)

    fallback_stage = len(node_candidates) + 1
    planned_ids = {id(candidate) for stage in stage_items.values() for candidate in stage}
    for candidate in dynamic_candidates:
        if id(candidate) in planned_ids:
            continue
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    planned_dynamic = plan_staged_items_with_following_connections(
        stage_items, args, effective_animation
    )

    for candidate in planned_dynamic:
        position = candidate_position(candidate)
        if candidate_has_class(candidate, "eventmodeling-event") and position is not None:
            candidate.branch_index = event_index_for_position(position[0], event_positions)
        elif candidate.role == "edge":
            candidate.branch_index = edge_event_index(candidate, event_positions)

    return [*row_candidates, *planned_dynamic]
