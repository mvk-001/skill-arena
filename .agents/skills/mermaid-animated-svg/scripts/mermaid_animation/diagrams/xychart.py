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
    ancestors,
    build_parent_map,
    class_tokens,
    collapsed_text,
    element_center,
    effect_for,
    local_name,
    normalized,
    numeric_attribute,
)


def is_xychart_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "xychart"


def xy_chart_needs_specialized_discovery(root: ET.Element) -> bool:
    has_negative_tick = any(
        (text := collapsed_text(element)).startswith("-") and text[1:].split(maxsplit=1)[0].isdigit()
        for element in root.iter()
        if local_name(element.tag) == "text"
    )
    line_plot_count = sum(
        1
        for element in root.iter()
        if any(token.lower().startswith("line-plot-") for token in class_tokens(element))
    )
    return has_negative_tick or line_plot_count > 1


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def has_class_prefix(element: ET.Element, prefix: str) -> bool:
    return any(token.lower().startswith(prefix) for token in class_tokens(element))


def has_ancestor_class_prefix(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    prefix: str,
) -> bool:
    return any(has_class_prefix(parent, prefix) for parent in ancestors(element, parent_map))


def discover_xychart_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    if not xy_chart_needs_specialized_discovery(root):
        return []

    parent_map = build_parent_map(root)
    selected: set[ET.Element] = set()
    candidates: list[Candidate] = []

    def add_candidate(element: ET.Element, role: str, extra_classes: Iterable[str]) -> None:
        if element in selected or any(parent in selected for parent in ancestors(element, parent_map)):
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
        tokens = {token.lower() for token in class_tokens(element)}

        if tag == "g" and tokens & {"chart-title", "bottom-axis", "left-axis"}:
            add_candidate(element, "label", ["xychart-base"])
            continue

        if tag == "rect" and has_ancestor_class_prefix(element, parent_map, "bar-plot-"):
            add_candidate(element, "node", ["xychart-bar"])
            continue

        if tag == "text" and has_ancestor_class_prefix(element, parent_map, "bar-plot-"):
            add_candidate(element, "label", ["xychart-bar-label"])
            continue

        if tag == "path" and has_ancestor_class_prefix(element, parent_map, "line-plot-"):
            add_candidate(element, "edge", ["xychart-line"])

    return candidates


def candidate_has_class(candidate: Candidate, token: str) -> bool:
    return token.lower() in {value.lower() for value in candidate.classes}


def candidate_x(candidate: Candidate, parent_map: dict[ET.Element, ET.Element]) -> float:
    x = numeric_attribute(candidate.element, "x")
    if x is not None:
        return x
    center = element_center(candidate.element, parent_map)
    return center[0] if center is not None else 0.0


def candidate_y(candidate: Candidate, parent_map: dict[ET.Element, ET.Element]) -> float:
    y = numeric_attribute(candidate.element, "y")
    if y is not None:
        return y
    center = element_center(candidate.element, parent_map)
    return center[1] if center is not None else 0.0


def line_series_index(candidate: Candidate) -> int:
    for token in candidate.classes:
        match = re.fullmatch(r"line-plot-(\d+)", token.lower())
        if match:
            return int(match.group(1))
    return candidate.dom_index


def plan_xychart_candidates(
    candidates: list[Candidate],
    root: ET.Element,
    args: argparse.Namespace,
    effective_animation: str,
) -> list[Candidate]:
    if args.animation != "auto" or any(candidate.explicit_order is not None for candidate in candidates):
        return []

    parent_map = build_parent_map(root)
    base_candidates = [
        candidate for candidate in candidates if candidate_has_class(candidate, "xychart-base")
    ]
    bar_candidates = [
        candidate for candidate in candidates if candidate_has_class(candidate, "xychart-bar")
    ]
    bar_label_candidates = [
        candidate for candidate in candidates if candidate_has_class(candidate, "xychart-bar-label")
    ]
    line_candidates = [
        candidate for candidate in candidates if candidate_has_class(candidate, "xychart-line")
    ]
    if not bar_candidates and not line_candidates:
        return []

    labels_by_bar: dict[int, list[Candidate]] = {}
    for label in bar_label_candidates:
        nearest_bar = min(
            bar_candidates,
            key=lambda bar: abs(candidate_x(bar, parent_map) - candidate_x(label, parent_map)),
            default=None,
        )
        if nearest_bar is not None:
            labels_by_bar.setdefault(id(nearest_bar), []).append(label)

    stages: list[list[Candidate]] = []
    if base_candidates:
        stages.append(sorted(base_candidates, key=lambda candidate: candidate.dom_index))

    for bar in sorted(bar_candidates, key=lambda candidate: (candidate_x(candidate, parent_map), candidate.dom_index)):
        stages.append([bar, *sorted(labels_by_bar.get(id(bar), []), key=lambda candidate: candidate.dom_index)])

    for line in sorted(line_candidates, key=lambda candidate: (line_series_index(candidate), candidate.dom_index)):
        stages.append([line])

    planned_ids = {id(candidate) for stage in stages for candidate in stage}
    leftovers = [candidate for candidate in candidates if id(candidate) not in planned_ids]
    if leftovers:
        stages.append(sorted(leftovers, key=lambda candidate: (candidate_y(candidate, parent_map), candidate.dom_index)))

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
