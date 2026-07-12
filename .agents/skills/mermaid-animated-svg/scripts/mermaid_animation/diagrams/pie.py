#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from typing import Iterable

from mermaid_animation.common import (
    Candidate,
    class_tokens,
    collapsed_text,
    effect_for,
    has_lower_class,
    local_name,
    normalized,
    slug,
)


BRACKETED_NUMBER_RE = re.compile(r"\[\s*([-+]?(?:\d*\.\d+|\d+))\s*\]")
PERCENT_RE = re.compile(r"([-+]?(?:\d*\.\d+|\d+))\s*%")


def is_pie_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "pie"


def add_classes(classes: list[str], extra_classes: Iterable[str]) -> list[str]:
    result = [*classes]
    for extra_class in extra_classes:
        if extra_class and extra_class not in result:
            result.append(extra_class)
    return result


def segment_value(*texts: str) -> float | None:
    for text in texts:
        match = BRACKETED_NUMBER_RE.search(text)
        if match:
            return float(match.group(1))

    for text in texts:
        match = PERCENT_RE.search(text)
        if match:
            return float(match.group(1))

    return None


def value_token(value: float | None) -> str | None:
    if value is None:
        return None
    return slug(f"value {value:g}")


def legend_label(text: str, index: int) -> str:
    label = BRACKETED_NUMBER_RE.sub("", text).strip()
    return label or f"segment {index + 1}"


def segment_text(legend_text: str, slice_text: str) -> str:
    parts: list[str] = []
    for text in (legend_text, slice_text):
        if text and text not in parts:
            parts.append(text)
    return " ".join(parts)


def segment_classes(index: int, legend_text: str, value: float | None) -> list[str]:
    classes = ["pie-segment", f"pie-segment-{index}"]
    label_slug = slug(legend_label(legend_text, index))
    if label_slug:
        classes.append(f"pie-label-{label_slug}")
    if value_slug := value_token(value):
        classes.append(f"pie-{value_slug}")
    return classes


def discover_pie_chart_candidates(root: ET.Element, dom_order: dict[ET.Element, int]) -> list[Candidate]:
    wedges: list[ET.Element] = []
    percentages: list[ET.Element] = []
    legends: list[ET.Element] = []

    for element in root.iter():
        if local_name(element.tag) == "path" and has_lower_class(element, "piecircle"):
            wedges.append(element)
        elif local_name(element.tag) == "text" and has_lower_class(element, "slice"):
            percentages.append(element)
        elif local_name(element.tag) == "g" and has_lower_class(element, "legend"):
            legends.append(element)

    segment_count = max(len(wedges), len(percentages), len(legends))
    if segment_count == 0:
        return []

    candidates: list[Candidate] = []
    for index in range(segment_count):
        wedge = wedges[index] if index < len(wedges) else None
        percentage = percentages[index] if index < len(percentages) else None
        legend = legends[index] if index < len(legends) else None

        legend_text = collapsed_text(legend) if legend is not None else ""
        percentage_text = collapsed_text(percentage) if percentage is not None else ""
        value = segment_value(legend_text, percentage_text)
        text = segment_text(legend_text, percentage_text)
        extra_classes = segment_classes(index, legend_text, value)

        for element, role in ((wedge, "node"), (percentage, "label"), (legend, "label")):
            if element is None:
                continue
            candidates.append(
                Candidate(
                    element=element,
                    role=role,
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), extra_classes),
                    text=text,
                    branch_index=index,
                )
            )

    return candidates


def candidate_segment_index(candidate: Candidate) -> int:
    return candidate.branch_index if candidate.branch_index is not None else candidate.dom_index


def candidate_piece_order(candidate: Candidate) -> tuple[int, int]:
    lower_classes = {value.lower() for value in candidate.classes}
    if "piecircle" in lower_classes:
        return 0, candidate.dom_index
    if "slice" in lower_classes:
        return 1, candidate.dom_index
    if "legend" in lower_classes:
        return 2, candidate.dom_index
    return 3, candidate.dom_index


def candidate_value(candidate: Candidate) -> float | None:
    return segment_value(candidate.text)


def plan_pie_chart_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    grouped: dict[int, list[Candidate]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate_segment_index(candidate)].append(candidate)

    segments = [sorted(group, key=candidate_piece_order) for _, group in sorted(grouped.items())]
    if not segments:
        return []

    any_explicit_order = any(candidate.explicit_order is not None for candidate in candidates)

    def segment_order_key(segment: list[Candidate]) -> tuple[int, float, int]:
        segment_index = candidate_segment_index(segment[0])
        explicit_orders = [
            candidate.explicit_order for candidate in segment if candidate.explicit_order is not None
        ]
        if any_explicit_order:
            if explicit_orders:
                return 0, float(min(explicit_orders)), segment_index
            return 1, 0.0, segment_index

        values = [value for candidate in segment if (value := candidate_value(candidate)) is not None]
        if values:
            return 0, min(values), segment_index
        return 1, 0.0, segment_index

    ordered_segments = sorted(segments, key=segment_order_key)
    animation = "sequence" if effective_animation == "pie-segments" else effective_animation

    duration = float(args.duration_ms)
    step_gap = duration + float(args.stagger_ms)
    if args.total_ms is not None and len(ordered_segments) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        step_gap = max(step_gap, available / (len(ordered_segments) - 1))

    ordered: list[Candidate] = []
    for stage, segment in enumerate(ordered_segments):
        delay = float(args.initial_delay_ms) + (stage * step_gap)
        for piece_index, candidate in enumerate(segment):
            candidate.effect = effect_for(animation, candidate.role)
            candidate.delay_ms = delay
            candidate.duration_ms = duration
            candidate.stage = stage
            candidate.branch_step = piece_index
            ordered.append(candidate)

    return ordered
