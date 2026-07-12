#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import base64
import binascii
import json
import re
import xml.etree.ElementTree as ET

from mermaid_animation.common import (
    Candidate,
    build_parent_map,
    class_tokens,
    element_bounds,
    dwell_for_candidate,
    edge_endpoints,
    effect_for,
    nearest_candidate,
    normalized,
    parse_keyed_number_entries,
    parse_viewbox,
    plan_staged_items_with_following_connections,
    squared_distance,
    translate_position,
)


def is_flowchart_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    return role.startswith("flowchart") or "flowchart" in {token.lower() for token in class_tokens(root)}


def flowchart_primary_axis(root: ET.Element) -> int:
    viewbox = parse_viewbox(root)
    if viewbox is None:
        return 0
    return 0 if viewbox[2] >= viewbox[3] else 1


def candidate_data_id(candidate: Candidate) -> str:
    data_id = candidate.element.get("data-id", "")
    if data_id:
        return data_id
    for child in candidate.element.iter():
        data_id = child.get("data-id", "")
        if data_id:
            return data_id
    return ""


def flowchart_alias_key(value: str) -> str:
    normalized_value = normalized(value)
    for prefix in ("my-svg-", "flowchart-"):
        if normalized_value.startswith(prefix):
            normalized_value = normalized_value.removeprefix(prefix)
    normalized_value = re.sub(r"-\d+$", "", normalized_value)
    return re.sub(r"[^a-z0-9]+", "_", normalized_value).strip("_")


def flowchart_node_aliases(candidate: Candidate) -> set[str]:
    aliases: set[str] = set()
    for value in (candidate_data_id(candidate), candidate.element_id, candidate.text):
        key = flowchart_alias_key(value)
        if key:
            aliases.add(key)
    return aliases


def edge_tokens(edge: Candidate) -> set[str]:
    tokens = {token for token in [candidate_data_id(edge), edge.element_id] if token}
    if edge.element_id.startswith("my-svg-"):
        tokens.add(edge.element_id.removeprefix("my-svg-"))
    return tokens


def flowchart_edge_endpoints(edge: Candidate) -> tuple[tuple[float, float], tuple[float, float]] | None:
    raw_points = edge.element.get("data-points", "")
    if raw_points:
        try:
            decoded = base64.b64decode(raw_points).decode("utf-8")
            loaded = json.loads(decoded)
            points = [
                (float(point["x"]), float(point["y"]))
                for point in loaded
                if isinstance(point, dict) and "x" in point and "y" in point
            ]
            if len(points) >= 2:
                return points[0], points[-1]
        except (ValueError, TypeError, KeyError, json.JSONDecodeError, binascii.Error):
            pass

    return edge_endpoints(edge)


def infer_flowchart_edge_nodes(
    edge: Candidate,
    node_by_alias: dict[str, Candidate],
    endpoints: tuple[tuple[float, float], tuple[float, float]] | None,
    positions: dict[int, tuple[float, float]],
) -> tuple[Candidate, Candidate] | None:
    edge_id = flowchart_alias_key(candidate_data_id(edge) or edge.element_id)
    parts = edge_id.split("_")
    if len(parts) < 4 or parts[0] != "l":
        return None

    body = parts[1:-1]
    matches: list[tuple[Candidate, Candidate]] = []
    for split_index in range(1, len(body)):
        source = node_by_alias.get("_".join(body[:split_index]))
        target = node_by_alias.get("_".join(body[split_index:]))
        if source is not None and target is not None:
            matches.append((source, target))

    if not matches:
        return None
    if len(matches) == 1 or endpoints is None:
        return matches[0]

    return min(
        matches,
        key=lambda match: squared_distance(endpoints[0], positions[id(match[0])])
        + squared_distance(endpoints[1], positions[id(match[1])]),
    )


