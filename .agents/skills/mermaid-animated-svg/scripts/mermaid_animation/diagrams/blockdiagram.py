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
    nearest_candidate,
    normalized,
    plan_staged_items_with_following_connections,
    squared_distance,
    translate_position,
)


def is_block_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    classes = {token.lower() for token in class_tokens(root)}
    return role == "block" or "blockdiagram" in classes


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def element_has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def discover_block_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        tag = local_name(element.tag)
        element_id = element.get("id", "")

        if tag == "g" and element_has_class(element, "node"):
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["block-diagram-block"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag in {"path", "line", "polyline"} and element_has_class(element, "flowchart-link"):
            candidates.append(
                Candidate(
                    element=element,
                    role="edge",
                    dom_index=dom_order[element],
                    element_id=element_id,
                    classes=add_classes(class_tokens(element), ["block-diagram-connection"]),
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
                    classes=add_classes(class_tokens(element), ["block-diagram-connection-label"]),
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


def block_key(candidate: Candidate) -> str:
    element_id = candidate.element_id
    if element_id.startswith("my-svg-"):
        element_id = element_id.removeprefix("my-svg-")
    return normalized(element_id)


def relation_key(candidate: Candidate) -> str:
    return normalized(candidate_data_id(candidate) or candidate.element_id)


def edge_blocks_from_id(
    edge: Candidate, block_by_key: dict[str, Candidate]
) -> tuple[Candidate, Candidate] | None:
    raw_ids = [candidate_data_id(edge), edge.element_id]
    for raw_id in raw_ids:
        if not raw_id:
            continue

        normalized_id = normalized(raw_id)
        if normalized_id.startswith("my-svg-"):
            normalized_id = normalized_id.removeprefix("my-svg-")

        matches: list[tuple[int, Candidate]] = []
        for key, block in block_by_key.items():
            if not key:
                continue
            pattern = re.compile(rf"(?:^|[-_])({re.escape(key)})(?=$|[-_])")
            matches.extend((match.start(1), block) for match in pattern.finditer(normalized_id))

        if len(matches) >= 2:
            ordered = sorted(matches, key=lambda item: item[0])
            return ordered[0][1], ordered[1][1]

    return None


def edge_blocks_from_geometry(
    edge: Candidate,
    blocks: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> tuple[Candidate, Candidate] | None:
    endpoints = edge_endpoints(edge)
    if endpoints is None:
        return None

    source = nearest_candidate(endpoints[0], blocks, positions)
    target = nearest_candidate(endpoints[1], blocks, positions)
    if source is None or target is None:
        return None
    return source, target


def nearest_edge_for_label(
    label: Candidate,
    edges: list[Candidate],
    edge_blocks: dict[int, tuple[Candidate, Candidate]],
) -> Candidate | None:
    position = translate_position(label.element)
    if position is None:
        return None

    best: tuple[float, Candidate] | None = None
    for edge in edges:
        if id(edge) not in edge_blocks:
            continue
        endpoints = edge_endpoints(edge)
        if endpoints is None:
            continue
        distance = min(squared_distance(position, endpoints[0]), squared_distance(position, endpoints[1]))
        if best is None or distance < best[0]:
            best = (distance, edge)

    return best[1] if best is not None else None


def plan_block_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    block_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "node" and "block-diagram-block" in {token.lower() for token in candidate.classes}
    ]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge" and "block-diagram-connection" in {token.lower() for token in candidate.classes}
    ]
    label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label"
        and "block-diagram-connection-label" in {token.lower() for token in candidate.classes}
    ]

    positions = {
        id(candidate): position
        for candidate in block_candidates
        if (position := translate_position(candidate.element)) is not None
    }
    positioned_blocks = [candidate for candidate in block_candidates if id(candidate) in positions]
    if not positioned_blocks or not edge_candidates:
        return []

    def block_sort_key(candidate: Candidate) -> tuple[int, int, int]:
        return (
            0 if candidate.explicit_order is not None else 1,
            candidate.explicit_order if candidate.explicit_order is not None else 0,
            candidate.dom_index,
        )

    ordered_blocks = sorted(positioned_blocks, key=block_sort_key)
    block_stage = {id(candidate): index for index, candidate in enumerate(ordered_blocks)}
    block_by_key = {block_key(candidate): candidate for candidate in ordered_blocks}

    edge_blocks: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        endpoints = edge_blocks_from_id(edge, block_by_key)
        if endpoints is None:
            endpoints = edge_blocks_from_geometry(edge, positioned_blocks, positions)
        if endpoints is None:
            continue
        edge_blocks[id(edge)] = endpoints

    if not edge_blocks:
        return []

    sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
    edge_by_key = {relation_key(edge): edge for edge in sorted_edges if id(edge) in edge_blocks}
    edge_labels: dict[int, list[Candidate]] = {}
    paired_label_ids: set[int] = set()
    fallback_edge_index = 0

    for label in sorted(label_candidates, key=lambda candidate: candidate.dom_index):
        edge: Candidate | None = None
        label_key = relation_key(label)
        if label_key:
            edge = edge_by_key.get(label_key)
        if edge is None:
            edge = nearest_edge_for_label(label, sorted_edges, edge_blocks)
        if edge is None:
            while fallback_edge_index < len(sorted_edges) and id(sorted_edges[fallback_edge_index]) not in edge_blocks:
                fallback_edge_index += 1
            if fallback_edge_index >= len(sorted_edges):
                continue
            edge = sorted_edges[fallback_edge_index]
            fallback_edge_index += 1

        edge_labels.setdefault(id(edge), []).append(label)
        paired_label_ids.add(id(label))

    stage_items: dict[int, list[Candidate]] = {index: [block] for index, block in enumerate(ordered_blocks)}
    for edge in sorted_edges:
        source, target = edge_blocks.get(id(edge), (None, None))
        if source is None or target is None:
            continue

        source_stage = block_stage.get(id(source), len(ordered_blocks))
        target_stage = block_stage.get(id(target), len(ordered_blocks))
        stage = max(source_stage, target_stage)
        edge.source_index = source_stage
        edge.target_index = target_stage
        stage_items.setdefault(stage, []).append(edge)
        for label in edge_labels.get(id(edge), []):
            label.source_index = source_stage
            label.target_index = target_stage
            stage_items[stage].append(label)

    fallback_stage = len(ordered_blocks)
    planned_candidate_ids = {
        id(candidate) for stage in stage_items.values() for candidate in stage
    } | paired_label_ids | set(edge_blocks)
    for candidate in candidates:
        if id(candidate) in planned_candidate_ids:
            continue
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    return plan_staged_items_with_following_connections(stage_items, args, effective_animation)
