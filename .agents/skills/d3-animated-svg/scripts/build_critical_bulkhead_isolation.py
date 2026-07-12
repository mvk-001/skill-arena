#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Bulkhead Isolation animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1080
HEIGHT = 640

PALETTE = {
    "red": "#9e1b32",
    "red_highlight": "#ffccd5",
    "orange": "#e77204",
    "orange_highlight": "#ffe5cc",
    "green": "#45842a",
    "green_highlight": "#dbffcc",
    "blue": "#007298",
    "blue_highlight": "#cdf3ff",
    "purple": "#652f6c",
    "purple_highlight": "#f9ccff",
    "ink": "#333e48",
    "surface": "#ffffff",
    "page": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray600": "#696969",
    "gray700": "#4f4f4f",
}

CLIENTS = [
    {"id": "critical", "label": "Checkout critical", "rate": "1.8k/s", "cell": "cell-a", "color": "green", "y": 238},
    {"id": "search", "label": "Search traffic", "rate": "2.4k/s", "cell": "cell-b", "color": "blue", "y": 300},
    {"id": "batch", "label": "Batch import", "rate": "0.9k/s", "cell": "cell-c", "color": "orange", "y": 362},
    {"id": "noisy", "label": "Tenant spike", "rate": "4.6k/s", "cell": "cell-c", "color": "red", "y": 424},
]

CELLS = [
    {"id": "cell-a", "label": "Cell A", "pool": "checkout pool", "used": 3, "total": 6, "util": 48, "color": "green", "x": 420},
    {"id": "cell-b", "label": "Cell B", "pool": "search pool", "used": 4, "total": 6, "util": 63, "color": "blue", "x": 610},
    {"id": "cell-c", "label": "Cell C", "pool": "tenant pool", "used": 6, "total": 6, "util": 97, "color": "red", "x": 800},
]

HEALTH_SERIES = {
    "cell-a": [44, 45, 47, 49, 48, 50, 48, 47, 46, 48],
    "cell-b": [51, 53, 55, 59, 62, 64, 63, 61, 60, 63],
    "cell-c": [48, 55, 64, 76, 89, 97, 96, 91, 84, 78],
}

STATUS_CARDS = [
    ("noisy cell", "97%", "cell C is saturated", "red"),
    ("protected", "2/3", "cells stay healthy", "green"),
    ("shed", "1.1k/s", "overflow rejected", "orange"),
    ("partition", "tenant-id", "router keeps boundaries", "purple"),
]

POLICY_STEPS = [
    {"id": "partition-key", "label": "Partition key", "note": "tenant-id routes", "color": "purple"},
    {"id": "cap-concurrency", "label": "Cap concurrency", "note": "6 slots per cell", "color": "orange"},
    {"id": "isolate-queues", "label": "Isolate queues", "note": "no shared pool", "color": "blue"},
    {"id": "shed-overflow", "label": "Shed overflow", "note": "protect other cells", "color": "green"},
]

ROUTER_X = 292
ROUTER_Y = 332
CELL_Y = 224
CELL_W = 158
CELL_H = 192
SHED_X = 830
SHED_Y = 430


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def client_x() -> float:
    return 80.0


def cell_by_id(cell_id: str) -> dict[str, object]:
    return next(cell for cell in CELLS if cell["id"] == cell_id)


def client_path(client: dict[str, object]) -> str:
    x0 = client_x() + 176
    y0 = float(client["y"])
    x1 = ROUTER_X - 74
    y1 = ROUTER_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 44)} {fmt(y0)} {fmt(x1 - 46)} {fmt(y1)} {x1} {fmt(y1)}"


def route_path(cell: dict[str, object]) -> str:
    x0 = ROUTER_X + 74
    y0 = ROUTER_Y
    x1 = float(cell["x"])
    y1 = CELL_Y + 88
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 54)} {fmt(y0)} {fmt(x1 - 54)} {fmt(y1)} {x1} {fmt(y1)}"


