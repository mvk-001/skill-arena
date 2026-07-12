#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Queue Backpressure animated SVG HTML file."""

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

PRODUCERS = [
    {"id": "api", "label": "API ingress", "rate": "4.8k/s", "priority": "user", "color": "blue", "y": 194},
    {"id": "webhook", "label": "Webhooks", "rate": "1.9k/s", "priority": "partner", "color": "blue", "y": 256},
    {"id": "retry", "label": "Retry storm", "rate": "2.1k/s", "priority": "defer", "color": "purple", "y": 318},
    {"id": "batch", "label": "Batch import", "rate": "900/s", "priority": "shed", "color": "orange", "y": 380},
]

CONSUMERS = [
    {"id": "worker-a", "label": "Worker A", "state": "busy", "capacity": 92, "color": "red", "y": 224},
    {"id": "worker-b", "label": "Worker B", "state": "busy", "capacity": 88, "color": "orange", "y": 286},
    {"id": "worker-c", "label": "Worker C", "state": "busy", "capacity": 81, "color": "orange", "y": 348},
    {"id": "worker-d", "label": "Worker D", "state": "scaling", "capacity": 54, "color": "green", "y": 410},
]

QUEUE_SEGMENTS = [
    {"id": "q01", "level": 1, "state": "processed", "color": "green"},
    {"id": "q02", "level": 2, "state": "processed", "color": "green"},
    {"id": "q03", "level": 3, "state": "active", "color": "blue"},
    {"id": "q04", "level": 4, "state": "active", "color": "blue"},
    {"id": "q05", "level": 5, "state": "waiting", "color": "orange"},
    {"id": "q06", "level": 6, "state": "waiting", "color": "orange"},
    {"id": "q07", "level": 7, "state": "stale", "color": "red"},
    {"id": "q08", "level": 8, "state": "critical", "color": "red"},
    {"id": "q09", "level": 9, "state": "critical", "color": "red"},
    {"id": "q10", "level": 10, "state": "critical", "color": "red"},
]

CONTROLS = [
    {"id": "throttle", "label": "Throttle producers", "state": "active", "color": "orange", "x": 318, "y": 144},
    {"id": "priority", "label": "Priority lane", "state": "protect user", "color": "green", "x": 496, "y": 144},
    {"id": "shed-old", "label": "Shed stale retries", "state": "active", "color": "red", "x": 674, "y": 144},
]

BACKLOG_POINTS = [
    {"minute": 0, "depth": 42},
    {"minute": 2, "depth": 48},
    {"minute": 4, "depth": 57},
    {"minute": 6, "depth": 66},
    {"minute": 8, "depth": 76},
    {"minute": 10, "depth": 91},
    {"minute": 12, "depth": 94},
    {"minute": 14, "depth": 87},
    {"minute": 16, "depth": 73},
    {"minute": 18, "depth": 61},
]

STATUS_CARDS = [
    ("ingress", "9.7k/s", "above drain capacity", "red"),
    ("drain", "5.1k/s", "4 workers saturated", "orange"),
    ("queue depth", "91%", "bounded queue critical", "red"),
    ("action", "throttle + shed", "protect fresh work", "purple"),
]

