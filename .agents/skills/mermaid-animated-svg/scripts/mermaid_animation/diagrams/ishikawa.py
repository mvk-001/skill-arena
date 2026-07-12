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
    ROLE_PRIORITY,
    ancestor_has_class_fragment,
    class_tokens,
    collapsed_text,
    effect_for,
    has_lower_class,
    line_start,
    local_name,
    normalized,
    parse_number_list,
    squared_distance,
    translate_position,
    edge_endpoints,
)


def is_ishikawa_root(root: ET.Element) -> bool:
    role = normalized(root.get("aria-roledescription", ""))
    return role == "ishikawa" or has_lower_class(root, "ishikawa")


def discover_ishikawa_candidates(
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    dom_order: dict[ET.Element, int],
) -> list[Candidate]:
    selected: set[ET.Element] = set()
    candidates: list[Candidate] = []

    def add_candidate(element: ET.Element, role: str) -> None:
        if element in selected:
            return
        selected.add(element)
        candidates.append(
            Candidate(
                element=element,
                role=role,
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=class_tokens(element),
                text=collapsed_text(element),
            )
        )

    for element in root.iter():
        lower_tokens = {token.lower() for token in class_tokens(element)}
        if "ishikawa-head-group" in lower_tokens:
            add_candidate(element, "node")
        elif lower_tokens & {"ishikawa-spine", "ishikawa-branch", "ishikawa-sub-branch"}:
            add_candidate(element, "edge")
        elif "ishikawa-label-group" in lower_tokens:
            add_candidate(element, "label")
        elif (
            local_name(element.tag) == "text"
            and "ishikawa-label" in lower_tokens
            and not ancestor_has_class_fragment(element, parent_map, "ishikawa-label-group")
        ):
            add_candidate(element, "label")

    return candidates


def ishikawa_problem_position(head_candidates: list[Candidate], spine_candidates: list[Candidate]) -> tuple[float, float] | None:
    for candidate in head_candidates:
        position = translate_position(candidate.element)
        if position is not None:
            return position

    for candidate in spine_candidates:
        endpoints = edge_endpoints(candidate)
        if endpoints is not None:
            first, second = endpoints
            return second if second[0] >= first[0] else first

    return None


def ishikawa_branch_stages(
    pair: ET.Element,
    candidate_by_element: dict[ET.Element, Candidate],
) -> list[list[list[Candidate]]]:
    branches: list[list[list[Candidate]]] = []
    current: list[list[Candidate]] = []

    def flush_current() -> None:
        nonlocal current
        if current:
            branches.append(current)
            current = []

    for child in list(pair):
        if has_lower_class(child, "ishikawa-branch"):
            flush_current()
            branch_line = candidate_by_element.get(child)
            current = [[branch_line]] if branch_line is not None else []
        elif has_lower_class(child, "ishikawa-label-group"):
            label = candidate_by_element.get(child)
            if label is not None:
                if not current:
                    current = [[label]]
                else:
                    current[0].append(label)
        elif has_lower_class(child, "ishikawa-sub-group"):
            point_stage: list[Candidate] = []
            for point_child in child.iter():
                if point_child is child:
                    continue
                point_candidate = candidate_by_element.get(point_child)
                if point_candidate is not None:
                    point_stage.append(point_candidate)
            if point_stage:
                current.append(point_stage)

    flush_current()
    return branches


def ishikawa_branch_duration(
    branch_index: int,
    stage_count: int,
    duration: float,
    args: argparse.Namespace,
    default_branch_ms: float | None,
) -> float:
    branch_durations = parse_number_list(args.ishikawa_branch_durations, "--ishikawa-branch-durations")
    if branch_index < len(branch_durations):
        requested = branch_durations[branch_index]
    elif args.ishikawa_branch_ms is not None:
        requested = float(args.ishikawa_branch_ms)
    elif default_branch_ms is not None:
        requested = default_branch_ms
    else:
        requested = (duration * stage_count) + (float(args.stagger_ms) * max(0, stage_count - 1))

    minimum = duration * stage_count
    return max(minimum, requested)


