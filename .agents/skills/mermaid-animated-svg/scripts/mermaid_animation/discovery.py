#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from mermaid_animation.common import (
    Candidate,
    ancestor_has_class_fragment,
    ancestors,
    build_parent_map,
    class_tokens,
    collapsed_text,
    has_class_fragment,
    local_name,
)
from mermaid_animation.diagrams.architecture import (
    discover_architecture_candidates,
    is_architecture_root,
)
from mermaid_animation.diagrams.blockdiagram import discover_block_candidates, is_block_root
from mermaid_animation.diagrams.classdiagram import discover_class_candidates, is_class_root
from mermaid_animation.diagrams.eventmodeling import (
    discover_event_modeling_candidates,
    is_event_modeling_root,
)
from mermaid_animation.diagrams.er import discover_er_candidates, is_er_root
from mermaid_animation.diagrams.gantt import discover_gantt_candidates, is_gantt_root
from mermaid_animation.diagrams.ishikawa import discover_ishikawa_candidates, is_ishikawa_root
from mermaid_animation.diagrams.journey import discover_journey_candidates, is_journey_root
from mermaid_animation.diagrams.pie import discover_pie_chart_candidates, is_pie_root
from mermaid_animation.diagrams.quadrant import (
    discover_quadrant_chart_candidates,
    is_quadrant_chart_root,
)
from mermaid_animation.diagrams.radar import discover_radar_candidates, is_radar_root
from mermaid_animation.diagrams.sankey import discover_sankey_candidates, is_sankey_root
from mermaid_animation.diagrams.sequence import discover_sequence_candidates, is_sequence_root
from mermaid_animation.diagrams.timeline import discover_timeline_candidates, is_timeline_root
from mermaid_animation.diagrams.venn import discover_venn_candidates, is_venn_root
from mermaid_animation.diagrams.xychart import discover_xychart_candidates, is_xychart_root


SKIP_TAGS = {
    "defs",
    "style",
    "metadata",
    "script",
    "title",
    "desc",
    "marker",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "filter",
}


GRAPHICAL_TAGS = {
    "g",
    "path",
    "line",
    "polyline",
    "polygon",
    "rect",
    "circle",
    "ellipse",
    "text",
    "foreignObject",
    "image",
}


CONTAINER_CLASSES = {
    "axis",
    "axes",
    "bar-plot-0",
    "background",
    "commit-bullets",
    "commit-labels",
    "clusters",
    "edgepaths",
    "edgelabels",
    "grid",
    "ishikawa",
    "legend",
    "line-plot-1",
    "main",
    "nodes",
    "plot",
    "root",
    "sections",
    "ticks",
    "treemapContainer",
    "wardley-axes",
    "wardley-links",
    "wardley-map",
    "wardley-nodes",
    "wardley-stages",
    "wardley-trends",
}


