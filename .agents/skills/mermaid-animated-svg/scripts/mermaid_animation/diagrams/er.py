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

from mermaid_animation.common import (
    Candidate,
    collapsed_text,
    class_tokens,
    edge_endpoints,
    local_name,
    nearest_candidate,
    normalized,
    parse_viewbox,
    plan_staged_items_with_following_connections,
    translate_position,
)


def is_er_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    classes = {token.lower() for token in class_tokens(root)}
    return role in {"er", "entity relationship", "entity relationship diagram"} or "erdiagram" in classes


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def element_has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def discover_er_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        tag = local_name(element.tag)
        if tag == "g" and element.get("id", "").find("-entity-") >= 0 and element_has_class(element, "node"):
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), ["er-entity"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag in {"path", "line", "polyline"} and element_has_class(element, "relationshipLine"):
            candidates.append(
                Candidate(
                    element=element,
                    role="edge",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), ["er-relationship-line"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag == "g" and element_has_class(element, "edgeLabel"):
            candidates.append(
                Candidate(
                    element=element,
                    role="label",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), ["er-relationship-label"]),
                    text=collapsed_text(element),
                )
            )

    return candidates


def candidate_data_id(candidate: Candidate) -> str:
    data_id = candidate.element.get("data-id", "")
    if data_id:
        return data_id
    for child in candidate.element.iter():
        data_id = child.get("data-id", "")
        if data_id:
            return data_id
    return ""


def relationship_key(candidate: Candidate) -> str:
    return normalized(candidate_data_id(candidate) or candidate.element_id)


def entity_key(candidate: Candidate) -> str:
    match = re.search(r"entity-.+?-\d+$", candidate.element_id)
    if match:
        return match.group(0)
    return candidate.element_id


def er_primary_axis(root: ET.Element) -> int:
    viewbox = parse_viewbox(root)
    if viewbox is None:
        return 1
    return 0 if viewbox[2] >= viewbox[3] else 1


def edge_entities_from_id(
    edge: Candidate, node_by_key: dict[str, Candidate]
) -> tuple[Candidate, Candidate] | None:
    raw_ids = [candidate_data_id(edge), edge.element_id]
    for raw_id in raw_ids:
        if not raw_id:
            continue

        matches: list[tuple[int, Candidate]] = []
        for key, node in node_by_key.items():
            pattern = re.compile(rf"{re.escape(key)}(?=$|_)")
            matches.extend((match.start(), node) for match in pattern.finditer(raw_id))

        if len(matches) >= 2:
            ordered = sorted(matches, key=lambda item: item[0])
            return ordered[0][1], ordered[1][1]

    return None


def edge_entities_from_geometry(
    edge: Candidate,
    nodes: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> tuple[Candidate, Candidate] | None:
    endpoints = edge_endpoints(edge)
    if endpoints is None:
        return None

    source = nearest_candidate(endpoints[0], nodes, positions)
    target = nearest_candidate(endpoints[1], nodes, positions)
    if source is None or target is None:
        return None
    return source, target


def plan_er_candidates(
    candidates: list[Candidate], root: ET.Element, args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    node_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "node"
        and (
            "er-entity" in {token.lower() for token in candidate.classes}
            or re.search(r"entity-.+?-\d+$", candidate.element_id)
        )
    ]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge"
        and (
            "relationshipline" in {token.lower() for token in candidate.classes}
            or "er-relationship-line" in {token.lower() for token in candidate.classes}
        )
    ]
    label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label"
        and (
            "edgeLabel" in candidate.classes
            or "er-relationship-label" in {token.lower() for token in candidate.classes}
        )
    ]

    positions = {
        id(candidate): position
        for candidate in node_candidates
        if (position := translate_position(candidate.element)) is not None
    }
    positioned_nodes = [candidate for candidate in node_candidates if id(candidate) in positions]
    if not positioned_nodes or not edge_candidates:
        return []

    axis = er_primary_axis(root)
    secondary_axis = 1 - axis
    use_lane_order = args.animation == "auto"

    def lane_index(candidate: Candidate) -> tuple[float, float]:
        position = positions[id(candidate)]
        lane_coordinate = position[secondary_axis]
        within_lane_coordinate = position[axis]
        return lane_coordinate, within_lane_coordinate

    def lane_map() -> dict[int, int]:
        ordered = sorted(positioned_nodes, key=lane_index)
        if len(ordered) < 3:
            return {id(candidate): index for index, candidate in enumerate(ordered)}

        lane_values = [positions[id(candidate)][secondary_axis] for candidate in ordered]
        gaps = [lane_values[index + 1] - lane_values[index] for index in range(len(lane_values) - 1)]
        largest_gap = max(gaps) if gaps else 0.0
        split_threshold = max(60.0, largest_gap / 2)

        lane = 0
        result: dict[int, int] = {}
        previous_value: float | None = None
        for candidate in ordered:
            value = positions[id(candidate)][secondary_axis]
            if previous_value is not None and value - previous_value > split_threshold:
                lane += 1
            result[id(candidate)] = lane
            previous_value = value
        return result

    visual_lanes = lane_map() if use_lane_order else {}

    def node_sort_key(candidate: Candidate) -> tuple[int, int, float, float, int]:
        position = positions[id(candidate)]
        if candidate.explicit_order is None and use_lane_order:
            return (
                1,
                0,
                float(visual_lanes.get(id(candidate), 0)),
                position[axis],
                candidate.dom_index,
            )
        return (
            0 if candidate.explicit_order is not None else 1,
            candidate.explicit_order if candidate.explicit_order is not None else 0,
            position[axis],
            position[secondary_axis],
            candidate.dom_index,
        )

    ordered_nodes = sorted(positioned_nodes, key=node_sort_key)
    node_stage = {id(candidate): index for index, candidate in enumerate(ordered_nodes)}
    node_by_key = {entity_key(candidate): candidate for candidate in ordered_nodes}

    edge_nodes: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        endpoints = edge_entities_from_id(edge, node_by_key)
        if endpoints is None:
            endpoints = edge_entities_from_geometry(edge, positioned_nodes, positions)
        if endpoints is None:
            continue
        edge_nodes[id(edge)] = endpoints

    if not edge_nodes:
        return []

    sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
    edge_by_key = {relationship_key(edge): edge for edge in sorted_edges if id(edge) in edge_nodes}
    edge_labels: dict[int, list[Candidate]] = {}
    paired_label_ids: set[int] = set()
    fallback_edge_index = 0

    for label in sorted(label_candidates, key=lambda candidate: candidate.dom_index):
        label_key = relationship_key(label)
        edge = edge_by_key.get(label_key) if label_key else None
        if edge is None:
            while fallback_edge_index < len(sorted_edges) and id(sorted_edges[fallback_edge_index]) not in edge_nodes:
                fallback_edge_index += 1
            if fallback_edge_index >= len(sorted_edges):
                continue
            edge = sorted_edges[fallback_edge_index]
            fallback_edge_index += 1

        edge_labels.setdefault(id(edge), []).append(label)
        paired_label_ids.add(id(label))

    stage_items: dict[int, list[Candidate]] = {index: [node] for index, node in enumerate(ordered_nodes)}
    for edge in sorted_edges:
        source, target = edge_nodes.get(id(edge), (None, None))
        if source is None or target is None:
            continue
        source_stage = node_stage.get(id(source), len(ordered_nodes))
        target_stage = node_stage.get(id(target), len(ordered_nodes))
        stage = max(source_stage, target_stage)
        edge.source_index = source_stage
        edge.target_index = target_stage
        stage_items.setdefault(stage, []).append(edge)
        for label in edge_labels.get(id(edge), []):
            label.source_index = source_stage
            label.target_index = target_stage
            stage_items[stage].append(label)

    fallback_stage = len(ordered_nodes)
    for candidate in candidates:
        if id(candidate) in node_stage or id(candidate) in edge_nodes or id(candidate) in paired_label_ids:
            continue
        if candidate.role == "label" and id(candidate) in paired_label_ids:
            continue
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    return plan_staged_items_with_following_connections(stage_items, args, effective_animation)
