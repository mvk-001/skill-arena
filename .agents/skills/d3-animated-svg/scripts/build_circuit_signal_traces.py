#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Circuit Signal Traces animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 760
HEIGHT = 440

PALETTE = {
    "blue": "#007298",
    "green": "#45842a",
    "purple": "#652f6c",
    "orange": "#e77204",
    "red": "#9e1b32",
    "ink": "#333e48",
    "surface": "#ffffff",
    "board": "#f6f8fa",
    "gray100": "#e7e7e7",
    "gray200": "#d8dde2",
    "gray300": "#c9ced3",
    "gray600": "#6d767e",
    "blue_highlight": "#cdf3ff",
    "green_highlight": "#dbffcc",
    "purple_highlight": "#f9ccff",
    "orange_highlight": "#ffe5cc",
    "red_highlight": "#ffccd5",
}

NODES = [
    {"id": "source", "label": "Source", "x": 88, "y": 108, "role": "source", "color": "blue"},
    {"id": "filter", "label": "Filter", "x": 244, "y": 108, "role": "processor", "color": "blue"},
    {"id": "gate", "label": "Gate", "x": 384, "y": 108, "role": "gate", "color": "purple"},
    {"id": "sink", "label": "Sink", "x": 648, "y": 108, "role": "sink", "color": "green"},
    {"id": "clock", "label": "Clock", "x": 128, "y": 248, "role": "control", "color": "purple"},
    {"id": "router", "label": "Router", "x": 384, "y": 248, "role": "router", "color": "orange"},
    {"id": "store", "label": "Store", "x": 648, "y": 248, "role": "sink", "color": "green"},
    {"id": "diagnostic", "label": "Diagnostic", "x": 184, "y": 344, "role": "diagnostic", "color": "orange"},
    {"id": "fallback", "label": "Fallback", "x": 520, "y": 344, "role": "fallback", "color": "orange"},
]