def shed_path() -> str:
    x0 = float(cell_by_id("cell-c")["x"]) + 78
    y0 = CELL_Y + 154
    x1 = SHED_X
    y1 = SHED_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 24)} {fmt(y0 + 42)} {fmt(x1 - 54)} {fmt(y1)} {x1} {fmt(y1)}"


def chart_x(index: int) -> float:
    left = 104
    right = 594
    return left + index / 9.0 * (right - left)


def chart_y(value: float) -> float:
    top = 524
    bottom = 584
    return bottom - value / 100.0 * (bottom - top)


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def status_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="bulkhead-status-card" data-card-index="{index}" transform="translate({x} 88)">
        <rect x="0" y="0" width="222" height="56" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
        <circle cx="18" cy="28" r="6.2" fill="{color}"/>
        <text class="status-eyebrow" x="34" y="17">{esc(eyebrow)}</text>
        <text class="status-value" x="34" y="34">{esc(value)}</text>
        <text class="status-note" x="34" y="48">{esc(note)}</text>
      </g>"""
        )
    return "\n".join(parts)


def topology_panel_markup() -> str:
    return f"""
    <g class="bulkhead-topology-panel" data-panel-id="bulkhead-topology">
      <rect x="58" y="160" width="970" height="304" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Bulkhead isolation contains a noisy tenant</text>
      <text class="panel-subtitle" x="78" y="203">dedicated cells, queues, and worker pools prevent one saturated compartment from draining every resource</text>
      <line x1="270" x2="270" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="392" x2="392" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <text class="lane-label" x="92" y="450">client pressure</text>
      <text class="lane-label" x="278" y="450">partition router</text>
      <text class="lane-label" x="602" y="450">isolated resource cells</text>
    </g>"""


def clients_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color_name = str(client["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="bulkhead-client" data-client-id="{esc(client['id'])}" data-rate="{esc(client['rate'])}" data-target-cell="{esc(client['cell'])}"
        transform="translate({client_x()} {float(client['y']) - 22})">
        <rect x="0" y="0" width="176" height="44" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="18" cy="22" r="6.3" fill="{color}"/>
        <text class="source-label" x="34" y="18">{esc(client['label'])}</text>
        <text class="source-rate" x="34" y="34">{esc(client['rate'])} -> {esc(client['cell'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def router_markup() -> str:
    return f"""
    <g class="bulkhead-router" data-router-id="tenant-router" data-partition-key="tenant-id" transform="translate({ROUTER_X - 74} {ROUTER_Y - 54})">
      <rect x="0" y="0" width="148" height="108" rx="10" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.35"/>
      <text class="panel-title" x="18" y="26">Cell router</text>
      <text class="panel-subtitle" x="18" y="44">partition key: tenant-id</text>
      <rect x="20" y="62" width="108" height="28" rx="7" fill="#ffffff" stroke="{PALETTE['purple']}" stroke-width="1"/>
      <circle cx="37" cy="76" r="6" fill="{PALETTE['purple']}">
        <animate attributeName="r" values="5.2;7.5;6" dur="1.3s" begin=".8s" repeatCount="indefinite"/>
      </circle>
      <text class="gate-label" x="53" y="73">route only</text>
      <text class="gate-note" x="53" y="87">no shared pool</text>
    </g>"""


def cell_markup(cell: dict[str, object]) -> str:
    color_name = str(cell["color"])
    color = PALETTE[color_name]
    fill = PALETTE[f"{color_name}_highlight"]
    x = float(cell["x"])
    used = int(cell["used"])
    total = int(cell["total"])
    slot_parts: list[str] = []
    for slot in range(total):
        sx = 18 + (slot % 3) * 39
        sy = 84 + (slot // 3) * 32
        active = slot < used
        slot_color = color if active else PALETTE["gray200"]
        slot_fill = fill if active else "#ffffff"
        slot_parts.append(
            f"""
        <rect class="pool-slot" data-cell-id="{esc(cell['id'])}" data-slot-index="{slot + 1}" data-state="{'used' if active else 'free'}"
          x="{sx}" y="{sy}" width="28" height="22" rx="5" fill="{slot_fill}" stroke="{slot_color}" stroke-width="1.1"/>"""
        )
    saturation = ""
    if cell["id"] == "cell-c":
        saturation = f"""
      <ellipse class="saturation-wave" data-cell-id="cell-c" cx="79" cy="108" rx="62" ry="48" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="2.2" opacity=".5">
        <animate attributeName="rx" values="42;66;50" dur="1.45s" begin="1.1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".28;.62;.38" dur="1.45s" begin="1.1s" repeatCount="indefinite"/>
      </ellipse>"""
    return f"""
    <g class="bulkhead-cell" data-cell-id="{esc(cell['id'])}" data-utilization="{cell['util']}" data-used-slots="{used}" data-total-slots="{total}"
      transform="translate({x - CELL_W / 2:.1f} {CELL_Y})">
      <rect x="0" y="0" width="{CELL_W}" height="{CELL_H}" rx="10" fill="{fill}" stroke="{color}" stroke-width="1.35"/>
      <text class="node-label" x="18" y="25">{esc(cell['label'])}</text>
      <text class="node-note" x="18" y="43">{esc(cell['pool'])}</text>
      <text class="node-note" x="18" y="61">{used}/{total} slots, {cell['util']}% util</text>
      <g class="resource-pool" data-cell-id="{esc(cell['id'])}" data-pool="{esc(cell['pool'])}">
{saturation}
{''.join(slot_parts)}
      </g>
    </g>"""


def boundaries_markup() -> str:
    return f"""
    <g class="bulkhead-boundaries">
      <rect class="isolation-boundary" data-boundary-id="cell-region" x="400" y="212" width="570" height="216" rx="14"
        fill="none" stroke="{PALETTE['gray300']}" stroke-width="1.4" stroke-dasharray="7 7"/>
      <line class="bulkhead-wall" data-wall-id="a-b" x1="515" y1="218" x2="515" y2="422" stroke="{PALETTE['gray600']}" stroke-width="4" stroke-linecap="round"/>
      <line class="bulkhead-wall" data-wall-id="b-c" x1="705" y1="218" x2="705" y2="422" stroke="{PALETTE['gray600']}" stroke-width="4" stroke-linecap="round"/>
    </g>"""


def flows_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color = PALETTE[str(client["color"])]
        parts.append(
            f"""
      <path id="bulkhead-flow-client-{esc(client['id'])}" class="bulkhead-flow-path" data-flow-id="client-{esc(client['id'])}"
        data-source="{esc(client['id'])}" data-target="tenant-router" data-kind="client-to-router" d="{client_path(client)}"
        fill="none" stroke="{color}" stroke-width="2.25" stroke-opacity=".75" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".75s" begin=".18s" fill="freeze"/>
      </path>"""
        )
    for index, cell in enumerate(CELLS):
        color = PALETTE[str(cell["color"])]
        parts.append(
            f"""
      <path id="bulkhead-flow-router-{esc(cell['id'])}" class="bulkhead-flow-path" data-flow-id="router-{esc(cell['id'])}"
        data-source="tenant-router" data-target="{esc(cell['id'])}" data-kind="routed-partition" d="{route_path(cell)}"
        fill="none" stroke="{color}" stroke-width="2.7" stroke-opacity=".82" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".85s" begin="{fmt(.48 + index * .08)}s" fill="freeze"/>
      </path>"""
        )
    parts.append(
        f"""
      <path id="bulkhead-flow-shed" class="bulkhead-flow-path shed-path" data-flow-id="overflow-shed"
        data-source="cell-c" data-target="overflow-shed" data-kind="shed-overflow" d="{shed_path()}"
        fill="none" stroke="{PALETTE['orange']}" stroke-width="3.2" stroke-opacity=".9" stroke-linecap="round"
        stroke-dasharray="9 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.55;1" dur="1.7s" begin="0s" fill="freeze"/>
      </path>"""
    )
    return "\n".join(parts)


def pulses_markup() -> str:
    pulse_defs = [
        ("critical", "bulkhead-flow-client-critical", "green", 1.0, "client"),
        ("search", "bulkhead-flow-client-search", "blue", 1.12, "client"),
        ("batch", "bulkhead-flow-client-batch", "orange", 1.24, "client"),
        ("noisy", "bulkhead-flow-client-noisy", "red", 1.36, "client"),
        ("cell-a", "bulkhead-flow-router-cell-a", "green", 1.54, "routed"),
        ("cell-b", "bulkhead-flow-router-cell-b", "blue", 1.68, "routed"),
        ("cell-c", "bulkhead-flow-router-cell-c", "red", 1.82, "routed"),
        ("shed", "bulkhead-flow-shed", "orange", 2.06, "shed"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        parts.append(
            f"""
      <circle class="bulkhead-request-pulse" data-pulse-id="{esc(pulse_id)}" data-pulse-kind="{esc(kind)}" r="5.4" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.35" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.65s" begin="{fmt(begin + index * .03)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def overflow_markup() -> str:
    return f"""
    <g class="overflow-shed" data-shed-id="noisy-overflow" data-shed-rate="1.1k/s" transform="translate({SHED_X} {SHED_Y})">
      <rect x="0" y="-16" width="150" height="34" rx="8" fill="{PALETTE['orange_highlight']}" stroke="{PALETTE['orange']}" stroke-width="1.15"/>
      <circle cx="18" cy="1" r="6.2" fill="{PALETTE['orange']}"/>
      <text class="gate-label" x="34" y="-2">overflow shed</text>
      <text class="gate-note" x="34" y="12">1.1k/s rejected</text>
    </g>"""


