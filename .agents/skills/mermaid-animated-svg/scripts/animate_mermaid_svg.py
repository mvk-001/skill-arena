#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from mermaid_animation.common import (
    ANIMATION_CHOICES,
    Candidate,
    apply_order_tokens,
    parse_keyed_number_entries,
    parse_number_list,
    parse_order_entries,
)
from mermaid_animation.discovery import discover_candidates
from mermaid_animation.directives import (
    apply_directive_plan,
    load_directive_program,
    plan_directive_program,
)
from mermaid_animation.planning import plan_candidates
from mermaid_animation.rendering import assert_not_mermaid_error_svg, render_mermaid, static_svg_path
from mermaid_animation.style import apply_animation


def candidate_report(candidates: list[Candidate]) -> list[dict[str, object]]:
    return [
        {
            "index": index,
            "role": candidate.role,
            "effect": candidate.effect,
            "delay_ms": round(candidate.delay_ms, 3),
            "duration_ms": round(candidate.duration_ms, 3),
            "level": candidate.level,
            "stage": candidate.stage,
            "wave_index": candidate.wave_index,
            "branch_index": candidate.branch_index,
            "branch_step": candidate.branch_step,
            "source_index": candidate.source_index,
            "target_index": candidate.target_index,
            "id": candidate.element_id,
            "classes": candidate.classes,
            "text": candidate.text,
        }
        for index, candidate in enumerate(candidates)
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a Mermaid diagram to a normal SVG, then inject high-quality SVG animation."
    )
    parser.add_argument("source", nargs="?", type=Path, help="Mermaid .mmd/.md source or a static .svg file.")
    parser.add_argument("-o", "--output", type=Path, help="Animated SVG output path.")
    parser.add_argument("--svg-input", type=Path, help="Use an existing static Mermaid SVG instead of rendering.")
    parser.add_argument("--static-output", type=Path, help="Where to write the normal Mermaid SVG before animation.")
    parser.add_argument("--keep-static", action="store_true", help="Keep the generated static SVG next to output.")
    parser.add_argument("--config-file", type=Path, help="Mermaid CLI config file passed to mmdc.")
    parser.add_argument("--css-file", type=Path, help="Mermaid CLI CSS file passed to mmdc.")
    parser.add_argument("--theme", help="Mermaid CLI theme passed to mmdc.")
    parser.add_argument("--background", help="Mermaid CLI backgroundColor passed to mmdc.")
    parser.add_argument(
        "--mmdc-arg",
        action="append",
        default=[],
        help="Append one raw Mermaid CLI argument. Repeat as --mmdc-arg=--scale --mmdc-arg=2.",
    )
    parser.add_argument(
        "--animation",
        choices=ANIMATION_CHOICES,
        default="auto",
        help=(
            "Animation preset. auto uses mindmap-level for mindmaps, ishikawa branch-first "
            "ordering for Ishikawa diagrams, state-flow ordering for state diagrams, "
            "flowchart-flow ordering for flowcharts and Swimlanes, bottom-to-top set ordering for Venn diagrams, "
            "event-ordered Event Modeling, Quadrant Chart point-by-quadrant ordering, "
            "Pie Chart segment-by-segment ordering from smallest to largest, "
            "Radar base-first z-layer ordering, Entity Relationship entity-step ordering, "
            "Class Diagram class-step ordering, Block Diagram block-step ordering, "
            "Architecture service-step ordering, "
            "Gantt row-first ordering, Journey column-by-column ordering, "
            "Sankey left-to-right link ordering, "
            "TreeView folder-level ordering, and sequence for other diagrams."
        ),
    )
    parser.add_argument("--duration-ms", type=float, default=650.0)
    parser.add_argument("--stagger-ms", type=float, default=120.0)
    parser.add_argument("--initial-delay-ms", type=float, default=0.0)
    parser.add_argument("--total-ms", type=float, help="Fit the full sequence into this total duration.")
    parser.add_argument(
        "--state-dwell-ms",
        type=float,
        default=0.0,
        help="Extra pause after each state node before the next state-flow construction step.",
    )
    parser.add_argument(
        "--state-dwell",
        action="append",
        default=[],
        help=(
            "State-flow dwell overrides as selector=milliseconds. Repeat or comma-separate entries, "
            'for example --state-dwell "Draft=300,Review=1200". Selectors use the same matching as --order.'
        ),
    )
    parser.add_argument(
        "--flowchart-dwell-ms",
        type=float,
        default=0.0,
        help="Extra pause after each flowchart node before the next flowchart-flow construction step.",
    )
    parser.add_argument(
        "--flowchart-dwell",
        action="append",
        default=[],
        help=(
            "Flowchart-flow dwell overrides as selector=milliseconds. Repeat or comma-separate entries, "
            'for example --flowchart-dwell "Collect request=300,Valid payload=1200". '
            "Selectors use the same matching as --order."
        ),
    )
    parser.add_argument("--easing", default="cubic-bezier(.2, .8, .2, 1)")
    parser.add_argument("--draw-distance", type=float, default=10000.0)
    parser.add_argument(
        "--mindmap-radial-wave-ms",
        type=float,
        default=90.0,
        help="Extra delay between same-level mindmap connector arrows so they reveal as a radial wave.",
    )
    parser.add_argument(
        "--mindmap-branch-ms",
        type=float,
        help="Target total duration for each top-level branch when using --animation mindmap-branch.",
    )
    parser.add_argument(
        "--mindmap-branch-durations",
        default="",
        help=(
            "Comma-separated values or JSON array of per-branch durations in milliseconds for "
            "--animation mindmap-branch. Overrides --mindmap-branch-ms for listed branches."
        ),
    )
    parser.add_argument(
        "--mindmap-branch-gap-ms",
        type=float,
        help="Pause between completed branches when using --animation mindmap-branch.",
    )
    parser.add_argument(
        "--ishikawa-branch-ms",
        type=float,
        help="Target total duration for each main branch when using Ishikawa branch-first ordering.",
    )
    parser.add_argument(
        "--ishikawa-branch-durations",
        default="",
        help=(
            "Comma-separated values or JSON array of per-branch durations in milliseconds for "
            "Ishikawa branch-first ordering. Overrides --ishikawa-branch-ms for listed branches."
        ),
    )
    parser.add_argument(
        "--ishikawa-branch-gap-ms",
        type=float,
        help="Pause between completed branches when using Ishikawa branch-first ordering.",
    )
    parser.add_argument("--order", action="append", default=[], help="Comma-separated order tokens or JSON array.")
    parser.add_argument("--order-file", type=Path, help="JSON array or newline-separated reveal order tokens.")
    parser.add_argument(
        "--directives-file",
        type=Path,
        help="Read Mermaid animation directives from a sidecar file. Source .mmd/.md files are scanned automatically.",
    )
    parser.add_argument("--strict-order", action="store_true", help="Fail when an order token matches no element.")
    parser.add_argument("--list-elements", action="store_true", help="Print detected animation elements as JSON.")
    args = parser.parse_args()

    if args.svg_input is not None and args.source is not None:
        parser.error("Use either a positional source or --svg-input, not both.")
    if args.output is None and not args.list_elements:
        parser.error("--output is required unless --list-elements is used.")
    if args.duration_ms < 0 or args.stagger_ms < 0 or args.initial_delay_ms < 0:
        parser.error("Timing values must be zero or greater.")
    if args.total_ms is not None and args.total_ms < 0:
        parser.error("--total-ms must be zero or greater.")
    if args.draw_distance <= 0:
        parser.error("--draw-distance must be greater than zero.")
    if args.mindmap_radial_wave_ms < 0:
        parser.error("--mindmap-radial-wave-ms must be zero or greater.")
    if args.mindmap_branch_ms is not None and args.mindmap_branch_ms < 0:
        parser.error("--mindmap-branch-ms must be zero or greater.")
    if args.mindmap_branch_gap_ms is not None and args.mindmap_branch_gap_ms < 0:
        parser.error("--mindmap-branch-gap-ms must be zero or greater.")
    if args.ishikawa_branch_ms is not None and args.ishikawa_branch_ms < 0:
        parser.error("--ishikawa-branch-ms must be zero or greater.")
    if args.ishikawa_branch_gap_ms is not None and args.ishikawa_branch_gap_ms < 0:
        parser.error("--ishikawa-branch-gap-ms must be zero or greater.")
    if args.state_dwell_ms < 0:
        parser.error("--state-dwell-ms must be zero or greater.")
    if args.flowchart_dwell_ms < 0:
        parser.error("--flowchart-dwell-ms must be zero or greater.")
    try:
        parse_number_list(args.mindmap_branch_durations, "--mindmap-branch-durations")
        parse_number_list(args.ishikawa_branch_durations, "--ishikawa-branch-durations")
        parse_keyed_number_entries(args.state_dwell, "--state-dwell")
        parse_keyed_number_entries(args.flowchart_dwell, "--flowchart-dwell")
    except ValueError as error:
        parser.error(str(error))
    return args