def assign_ishikawa_branch_stages(
    stages: list[list[Candidate]],
    branch_index: int,
    stage_start: int,
    current_delay: float,
    duration: float,
    args: argparse.Namespace,
    default_branch_ms: float | None,
    planned: list[Candidate],
) -> tuple[int, float]:
    if not stages:
        return stage_start, current_delay

    total_branch_ms = ishikawa_branch_duration(
        branch_index,
        len(stages),
        duration,
        args,
        default_branch_ms,
    )
    start_gap = 0.0
    if len(stages) > 1:
        start_gap = max(duration, (total_branch_ms - duration) / (len(stages) - 1))

    branch_end = current_delay
    for branch_step, stage_candidates in enumerate(stages):
        delay = current_delay + (branch_step * start_gap)
        for candidate in sorted(
            stage_candidates,
            key=lambda item: (ROLE_PRIORITY.get(item.role, 99), item.dom_index),
        ):
            candidate.effect = effect_for("ishikawa", candidate.role)
            candidate.delay_ms = delay
            candidate.duration_ms = duration
            candidate.stage = stage_start + branch_step
            candidate.branch_index = branch_index
            candidate.branch_step = branch_step
            planned.append(candidate)
        branch_end = max(branch_end, delay + duration)

    return stage_start + len(stages), branch_end


def plan_ishikawa_candidates(candidates: list[Candidate], root: ET.Element, args: argparse.Namespace) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    candidate_by_element = {candidate.element: candidate for candidate in candidates}
    head_candidates = [
        candidate for candidate in candidates if has_lower_class(candidate.element, "ishikawa-head-group")
    ]
    spine_candidates = [
        candidate for candidate in candidates if has_lower_class(candidate.element, "ishikawa-spine")
    ]
    problem_position = ishikawa_problem_position(head_candidates, spine_candidates)

    branch_specs: list[tuple[float, int, list[list[Candidate]]]] = []
    for pair in root.iter():
        if not has_lower_class(pair, "ishikawa-pair"):
            continue
        for stages in ishikawa_branch_stages(pair, candidate_by_element):
            first_edge = next(
                (candidate for stage in stages for candidate in stage if candidate.role == "edge"),
                None,
            )
            start = line_start(first_edge) if first_edge is not None else None
            distance = (
                squared_distance(problem_position, start)
                if problem_position is not None and start is not None
                else float("inf")
            )
            first_dom = min((candidate.dom_index for stage in stages for candidate in stage), default=0)
            branch_specs.append((distance, first_dom, stages))

    branch_specs.sort(key=lambda item: (item[0], item[1]))
    if not head_candidates and not spine_candidates and not branch_specs:
        return []

    duration = float(args.duration_ms)
    initial_delay = float(args.initial_delay_ms)
    base_candidates = sorted(
        [*head_candidates, *spine_candidates],
        key=lambda candidate: (ROLE_PRIORITY.get(candidate.role, 99), candidate.dom_index),
    )
    branch_gap = (
        float(args.ishikawa_branch_gap_ms)
        if args.ishikawa_branch_gap_ms is not None
        else float(args.stagger_ms)
    )
    branch_durations = parse_number_list(args.ishikawa_branch_durations, "--ishikawa-branch-durations")
    explicit_branch_timing = args.ishikawa_branch_ms is not None or bool(branch_durations)
    default_branch_ms: float | None = None
    if args.total_ms is not None and branch_specs and not explicit_branch_timing:
        available = (
            float(args.total_ms)
            - initial_delay
            - (duration if base_candidates else 0.0)
            - (branch_gap * max(0, len(branch_specs) - 1))
        )
        default_branch_ms = max(0.0, available / len(branch_specs))

    planned: list[Candidate] = []
    for candidate in base_candidates:
        candidate.effect = effect_for("ishikawa", candidate.role)
        candidate.delay_ms = initial_delay
        candidate.duration_ms = duration
        candidate.stage = 0
        planned.append(candidate)

    stage_index = 1 if base_candidates else 0
    current_delay = initial_delay + (duration if base_candidates and branch_specs else 0.0)
    for branch_index, (_distance, _dom, stages) in enumerate(branch_specs):
        stage_index, branch_end = assign_ishikawa_branch_stages(
            stages,
            branch_index,
            stage_index,
            current_delay,
            duration,
            args,
            default_branch_ms,
            planned,
        )
        current_delay = branch_end + (branch_gap if branch_index < len(branch_specs) - 1 else 0.0)

    return planned