def health_markup() -> str:
    line_parts: list[str] = []
    point_parts: list[str] = []
    for cell in CELLS:
        color = PALETTE[str(cell["color"])]
        values = HEALTH_SERIES[str(cell["id"])]
        points = [(chart_x(index), chart_y(value)) for index, value in enumerate(values)]
        line_parts.append(
            f"""
      <path class="cell-health-line" data-cell-id="{esc(cell['id'])}" data-sample-count="{len(values)}" d="{line_path(points)}"
        fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin=".6s" fill="freeze"/>
      </path>"""
        )
        for index, (value, (x, y)) in enumerate(zip(values, points)):
            point_parts.append(
                f"""
      <circle class="cell-health-point" data-cell-id="{esc(cell['id'])}" data-sample-index="{index}" data-utilization="{value}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{4.6 if value >= 90 else 3.2}" fill="{color}" stroke="#ffffff" stroke-width="1.15"/>"""
            )
    threshold_y = chart_y(80)
    return f"""
    <g class="bulkhead-health-panel" data-panel-id="cell-utilization">
      <rect x="58" y="474" width="600" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="496">Cell utilization: only the noisy cell crosses capacity</text>
      <text class="panel-subtitle" x="78" y="512">bulkhead walls keep critical and search pools below the overload threshold</text>
      <rect x="104" y="{fmt(chart_y(100))}" width="490" height="{fmt(threshold_y - chart_y(100))}" fill="{PALETTE['red_highlight']}" opacity=".45"/>
      <line class="capacity-threshold-line" data-threshold="80" x1="104" x2="594" y1="{fmt(threshold_y)}" y2="{fmt(threshold_y)}"
        stroke="{PALETTE['red']}" stroke-width="1.25" stroke-dasharray="5 6"/>
{''.join(line_parts)}
{''.join(point_parts)}
      <text class="axis-label" x="104" y="594">t0</text>
      <text class="axis-label" x="594" y="594" text-anchor="end">t9</text>
      <text class="axis-label" x="604" y="{fmt(threshold_y + 4)}">80%</text>
    </g>"""


