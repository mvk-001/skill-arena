#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET

from mermaid_animation.common import Candidate, ROLE_PRIORITY, effect_for, normalized, ordered_reveal_key


def is_kanban_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "kanban"


def plan_kanban_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    task_candidates = sorted(
        [candidate for candidate in candidates if candidate.role in {"node", "item"}],
        key=ordered_reveal_key,
    )
    task_ids = {id(candidate) for candidate in task_candidates}
    board_candidates = sorted(
        [candidate for candidate in candidates if id(candidate) not in task_ids],
        key=ordered_reveal_key,
    )

    duration = float(args.duration_ms)
    initial_delay = float(args.initial_delay_ms)
    task_start_delay = initial_delay + (duration if board_candidates else 0.0)

    if args.total_ms is not None and len(task_candidates) > 1:
        last_task_delay = max(task_start_delay, float(args.total_ms) - duration)
        task_stagger = (last_task_delay - task_start_delay) / (len(task_candidates) - 1)
    else:
        task_stagger = float(args.stagger_ms)

    for candidate in board_candidates:
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = initial_delay
        candidate.duration_ms = duration

    for index, candidate in enumerate(task_candidates):
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = task_start_delay + (index * task_stagger)
        candidate.duration_ms = duration

    return sorted(
        [*board_candidates, *task_candidates],
        key=lambda candidate: (
            candidate.delay_ms,
            ROLE_PRIORITY.get(candidate.role, 99),
            candidate.dom_index,
        ),
    )
