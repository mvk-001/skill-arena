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
    build_parent_map,
    class_tokens,
    collapsed_text,
    element_bounds,
    element_center,
    effect_for,
    local_name,
    normalized,
)


def is_sequence_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "sequence"


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def discover_sequence_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    if not any(element.get("data-et", "") == "control-structure" for element in root.iter()):
        return []

    parent_map = build_parent_map(root)
    selected: set[ET.Element] = set()
    candidates: list[Candidate] = []

    def already_selected(element: ET.Element) -> bool:
        return any(parent in selected for parent in ancestors(element, parent_map))

    def add_candidate(element: ET.Element, role: str, extra_classes: Iterable[str]) -> None:
        if element in selected or already_selected(element):
            return
        selected.add(element)
        candidates.append(
            Candidate(
                element=element,
                role=role,
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=add_classes(class_tokens(element), extra_classes),
                text=collapsed_text(element),
            )
        )

    for element in root.iter():
        tag = local_name(element.tag)
        data_et = element.get("data-et", "")
        tokens = {token.lower() for token in class_tokens(element)}
        text = collapsed_text(element)

        if data_et == "participant":
            add_candidate(element, "actor", ["sequence-participant"])
            continue

        if tag == "g" and "actor-man" in tokens and "actor-bottom" in tokens:
            add_candidate(element, "actor", ["sequence-bottom-actor"])
            continue

        if tag in {"rect", "text"} and "actor-bottom" in tokens:
            add_candidate(element, "actor", ["sequence-bottom-actor"])
            continue

        if tag == "text" and "actor-box" in tokens:
            # Standalone mirrored bottom labels are not children of participant groups.
            center = element_center(element, parent_map)
            if center is not None and center[1] > 200:
                add_candidate(element, "actor", ["sequence-bottom-actor"])
            continue

        if data_et == "control-structure":
            add_candidate(element, "cluster", ["sequence-control"])
            continue

        if tag == "g" and text in {"Front door", "Platform"}:
            add_candidate(element, "cluster", ["sequence-box"])
            continue

        if data_et == "message" or "messageline0" in tokens or "messageline1" in tokens:
            add_candidate(element, "edge", ["sequence-message-line"])
            continue

        if "messagetext" in tokens:
            add_candidate(element, "label", ["sequence-message-text"])
            continue

        if "sequencenumber" in tokens:
            add_candidate(element, "label", ["sequence-number"])
            continue

        if any(token.startswith("activation") for token in tokens):
            add_candidate(element, "item", ["sequence-activation"])

    return candidates


def candidate_center(
    candidate: Candidate,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float] | None:
    return element_center(candidate.element, parent_map)


def candidate_bounds(
    candidate: Candidate,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float, float, float] | None:
    return element_bounds(candidate.element, parent_map)


