#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from typing import Iterable

from mermaid_animation.common import Candidate, class_tokens, collapsed_text, effect_for, local_name, normalized


def is_gantt_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "gantt"


def discover_gantt_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    candidates: list[Candidate] = []

    def add_candidate(element: ET.Element, role: str, extra_classes: Iterable[str]) -> None:
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

    for element in root.iter():
        tag = local_name(element.tag)
        lower_tokens = {token.lower() for token in class_tokens(element)}

        if tag == "rect" and "section" in lower_tokens:
            add_candidate(element, "row", ["gantt-row"])
            continue

        if tag == "text" and any(token.startswith("sectiontitle") for token in lower_tokens):
            add_candidate(element, "label", ["gantt-row-title"])
            continue

        if tag == "rect" and "task" in lower_tokens:
            add_candidate(element, "node", ["gantt-task"])
            continue

        if tag == "text" and any(token.startswith("tasktext") for token in lower_tokens):
            add_candidate(element, "label", ["gantt-task-label"])

    return candidates


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def candidate_position(candidate: Candidate) -> tuple[float, float] | None:
    x = numeric_attribute(candidate.element, "x")
    y = numeric_attribute(candidate.element, "y")
    if x is not None and y is not None:
        return x, y
    return None


def row_key(candidate: Candidate) -> tuple[int, float, int, float, int]:
    position = candidate_position(candidate)
    if position is None:
        return 1, 0.0, 0 if candidate.role == "row" else 1, 0.0, candidate.dom_index
    return (
        0,
        position[1],
        0 if candidate.role == "row" else 1,
        position[0],
        candidate.dom_index,
    )


def task_key(candidates: list[Candidate]) -> tuple[int, float, float, int]:
    task_candidates = [candidate for candidate in candidates if candidate_has_class(candidate, "gantt-task")]
    positioned_candidates = task_candidates or candidates
    positions = [
        position
        for candidate in positioned_candidates
        if (position := candidate_position(candidate)) is not None
    ]
    if not positions:
        return 1, 0.0, 0.0, min(candidate.dom_index for candidate in candidates)
    x = min(position[0] for position in positions)
    y = min(position[1] for position in positions)
    return 0, x, y, min(candidate.dom_index for candidate in candidates)


def task_id_for_label(candidate: Candidate) -> str:
    if candidate.element_id.endswith("-text"):
        return candidate.element_id.removesuffix("-text")
    return ""


def plan_gantt_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    row_candidates = sorted(
        [
            candidate
            for candidate in candidates
            if candidate.role == "row" or candidate_has_class(candidate, "gantt-row-title")
        ],
        key=row_key,
    )
    task_bars = sorted(
        [candidate for candidate in candidates if candidate_has_class(candidate, "gantt-task")],
        key=lambda candidate: task_key([candidate]),
    )
    task_labels = sorted(
        [candidate for candidate in candidates if candidate_has_class(candidate, "gantt-task-label")],
        key=lambda candidate: task_key([candidate]),
    )

    labels_by_task_id: dict[str, list[Candidate]] = {}
    unpaired_labels: list[Candidate] = []
    for label in task_labels:
        task_id = task_id_for_label(label)
        if task_id:
            labels_by_task_id.setdefault(task_id, []).append(label)
        else:
            unpaired_labels.append(label)

    task_steps: list[list[Candidate]] = []
    for bar in task_bars:
        step = [bar, *labels_by_task_id.pop(bar.element_id, [])]
        task_steps.append(step)

    for labels in labels_by_task_id.values():
        unpaired_labels.extend(labels)
    for label in unpaired_labels:
        task_steps.append([label])

    task_steps.sort(key=task_key)

    if args.animation == "auto":
        row_bands = sorted(
            [
                candidate
                for candidate in row_candidates
                if candidate.role == "row" and candidate_position(candidate) is not None
            ],
            key=row_key,
        )
        section_titles = [
            candidate
            for candidate in row_candidates
            if candidate_has_class(candidate, "gantt-row-title")
        ]

        visual_steps: list[list[Candidate]] = []
        used_ids: set[int] = set()
        for row in row_bands:
            row_position = candidate_position(row)
            if row_position is None:
                continue
            row_y = row_position[1]
            step: list[Candidate] = [row]
            used_ids.add(id(row))

            for title in section_titles:
                if id(title) in used_ids:
                    continue
                title_position = candidate_position(title)
                if title_position is not None and abs(title_position[1] - row_y) <= 30:
                    step.append(title)
                    used_ids.add(id(title))

            matching_task_steps: list[list[Candidate]] = []
            for task_step in task_steps:
                if any(id(candidate) in used_ids for candidate in task_step):
                    continue
                key = task_key(task_step)
                if key[0] == 0 and abs(key[2] - row_y) <= 12:
                    matching_task_steps.append(task_step)

            for task_step in sorted(matching_task_steps, key=task_key):
                step.extend(task_step)
                used_ids.update(id(candidate) for candidate in task_step)

            visual_steps.append(step)

        for title in section_titles:
            if id(title) not in used_ids:
                visual_steps.insert(0, [title])
                used_ids.add(id(title))
        for task_step in task_steps:
            if not any(id(candidate) in used_ids for candidate in task_step):
                visual_steps.append(task_step)
                used_ids.update(id(candidate) for candidate in task_step)

        duration = float(args.duration_ms)
        if args.total_ms is not None and len(visual_steps) > 1:
            available = float(args.total_ms) - float(args.initial_delay_ms) - duration
            step_gap = max(duration + float(args.stagger_ms), available / (len(visual_steps) - 1))
        else:
            step_gap = duration + float(args.stagger_ms)

        planned: list[Candidate] = []
        for index, step in enumerate(visual_steps):
            delay = float(args.initial_delay_ms) + (index * step_gap)
            for candidate in step:
                candidate.effect = effect_for(effective_animation, candidate.role)
                candidate.delay_ms = delay
                candidate.duration_ms = duration
                candidate.stage = index
                planned.append(candidate)
        return planned

    duration = float(args.duration_ms)
    initial_delay = float(args.initial_delay_ms)
    task_start_delay = initial_delay + (duration if row_candidates else 0.0)
    if args.total_ms is not None and len(task_steps) > 1:
        available = float(args.total_ms) - task_start_delay - duration
        task_stagger = max(0.0, available / (len(task_steps) - 1))
    else:
        task_stagger = float(args.stagger_ms)

    for candidate in row_candidates:
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = initial_delay
        candidate.duration_ms = duration
        candidate.stage = 0

    planned: list[Candidate] = [*row_candidates]
    task_stage_offset = 1 if row_candidates else 0
    for index, step in enumerate(task_steps):
        delay = task_start_delay + (index * task_stagger)
        for candidate in step:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = delay
            candidate.duration_ms = duration
            candidate.stage = task_stage_offset + index
            planned.append(candidate)

    return planned
