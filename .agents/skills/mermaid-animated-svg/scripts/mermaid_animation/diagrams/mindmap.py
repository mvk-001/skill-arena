#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import math
import re
import xml.etree.ElementTree as ET

from mermaid_animation.common import (
    Candidate,
    ROLE_PRIORITY,
    average_position,
    class_number,
    class_tokens,
    numeric_id_suffix,
    parse_number_list,
    translate_position,
)


def is_mindmap_candidates(candidates: list[Candidate]) -> bool:
    return any("mindmap-node" in class_tokens(candidate.element) for candidate in candidates)


def mindmap_edge_indexes(element_id: str) -> tuple[int, int] | None:
    match = re.search(r"edge_(\d+)_(\d+)$", element_id)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def mindmap_root_indexes(nodes: dict[int, Candidate], edges: list[tuple[Candidate, int, int]]) -> list[int]:
    parents = {target for _, _, target in edges}
    explicit_roots = [
        index for index, candidate in nodes.items() if "section-root" in {token.lower() for token in candidate.classes}
    ]
    return explicit_roots or [index for index in nodes if index not in parents]


def mindmap_child_edges(edges: list[tuple[Candidate, int, int]]) -> dict[int, list[tuple[Candidate, int]]]:
    children: dict[int, list[tuple[Candidate, int]]] = {}
    for candidate, source, target in edges:
        children.setdefault(source, []).append((candidate, target))
    for source in children:
        children[source].sort(key=lambda item: item[0].dom_index)
    return children


def mindmap_levels(nodes: dict[int, Candidate], edges: list[tuple[Candidate, int, int]]) -> dict[int, int]:
    roots = mindmap_root_indexes(nodes, edges)
    children = mindmap_child_edges(edges)

    levels: dict[int, int] = {}
    queue: list[tuple[int, int]] = [(root, 0) for root in roots]
    while queue:
        node_index, level = queue.pop(0)
        if node_index in levels and levels[node_index] <= level:
            continue
        levels[node_index] = level
        for _, child in children.get(node_index, []):
            queue.append((child, level + 1))

    for node_index in nodes:
        levels.setdefault(node_index, 0)
    return levels


def radial_edge_sort_key(
    candidate: Candidate,
    nodes: dict[int, Candidate],
    origin: tuple[float, float] | None,
) -> tuple[float, float, int]:
    target = nodes.get(candidate.target_index or -1)
    target_position = translate_position(target.element) if target is not None else None
    if origin is None or target_position is None:
        return 0.0, 0.0, candidate.dom_index

    dx = target_position[0] - origin[0]
    dy = target_position[1] - origin[1]
    distance = math.hypot(dx, dy)
    # Normalize angle to a clockwise sweep starting at the top of the diagram.
    angle = (math.atan2(dy, dx) + (math.pi / 2)) % (2 * math.pi)
    return distance, angle, candidate.dom_index


def assign_mindmap_delays(planned: list[Candidate], nodes: dict[int, Candidate], args: argparse.Namespace) -> None:
    stage_values = sorted({candidate.stage for candidate in planned if candidate.stage is not None})
    origin = average_position(candidate for candidate in nodes.values() if candidate.level == 0)
    raw_delays: dict[int, float] = {}
    current_delay = float(args.initial_delay_ms)
    inter_stage_gap = float(args.stagger_ms)
    wave_gap = float(args.mindmap_radial_wave_ms)

    for stage in stage_values:
        stage_candidates = [candidate for candidate in planned if candidate.stage == stage]
        edge_candidates = [candidate for candidate in stage_candidates if candidate.effect == "radial-arrow"]
        edge_order = {
            id(candidate): index
            for index, candidate in enumerate(
                sorted(edge_candidates, key=lambda candidate: radial_edge_sort_key(candidate, nodes, origin))
            )
        }
        stage_span = 0.0
        for candidate in stage_candidates:
            wave_index = edge_order.get(id(candidate), 0)
            if candidate.effect == "radial-arrow":
                candidate.wave_index = wave_index
            offset = wave_index * wave_gap
            raw_delays[id(candidate)] = current_delay + offset
            stage_span = max(stage_span, offset)
        current_delay += stage_span + float(args.duration_ms) + inter_stage_gap

    if args.total_ms is not None and planned:
        raw_last_delay = max(raw_delays.values())
        target_last_delay = max(float(args.initial_delay_ms), float(args.total_ms) - float(args.duration_ms))
        span = raw_last_delay - float(args.initial_delay_ms)
        scale = 0.0 if span <= 0 else (target_last_delay - float(args.initial_delay_ms)) / span
    else:
        scale = 1.0

    for candidate in planned:
        raw_delay = raw_delays[id(candidate)]
        candidate.delay_ms = float(args.initial_delay_ms) + (
            (raw_delay - float(args.initial_delay_ms)) * scale
        )