def has_candidate_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def plan_sequence_candidates(
    candidates: list[Candidate],
    root: ET.Element,
    args: argparse.Namespace,
    effective_animation: str,
) -> list[Candidate]:
    if args.animation != "auto" or any(candidate.explicit_order is not None for candidate in candidates):
        return []

    parent_map = build_parent_map(root)
    actor_candidates = [candidate for candidate in candidates if candidate.role == "actor"]
    box_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "cluster" and has_candidate_class(candidate, "sequence-box")
    ]
    control_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "cluster" and has_candidate_class(candidate, "sequence-control")
    ]
    message_lines = [
        candidate
        for candidate in candidates
        if candidate.role == "edge" and has_candidate_class(candidate, "sequence-message-line")
    ]
    message_labels = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and has_candidate_class(candidate, "sequence-message-text")
    ]
    number_labels = [
        candidate
        for candidate in candidates
        if candidate.role == "label" and has_candidate_class(candidate, "sequence-number")
    ]
    activation_candidates = [
        candidate
        for candidate in candidates
        if has_candidate_class(candidate, "sequence-activation")
    ]

    line_positions = {
        id(candidate): center
        for candidate in message_lines
        if (center := candidate_center(candidate, parent_map)) is not None
    }
    if not actor_candidates or not line_positions:
        return []

    actor_positions = {
        id(candidate): center
        for candidate in actor_candidates
        if (center := candidate_center(candidate, parent_map)) is not None
    }
    if not actor_positions:
        return []
    top_y = min(position[1] for position in actor_positions.values())
    actor_row_tolerance = 90.0
    first_stage = sorted(
        [*box_candidates, *actor_candidates],
        key=lambda candidate: (
            1 if has_candidate_class(candidate, "sequence-bottom-actor") else 0,
            abs((actor_positions.get(id(candidate)) or candidate_center(candidate, parent_map) or (0, 0))[1] - top_y)
            > actor_row_tolerance,
            (candidate_center(candidate, parent_map) or (0.0, 0.0))[0],
            candidate.dom_index,
        ),
    )

    sorted_lines = sorted(
        message_lines,
        key=lambda candidate: (line_positions[id(candidate)][1], candidate.dom_index),
    )

    def paired_line(candidate: Candidate) -> Candidate | None:
        center = candidate_center(candidate, parent_map)
        if center is None:
            return None
        if has_candidate_class(candidate, "sequence-message-text"):
            following_lines = [
                line
                for line in sorted_lines
                if line_positions[id(line)][1] >= center[1] - 1.0
            ]
            if following_lines:
                return min(
                    following_lines,
                    key=lambda line: (
                        line_positions[id(line)][1],
                        abs(line_positions[id(line)][0] - center[0]),
                        line.dom_index,
                    ),
                )
        return min(sorted_lines, key=lambda line: abs(line_positions[id(line)][1] - center[1]))

    labels_by_line: dict[int, list[Candidate]] = {}
    paired_label_ids: set[int] = set()
    for label in [*message_labels, *number_labels]:
        line = paired_line(label)
        if line is None:
            continue
        labels_by_line.setdefault(id(line), []).append(label)
        paired_label_ids.add(id(label))

    control_bounds = {
        id(candidate): bounds
        for candidate in control_candidates
        if (bounds := candidate_bounds(candidate, parent_map)) is not None
    }
    control_first_line: dict[int, int] = {}
    for control in control_candidates:
        bounds = control_bounds.get(id(control))
        if bounds is None:
            continue
        _min_x, min_y, _max_x, max_y = bounds
        contained = [
            index
            for index, line in enumerate(sorted_lines)
            if min_y - 8 <= line_positions[id(line)][1] <= max_y + 8
        ]
        if contained:
            control_first_line[id(control)] = min(contained)

    stages: list[list[Candidate]] = []
    if first_stage:
        stages.append(first_stage)

    activation_added = False
    added_control_ids: set[int] = set()
    for line_index, line in enumerate(sorted_lines):
        controls = [
            control
            for control in control_candidates
            if control_first_line.get(id(control)) == line_index and id(control) not in added_control_ids
        ]
        if controls:
            stages.append(sorted(controls, key=lambda candidate: candidate.dom_index))
            added_control_ids.update(id(candidate) for candidate in controls)

        step = [line, *sorted(labels_by_line.get(id(line), []), key=lambda candidate: candidate.dom_index)]
        if not activation_added and activation_candidates:
            step = [*activation_candidates, *step]
            activation_added = True
        stages.append(step)

    leftovers = [
        candidate
        for candidate in candidates
        if id(candidate) not in {id(item) for stage in stages for item in stage}
        and id(candidate) not in paired_label_ids
    ]
    if leftovers:
        stages.append(sorted(leftovers, key=lambda candidate: candidate.dom_index))

    duration = float(args.duration_ms)
    if args.total_ms is not None and len(stages) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stage_gap = max(duration + float(args.stagger_ms), available / (len(stages) - 1))
    else:
        stage_gap = duration + float(args.stagger_ms)

    planned: list[Candidate] = []
    for index, stage in enumerate(stages):
        delay = float(args.initial_delay_ms) + (index * stage_gap)
        for candidate in stage:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = delay
            candidate.duration_ms = duration
            candidate.stage = index
            planned.append(candidate)

    return planned
