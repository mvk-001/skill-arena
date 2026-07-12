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
    build_parent_map,
    class_tokens,
    edge_endpoints,
    effect_for,
    local_name,
    normalized,
)


def is_gitgraph_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "gitgraph"


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def path_average_position(element: ET.Element) -> tuple[float, float] | None:
    numbers = [
        float(match.group(0))
        for match in re.finditer(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", element.get("d", ""))
    ]
    points = list(zip(numbers[0::2], numbers[1::2]))
    if not points:
        return None
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def gitgraph_commit_position(candidate: Candidate) -> tuple[float, float] | None:
    tag = local_name(candidate.element.tag)
    if tag == "circle":
        x = numeric_attribute(candidate.element, "cx")
        y = numeric_attribute(candidate.element, "cy")
        if x is not None and y is not None:
            return x, y
    if tag == "rect":
        x = numeric_attribute(candidate.element, "x")
        y = numeric_attribute(candidate.element, "y")
        width = numeric_attribute(candidate.element, "width")
        height = numeric_attribute(candidate.element, "height")
        if x is not None and y is not None and width is not None and height is not None:
            return x + (width / 2), y + (height / 2)
    if tag == "path":
        return path_average_position(candidate.element)
    return None


def commit_label_position(
    candidate: Candidate,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float] | None:
    parent = parent_map.get(candidate.element)
    if parent is not None:
        for sibling in parent:
            if local_name(sibling.tag) != "rect":
                continue
            if "commit-label-bkg" not in {token.lower() for token in class_tokens(sibling)}:
                continue
            x = numeric_attribute(sibling, "x")
            y = numeric_attribute(sibling, "y")
            width = numeric_attribute(sibling, "width")
            height = numeric_attribute(sibling, "height")
            if x is not None and y is not None and width is not None and height is not None:
                return x + (width / 2), y + (height / 2)

    x = numeric_attribute(candidate.element, "x")
    y = numeric_attribute(candidate.element, "y")
    if x is not None and y is not None:
        return x, y
    return None


def edge_target_x(candidate: Candidate) -> float | None:
    endpoints = edge_endpoints(candidate)
    if endpoints is None:
        return None
    start, end = endpoints
    return max(start[0], end[0])


def nearest_commit_index(
    x: float,
    event_x_values: list[float],
    tolerance: float,
) -> int | None:
    if not event_x_values:
        return None
    index, nearest_x = min(enumerate(event_x_values), key=lambda item: abs(item[1] - x))
    if abs(nearest_x - x) <= tolerance:
        return index
    return None


def position_tolerance(event_x_values: list[float]) -> float:
    if len(event_x_values) < 2:
        return 32.0
    gaps = [
        second - first
        for first, second in zip(event_x_values, event_x_values[1:])
        if second > first
    ]
    if not gaps:
        return 32.0
    return max(16.0, min(gaps) * 0.6)


def plan_gitgraph_candidates(
    candidates: list[Candidate],
    root: ET.Element,
    args: argparse.Namespace,
    effective_animation: str,
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    parent_map = build_parent_map(root)
    commit_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "node" and candidate_has_class(candidate, "commit")
    ]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge" and candidate_has_class(candidate, "arrow")
    ]
    commit_label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and candidate_has_class(candidate, "commit-label")
    ]
    static_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and any(token.lower().startswith("branch-label") for token in candidate.classes)
    ]

    commit_positions = {
        id(candidate): position
        for candidate in commit_candidates
        if (position := gitgraph_commit_position(candidate)) is not None
    }
    if not commit_positions:
        return []

    event_x_values = sorted({round(position[0], 3) for position in commit_positions.values()})
    tolerance = position_tolerance(event_x_values)

    commits_by_event: dict[int, list[Candidate]] = {index: [] for index in range(len(event_x_values))}
    for candidate in sorted(commit_candidates, key=lambda item: (commit_positions.get(id(item), (0.0, 0.0)), item.dom_index)):
        position = commit_positions.get(id(candidate))
        if position is None:
            continue
        event_index = nearest_commit_index(position[0], event_x_values, tolerance)
        if event_index is not None:
            commits_by_event[event_index].append(candidate)

    edges_by_event: dict[int, list[Candidate]] = {index: [] for index in range(len(event_x_values))}
    for candidate in sorted(edge_candidates, key=lambda item: (edge_target_x(item) or 0.0, item.dom_index)):
        target_x = edge_target_x(candidate)
        if target_x is None:
            continue
        event_index = nearest_commit_index(target_x, event_x_values, tolerance)
        if event_index is not None:
            candidate.target_index = event_index
            edges_by_event[event_index].append(candidate)

    labels_by_event: dict[int, list[Candidate]] = {index: [] for index in range(len(event_x_values))}
    for candidate in sorted(commit_label_candidates, key=lambda item: (commit_label_position(item, parent_map) or (0.0, 0.0), item.dom_index)):
        position = commit_label_position(candidate, parent_map)
        if position is None:
            continue
        event_index = nearest_commit_index(position[0], event_x_values, tolerance)
        if event_index is not None:
            labels_by_event[event_index].append(candidate)

    stages: list[list[Candidate]] = []
    for event_index in range(len(event_x_values)):
        point_stage = [*commits_by_event[event_index], *labels_by_event[event_index]]
        if point_stage:
            stages.append(point_stage)
        if edges_by_event[event_index]:
            stages.append(edges_by_event[event_index])

    if not stages:
        return []

    for candidate in static_candidates:
        candidate.effect = "none"
        candidate.delay_ms = 0.0
        candidate.duration_ms = 0.0

    duration = float(args.duration_ms)
    minimum_stage_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(stages) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stage_gap = max(minimum_stage_gap, available / (len(stages) - 1))
    else:
        stage_gap = minimum_stage_gap

    planned: list[Candidate] = [*static_candidates]
    for stage_index, stage in enumerate(stages):
        delay = float(args.initial_delay_ms) + (stage_index * stage_gap)
        for candidate in stage:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = delay
            candidate.duration_ms = duration
            candidate.stage = stage_index
            planned.append(candidate)

    planned_ids = {id(candidate) for candidate in planned}
    for candidate in candidates:
        if id(candidate) in planned_ids:
            continue
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (len(stages) * stage_gap)
        candidate.duration_ms = duration
        candidate.stage = len(stages)
        planned.append(candidate)

    return planned