def main() -> int:
    args = parse_args()
    directive_program = load_directive_program(args.source, args.directives_file)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            static_path = static_svg_path(args, tmp_path)

            if args.svg_input is None and args.source is not None and args.source.suffix.lower() != ".svg":
                render_mermaid(args.source, static_path, args)

            tree = ET.parse(static_path)
            root = tree.getroot()

            if root.get("data-animated-mermaid") == "true":
                raise ValueError("Input SVG already appears to be animated. Use a fresh static Mermaid SVG.")
            assert_not_mermaid_error_svg(root, static_path)

            candidates = discover_candidates(root)
            order_tokens = parse_order_entries(args.order, args.order_file)
            unmatched = apply_order_tokens(candidates, order_tokens)
            if unmatched and args.strict_order:
                raise ValueError(f"Order token(s) matched no elements: {', '.join(unmatched)}")
            for token in unmatched:
                print(f"Warning: order token matched no elements: {token}", file=sys.stderr)

            directive_plan = None
            if directive_program is not None:
                args.effective_animation = "directives"
                directive_plan = plan_directive_program(root, candidates, args, directive_program)
                planned = directive_plan.candidates
            else:
                planned = plan_candidates(root, candidates, args)

            if args.list_elements:
                print(json.dumps(candidate_report(planned), indent=2))

            if args.output is None:
                return 0

            apply_animation(root, planned, args)
            if directive_plan is not None:
                apply_directive_plan(root, directive_plan)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            tree.write(args.output, encoding="utf-8", xml_declaration=True, short_empty_elements=True)

            total = 0.0
            if planned:
                total = max(candidate.delay_ms + candidate.duration_ms for candidate in planned)
            if directive_plan is not None:
                total = max(total, directive_plan.total_ms)
            print(
                f"Wrote {args.output} with {len(planned)} animated element(s); "
                f"sequence completes at {total:.0f}ms.",
                file=sys.stderr,
            )
            return 0
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