def extract_mindmap_graph(candidates: list[Candidate]) -> tuple[dict[int, Candidate], list[tuple[Candidate, int, int]]]:
    nodes: dict[int, Candidate] = {}
    edges: list[tuple[Candidate, int, int]] = []

    for candidate in candidates:
        if "mindmap-node" in candidate.classes:
            node_index = numeric_id_suffix(candidate.element_id, "node_")
            if node_index is not None:
                nodes[node_index] = candidate
        elif candidate.role == "edge":
            edge_indexes = mindmap_edge_indexes(candidate.element_id)
            if edge_indexes is not None:
                edges.append((candidate, edge_indexes[0], edge_indexes[1]))
    edges.sort(key=lambda edge: edge[0].dom_index)
    return nodes, edges


def assign_mindmap_branch_delays(planned: list[Candidate], args: argparse.Namespace) -> None:
    if not planned:
        return

    duration = float(args.duration_ms)
    branch_durations = parse_number_list(args.mindmap_branch_durations, "--mindmap-branch-durations")
    branch_gap = (
        float(args.mindmap_branch_gap_ms)
        if args.mindmap_branch_gap_ms is not None
        else float(args.stagger_ms)
    )
    branch_budget = args.mindmap_branch_ms
    branch_timing_enabled = branch_budget is not None or bool(branch_durations)

    if not branch_timing_enabled and args.total_ms is not None and len(planned) > 1:
        available_gap = float(args.total_ms) - (duration * len(planned)) - float(args.initial_delay_ms)
        step_gap = max(0.0, available_gap / (len(planned) - 1))
    elif not branch_timing_enabled:
        step_gap = float(args.stagger_ms)

    if not branch_timing_enabled:
        for index, candidate in enumerate(planned):
            candidate.delay_ms = float(args.initial_delay_ms) + (index * (duration + step_gap))
            candidate.duration_ms = duration
            candidate.stage = index
        return

    root_candidates = [candidate for candidate in planned if candidate.branch_index is None]
    branch_indexes = sorted(
        {candidate.branch_index for candidate in planned if candidate.branch_index is not None}
    )

    current_delay = float(args.initial_delay_ms)
    for candidate in root_candidates:
        candidate.delay_ms = current_delay
        candidate.duration_ms = duration
        current_delay += duration + branch_gap

    for branch_index in branch_indexes:
        branch_candidates = sorted(
            [candidate for candidate in planned if candidate.branch_index == branch_index],
            key=lambda candidate: candidate.branch_step if candidate.branch_step is not None else 999,
        )
        if not branch_candidates:
            continue

        if branch_index < len(branch_durations):
            total_branch_ms = branch_durations[branch_index]
        elif branch_budget is not None:
            total_branch_ms = float(branch_budget)
        else:
            total_branch_ms = (duration * len(branch_candidates)) + (
                float(args.stagger_ms) * max(0, len(branch_candidates) - 1)
            )

        start_gap = 0.0
        if len(branch_candidates) > 1:
            start_gap = max(0.0, (total_branch_ms - duration) / (len(branch_candidates) - 1))

        branch_end = current_delay
        for index, candidate in enumerate(branch_candidates):
            candidate.delay_ms = current_delay + (index * start_gap)
            candidate.duration_ms = duration
            branch_end = max(branch_end, candidate.delay_ms + duration)

        current_delay = branch_end + branch_gap

    for stage, candidate in enumerate(sorted(planned, key=lambda item: (item.delay_ms, item.dom_index))):
        candidate.stage = stage