def is_inside_skipped_tag(element: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> bool:
    return any(local_name(parent.tag) in SKIP_TAGS for parent in ancestors(element, parent_map))


def is_container_group(element: ET.Element) -> bool:
    if local_name(element.tag) != "g":
        return False
    tokens = {token.lower() for token in class_tokens(element)}
    if not tokens:
        return False
    return bool(tokens & {token.lower() for token in CONTAINER_CLASSES})


def classify_element(element: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> str | None:
    tag = local_name(element.tag)
    if tag in SKIP_TAGS or tag not in GRAPHICAL_TAGS or is_inside_skipped_tag(element, parent_map):
        return None

    tokens = set(class_tokens(element))
    lower_tokens = {token.lower() for token in tokens}
    element_id = element.get("id", "")

    if "am-step" in lower_tokens or "am-wrapper" in lower_tokens:
        return None
    if is_container_group(element):
        return None

    if tag in {"path", "line", "polyline"}:
        if (
            "arrow" in lower_tokens
            or has_class_fragment(element, "flowchart-link")
            or ancestor_has_class_fragment(element, parent_map, "edgePaths")
            or ancestor_has_class_fragment(element, parent_map, "messages")
            or ancestor_has_class_fragment(element, parent_map, "line-plot")
            or "messageLine0" in tokens
            or "messageLine1" in tokens
            or "relationshipLine" in tokens
            or "ishikawa-arrow" in lower_tokens
            or "ishikawa-branch" in lower_tokens
            or "ishikawa-spine" in lower_tokens
            or "ishikawa-sub-branch" in lower_tokens
            or "relation" in lower_tokens
            or "transition" in lower_tokens
            or "radaraxisline" in lower_tokens
            or "treeview-node-line" in lower_tokens
            or "wardley-link" in lower_tokens
            or "wardley-trend" in lower_tokens
            or "wardley-inertia" in lower_tokens
            or re.match(r"^L[-_]", element_id)
        ):
            return "edge"

    if "cluster" in lower_tokens:
        return "cluster"
    if (
        "node" in lower_tokens
        or "rough-node" in lower_tokens
        or "task" in lower_tokens
        or "state" in lower_tokens
        or "commit" in lower_tokens
        or "ishikawa-head-group" in lower_tokens
        or "ishikawa-pair" in lower_tokens
        or "ishikawa-sub-group" in lower_tokens
        or "piecircle" in lower_tokens
        or "radarcurve-0" in lower_tokens
        or "radarcurve-1" in lower_tokens
        or "treemapnode" in lower_tokens
        or "treemapleafgroup" in lower_tokens
        or "treemapsection" in lower_tokens
        or "wardley-node" in lower_tokens
        or "architecture-service" in lower_tokens
        or "architecture-group" in lower_tokens
        or (tag == "rect" and ancestor_has_class_fragment(element, parent_map, "bar-plot"))
    ):
        return "node"
    if "actor" in lower_tokens:
        return "actor"
    if (
        "edgeLabel" in tokens
        or "messageText" in tokens
        or "label" in lower_tokens
        or "slice" in lower_tokens
        or "legend" in lower_tokens
        or "radaraxislabel" in lower_tokens
        or "radarlegendtext" in lower_tokens
        or "radartitle" in lower_tokens
        or "treeview-node-label" in lower_tokens
        or "wardley-title" in lower_tokens
        or "wardley-axis-label" in lower_tokens
        or "wardley-stage-label" in lower_tokens
        or "wardley-notes" in lower_tokens
        or "commit-label" in lower_tokens
    ):
        return "label"
    if "note" in lower_tokens or "annotation" in lower_tokens:
        return "annotation"

    if tag == "g" and element_id and not is_container_group(element):
        text = collapsed_text(element)
        if text or list(element):
            return "item"

    if tag in {"rect", "circle", "ellipse", "polygon", "text", "image"} and element_id:
        return "item"

    return None


def discover_candidates(root: ET.Element) -> list[Candidate]:
    parent_map = build_parent_map(root)
    dom_order = {element: index for index, element in enumerate(root.iter())}
    selected: set[ET.Element] = set()
    candidates: list[Candidate] = []

    if is_venn_root(root):
        venn_candidates = discover_venn_candidates(root, dom_order)
        if venn_candidates:
            return venn_candidates

    if is_ishikawa_root(root):
        ishikawa_candidates = discover_ishikawa_candidates(root, parent_map, dom_order)
        if ishikawa_candidates:
            return ishikawa_candidates

    if is_event_modeling_root(root):
        event_modeling_candidates = discover_event_modeling_candidates(root, dom_order)
        if event_modeling_candidates:
            return event_modeling_candidates

    if is_er_root(root):
        er_candidates = discover_er_candidates(root, dom_order)
        if er_candidates:
            return er_candidates

    if is_class_root(root):
        class_candidates = discover_class_candidates(root, dom_order)
        if class_candidates:
            return class_candidates

    if is_block_root(root):
        block_candidates = discover_block_candidates(root, dom_order)
        if block_candidates:
            return block_candidates

    if is_architecture_root(root):
        architecture_candidates = discover_architecture_candidates(root, parent_map, dom_order)
        if architecture_candidates:
            return architecture_candidates

    if is_quadrant_chart_root(root):
        quadrant_candidates = discover_quadrant_chart_candidates(root, dom_order)
        if quadrant_candidates:
            return quadrant_candidates

    if is_radar_root(root):
        radar_candidates = discover_radar_candidates(root, dom_order)
        if radar_candidates:
            return radar_candidates

    if is_pie_root(root):
        pie_candidates = discover_pie_chart_candidates(root, dom_order)
        if pie_candidates:
            return pie_candidates

    if is_timeline_root(root):
        timeline_candidates = discover_timeline_candidates(root, parent_map, dom_order)
        if timeline_candidates:
            return timeline_candidates

    if is_gantt_root(root):
        gantt_candidates = discover_gantt_candidates(root, dom_order)
        if gantt_candidates:
            return gantt_candidates

    if is_journey_root(root):
        journey_candidates = discover_journey_candidates(root, dom_order)
        if journey_candidates:
            return journey_candidates

    if is_sankey_root(root):
        sankey_candidates = discover_sankey_candidates(root, parent_map, dom_order)
        if sankey_candidates:
            return sankey_candidates

    if is_xychart_root(root):
        xychart_candidates = discover_xychart_candidates(root, dom_order)
        if xychart_candidates:
            return xychart_candidates

    if is_sequence_root(root):
        sequence_candidates = discover_sequence_candidates(root, dom_order)
        if sequence_candidates:
            return sequence_candidates

    for element in root.iter():
        role = classify_element(element, parent_map)
        if role is None:
            continue
        if any(parent in selected for parent in ancestors(element, parent_map)):
            continue
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

    if candidates:
        return candidates

    # Generic fallback for unusual Mermaid diagram types.
    for parent in [root, *list(root)]:
        if local_name(parent.tag) not in {"svg", "g"}:
            continue
        for child in list(parent):
            tag = local_name(child.tag)
            if tag in GRAPHICAL_TAGS and tag not in SKIP_TAGS:
                candidates.append(
                    Candidate(
                        element=child,
                        role="item",
                        dom_index=dom_order.get(child, len(candidates)),
                        element_id=child.get("id", ""),
                        classes=class_tokens(child),
                        text=collapsed_text(child),
                    )
                )
        if candidates:
            break

    return candidates
