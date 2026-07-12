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
    effect_for,
    local_name,
    normalized,
)


RADAR_BASE_CLASSES = {
    "radargraticule",
    "radaraxisline",
    "radaraxislabel",
    "radarlegendtext",
    "radartitle",
}


def is_radar_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "radar"


def add_classes(classes: list[str], extra_classes: Iterable[str]) -> list[str]:
    result = [*classes]
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def lower_classes(element: ET.Element) -> set[str]:
    return {token.lower() for token in class_tokens(element)}


def class_prefix_number(classes: Iterable[str], prefix: str) -> int | None:
    prefix = prefix.lower()
    for token in classes:
        lower_token = token.lower()
        if not lower_token.startswith(prefix):
            continue
        suffix = lower_token[len(prefix) :]
        if re.fullmatch(r"\d+", suffix):
            return int(suffix)
    return None


def is_radar_curve(element: ET.Element) -> bool:
    return class_prefix_number(class_tokens(element), "radarcurve-") is not None


def is_radar_legend_box(element: ET.Element) -> bool:
    return class_prefix_number(class_tokens(element), "radarlegendbox-") is not None


def is_radar_base_element(element: ET.Element) -> bool:
    classes = lower_classes(element)
    return bool(classes & RADAR_BASE_CLASSES) or is_radar_legend_box(element)


def descendant_classes(element: ET.Element) -> list[str]:
    seen: set[str] = set()
    classes: list[str] = []
    for child in element.iter():
        for token in class_tokens(child):
            if token not in seen:
                seen.add(token)
                classes.append(token)
    return classes


def is_legend_group(element: ET.Element) -> bool:
    if local_name(element.tag) != "g":
        return False
    if any(child is not element and is_radar_curve(child) for child in element.iter()):
        return False
    return any(
        child is not element
        and ("radarlegendtext" in lower_classes(child) or is_radar_legend_box(child))
        for child in element.iter()
    )


def has_ancestor_in(element: ET.Element, selected: set[ET.Element], parent_map: dict[ET.Element, ET.Element]) -> bool:
    return any(parent in selected for parent in ancestors(element, parent_map))


def legend_series_index(element: ET.Element) -> int | None:
    return class_prefix_number(descendant_classes(element), "radarlegendbox-")


def radar_base_role(element: ET.Element) -> str:
    classes = lower_classes(element)
    if local_name(element.tag) == "text" or "radartitle" in classes or "radaraxislabel" in classes:
        return "label"
    if "radarlegendtext" in classes or is_radar_legend_box(element) or is_legend_group(element):
        return "label"
    return "item"


def discover_radar_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    parent_map = build_parent_map(root)
    candidates: list[Candidate] = []
    selected_legend_groups: set[ET.Element] = set()

    for element in root.iter():
        if is_legend_group(element):
            series_index = legend_series_index(element)
            extra_classes = ["radar-legend"]
            if series_index is not None:
                extra_classes.append(f"radar-series-{series_index}")
            selected_legend_groups.add(element)
            candidates.append(
                Candidate(
                    element=element,
                    role="label",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(descendant_classes(element), extra_classes),
                    text=collapsed_text(element),
                    branch_index=series_index,
                )
            )

    for element in root.iter():
        if has_ancestor_in(element, selected_legend_groups, parent_map):
            continue

        series_index = class_prefix_number(class_tokens(element), "radarcurve-")
        if series_index is not None:
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(
                        class_tokens(element),
                        ["radar-curve", f"radar-series-{series_index}", "radar-z-layer"],
                    ),
                    text=collapsed_text(element),
                    branch_index=series_index,
                )
            )
            continue

        if not is_radar_base_element(element):
            continue

        candidates.append(
            Candidate(
                element=element,
                role=radar_base_role(element),
                dom_index=dom_order[element],
                element_id=element.get("id", ""),
                classes=class_tokens(element),
                text=collapsed_text(element),
            )
        )

    return candidates


def is_radar_curve_candidate(candidate: Candidate) -> bool:
    return any(token.lower() == "radar-curve" for token in candidate.classes)


def is_circle_graticule_candidate(candidate: Candidate) -> bool:
    return local_name(candidate.element.tag) == "circle" and "radargraticule" in {
        token.lower() for token in candidate.classes
    }


def radar_base_group(candidate: Candidate) -> int:
    classes = {token.lower() for token in candidate.classes}
    if "radartitle" in classes or "radargraticule" in classes:
        return 0
    if "radaraxisline" in classes or "radaraxislabel" in classes:
        return 1
    if "radar-legend" in classes or "radarlegendtext" in classes or any(
        token.startswith("radarlegendbox-") for token in classes
    ):
        return 2
    return 1


def radar_curve_order_key(candidate: Candidate) -> tuple[int, int]:
    return candidate.dom_index, candidate.branch_index if candidate.branch_index is not None else 999


def plan_radar_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    if any(candidate.explicit_order is not None for candidate in candidates):
        return []

    base_candidates = sorted(
        [candidate for candidate in candidates if not is_radar_curve_candidate(candidate)],
        key=lambda candidate: candidate.dom_index,
    )
    curve_candidates = sorted(
        [candidate for candidate in candidates if is_radar_curve_candidate(candidate)],
        key=radar_curve_order_key,
    )
    ordered = [*base_candidates, *curve_candidates]
    if not ordered:
        return []

    duration = float(args.duration_ms)
    stage_count = (1 if base_candidates else 0) + len(curve_candidates)
    if args.total_ms is not None and stage_count > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stage_gap = max(0.0, available / (stage_count - 1))
    else:
        stage_gap = duration + float(args.stagger_ms)

    stagger_base = effective_animation == "radar-layers" and any(
        is_circle_graticule_candidate(candidate) for candidate in base_candidates
    )
    if stagger_base:
        base_stage_count = 3 if base_candidates else 0
        for candidate in base_candidates:
            stage = radar_base_group(candidate)
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = float(args.initial_delay_ms) + (stage * float(args.stagger_ms))
            candidate.duration_ms = duration
            candidate.stage = stage
        first_curve_stage = base_stage_count
    else:
        first_curve_stage = 1 if base_candidates else 0
        for candidate in base_candidates:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = float(args.initial_delay_ms)
            candidate.duration_ms = duration
            candidate.stage = 0

    for index, candidate in enumerate(curve_candidates):
        stage = first_curve_stage + index
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (stage * stage_gap)
        candidate.duration_ms = duration
        candidate.stage = stage

    return ordered