SHED_LANES = [
    {"id": "stale-retry", "label": "stale retries", "color": "red"},
    {"id": "batch-defer", "label": "batch defer", "color": "purple"},
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def producer_x() -> float:
    return 74.0


def queue_x() -> float:
    return 386.0


def queue_y() -> float:
    return 204.0


def consumer_x() -> float:
    return 810.0


def path_to_queue(producer: dict[str, object]) -> str:
    x0 = producer_x() + 178
    y0 = float(producer["y"])
    x1 = queue_x() - 20
    y1 = queue_y() + 86
    return f"M{x0} {y0} C{fmt(x0 + 52)} {fmt(y0)} {fmt(x1 - 62)} {fmt(y1)} {x1} {fmt(y1)}"


def path_to_consumer(consumer: dict[str, object], index: int) -> str:
    x0 = queue_x() + 244
    y0 = queue_y() + 86
    x1 = consumer_x() - 20
    y1 = float(consumer["y"])
    lift = (index - 1.5) * 14
    return f"M{x0} {fmt(y0 + lift)} C{fmt(x0 + 76)} {fmt(y0 + lift)} {fmt(x1 - 82)} {fmt(y1)} {x1} {fmt(y1)}"


def shed_path(index: int) -> str:
    x0 = queue_x() + 120
    y0 = queue_y() + 190
    x1 = 710 + index * 72
    y1 = 486
    return f"M{x0} {y0} C{fmt(x0 + 44)} {fmt(y0 + 58)} {fmt(x1 - 70)} {fmt(y1)} {x1} {y1}"


def producer_markup() -> str:
    parts: list[str] = []
    for producer in PRODUCERS:
        color = PALETTE[str(producer["color"])]
        fill = PALETTE[f"{producer['color']}_highlight"]
        parts.append(
            f"""
      <g class="producer-source" data-producer-id="{esc(producer['id'])}" data-rate="{esc(producer['rate'])}" data-priority="{esc(producer['priority'])}"
        transform="translate({producer_x()} {producer['y'] - 24})">
        <rect x="0" y="0" width="178" height="48" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.4"/>
        <circle cx="18" cy="24" r="6.4" fill="{color}"/>
        <text class="producer-label" x="34" y="20">{esc(producer['label'])}</text>
        <text class="producer-rate" x="34" y="36">{esc(producer['rate'])} · {esc(producer['priority'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def control_markup() -> str:
    parts: list[str] = []
    for control in CONTROLS:
        color = PALETTE[str(control["color"])]
        fill = PALETTE[f"{control['color']}_highlight"]
        parts.append(
            f"""
      <g class="backpressure-gate" data-control-id="{esc(control['id'])}" data-state="{esc(control['state'])}" transform="translate({control['x']} {control['y']})">
        <rect x="0" y="0" width="152" height="42" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.35"/>
        <circle cx="17" cy="21" r="6" fill="{color}">
          <animate attributeName="r" values="5.5;8;5.5" dur="1.35s" begin="1.45s" repeatCount="indefinite"/>
        </circle>
        <text class="control-label" x="32" y="18">{esc(control['label'])}</text>
        <text class="control-state" x="32" y="33">{esc(control['state'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def queue_markup() -> str:
    x = queue_x()
    y = queue_y()
    parts: list[str] = []
    for index, segment in enumerate(QUEUE_SEGMENTS):
        col = index % 5
        row = index // 5
        sx = 28 + col * 38
        sy = 122 - row * 54
        color = PALETTE[str(segment["color"])]
        fill = PALETTE[f"{segment['color']}_highlight"]
        parts.append(
            f"""
        <g class="queue-segment" data-segment-id="{esc(segment['id'])}" data-level="{segment['level']}" data-state="{esc(segment['state'])}" transform="translate({sx} {sy})">
          <rect x="0" y="0" width="30" height="44" rx="5" fill="{fill}" stroke="{color}" stroke-width="1.25">
            <animate attributeName="height" values="4;44" dur=".42s" begin="{fmt(.55 + index * .045)}s" fill="freeze"/>
          </rect>
          <text class="segment-label" x="15" y="28" text-anchor="middle">{segment['level']}</text>
        </g>"""
        )
    return f"""
    <g class="bounded-queue" data-queue-id="orders-bounded-queue" transform="translate({x} {y})">
      <rect x="0" y="0" width="244" height="188" rx="10" fill="#ffffff" stroke="{PALETTE['gray300']}" stroke-width="1.4"/>
      <text class="panel-title" x="18" y="25">Bounded queue</text>
      <text class="queue-subtitle" x="18" y="43">max depth 10 · current 91%</text>
      <line class="queue-capacity-marker" data-capacity-threshold="70" x1="18" x2="226" y1="74" y2="74" stroke="{PALETTE['orange']}" stroke-width="2" stroke-dasharray="6 6"/>
      <text class="capacity-label" x="226" y="66" text-anchor="end">safe headroom</text>
      <g class="queue-age-guard" data-age-minutes="11" data-ttl-minutes="6" transform="translate(8 203)">
        <rect x="0" y="-13" width="228" height="17" rx="4" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width=".9"/>
        <text class="age-label" x="9" y="0">oldest 11m > TTL 6m · sideline now</text>
      </g>
{''.join(parts)}
    </g>"""


def consumer_markup() -> str:
    parts: list[str] = []
    for consumer in CONSUMERS:
        color = PALETTE[str(consumer["color"])]
        fill = PALETTE[f"{consumer['color']}_highlight"]
        width = 76 * (float(consumer["capacity"]) / 100)
        parts.append(
            f"""
      <g class="consumer-worker" data-consumer-id="{esc(consumer['id'])}" data-state="{esc(consumer['state'])}" data-capacity="{consumer['capacity']}"
        transform="translate({consumer_x()} {consumer['y'] - 24})">
        <rect x="0" y="0" width="178" height="48" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.4"/>
        <circle cx="18" cy="24" r="6.4" fill="{color}"/>
        <text class="consumer-label" x="34" y="19">{esc(consumer['label'])}</text>
        <text class="consumer-state" x="34" y="35">{esc(consumer['state'])} · {consumer['capacity']}%</text>
        <rect x="92" y="30" width="76" height="7" rx="3.5" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width=".8"/>
        <rect x="92" y="30" width="{fmt(width)}" height="7" rx="3.5" fill="{color}"/>
      </g>"""
        )
    return "\n".join(parts)


def flow_markup() -> str:
    producer_paths = []
    for index, producer in enumerate(PRODUCERS):
        color = PALETTE[str(producer["color"])]
        producer_paths.append(
            f"""
      <path id="queue-flow-producer-{esc(producer['id'])}" class="queue-flow-path producer-flow"
        data-flow-id="producer-{esc(producer['id'])}" d="{path_to_queue(producer)}" fill="none" stroke="{color}" stroke-width="2.3"
        stroke-opacity=".65" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{fmt(.18 + index * .06)}s" fill="freeze"/>
      </path>"""
        )
    consumer_paths = []
    for index, consumer in enumerate(CONSUMERS):
        color = PALETTE[str(consumer["color"])]
        consumer_paths.append(
            f"""
      <path id="queue-flow-consumer-{esc(consumer['id'])}" class="queue-flow-path consumer-flow"
        data-flow-id="consumer-{esc(consumer['id'])}" d="{path_to_consumer(consumer, index)}" fill="none" stroke="{color}" stroke-width="2.3"
        stroke-opacity=".65" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{fmt(.32 + index * .06)}s" fill="freeze"/>
      </path>"""
        )
    shed_paths = []
    for index, lane in enumerate(SHED_LANES):
        color = PALETTE[str(lane["color"])]
        shed_paths.append(
            f"""
      <path id="load-shed-path-{esc(lane['id'])}" class="load-shed-path"
        data-shed-id="{esc(lane['id'])}" d="{shed_path(index)}" fill="none" stroke="{color}" stroke-width="2.8"
        stroke-opacity=".85" stroke-linecap="round" stroke-dasharray="7 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.62;1" dur="{fmt(1.55 + index * .12)}s" begin="0s" fill="freeze"/>
      </path>"""
        )
    return "\n".join(producer_paths + consumer_paths + shed_paths)


def pulse_markup() -> str:
    pulse_defs = [
        ("api", "queue-flow-producer-api", "blue", 0.95, "normal"),
        ("retry", "queue-flow-producer-retry", "purple", 1.2, "retry"),
        ("worker-a", "queue-flow-consumer-worker-a", "red", 1.35, "drain"),
        ("worker-d", "queue-flow-consumer-worker-d", "green", 1.55, "scale"),
        ("shed", "load-shed-path-stale-retry", "red", 1.85, "shed"),
    ]
    parts = []
    for index, (pid, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        color = PALETTE[color_name]
        parts.append(
            f"""
      <circle class="queue-message-pulse" data-pulse-id="{esc(pid)}" data-pulse-kind="{esc(kind)}" r="5.6" fill="{color}" stroke="#ffffff" stroke-width="1.4" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.5s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def backlog_x(minute: float) -> float:
    left = 86
    right = 642
    return left + (minute / 18.0) * (right - left)


def backlog_y(depth: float) -> float:
    top = 466
    bottom = 560
    return bottom - (depth / 100.0) * (bottom - top)


def backlog_markup() -> str:
    pts = [(backlog_x(float(p["minute"])), backlog_y(float(p["depth"]))) for p in BACKLOG_POINTS]
    line = " ".join(("M" if i == 0 else "L") + f"{fmt(x)} {fmt(y)}" for i, (x, y) in enumerate(pts))
    area = f"M{fmt(pts[0][0])} 560 " + " ".join(f"L{fmt(x)} {fmt(y)}" for x, y in pts) + f" L{fmt(pts[-1][0])} 560 Z"
    point_parts = []
    for index, (point, (x, y)) in enumerate(zip(BACKLOG_POINTS, pts)):
        color = "red" if point["depth"] >= 85 else "orange" if point["depth"] >= 70 else "blue"
        point_parts.append(
            f"""
      <circle class="queue-depth-point" data-minute="{point['minute']}" data-depth="{point['depth']}" cx="{fmt(x)}" cy="{fmt(y)}" r="{4.8 if point['depth'] >= 85 else 3.4}" fill="{PALETTE[color]}" stroke="#ffffff" stroke-width="1.3"/>"""
        )
    risk_x = pts[5][0] + 74
    risk_y = pts[5][1] - 24
    return f"""
    <g class="queue-depth-panel" data-panel-id="queue-depth">
      <rect x="58" y="420" width="624" height="180" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="446">Queue depth and recovery</text>
      <text class="queue-subtitle" x="270" y="446">age + depth trigger upstream control</text>
      <line x1="86" x2="642" y1="{fmt(backlog_y(70))}" y2="{fmt(backlog_y(70))}" stroke="{PALETTE['orange']}" stroke-width="1.7" stroke-dasharray="6 6"/>
      <text class="capacity-label" x="642" y="{fmt(backlog_y(70) - 8)}" text-anchor="end">70% backpressure threshold</text>
      <path class="queue-depth-area" d="{area}" fill="{PALETTE['red_highlight']}" fill-opacity=".26"/>
      <path class="queue-depth-line" data-sample-count="{len(BACKLOG_POINTS)}" d="{line}" fill="none" stroke="{PALETTE['red']}" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.2s" begin=".5s" fill="freeze"/>
      </path>
{''.join(point_parts)}
      <text class="axis-label" x="86" y="578">0m</text>
      <text class="axis-label" x="626" y="578">18m</text>
      <rect class="risk-callout" x="{fmt(risk_x)}" y="{fmt(risk_y)}" width="112" height="24" rx="5" fill="#ffffff" stroke="{PALETTE['red']}" stroke-width="1"/>
      <text class="risk-label" x="{fmt(risk_x + 10)}" y="{fmt(risk_y + 16)}">91% critical</text>
    </g>"""


def dead_letter_markup() -> str:
    return f"""
    <g class="dead-letter-bin" data-bin-id="sideline" data-policy="ttl-or-retry-exhausted" transform="translate(708 456)">
      <rect x="0" y="0" width="310" height="70" rx="8" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.3"/>
      <circle cx="20" cy="35" r="7" fill="{PALETTE['red']}"/>
      <text class="dead-letter-label" x="38" y="27">Sideline stale work</text>
      <text class="dead-letter-note" x="38" y="45">drop retries older than client timeout</text>
      <text class="dead-letter-note" x="38" y="60">keep fresh user queue draining</text>
    </g>"""


def summary_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        y = 82
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="queue-status-card" data-card-index="{index}" transform="translate({x} {y})">
        <rect x="0" y="0" width="222" height="56" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
        <circle cx="18" cy="28" r="6.2" fill="{color}"/>
        <text class="status-eyebrow" x="34" y="17">{esc(eyebrow)}</text>
        <text class="status-value" x="34" y="34">{esc(value)}</text>
        <text class="status-note" x="34" y="48">{esc(note)}</text>
      </g>"""
        )
    return "\n".join(parts)


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Queue Backpressure</title>
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
    .root-subtitle, .producer-rate, .consumer-state, .control-state, .queue-subtitle, .capacity-label, .axis-label, .status-note, .dead-letter-note {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .age-label {{
      fill: {PALETTE["red"]};
      font-size: 9px;
      font-weight: 850;
    }}
    .panel-title, .producer-label, .consumer-label, .control-label, .status-value, .dead-letter-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .status-eyebrow, .segment-label {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .risk-label {{
      fill: {PALETTE["red"]};
      font-size: 13px;
      font-weight: 900;
    }}
    .queue-message-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .28));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .queue-message-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="queue-backpressure" data-pattern-id="d3-queue-backpressure"
    data-pattern-family="critical-queue" data-producer-count="{len(PRODUCERS)}"
    data-consumer-count="{len(CONSUMERS)}" data-queue-segment-count="{len(QUEUE_SEGMENTS)}"
    data-control-count="{len(CONTROLS)}" data-shed-count="{len(SHED_LANES)}"
    data-backlog-point-count="{len(BACKLOG_POINTS)}" data-status-card-count="{len(STATUS_CARDS)}"
    data-pulse-count="5" data-current-depth="91" data-backpressure-threshold="70"
    data-oldest-message-minutes="11" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="queue-backpressure-title queue-backpressure-desc">
    <title id="queue-backpressure-title">Critical queue backpressure</title>
    <desc id="queue-backpressure-desc">A deterministic queue overload map shows producers, a bounded queue, saturated consumers, backpressure gates, load shedding, queue depth, and animated message pulses.</desc>
    <rect x="28" y="24" width="1024" height="580" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical queue backpressure</text>
    <text class="root-subtitle" x="58" y="78">Bound the queue, slow producers, shed stale work, and keep fresh user traffic draining.</text>
    <g class="queue-status-cards">
{summary_markup()}
    </g>
    <g class="backpressure-controls">
{control_markup()}
    </g>
    <g class="queue-flow-paths">
{flow_markup()}
    </g>
    <g class="queue-producers">
{producer_markup()}
    </g>
{queue_markup()}
    <g class="queue-consumers">
{consumer_markup()}
    </g>
    <g class="queue-message-pulses">
{pulse_markup()}
    </g>
{backlog_markup()}
{dead_letter_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Queue Backpressure D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
