#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET

from mermaid_animation.common import (
    Candidate,
    ancestors,
    build_parent_map,
    class_tokens,
    element_bounds,
    element_center,
    edge_endpoints,
    effect_for,
    nearest_candidate,
    normalized,
    parse_keyed_number_entries,
    parse_viewbox,
    plan_staged_items_with_following_connections,
    squared_distance,
    state_dwell_for_candidate,
    translated_point,
    translate_position,
)


def is_state_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    return role == "statediagram" or "statediagram" in {token.lower() for token in class_tokens(root)}


def state_primary_axis(root: ET.Element) -> int:
    viewbox = parse_viewbox(root)
    if viewbox is None:
        return 0
    return 0 if viewbox[2] >= viewbox[3] else 1


def plan_state_candidates(candidates: list[Candidate], root: ET.Element, args: argparse.Namespace) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    axis = state_primary_axis(root)
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
    cluster_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "item"
        and "statediagram-cluster" in {token.lower() for token in candidate.classes}
    ]

    if cluster_candidates:
        parent_map = build_parent_map(root)
        visual_candidates = [*cluster_candidates, *node_candidates]

        def visual_bounds_for(candidate: Candidate) -> tuple[float, float, float, float] | None:
            return element_bounds(candidate.element, parent_map, include_path_points=True)

        def visual_center_for(candidate: Candidate) -> tuple[float, float] | None:
            bounds = visual_bounds_for(candidate)
            if bounds is None:
                return element_center(candidate.element, parent_map)
            min_x, min_y, max_x, max_y = bounds
            return min_x + ((max_x - min_x) / 2), min_y + ((max_y - min_y) / 2)

        node_position_cache = {
            id(candidate): position
            for candidate in node_candidates
            if (position := visual_center_for(candidate)) is not None
        }

        def cluster_position(candidate: Candidate) -> tuple[float, float] | None:
            bounds = visual_bounds_for(candidate)
            descendants = [
                node_position_cache[id(node)]
                for node in node_candidates
                if id(node) in node_position_cache
                and any(parent is candidate.element for parent in ancestors(node.element, parent_map))
            ]
            if descendants and bounds is not None:
                x = sum(point[0] for point in descendants) / len(descendants)
                return x, bounds[1]
            if bounds is not None:
                return bounds[0] + ((bounds[2] - bounds[0]) / 2), bounds[1]
            return element_center(candidate.element, parent_map)

        visual_positions: dict[int, tuple[float, float]] = {}
        visual_bounds: dict[int, tuple[float, float, float, float]] = {}
        for candidate in visual_candidates:
            bounds = visual_bounds_for(candidate)
            if bounds is not None:
                visual_bounds[id(candidate)] = bounds
            if candidate.role == "item":
                position = cluster_position(candidate)
            else:
                position = node_position_cache.get(id(candidate))
            if position is not None:
                visual_positions[id(candidate)] = position

        positioned_visual = [candidate for candidate in visual_candidates if id(candidate) in visual_positions]
        if positioned_visual and edge_candidates:
            def root_start_rank(candidate: Candidate) -> int:
                return -1 if "root_start" in candidate.element_id else 0

            def primary_bucket(candidate: Candidate) -> int:
                return round(visual_positions[id(candidate)][axis] / 32.0)

            ordered_visual = sorted(
                positioned_visual,
                key=lambda candidate: (
                    root_start_rank(candidate),
                    primary_bucket(candidate),
                    visual_positions[id(candidate)][secondary_axis],
                    visual_positions[id(candidate)][axis],
                    0 if candidate.role == "item" else 1,
                    candidate.dom_index,
                ),
            )
            visual_stage = {id(candidate): index for index, candidate in enumerate(ordered_visual)}

            def bounds_distance(
                point: tuple[float, float],
                bounds: tuple[float, float, float, float],
            ) -> float:
                min_x, min_y, max_x, max_y = bounds
                dx = max(min_x - point[0], 0.0, point[0] - max_x)
                dy = max(min_y - point[1], 0.0, point[1] - max_y)
                return (dx * dx) + (dy * dy)

            def bounds_area(bounds: tuple[float, float, float, float]) -> float:
                min_x, min_y, max_x, max_y = bounds
                return max(0.0, max_x - min_x) * max(0.0, max_y - min_y)

            def nearest_visual_candidate(
                point: tuple[float, float],
                options: list[Candidate],
            ) -> Candidate | None:
                if not options:
                    return None
                close_distance = 16.0

                def visual_distance_key(candidate: Candidate) -> tuple[float, float, float, int]:
                    distance = (
                        bounds_distance(point, visual_bounds[id(candidate)])
                        if id(candidate) in visual_bounds
                        else squared_distance(point, visual_positions[id(candidate)])
                    )
                    distance_bucket = 0.0 if distance <= close_distance else distance
                    return (
                        distance_bucket,
                        bounds_area(visual_bounds[id(candidate)])
                        if id(candidate) in visual_bounds
                        else float("inf"),
                        squared_distance(point, visual_positions[id(candidate)]),
                        candidate.dom_index,
                    )

                return min(
                    options,
                    key=visual_distance_key,
                )

            edge_visual_nodes: dict[int, tuple[Candidate, Candidate]] = {}
            for edge in edge_candidates:
                endpoints = edge_endpoints(edge)
                if endpoints is None:
                    continue
                start = translated_point(edge.element, parent_map, endpoints[0])
                end = translated_point(edge.element, parent_map, endpoints[1])
                source = nearest_visual_candidate(start, positioned_visual)
                target = nearest_visual_candidate(end, positioned_visual)
                if source is not None and target is source:
                    alternatives = [candidate for candidate in positioned_visual if candidate is not source]
                    replacement = nearest_visual_candidate(end, alternatives)
                    if replacement is not None:
                        target = replacement
                if source is None or target is None:
                    continue
                edge_visual_nodes[id(edge)] = (source, target)

            if edge_visual_nodes:
                sorted_edges = sorted(edge_candidates, key=lambda candidate: candidate.dom_index)
                sorted_labels = sorted(label_candidates, key=lambda candidate: candidate.dom_index)
                edge_labels: dict[int, list[Candidate]] = {}
                paired_labels: set[int] = set()
                for index, label in enumerate(sorted_labels):
                    if index >= len(sorted_edges):
                        break
                    edge = sorted_edges[index]
                    if id(edge) not in edge_visual_nodes:
                        continue
                    edge_labels.setdefault(id(edge), []).append(label)
                    paired_labels.add(id(label))

                stage_items: dict[int, list[Candidate]] = {
                    index: [candidate] for index, candidate in enumerate(ordered_visual)
                }
                for edge in sorted_edges:
                    endpoints = edge_visual_nodes.get(id(edge))
                    if endpoints is None:
                        continue
                    source, target = endpoints
                    source_stage = visual_stage[id(source)]
                    target_stage = visual_stage[id(target)]
                    stage = max(source_stage, target_stage)
                    edge.source_index = source_stage
                    edge.target_index = target_stage
                    stage_items.setdefault(stage, []).append(edge)
                    for label in edge_labels.get(id(edge), []):
                        label.source_index = source_stage
                        label.target_index = target_stage
                        stage_items[stage].append(label)

                planned_ids = {
                    id(candidate) for values in stage_items.values() for candidate in values
                } | paired_labels
                fallback_stage = len(stage_items)
                for candidate in candidates:
                    if id(candidate) in planned_ids:
                        continue
                    stage_items.setdefault(fallback_stage, []).append(candidate)
                    fallback_stage += 1

                return plan_staged_items_with_following_connections(
                    stage_items, args, "state-flow"
                )

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

    for edge in edge_candidates:
        endpoints = edge_endpoints(edge)
        if endpoints is None:
            continue
        source = nearest_candidate(endpoints[0], positioned_nodes, positions)
        target = nearest_candidate(endpoints[1], positioned_nodes, positions)
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
    sorted_labels = sorted(label_candidates, key=lambda candidate: candidate.dom_index)
    edge_labels: dict[int, list[Candidate]] = {}
    paired_labels: set[int] = set()
    for index, label in enumerate(sorted_labels):
        if index >= len(sorted_edges):
            break
        edge = sorted_edges[index]
        if id(edge) not in edge_keys:
            continue
        edge_labels.setdefault(id(edge), []).append(label)
        paired_labels.add(id(label))

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

    state_dwell_overrides = parse_keyed_number_entries(args.state_dwell, "--state-dwell")

    def state_dwell(candidate: Candidate) -> float:
        if candidate.role != "node":
            return 0.0
        return state_dwell_for_candidate(
            candidate,
            float(args.state_dwell_ms),
            state_dwell_overrides,
        )

    step_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(ordered_reveal_items) > 1:
        dwell_before_last = sum(state_dwell(candidate) for candidate in ordered_reveal_items[:-1])
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration - dwell_before_last
        step_gap = max(step_gap, available / (len(ordered_reveal_items) - 1))

    planned: list[Candidate] = []
    cumulative_state_dwell = 0.0
    for index, candidate in enumerate(ordered_reveal_items):
        candidate.effect = effect_for("state-flow", candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * step_gap) + cumulative_state_dwell
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
                label.effect = effect_for("state-flow", label.role)
                label.delay_ms = candidate.delay_ms
                label.duration_ms = duration
                label.stage = index
                label.source_index = candidate.source_index
                label.target_index = candidate.target_index
                planned.append(label)
        cumulative_state_dwell += state_dwell(candidate)

    return planned
