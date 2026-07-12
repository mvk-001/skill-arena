#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET

from mermaid_animation.common import Candidate, ROLE_PRIORITY, effect_for
from mermaid_animation.diagrams.architecture import (
    is_architecture_root,
    plan_architecture_candidates,
)
from mermaid_animation.diagrams.blockdiagram import is_block_root, plan_block_candidates
from mermaid_animation.diagrams.classdiagram import is_class_root, plan_class_candidates
from mermaid_animation.diagrams.eventmodeling import (
    is_event_modeling_root,
    plan_event_modeling_candidates,
)
from mermaid_animation.diagrams.er import is_er_root, plan_er_candidates
from mermaid_animation.diagrams.flowchart import is_flowchart_root, plan_flowchart_candidates
from mermaid_animation.diagrams.gantt import is_gantt_root, plan_gantt_candidates
from mermaid_animation.diagrams.gitgraph import is_gitgraph_root, plan_gitgraph_candidates
from mermaid_animation.diagrams.ishikawa import is_ishikawa_root, plan_ishikawa_candidates
from mermaid_animation.diagrams.journey import is_journey_root, plan_journey_candidates
from mermaid_animation.diagrams.kanban import is_kanban_root, plan_kanban_candidates
from mermaid_animation.diagrams.mindmap import is_mindmap_candidates, plan_mindmap_candidates
from mermaid_animation.diagrams.pie import is_pie_root, plan_pie_chart_candidates
from mermaid_animation.diagrams.quadrant import (
    is_quadrant_chart_root,
    plan_quadrant_chart_candidates,
)
from mermaid_animation.diagrams.radar import is_radar_root, plan_radar_candidates
from mermaid_animation.diagrams.requirement import (
    is_requirement_root,
    plan_requirement_candidates,
)
from mermaid_animation.diagrams.sankey import is_sankey_root, plan_sankey_candidates
from mermaid_animation.diagrams.sequence import is_sequence_root, plan_sequence_candidates
from mermaid_animation.diagrams.state import is_state_root, plan_state_candidates
from mermaid_animation.diagrams.timeline import is_timeline_root, plan_timeline_candidates
from mermaid_animation.diagrams.treeview import is_treeview_root, plan_treeview_candidates
from mermaid_animation.diagrams.venn import is_venn_root, plan_venn_candidates
from mermaid_animation.diagrams.xychart import is_xychart_root, plan_xychart_candidates


def resolve_animation(candidates: list[Candidate], args: argparse.Namespace) -> str:
    if args.animation == "auto":
        return "mindmap-level" if is_mindmap_candidates(candidates) else "sequence"
    if args.animation in {"mindmap-level", "mindmap-branch"} and not is_mindmap_candidates(candidates):
        return "sequence"
    return args.animation


def plan_candidates(root: ET.Element, candidates: list[Candidate], args: argparse.Namespace) -> list[Candidate]:
    effective_animation = resolve_animation(candidates, args)
    args.effective_animation = effective_animation

    if effective_animation in {"mindmap-level", "mindmap-branch"}:
        planned = plan_mindmap_candidates(candidates, args)
        if planned:
            return planned

    if effective_animation == "ishikawa" or (args.animation == "auto" and is_ishikawa_root(root)):
        args.effective_animation = "ishikawa"
        planned = plan_ishikawa_candidates(candidates, root, args)
        if planned:
            return planned
        args.effective_animation = effective_animation

    if is_venn_root(root):
        planned = plan_venn_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_kanban_root(root):
        return plan_kanban_candidates(candidates, args, effective_animation)

    if is_event_modeling_root(root):
        planned = plan_event_modeling_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_er_root(root):
        planned = plan_er_candidates(candidates, root, args, effective_animation)
        if planned:
            return planned

    if is_class_root(root):
        planned = plan_class_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_block_root(root):
        planned = plan_block_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_architecture_root(root):
        planned = plan_architecture_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_quadrant_chart_root(root):
        if args.animation == "auto":
            effective_animation = "quadrant-points"
            args.effective_animation = effective_animation
        planned = plan_quadrant_chart_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_radar_root(root):
        if args.animation == "auto":
            effective_animation = "radar-layers"
            args.effective_animation = effective_animation
        planned = plan_radar_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_pie_root(root):
        if args.animation == "auto":
            effective_animation = "pie-segments"
            args.effective_animation = effective_animation
        planned = plan_pie_chart_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_gantt_root(root):
        planned = plan_gantt_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_journey_root(root):
        planned = plan_journey_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_gitgraph_root(root):
        planned = plan_gitgraph_candidates(candidates, root, args, effective_animation)
        if planned:
            return planned

    if is_timeline_root(root):
        planned = plan_timeline_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_sankey_root(root):
        planned = plan_sankey_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_requirement_root(root):
        planned = plan_requirement_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if is_sequence_root(root):
        planned = plan_sequence_candidates(candidates, root, args, effective_animation)
        if planned:
            return planned

    if is_xychart_root(root):
        planned = plan_xychart_candidates(candidates, root, args, effective_animation)
        if planned:
            return planned

    if is_treeview_root(root):
        planned = plan_treeview_candidates(candidates, args, effective_animation)
        if planned:
            return planned

    if args.animation == "auto" and is_flowchart_root(root):
        args.effective_animation = "flowchart-flow"
        planned = plan_flowchart_candidates(candidates, root, args)
        if planned:
            return planned
        args.effective_animation = effective_animation

    if args.animation == "auto" and is_state_root(root):
        args.effective_animation = "state-flow"
        planned = plan_state_candidates(candidates, root, args)
        if planned:
            return planned
        args.effective_animation = effective_animation

    ordered = sorted(
        candidates,
        key=lambda candidate: (
            0 if candidate.explicit_order is not None else 1,
            candidate.explicit_order if candidate.explicit_order is not None else 0,
            ROLE_PRIORITY.get(candidate.role, 99),
            candidate.dom_index,
        ),
    )

    duration = float(args.duration_ms)
    if args.total_ms is not None and len(ordered) > 1:
        available = float(args.total_ms) - float(args.initial_delay_ms) - duration
        stagger = max(0.0, available / (len(ordered) - 1))
    else:
        stagger = float(args.stagger_ms)

    for index, candidate in enumerate(ordered):
        candidate.effect = effect_for(effective_animation, candidate.role)
        candidate.delay_ms = float(args.initial_delay_ms) + (index * stagger)
        candidate.duration_ms = duration

    return ordered