TRACES = [
    {
        "id": "data-main",
        "signal": "data",
        "mode": "signal-propagation",
        "points": [(110, 108), (226, 108), (262, 108), (366, 108), (406, 108), (626, 108)],
        "color": "blue",
        "cadence": 2.35,
        "phase": 0.1,
        "width": 5.2,
    },
    {
        "id": "clock-control",
        "signal": "control",
        "mode": "bus-handshake",
        "points": [(150, 248), (292, 248), (292, 160), (384, 160), (384, 130)],
        "color": "purple",
        "cadence": 2.7,
        "phase": 0.25,
        "width": 4.8,
    },
    {
        "id": "ack-return",
        "signal": "ack",
        "mode": "bus-handshake",
        "points": [(626, 108), (594, 108), (594, 206), (406, 206), (406, 248)],
        "color": "green",
        "cadence": 2.95,
        "phase": 0.85,
        "width": 4.8,
    },
    {
        "id": "store-write",
        "signal": "write",
        "mode": "signal-propagation",
        "points": [(406, 248), (626, 248)],
        "color": "green",
        "cadence": 2.45,
        "phase": 0.55,
        "width": 5,
    },
    {
        "id": "fault-block",
        "signal": "fault",
        "mode": "fault-isolation",
        "points": [(384, 130), (384, 292), (474, 292), (474, 344)],
        "color": "red",
        "cadence": 1.85,
        "phase": 0.45,
        "width": 5.2,
    },
    {
        "id": "fallback-reroute",
        "signal": "reroute",
        "mode": "fault-isolation",
        "points": [(406, 108), (520, 108), (520, 344), (626, 344), (626, 248)],
        "color": "orange",
        "cadence": 2.25,
        "phase": 1.25,
        "width": 5.2,
        "draw_delay": 1.1,
    },
    {
        "id": "diagnostic-probe",
        "signal": "diagnostic",
        "mode": "fault-isolation",
        "points": [(206, 344), (384, 344), (384, 270)],
        "color": "orange",
        "cadence": 2.15,
        "phase": 0.95,
        "width": 4.6,
    },
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def path_for(points: list[tuple[int, int]]) -> str:
    start = points[0]
    commands = [f"M{fmt(start[0])} {fmt(start[1])}"]
    for x, y in points[1:]:
        commands.append(f"L{fmt(x)} {fmt(y)}")
    return " ".join(commands)


def path_length(points: list[tuple[int, int]]) -> float:
    total = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        total += abs(x1 - x0) + abs(y1 - y0)
    return total


def unique_vias() -> list[tuple[int, int]]:
    vias: set[tuple[int, int]] = set()
    for trace in TRACES:
        points = trace["points"]
        for index in range(1, len(points) - 1):
            x0, y0 = points[index - 1]
            x1, y1 = points[index]
            x2, y2 = points[index + 1]
            if (x0 == x1 and y1 == y2) or (y0 == y1 and x1 == x2):
                vias.add((x1, y1))
    return sorted(vias, key=lambda point: (point[1], point[0]))


def grid_markup() -> str:
    lines: list[str] = []
    for x in range(48, WIDTH - 47, 40):
        lines.append(
            f'<line class="circuit-grid-line" x1="{x}" y1="54" x2="{x}" y2="{HEIGHT - 48}" />'
        )
    for y in range(68, HEIGHT - 47, 40):
        lines.append(
            f'<line class="circuit-grid-line" x1="44" y1="{y}" x2="{WIDTH - 44}" y2="{y}" />'
        )
    return "\n      ".join(lines)


def trace_markup(trace: dict[str, object], index: int) -> str:
    points = trace["points"]
    assert isinstance(points, list)
    length = path_length(points)
    draw_delay = float(trace.get("draw_delay", 0.45 + index * 0.08))
    draw_duration = 1.05
    total = draw_delay + draw_duration
    color = PALETTE[str(trace["color"])]
    return f"""
      <path id="circuit-trace-{esc(trace['id'])}" class="circuit-trace"
        data-trace-id="{esc(trace['id'])}" data-signal="{esc(trace['signal'])}" data-mode="{esc(trace['mode'])}"
        d="{path_for(points)}" fill="none" stroke="{color}" stroke-width="{fmt(float(trace['width']))}"
        stroke-linecap="round" stroke-linejoin="round" pathLength="{fmt(length)}"
        stroke-dasharray="{fmt(length)} {fmt(length)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="{fmt(length)};{fmt(length)};0"
          keyTimes="0;{draw_delay / total:.3f};1" dur="{fmt(total)}s" begin="0s" fill="freeze"/>
      </path>"""


def trace_underlay_markup(trace: dict[str, object]) -> str:
    points = trace["points"]
    assert isinstance(points, list)
    return f"""
      <path class="circuit-trace-underlay-path" data-underlay-for="{esc(trace['id'])}"
        d="{path_for(points)}" fill="none" stroke="{PALETTE['gray300']}"
        stroke-width="{fmt(float(trace['width']) + 5)}" stroke-linecap="round" stroke-linejoin="round"/>"""


def pulse_markup(trace: dict[str, object]) -> str:
    color = PALETTE[str(trace["color"])]
    begin = 0.85 + float(trace["phase"])
    opacity_values = "0;0;1;1"
    opacity_times = "0;.18;.24;1"
    if trace["id"] == "fallback-reroute":
        opacity_values = "0;0;1"
        opacity_times = "0;.42;1"
    return f"""
      <circle class="circuit-pulse" data-trace-id="{esc(trace['id'])}" data-signal="{esc(trace['signal'])}"
        r="5.8" fill="{color}" stroke="#ffffff" stroke-width="1.6" opacity="1">
        <animate attributeName="opacity" values="{opacity_values}" keyTimes="{opacity_times}"
          dur="{fmt(begin + 0.35)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="{fmt(float(trace['cadence']))}s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#circuit-trace-{esc(trace['id'])}"/>
        </animateMotion>
      </circle>"""


def via_markup(point: tuple[int, int], index: int) -> str:
    delay = 0.62 + index * 0.035
    x, y = point
    return f"""
      <g class="circuit-via" data-via-index="{index}" transform="translate({x} {y})">
        <circle r="6.5" fill="{PALETTE['surface']}" stroke="{PALETTE['gray600']}" stroke-width="1.6"/>
        <circle r="2.4" fill="{PALETTE['gray600']}">
          <animate attributeName="r" values="0;2.4" dur=".28s" begin="{fmt(delay)}s" fill="freeze"/>
        </circle>
      </g>"""


def node_markup(node: dict[str, object], index: int) -> str:
    color = PALETTE[str(node["color"])]
    fill = PALETTE[f"{node['color']}_highlight"]
    y_label = -28 if int(node["y"]) > 300 else -22
    delay = 0.2 + index * 0.035
    label = esc(node["label"])
    return f"""
      <g class="circuit-node" data-node-id="{esc(node['id'])}" data-node-role="{esc(node['role'])}"
        transform="translate({fmt(float(node['x']))} {fmt(float(node['y']))})">
        <rect x="-22" y="-16" width="44" height="32" rx="4" fill="{fill}" stroke="{color}" stroke-width="2.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".34s" begin="{fmt(delay)}s" fill="freeze"/>
          <animateTransform attributeName="transform" type="scale" values=".72;1.04;1"
            dur=".52s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <circle r="5.2" fill="{color}" stroke="#ffffff" stroke-width="1.4"/>
        <text class="circuit-label" text-anchor="middle" y="{y_label}" font-size="12" font-weight="800">{label}</text>
      </g>"""


def build_html() -> str:
    traces = "\n".join(trace_markup(trace, index) for index, trace in enumerate(TRACES))
    trace_underlays = "\n".join(trace_underlay_markup(trace) for trace in TRACES)
    pulses = "\n".join(pulse_markup(trace) for trace in TRACES)
    vias = "\n".join(via_markup(point, index) for index, point in enumerate(unique_vias()))
    nodes = "\n".join(node_markup(node, index) for index, node in enumerate(NODES))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Circuit Signal Traces</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f7f7f7;
      color: {PALETTE["ink"]};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw - 32px, 920px);
      height: auto;
      display: block;
      background: {PALETTE["surface"]};
    }}
    .circuit-grid-line {{
      stroke: {PALETTE["gray100"]};
      stroke-width: 1;
    }}
    .circuit-trace {{
      filter: drop-shadow(0 1px 0 rgba(255,255,255,.85));
    }}
    .circuit-label {{
      fill: {PALETTE["ink"]};
      paint-order: stroke;
      stroke: {PALETTE["surface"]};
      stroke-width: 4px;
      stroke-linejoin: round;
    }}
    .circuit-pulse {{
      filter: drop-shadow(0 0 5px rgba(0, 114, 152, .25));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
    }}
  </style>
