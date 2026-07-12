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
    ancestors,
    class_tokens,
    collapsed_text,
    edge_endpoints,
    effect_for,
    local_name,
    normalized,
    translate_position,
)


def is_sankey_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "sankey"


def has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def element_has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def has_ancestor_class(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    token: str,
) -> bool:
    return any(element_has_class(parent, token) for parent in ancestors(element, parent_map))


def add_candidate(
    candidates: list[Candidate],
    element: ET.Element,
    role: str,
    dom_order: dict[ET.Element, int],
    extra_classes: Iterable[str],
) -> None:
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


def discover_sankey_candidates(
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    dom_order: dict[ET.Element, int],
) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        tag = local_name(element.tag)
        if tag == "g" and element_has_class(element, "node") and has_ancestor_class(
            element, parent_map, "nodes"
        ):
            add_candidate(candidates, element, "node", dom_order, ["sankey-node"])
            continue

        if tag == "path" and has_ancestor_class(element, parent_map, "links"):
            add_candidate(candidates, element, "edge", dom_order, ["sankey-link"])
            continue

        if tag == "text" and has_ancestor_class(element, parent_map, "node-labels"):
            add_candidate(candidates, element, "label", dom_order, ["sankey-label"])

    return candidates


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def node_position(candidate: Candidate) -> tuple[float, float] | None:
    translated = translate_position(candidate.element)
    if translated is not None:
        return translated

    x = numeric_attribute(candidate.element, "x")
    y = numeric_attribute(candidate.element, "y")
    if x is not None and y is not None:
        return x, y
    return None


def label_position(candidate: Candidate) -> tuple[float, float] | None:
    x = numeric_attribute(candidate.element, "x")
    y = numeric_attribute(candidate.element, "y")
    if x is not None and y is not None:
        return x, y
    return node_position(candidate)


def link_start(candidate: Candidate) -> tuple[float, float] | None:
    endpoints = edge_endpoints(candidate)
    if endpoints is None:
        return None
    start, end = endpoints
    return start if start[0] <= end[0] else end


def link_columns(candidate: Candidate, column_x_values: list[float]) -> tuple[int, int] | None:
    endpoints = edge_endpoints(candidate)
    if endpoints is None:
        start = link_start(candidate)
        if start is None:
            return None
        column_index = nearest_column(start[0], column_x_values)
        return column_index, column_index

    start, end = endpoints
    source, target = (start, end) if start[0] <= end[0] else (end, start)
    return nearest_column(source[0], column_x_values), nearest_column(target[0], column_x_values)


def nearest_column(x: float, column_x_values: list[float]) -> int:
    return min(range(len(column_x_values)), key=lambda index: abs(column_x_values[index] - x))


def plan_sankey_candidates(
    candidates: list[Candidate],
    args: argparse.Namespace,
    effective_animation: str,
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    node_candidates = [candidate for candidate in candidates if has_class(candidate, "sankey-node")]
    link_candidates = [candidate for candidate in candidates if has_class(candidate, "sankey-link")]
    label_candidates = [candidate for candidate in candidates if has_class(candidate, "sankey-label")]

    node_positions = {
        id(candidate): position
        for candidate in node_candidates
        if (position := node_position(candidate)) is not None
    }
    if not node_positions or not link_candidates:
        return []

    column_x_values = sorted({round(position[0], 3) for position in node_positions.values()})

    nodes_by_column: dict[int, list[Candidate]] = {index: [] for index in range(len(column_x_values))}
    for candidate in node_candidates:
        position = node_positions.get(id(candidate))
        if position is None:
            continue
        column_index = nearest_column(position[0], column_x_values)
        candidate.source_index = column_index
        nodes_by_column[column_index].append(candidate)

    labels_by_column: dict[int, list[Candidate]] = {index: [] for index in range(len(column_x_values))}
    for candidate in label_candidates:
        position = label_position(candidate)
        if position is None:
            continue
        column_index = nearest_column(position[0], column_x_values)
        candidate.source_index = column_index
        labels_by_column[column_index].append(candidate)

    links_by_column: dict[int, list[Candidate]] = {index: [] for index in range(len(column_x_values))}
    for candidate in link_candidates:
        columns = link_columns(candidate, column_x_values)
        if columns is None:
            continue
        source_column, target_column = columns
        candidate.source_index = source_column
        candidate.target_index = target_column
        link_column = source_column if args.animation == "auto" else max(source_column, target_column)
        links_by_column[link_column].append(candidate)

    stages: list[list[Candidate]] = []
    for column_index in range(len(column_x_values)):
        column_nodes = sorted(
            [*nodes_by_column[column_index], *labels_by_column[column_index]],
            key=lambda candidate: (
                (node_position(candidate) if candidate.role == "node" else label_position(candidate))
                or (0.0, 0.0),
                0 if candidate.role == "node" else 1,
                candidate.dom_index,
            ),
        )
        if column_nodes:
            stages.append(column_nodes)

        column_links = sorted(links_by_column[column_index], key=lambda candidate: candidate.dom_index)
        if column_links:
            stages.append(column_links)

    if not stages:
        return []

    duration = float(args.duration_ms)
    minimum_stage_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(stages) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stage_gap = max(minimum_stage_gap, available / (len(stages) - 1))
    else:
        stage_gap = minimum_stage_gap

    planned: list[Candidate] = []
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
