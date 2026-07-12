#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

from mermaid_animation.common import Candidate, ROLE_PRIORITY, effect_for, normalized


POSITION_TOLERANCE = 0.01


@dataclass
class TreeViewStep:
    depth: int
    y: float
    order: int
    connection_only: bool = False
    candidates: list[Candidate] = field(default_factory=list)


def is_treeview_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "treeview"


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


def label_position(candidate: Candidate) -> tuple[float, float] | None:
    x = numeric_attribute(candidate.element, "x")
    y = numeric_attribute(candidate.element, "y")
    if x is None or y is None:
        return None
    return x, y


def line_coordinates(candidate: Candidate) -> tuple[float, float, float, float] | None:
    x1 = numeric_attribute(candidate.element, "x1")
    y1 = numeric_attribute(candidate.element, "y1")
    x2 = numeric_attribute(candidate.element, "x2")
    y2 = numeric_attribute(candidate.element, "y2")
    if x1 is None or y1 is None or x2 is None or y2 is None:
        return None
    return x1, y1, x2, y2


def same_position(first: float, second: float) -> bool:
    return abs(first - second) <= POSITION_TOLERANCE


def depth_for_x(x: float, label_x_positions: list[float]) -> int:
    if not label_x_positions:
        return 0
    return min(range(len(label_x_positions)), key=lambda index: abs(label_x_positions[index] - x))


def nearest_label_by_y(
    y: float,
    labels: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> Candidate | None:
    same_row = [
        label
        for label in labels
        if same_position(positions[id(label)][1], y)
    ]
    if not same_row:
        return None
    return min(same_row, key=lambda label: abs(positions[id(label)][1] - y))


def treeview_steps(candidates: list[Candidate]) -> list[TreeViewStep]:
    labels = [
        candidate
        for candidate in candidates
        if candidate_has_class(candidate, "treeView-node-label")
    ]
    lines = [
        candidate
        for candidate in candidates
        if candidate_has_class(candidate, "treeView-node-line")
    ]
    label_positions = {
        id(candidate): position
        for candidate in labels
        if (position := label_position(candidate)) is not None
    }
    if len(label_positions) != len(labels):
        return []

    label_x_positions = sorted({position[0] for position in label_positions.values()})
    steps_by_label: dict[int, TreeViewStep] = {}
    assigned: set[int] = set()

    for label in labels:
        x, y = label_positions[id(label)]
        depth = depth_for_x(x, label_x_positions)
        step = TreeViewStep(depth=depth, y=y, order=label.dom_index, candidates=[label])
        steps_by_label[id(label)] = step
        assigned.add(id(label))

    extra_steps: list[TreeViewStep] = []
    for line in lines:
        coordinates = line_coordinates(line)
        if coordinates is None:
            continue
        x1, y1, x2, y2 = coordinates
        assigned.add(id(line))

        if same_position(y1, y2):
            label = nearest_label_by_y(y1, labels, label_positions)
            if label is not None:
                steps_by_label[id(label)].candidates.insert(0, line)
                continue

            depth = depth_for_x(max(x1, x2), label_x_positions)
            extra_steps.append(TreeViewStep(depth=depth, y=y1, order=line.dom_index, candidates=[line]))
            continue

        if same_position(x1, x2):
            parent_depth = depth_for_x(x1, label_x_positions)
            child_depth = min(parent_depth + 1, max(len(label_x_positions) - 1, 0))
            extra_steps.append(
                TreeViewStep(
                    depth=child_depth,
                    y=min(y1, y2),
                    order=line.dom_index,
                    connection_only=True,
                    candidates=[line],
                )
            )
            continue

        extra_steps.append(
            TreeViewStep(depth=0, y=min(y1, y2), order=line.dom_index, connection_only=True, candidates=[line])
        )

    fallback_steps = [
        TreeViewStep(
            depth=len(label_x_positions),
            y=0.0,
            order=candidate.dom_index,
            candidates=[candidate],
        )
        for candidate in candidates
        if id(candidate) not in assigned
    ]

    return sorted(
        [*steps_by_label.values(), *extra_steps, *fallback_steps],
        key=lambda step: (step.depth, 1 if step.connection_only else 0, step.y, step.order),
    )


def plan_treeview_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    steps = treeview_steps(candidates)
    if not steps:
        return []

    duration = float(args.duration_ms)
    stagger = float(args.stagger_ms)

    planned: list[Candidate] = []
    current_delay = float(args.initial_delay_ms)
    for stage, step in enumerate(steps):
        ordered_candidates = sorted(
            step.candidates,
            key=lambda item: (
                1 if item.role == "edge" else 0,
                ROLE_PRIORITY.get(item.role, 99),
                item.dom_index,
            ),
        )
        has_entity = any(candidate.role != "edge" for candidate in ordered_candidates)
        has_edge = any(candidate.role == "edge" for candidate in ordered_candidates)
        edge_delay = current_delay + duration + stagger if has_entity and has_edge else current_delay

        for candidate in ordered_candidates:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = edge_delay if candidate.role == "edge" else current_delay
            candidate.duration_ms = duration
            candidate.level = step.depth
            candidate.stage = stage
            planned.append(candidate)
        current_delay += (duration + stagger + duration if has_entity and has_edge else duration) + stagger

    return sorted(
        planned,
        key=lambda candidate: (
            candidate.delay_ms,
            ROLE_PRIORITY.get(candidate.role, 99),
            candidate.dom_index,
        ),
    )