</head>
<body>
  <svg id="circuit-signal-traces" data-pattern-id="d3-circuit-signal-traces"
    data-pattern-family="circuit" data-node-count="{len(NODES)}" data-trace-count="{len(TRACES)}"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="circuit-signal-traces-title circuit-signal-traces-desc">
    <title id="circuit-signal-traces-title">Circuit signal traces</title>
    <desc id="circuit-signal-traces-desc">Animated circuit-board traces show data propagation, a request and acknowledge handshake, fault isolation, and an orange fallback reroute.</desc>
    <rect x="30" y="32" width="{WIDTH - 60}" height="{HEIGHT - 64}" rx="8" fill="{PALETTE["board"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.4"/>
    <g class="circuit-grid" opacity=".82">
      {grid_markup()}
    </g>
    <g class="circuit-trace-underlay" opacity=".32">
{trace_underlays}
    </g>
    <g class="circuit-traces">
{traces}
    </g>
    <g class="circuit-vias">
{vias}
    </g>
    <g class="circuit-nodes">
{nodes}
    </g>
    <g class="circuit-pulses">
{pulses}
    </g>
    <rect x="470" y="278" width="24" height="28" rx="4" fill="{PALETTE["red_highlight"]}" stroke="{PALETTE["red"]}" stroke-width="1.6" opacity=".9">
      <animate attributeName="opacity" values=".25;.9;.25" dur="1.2s" begin="1s" repeatCount="indefinite"/>
    </rect>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Circuit Signal Traces D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