def plan_flowchart_candidates(
    candidates: list[Candidate], root: ET.Element, args: argparse.Namespace
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    axis = flowchart_primary_axis(root)
    secondary_axis = 1 - axis
    duration = float(args.duration_ms)
    tolerance = 1.0

    node_candidates = [candidate for candidate in candidates if candidate.role == "node"]
    edge_candidates = [candidate for candidate in candidates if candidate.role == "edge"]
    label_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and "edgeLabel" in candidate.classes
    ]

    positions = {
        id(candidate): position
        for candidate in [*node_candidates, *label_candidates]
        if (position := translate_position(candidate.element)) is not None
    }
    positioned_nodes = [candidate for candidate in node_candidates if id(candidate) in positions]
    if not positioned_nodes or not edge_candidates:
        return []

    edge_nodes: dict[int, tuple[Candidate | None, Candidate | None]] = {}
    edge_keys: dict[int, tuple[float, float, float, int]] = {}
    node_order = {
        id(candidate): index
        for index, candidate in enumerate(
            sorted(
                positioned_nodes,
                key=lambda candidate: (
                    positions[id(candidate)][axis],
                    positions[id(candidate)][secondary_axis],
                    candidate.dom_index,
                ),
            )
        )
    }
    node_by_alias: dict[str, Candidate] = {}
    for node in positioned_nodes:
        for alias in flowchart_node_aliases(node):
            node_by_alias.setdefault(alias, node)

    for edge in edge_candidates:
        endpoints = flowchart_edge_endpoints(edge)
        if endpoints is None:
            continue
        inferred_nodes = infer_flowchart_edge_nodes(edge, node_by_alias, endpoints, positions)
        if inferred_nodes is None:
            source = nearest_candidate(endpoints[0], positioned_nodes, positions)
            target = nearest_candidate(endpoints[1], positioned_nodes, positions)
        else:
            source, target = inferred_nodes
        if source is None or target is None:
            continue

        source_position = positions[id(source)]
        target_position = positions[id(target)]
        source_primary = source_position[axis]
        target_primary = target_position[axis]
        target_secondary = target_position[secondary_axis]
        source_secondary = source_position[secondary_axis]
        if target_primary >= source_primary - tolerance:
            key = (target_primary, target_secondary, 0.0, edge.dom_index)
        else:
            key = (source_primary, source_secondary, 2.0, edge.dom_index)

        edge_nodes[id(edge)] = (source, target)
        edge_keys[id(edge)] = key
        edge.source_index = node_order.get(id(source))
        edge.target_index = node_order.get(id(target))

    if not edge_keys:
        return []

    sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
    edge_by_token: dict[str, Candidate] = {}
    for edge in sorted_edges:
        if id(edge) not in edge_keys:
            continue
        for token in edge_tokens(edge):
            edge_by_token[token] = edge

    edge_labels: dict[int, list[Candidate]] = {}
    paired_labels: set[int] = set()
    fallback_index = 0
    for label in sorted(label_candidates, key=lambda candidate: candidate.dom_index):
        label_data_id = candidate_data_id(label)
        edge = edge_by_token.get(label_data_id) if label_data_id else None
        if edge is None:
            while fallback_index < len(sorted_edges) and id(sorted_edges[fallback_index]) not in edge_keys:
                fallback_index += 1
            if fallback_index >= len(sorted_edges):
                continue
            edge = sorted_edges[fallback_index]
            fallback_index += 1
        edge_labels.setdefault(id(edge), []).append(label)
        paired_labels.add(id(label))

    cluster_candidates = [candidate for candidate in candidates if candidate.role == "cluster"]
    if cluster_candidates:
        parent_map = build_parent_map(root)
        cluster_positions = {
            id(candidate): (bounds[0], bounds[1])
            for candidate in cluster_candidates
            if (bounds := element_bounds(candidate.element, parent_map)) is not None
        }
        visual_items = [
            candidate
            for candidate in [*cluster_candidates, *positioned_nodes]
            if id(candidate) in cluster_positions or id(candidate) in positions
        ]

        def visual_position(candidate: Candidate) -> tuple[float, float]:
            if candidate.role == "cluster":
                return cluster_positions[id(candidate)]
            return positions[id(candidate)]

        ordered_visual_items = sorted(
            visual_items,
            key=lambda candidate: (
                visual_position(candidate)[axis],
                visual_position(candidate)[secondary_axis],
                0 if candidate.role == "cluster" else 1,
                candidate.dom_index,
            ),
        )
        stage_by_id = {id(candidate): index for index, candidate in enumerate(ordered_visual_items)}
        stage_items: dict[int, list[Candidate]] = {
            index: [candidate] for index, candidate in enumerate(ordered_visual_items)
        }

        for edge in sorted_edges:
            source, target = edge_nodes.get(id(edge), (None, None))
            if source is None or target is None:
                continue
            stage = max(stage_by_id.get(id(source), 0), stage_by_id.get(id(target), 0))
            stage_items.setdefault(stage, []).append(edge)
            for label in edge_labels.get(id(edge), []):
                stage_items[stage].append(label)

        fallback_stage = len(stage_items)
        planned_ids = {
            id(candidate) for stage in stage_items.values() for candidate in stage
        } | paired_labels
        for candidate in candidates:
            if id(candidate) in planned_ids:
                continue
            stage_items.setdefault(fallback_stage, []).append(candidate)
            fallback_stage += 1

        return plan_staged_items_with_following_connections(stage_items, args, "flowchart-flow")

    node_sort_key = {
        id(candidate): (
            positions[id(candidate)][axis],
            positions[id(candidate)][secondary_axis],
            candidate.dom_index,
        )
        for candidate in positioned_nodes
    }
    incoming_node_ids = {
        id(target)
        for source, target in edge_nodes.values()
        if source is not None and target is not None and source is not target
    }
    seed_nodes = [
        candidate for candidate in positioned_nodes if id(candidate) not in incoming_node_ids
    ] or [min(positioned_nodes, key=lambda candidate: node_sort_key[id(candidate)])]

    ordered_reveal_items: list[Candidate] = []
    reveal_ids: set[int] = set()
    visible_node_ids: set[int] = set()
    revealed_edge_ids: set[int] = set()

    def add_reveal(candidate: Candidate) -> None:
        if id(candidate) in reveal_ids:
            return
        ordered_reveal_items.append(candidate)
        reveal_ids.add(id(candidate))
        if candidate.role == "node":
            visible_node_ids.add(id(candidate))

    for node in sorted(seed_nodes, key=lambda candidate: node_sort_key[id(candidate)]):
        add_reveal(node)

    def dynamic_edge_key(candidate: Candidate) -> tuple[int, float, float, float, int]:
        _source, target = edge_nodes.get(id(candidate), (None, None))
        target_is_visible = target is None or id(target) in visible_node_ids
        return (1 if target_is_visible else 0, *edge_keys[id(candidate)])

    while len(revealed_edge_ids) < len(edge_keys):
        eligible_edges = [
            edge
            for edge in edge_candidates
            if id(edge) in edge_keys
            and id(edge) not in revealed_edge_ids
            and edge_nodes[id(edge)][0] is not None
            and id(edge_nodes[id(edge)][0]) in visible_node_ids
        ]

        if eligible_edges:
            for edge in sorted(eligible_edges, key=dynamic_edge_key):
                _source, target = edge_nodes.get(id(edge), (None, None))
                if target is not None and id(target) not in visible_node_ids:
                    add_reveal(target)
                add_reveal(edge)
                revealed_edge_ids.add(id(edge))
            continue

        unseen_nodes = [node for node in positioned_nodes if id(node) not in visible_node_ids]
        if unseen_nodes:
            add_reveal(min(unseen_nodes, key=lambda candidate: node_sort_key[id(candidate)]))
            continue

        for edge in sorted(
            [edge for edge in edge_candidates if id(edge) in edge_keys and id(edge) not in revealed_edge_ids],
            key=lambda candidate: edge_keys[id(candidate)],
        ):
            add_reveal(edge)
            revealed_edge_ids.add(id(edge))

    for candidate in candidates:
        if candidate.role == "label" and id(candidate) in paired_labels:
            continue
        if id(candidate) in reveal_ids:
            continue
        add_reveal(candidate)

    flowchart_dwell_overrides = parse_keyed_number_entries(args.flowchart_dwell, "--flowchart-dwell")

    def flowchart_dwell(candidate: Candidate) -> float:
        if candidate.role != "node":
            return 0.0
        return dwell_for_candidate(
            candidate,
            float(args.flowchart_dwell_ms),
            flowchart_dwell_overrides,
        )

    step_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(ordered_reveal_items) > 1:
        dwell_before_last = sum(flowchart_dwell(candidate) for candidate in ordered_reveal_items[:-1])
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration - dwell_before_last
        step_gap = max(step_gap, available / (len(ordered_reveal_items) - 1))

    planned: list[Candidate] = []
    cumulative_flowchart_dwell = 0.0
    for index, candidate in enumerate(ordered_reveal_items):
        candidate.effect = effect_for("flowchart-flow", candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * step_gap) + cumulative_flowchart_dwell
        candidate.duration_ms = duration
        candidate.stage = index
        planned.append(candidate)

        if candidate.role == "edge":
            source, target = edge_nodes.get(id(candidate), (None, None))
            if source is not None:
                candidate.source_index = node_order.get(id(source))
            if target is not None:
                candidate.target_index = node_order.get(id(target))
            for label in edge_labels.get(id(candidate), []):
                label.effect = effect_for("flowchart-flow", label.role)
                label.delay_ms = candidate.delay_ms
                label.duration_ms = duration
                label.stage = index
                label.source_index = candidate.source_index
                label.target_index = candidate.target_index
                planned.append(label)
        cumulative_flowchart_dwell += flowchart_dwell(candidate)

    return planned
