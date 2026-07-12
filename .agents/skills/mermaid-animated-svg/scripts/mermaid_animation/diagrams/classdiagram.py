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
    class_tokens,
    collapsed_text,
    edge_endpoints,
    local_name,
    normalized,
    plan_staged_items_with_following_connections,
    squared_distance,
    translate_position,
)


def is_class_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    classes = {token.lower() for token in class_tokens(root)}
    return role == "class" or "classdiagram" in classes


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def element_has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def discover_class_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        tag = local_name(element.tag)
        element_id = element.get("id", "")

        if tag == "g" and element_has_class(element, "node") and "classId-" in element_id:
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["class-diagram-class"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag in {"path", "line", "polyline"} and element_has_class(element, "relation"):
            candidates.append(
                Candidate(
                    element=element,
                    role="edge",
                    dom_index=dom_order[element],
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["class-diagram-relation-line"]),
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
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["class-diagram-relation-label"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag == "g" and element_has_class(element, "edgeTerminals"):
            candidates.append(
                Candidate(
                    element=element,
                    role="label",
                    dom_index=dom_order[element],
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["class-diagram-relation-terminal"]),
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


def class_key(candidate: Candidate) -> str:
    match = re.search(r"classId-(.+)-\d+$", candidate.element_id)
    if match:
        return match.group(1)
    first_token = candidate.text.split(maxsplit=1)[0] if candidate.text else ""
    return first_token or candidate.element_id


def relation_key(candidate: Candidate) -> str:
    return normalized(candidate_data_id(candidate) or candidate.element_id)


def edge_classes_from_id(
    edge: Candidate, class_by_key: dict[str, Candidate]
) -> tuple[Candidate, Candidate] | None:
    raw_ids = [candidate_data_id(edge), edge.element_id]
    for raw_id in raw_ids:
        if not raw_id:
            continue

        matches: list[tuple[int, Candidate]] = []
        for key, node in class_by_key.items():
            pattern = re.compile(rf"(?:(?<=id_)|(?<=_)){re.escape(key)}(?=_|$)")
            matches.extend((match.start(), node) for match in pattern.finditer(raw_id))

        if len(matches) >= 2:
            ordered = sorted(matches, key=lambda item: item[0])
            return ordered[0][1], ordered[1][1]

    return None


def label_position(candidate: Candidate) -> tuple[float, float] | None:
    return translate_position(candidate.element)


def nearest_edge_for_label(
    label: Candidate,
    edges: list[Candidate],
    edge_nodes: dict[int, tuple[Candidate, Candidate]],
) -> Candidate | None:
    position = label_position(label)
    if position is None:
        return None

    best: tuple[float, Candidate] | None = None
    for edge in edges:
        if id(edge) not in edge_nodes:
            continue
        endpoints = edge_endpoints(edge)
        if endpoints is None:
            continue
        distance = min(squared_distance(position, endpoints[0]), squared_distance(position, endpoints[1]))
        if best is None or distance < best[0]:
            best = (distance, edge)

    return best[1] if best is not None else None


def plan_class_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    node_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "node"
        and (
            "class-diagram-class" in {token.lower() for token in candidate.classes}
            or "classid-" in candidate.element_id.lower()
        )
    ]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge"
        and (
            "class-diagram-relation-line" in {token.lower() for token in candidate.classes}
            or "relation" in {token.lower() for token in candidate.classes}
        )
    ]
    label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label"
        and (
            "class-diagram-relation-label" in {token.lower() for token in candidate.classes}
            or "class-diagram-relation-terminal" in {token.lower() for token in candidate.classes}
            or "edgeLabel" in candidate.classes
        )
    ]

    if not node_candidates or not edge_candidates:
        return []

    node_positions = {
        id(candidate): position
        for candidate in node_candidates
        if (position := translate_position(candidate.element)) is not None
    }
    if len(node_positions) >= 2:
        x_values = [position[0] for position in node_positions.values()]
        y_values = [position[1] for position in node_positions.values()]
        use_visual_vertical_order = (max(y_values) - min(y_values)) > (max(x_values) - min(x_values))
    else:
        use_visual_vertical_order = False

    def node_sort_key(candidate: Candidate) -> tuple[float, ...]:
        position = node_positions.get(id(candidate))
        if candidate.explicit_order is None and use_visual_vertical_order and position is not None:
            return (
                1,
                0,
                int(round(position[1] * 1000)),
                int(round(position[0] * 1000)),
                candidate.dom_index,
            )
        return (
            0 if candidate.explicit_order is not None else 1,
            candidate.explicit_order if candidate.explicit_order is not None else 0,
            candidate.dom_index,
        )

    ordered_nodes = sorted(node_candidates, key=node_sort_key)
    node_stage = {id(candidate): index for index, candidate in enumerate(ordered_nodes)}
    class_by_key = {class_key(candidate): candidate for candidate in ordered_nodes}

    edge_nodes: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        endpoints = edge_classes_from_id(edge, class_by_key)
        if endpoints is None:
            continue
        edge_nodes[id(edge)] = endpoints

    if not edge_nodes:
        return []

    sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
    edge_by_key = {relation_key(edge): edge for edge in sorted_edges if id(edge) in edge_nodes}
    edge_labels: dict[int, list[Candidate]] = {}
    paired_label_ids: set[int] = set()
    fallback_edge_index = 0

    for label in sorted(label_candidates, key=lambda candidate: candidate.dom_index):
        edge: Candidate | None = None
        label_key = relation_key(label)
        if label_key:
            edge = edge_by_key.get(label_key)

        if edge is None and "class-diagram-relation-terminal" in {
            token.lower() for token in label.classes
        }:
            edge = nearest_edge_for_label(label, sorted_edges, edge_nodes)

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
    planned_candidate_ids = {
        id(candidate) for stage in stage_items.values() for candidate in stage
    } | paired_label_ids | set(edge_nodes)
    for candidate in candidates:
        if id(candidate) in planned_candidate_ids:
            continue
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    return plan_staged_items_with_following_connections(stage_items, args, effective_animation)