def policy_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(POLICY_STEPS):
        col = index % 2
        row = index // 2
        x = 690 + col * 164
        y = 512 + row * 42
        color = PALETTE[str(step["color"])]
        fill = PALETTE[f"{step['color']}_highlight"]
        parts.append(
            f"""
      <g class="bulkhead-policy-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
        <rect x="0" y="0" width="150" height="34" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.1">
          <animate attributeName="opacity" values=".48;1" dur=".35s" begin="{fmt(1.15 + index * .15)}s" fill="freeze"/>
        </rect>
        <circle cx="17" cy="17" r="7" fill="{color}"/>
        <text class="step-index" x="17" y="20" text-anchor="middle">{index + 1}</text>
        <text class="step-label" x="31" y="14">{esc(step['label'])}</text>
        <text class="step-note" x="31" y="28">{esc(step['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="bulkhead-policy-panel" data-panel-id="bulkhead-policy">
      <rect x="672" y="474" width="356" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="692" y="498">Bulkhead policy</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Bulkhead Isolation</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {PALETTE["page"]};
      color: {PALETTE["ink"]};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw - 32px, 1160px);
      height: auto;
      display: block;
      background: {PALETTE["surface"]};
    }}
    text {{
      font-family: "Open Sans", Arial, sans-serif;
      letter-spacing: 0;
    }}
    .root-title {{
      fill: {PALETTE["ink"]};
      font-size: 22px;
      font-weight: 900;
    }}
    .root-subtitle, .panel-subtitle, .status-note, .source-rate, .gate-note, .node-note, .axis-label, .lane-label, .step-note {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .source-label, .gate-label, .node-label, .step-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .status-eyebrow {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .step-index {{
      fill: #ffffff;
      font-size: 10px;
      font-weight: 900;
    }}
    .bulkhead-request-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .24));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .bulkhead-request-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="bulkhead-isolation" data-pattern-id="d3-bulkhead-isolation"
    data-pattern-family="critical-bulkhead" data-client-count="{len(CLIENTS)}" data-cell-count="{len(CELLS)}"
    data-pool-slot-count="{sum(int(cell['total']) for cell in CELLS)}" data-flow-count="8" data-pulse-count="8"
    data-wall-count="2" data-health-line-count="{len(CELLS)}" data-health-point-count="{len(CELLS) * 10}"
    data-policy-step-count="{len(POLICY_STEPS)}" data-status-card-count="{len(STATUS_CARDS)}"
    data-saturated-cell="cell-c" data-shed-rate="1.1k/s" data-protected-cell-count="2"
    data-partition-key="tenant-id" data-concurrency-limit="6" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="bulkhead-isolation-title bulkhead-isolation-desc">
    <title id="bulkhead-isolation-title">Critical bulkhead isolation</title>
    <desc id="bulkhead-isolation-desc">A deterministic bulkhead-isolation pattern shows clients routed by tenant key into isolated resource cells, a saturated noisy cell, protected healthy cells, overflow shedding, utilization thresholds, and policy steps.</desc>
    <rect x="28" y="24" width="1024" height="590" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical bulkhead isolation</text>
    <text class="root-subtitle" x="58" y="80">Contain a noisy tenant inside one cell so critical traffic keeps its reserved pool.</text>
    <g class="bulkhead-status-cards">
{status_markup()}
    </g>
{topology_panel_markup()}
{boundaries_markup()}
    <g class="bulkhead-flow-paths">
{flows_markup()}
    </g>
    <g class="bulkhead-clients">
{clients_markup()}
    </g>
{router_markup()}
    <g class="bulkhead-cells">
{''.join(cell_markup(cell) for cell in CELLS)}
    </g>
{overflow_markup()}
    <g class="bulkhead-request-pulses">
{pulses_markup()}
    </g>
{health_markup()}
{policy_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Bulkhead Isolation D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