def plan_mindmap_branch_candidates(candidates: list[Candidate], args: argparse.Namespace) -> list[Candidate]:
    nodes, edges = extract_mindmap_graph(candidates)
    if not nodes:
        return []

    levels = mindmap_levels(nodes, edges)
    roots = mindmap_root_indexes(nodes, edges)
    children = mindmap_child_edges(edges)
    planned: list[Candidate] = []
    planned_elements: set[ET.Element] = set()
    branch_index = 0

    def add_candidate(candidate: Candidate, effect: str, branch: int | None, step: int | None) -> None:
        if candidate.element in planned_elements:
            return
        candidate.effect = effect
        candidate.branch_index = branch
        candidate.branch_step = step
        candidate.duration_ms = float(args.duration_ms)
        planned_elements.add(candidate.element)
        planned.append(candidate)

    def visit_child(edge: Candidate, source: int, target: int, branch: int, step: int) -> int:
        node = nodes.get(target)
        if node is not None:
            node.level = levels.get(target, 0)
            add_candidate(node, "pop", branch, step)
            step += 1

        edge.level = levels.get(source, 0)
        edge.source_index = source
        edge.target_index = target
        edge.wave_index = step
        add_candidate(edge, "radial-arrow", branch, step)
        step += 1

        for child_edge, child_target in children.get(target, []):
            step = visit_child(child_edge, target, child_target, branch, step)
        return step

    for root_index in sorted(roots, key=lambda index: nodes[index].dom_index):
        root = nodes[root_index]
        root.level = levels.get(root_index, 0)
        add_candidate(root, "pop", None, None)
        for edge, target in children.get(root_index, []):
            visit_child(edge, root_index, target, branch_index, 0)
            branch_index += 1

    for candidate in sorted(nodes.values(), key=lambda item: item.dom_index):
        candidate.level = levels.get(numeric_id_suffix(candidate.element_id, "node_") or 0, 0)
        add_candidate(candidate, "pop", None, None)
    for edge, source, target in edges:
        edge.level = levels.get(source, 0)
        edge.source_index = source
        edge.target_index = target
        add_candidate(edge, "radial-arrow", None, None)

    assign_mindmap_branch_delays(planned, args)
    return planned


def plan_mindmap_candidates(candidates: list[Candidate], args: argparse.Namespace) -> list[Candidate]:
    if getattr(args, "effective_animation", args.animation) == "mindmap-branch":
        return plan_mindmap_branch_candidates(candidates, args)

    nodes, edges = extract_mindmap_graph(candidates)

    if not nodes:
        return []

    levels = mindmap_levels(nodes, edges)
    planned: list[Candidate] = []

    for node_index, candidate in nodes.items():
        level = levels[node_index]
        candidate.level = level
        candidate.stage = level * 2
        candidate.effect = "pop"
        candidate.duration_ms = float(args.duration_ms)
        planned.append(candidate)

    for candidate, source, _target in edges:
        source_level = levels.get(source)
        if source_level is None:
            edge_depth = class_number(candidate, "edge-depth-")
            source_level = max(0, (edge_depth - 1) // 2) if edge_depth is not None else 0
        target_level = levels.get(_target, source_level + 1)
        candidate.level = source_level
        candidate.stage = (target_level * 2) + 1
        candidate.source_index = source
        candidate.target_index = _target
        candidate.effect = "radial-arrow"
        candidate.duration_ms = float(args.duration_ms)
        planned.append(candidate)

    assign_mindmap_delays(planned, nodes, args)

    return sorted(
        planned,
        key=lambda candidate: (
            candidate.delay_ms,
            ROLE_PRIORITY.get(candidate.role, 99),
            candidate.dom_index,
        ),
    )
