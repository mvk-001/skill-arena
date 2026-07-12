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
    class_tokens,
    edge_endpoints,
    effect_for,
    normalized,
    plan_staged_items_with_following_connections,
    squared_distance,
    translate_position,
)


def is_requirement_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    return role == "requirement" or role == "requirementdiagram"


def requirement_key(candidate: Candidate) -> str:
    value = candidate.element_id
    if value.startswith("my-svg-"):
        value = value.removeprefix("my-svg-")
    return normalized(value).replace("-", "_")


def relationship_parts(candidate: Candidate) -> tuple[str, str] | None:
    value = candidate.element.get("data-id", "") or candidate.element_id
    if value.startswith("my-svg-"):
        value = value.removeprefix("my-svg-")
    value = re.sub(r"-\d+$", "", value)
    parts = value.split("-")
    if len(parts) < 2:
        return None
    return normalized(parts[0]).replace("-", "_"), normalized(parts[1]).replace("-", "_")


def nearest_node(
    point: tuple[float, float],
    nodes: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> Candidate | None:
    if not nodes:
        return None
    return min(nodes, key=lambda candidate: squared_distance(point, positions[id(candidate)]))


def plan_requirement_candidates(
    candidates: list[Candidate],
    args: argparse.Namespace,
    effective_animation: str,
) -> list[Candidate]:
    if args.animation != "auto" or any(candidate.explicit_order is not None for candidate in candidates):
        return []

    node_candidates = [candidate for candidate in candidates if candidate.role == "node"]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge"
        and "relationshipline" in {token.lower() for token in candidate.classes}
    ]
    label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and "edgeLabel" in candidate.classes
    ]

    positions = {
        id(candidate): position
        for candidate in node_candidates
        if (position := translate_position(candidate.element)) is not None
    }
    positioned_nodes = [candidate for candidate in node_candidates if id(candidate) in positions]
    if len(positioned_nodes) < 3 or not edge_candidates:
        return []

    node_by_key = {requirement_key(candidate): candidate for candidate in positioned_nodes}
    ordered_nodes = sorted(
        positioned_nodes,
        key=lambda candidate: (
            positions[id(candidate)][1],
            positions[id(candidate)][0],
            candidate.dom_index,
        ),
    )
    node_stage = {id(candidate): index for index, candidate in enumerate(ordered_nodes)}

    edge_nodes: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        parts = relationship_parts(edge)
        endpoints: tuple[Candidate, Candidate] | None = None
        if parts is not None:
            source = node_by_key.get(parts[0])
            target = node_by_key.get(parts[1])
            if source is not None and target is not None:
                endpoints = (source, target)
        if endpoints is None:
            line_points = edge_endpoints(edge)
            if line_points is not None:
                source = nearest_node(line_points[0], positioned_nodes, positions)
                target = nearest_node(line_points[1], positioned_nodes, positions)
                if source is not None and target is not None:
                    endpoints = (source, target)
        if endpoints is not None:
            edge_nodes[id(edge)] = endpoints

    if not edge_nodes:
        return []

    sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
    edge_labels: dict[int, list[Candidate]] = {}
    paired_label_ids: set[int] = set()
    for label, edge in zip(sorted(label_candidates, key=lambda candidate: candidate.dom_index), sorted_edges):
        if id(edge) not in edge_nodes:
            continue
        edge_labels.setdefault(id(edge), []).append(label)
        paired_label_ids.add(id(label))

    stage_items: dict[int, list[Candidate]] = {
        index: [candidate] for index, candidate in enumerate(ordered_nodes)
    }
    for edge in sorted_edges:
        endpoints = edge_nodes.get(id(edge))
        if endpoints is None:
            continue
        source, target = endpoints
        source_stage = node_stage[id(source)]
        target_stage = node_stage[id(target)]
        stage = max(source_stage, target_stage)
        edge.source_index = source_stage
        edge.target_index = target_stage
        stage_items.setdefault(stage, []).append(edge)
        for label in edge_labels.get(id(edge), []):
            label.source_index = source_stage
            label.target_index = target_stage
            stage_items[stage].append(label)

    planned_ids = {id(candidate) for values in stage_items.values() for candidate in values} | paired_label_ids
    fallback_stage = len(stage_items)
    for candidate in candidates:
        if id(candidate) in planned_ids:
            continue
        candidate.effect = effect_for(effective_animation, candidate.role)
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    return plan_staged_items_with_following_connections(stage_items, args, effective_animation)
