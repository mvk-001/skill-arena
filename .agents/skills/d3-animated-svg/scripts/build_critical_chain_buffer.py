#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Chain Buffer animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1120
HEIGHT = 650
LEFT = 122
RIGHT = 780
TOP = 112
DEADLINE = 8.5
TASK_HEIGHT = 32
PANEL_X = 824
PANEL_Y = 96
PANEL_W = 244
PANEL_H = 420

PALETTE = {
    "red": "#9e1b32",
    "red_hover": "#6d1222",
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
    "gray500": "#828282",
    "gray600": "#696969",
    "gray700": "#4f4f4f",
}

LANES = [
    {"id": "program", "label": "Program", "y": 148},
    {"id": "build", "label": "Build", "y": 238},
    {"id": "verify", "label": "Verify", "y": 328},
    {"id": "release", "label": "Release", "y": 418},
]

TASKS = [
    {"id": "scope", "label": "Scope", "lane": "program", "start": 0.45, "duration": 0.95, "critical": True, "color": "red"},
    {"id": "design", "label": "Design", "lane": "program", "start": 1.55, "duration": 1.08, "critical": True, "color": "red"},
    {"id": "copy", "label": "Copy", "lane": "program", "start": 2.44, "duration": 0.76, "critical": False, "color": "purple"},
    {"id": "data", "label": "Data", "lane": "build", "start": 2.08, "duration": 1.02, "critical": False, "color": "blue"},
    {"id": "api", "label": "API", "lane": "build", "start": 2.82, "duration": 1.18, "critical": True, "color": "red"},
    {"id": "integrate", "label": "Integrate", "lane": "build", "start": 4.32, "duration": 1.0, "critical": True, "color": "red"},
    {"id": "security", "label": "Security", "lane": "verify", "start": 3.72, "duration": 0.86, "critical": False, "color": "purple"},
    {"id": "qa", "label": "Final QA", "lane": "verify", "start": 5.55, "duration": 1.0, "critical": True, "color": "red"},
    {"id": "docs", "label": "Docs", "lane": "release", "start": 5.1, "duration": 0.86, "critical": False, "color": "blue"},
    {"id": "ops", "label": "Ops drill", "lane": "release", "start": 6.12, "duration": 0.68, "critical": False, "color": "purple"},
    {"id": "launch", "label": "Launch", "lane": "release", "start": 6.88, "duration": 0.66, "critical": True, "color": "red"},
]

DEPENDENCIES = [
    {"id": "scope-design", "source": "scope", "target": "design", "critical": True},
    {"id": "design-api", "source": "design", "target": "api", "critical": True},
    {"id": "api-integrate", "source": "api", "target": "integrate", "critical": True},
    {"id": "integrate-qa", "source": "integrate", "target": "qa", "critical": True},
    {"id": "qa-launch", "source": "qa", "target": "launch", "critical": True},
    {"id": "copy-integrate", "source": "copy", "target": "integrate", "critical": False, "feeds_critical": True},
    {"id": "data-integrate", "source": "data", "target": "integrate", "critical": False, "feeds_critical": True},
    {"id": "security-qa", "source": "security", "target": "qa", "critical": False, "feeds_critical": True},
    {"id": "docs-launch", "source": "docs", "target": "launch", "critical": False, "feeds_critical": True},
    {"id": "ops-launch", "source": "ops", "target": "launch", "critical": False, "feeds_critical": True},
]

BUFFERS = [
    {"id": "copy-feed", "label": "feed", "lane": "program", "start": 3.22, "duration": 0.5, "consumed": 0.48, "kind": "feeding", "target": "integrate"},
    {"id": "data-feed", "label": "feed", "lane": "build", "start": 3.18, "duration": 1.1, "consumed": 0.42, "kind": "feeding", "target": "integrate"},
    {"id": "security-feed", "label": "feed", "lane": "verify", "start": 4.64, "duration": 0.9, "consumed": 0.36, "kind": "feeding", "target": "qa"},
    {"id": "release-feed", "label": "feed", "lane": "release", "start": 5.98, "duration": 0.86, "consumed": 0.28, "kind": "feeding", "target": "launch"},
    {"id": "project", "label": "project buffer", "lane": "release", "start": 7.54, "duration": 0.96, "consumed": 0.62, "kind": "project", "target": "deadline"},
]

RESOURCE_BUFFERS = [
    {"id": "api-ready", "label": "API env", "lane": "build", "time": 2.62, "for": "api"},
    {"id": "qa-ready", "label": "QA team", "lane": "verify", "time": 5.34, "for": "qa"},
]

FEVER_POINTS = [
    {"complete": 0.18, "consumed": 0.10, "label": "scoped"},
    {"complete": 0.32, "consumed": 0.18, "label": "designed"},
    {"complete": 0.47, "consumed": 0.28, "label": "built"},
    {"complete": 0.63, "consumed": 0.44, "label": "verified"},
    {"complete": 0.78, "consumed": 0.62, "label": "now"},
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def x_scale(value: float) -> float:
    return LEFT + (RIGHT - LEFT) * value / DEADLINE


def lane_y(lane_id: str) -> float:
    for lane in LANES:
        if lane["id"] == lane_id:
            return float(lane["y"])
    raise KeyError(lane_id)


def task_by_id(task_id: str) -> dict[str, object]:
    for task in TASKS:
        if task["id"] == task_id:
            return task
    raise KeyError(task_id)


def task_box(task: dict[str, object]) -> dict[str, float]:
    x0 = x_scale(float(task["start"]))
    width = x_scale(float(task["start"]) + float(task["duration"])) - x0
    y0 = lane_y(str(task["lane"])) - TASK_HEIGHT / 2
    return {
        "x": x0,
        "y": y0,
        "width": width,
        "height": TASK_HEIGHT,
        "cx": x0 + width / 2,
        "cy": y0 + TASK_HEIGHT / 2,
    }


def dependency_path(dep: dict[str, object]) -> str:
    source = task_box(task_by_id(str(dep["source"])))
    target = task_box(task_by_id(str(dep["target"])))
    x0 = source["x"] + source["width"]
    y0 = source["cy"]
    x1 = target["x"]
    y1 = target["cy"]
    mx = x0 + max(34, abs(x1 - x0) * 0.48)
    if dep.get("feeds_critical"):
        bend = 20 if y1 >= y0 else -20
        return f"M{fmt(x0)} {fmt(y0)} C{fmt(mx)} {fmt(y0 + bend)} {fmt(mx)} {fmt(y1 - bend)} {fmt(x1)} {fmt(y1)}"
    return f"M{fmt(x0)} {fmt(y0)} C{fmt(mx)} {fmt(y0)} {fmt(mx)} {fmt(y1)} {fmt(x1)} {fmt(y1)}"


def lane_markup() -> str:
    parts: list[str] = []
    for index, lane in enumerate(LANES):
        y = float(lane["y"])
        band_y = y - 31
        delay = index * 0.04
        parts.append(
            f"""
      <g class="critical-lane" data-lane-id="{esc(lane['id'])}">
        <rect x="{LEFT - 10}" y="{fmt(band_y)}" width="{fmt(RIGHT - LEFT + 20)}" height="62" rx="4"
          fill="{PALETTE['gray100']}" opacity="0">
          <animate attributeName="opacity" values="0;.52" dur=".35s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <line x1="{LEFT}" x2="{RIGHT}" y1="{fmt(y)}" y2="{fmt(y)}" stroke="{PALETTE['gray200']}" stroke-width="1"/>
        <text class="lane-label" x="{LEFT - 25}" y="{fmt(y + 4)}" text-anchor="end">{esc(lane['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def axis_markup() -> str:
    ticks: list[str] = []
    for week in range(0, 9):
        x = x_scale(float(week))
        ticks.append(
            f"""
      <g class="time-tick" data-week="{week}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".22s" begin="{fmt(0.08 + week * 0.025)}s" fill="freeze"/>
        <line x1="{fmt(x)}" x2="{fmt(x)}" y1="{TOP}" y2="466" stroke="{PALETTE['gray200']}" stroke-width="1" stroke-dasharray="2 6"/>
        <text class="axis-label" x="{fmt(x)}" y="102" text-anchor="middle">W{week}</text>
      </g>"""
        )
    deadline_x = x_scale(DEADLINE)
    ticks.append(
        f"""
      <g class="deadline-marker" data-deadline="{fmt(DEADLINE)}">
        <line x1="{fmt(deadline_x)}" x2="{fmt(deadline_x)}" y1="88" y2="482"
          stroke="{PALETTE['red']}" stroke-width="2.2" stroke-dasharray="6 6"/>
        <text class="deadline-label" x="{fmt(deadline_x)}" y="88" text-anchor="middle">deadline</text>
      </g>"""
    )
    return "\n".join(ticks)


def dependency_markup(dep: dict[str, object], index: int) -> str:
    is_critical = bool(dep.get("critical"))
    feeds = bool(dep.get("feeds_critical"))
    delay = 1.0 + index * 0.045 if not is_critical else 1.42 + index * 0.09
    stroke = PALETTE["red"] if is_critical else (PALETTE["orange"] if feeds else PALETTE["gray300"])
    width = 3.8 if is_critical else 1.7
    opacity = 0.94 if is_critical else 0.58
    class_name = "critical-chain-dependency"
    if is_critical:
        class_name += " critical-dependency"
    if feeds:
        class_name += " feeding-dependency"
    return f"""
      <path id="critical-chain-dependency-{esc(dep['id'])}" class="{class_name}"
        data-dependency-id="{esc(dep['id'])}" data-source-id="{esc(dep['source'])}" data-target-id="{esc(dep['target'])}"
        data-critical="{str(is_critical).lower()}" data-feeds-critical="{str(feeds).lower()}"
        d="{dependency_path(dep)}" fill="none" stroke="{stroke}" stroke-width="{fmt(width)}"
        stroke-opacity="{fmt(opacity)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0"
          keyTimes="0;{delay / (delay + 0.72):.3f};1" dur="{fmt(delay + 0.72)}s" begin="0s" fill="freeze"/>
      </path>"""


def pulse_markup(dep: dict[str, object], pulse_index: int) -> str:
    begin = 2.05 + pulse_index * 0.18
    return f"""
      <circle class="dependency-pulse" data-dependency-id="{esc(dep['id'])}" r="5.6"
        fill="{PALETTE['red']}" stroke="#ffffff" stroke-width="1.6" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.84;.9;1"
          dur="{fmt(begin + 0.35)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.1s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#critical-chain-dependency-{esc(dep['id'])}"/>
        </animateMotion>
      </circle>"""


def task_markup(task: dict[str, object], index: int) -> str:
    box = task_box(task)
    is_critical = bool(task["critical"])
    color = PALETTE[str(task["color"])]
    fill = color if is_critical else PALETTE[f"{task['color']}_highlight"]
    stroke = PALETTE["red_hover"] if is_critical else color
    text_color = PALETTE["surface"] if is_critical else PALETTE["ink"]
    delay = 0.58 + index * 0.045 + (0.34 if is_critical else 0)
    return f"""
      <g class="critical-chain-task{' critical-task' if is_critical else ' context-task'}"
        data-task-id="{esc(task['id'])}" data-lane-id="{esc(task['lane'])}"
        data-start="{fmt(float(task['start']))}" data-duration="{fmt(float(task['duration']))}"
        data-critical="{str(is_critical).lower()}">
        <rect x="{fmt(box['x'])}" y="{fmt(box['y'])}" width="{fmt(box['width'])}" height="{TASK_HEIGHT}" rx="5"
          fill="{fill}" stroke="{stroke}" stroke-width="{2.4 if is_critical else 1.6}" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".22s" begin="{fmt(delay)}s" fill="freeze"/>
          <animate attributeName="width" values="0;{fmt(box['width'])}" dur=".52s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <text class="task-label{' task-label-critical' if is_critical else ''}" x="{fmt(box['cx'])}" y="{fmt(box['cy'] + 4)}"
          text-anchor="middle" fill="{text_color}">{esc(task['label'])}</text>
      </g>"""


def buffer_markup(buffer: dict[str, object], index: int) -> str:
    x0 = x_scale(float(buffer["start"]))
    width = x_scale(float(buffer["start"]) + float(buffer["duration"])) - x0
    y = lane_y(str(buffer["lane"])) + (24 if buffer["kind"] == "project" else 28)
    consumed = max(0.0, min(1.0, float(buffer["consumed"])))
    consumed_width = width * consumed
    remaining_width = max(0.0, width - consumed_width)
    is_project = buffer["kind"] == "project"
    delay = 1.68 + index * 0.15
    consumed_fill = PALETTE["orange"] if consumed < 0.7 else PALETTE["red"]
    height = 16 if is_project else 10
    label_y = 30 if is_project else 22
    return f"""
      <g class="critical-buffer" data-buffer-id="{esc(buffer['id'])}" data-buffer-kind="{esc(buffer['kind'])}"
        data-lane-id="{esc(buffer['lane'])}" data-target-id="{esc(buffer['target'])}"
        data-consumed="{fmt(consumed)}" transform="translate({fmt(x0)} {fmt(y)})">
        <rect x="0" y="0" width="{fmt(width)}" height="{height}" rx="5"
          fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".28s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <rect x="0" y="0" width="{fmt(consumed_width)}" height="{height}" rx="5"
          fill="{consumed_fill}" opacity=".9">
          <animate attributeName="width" values="0;{fmt(consumed_width)}" dur=".55s" begin="{fmt(delay + 0.18)}s" fill="freeze"/>
        </rect>
        <rect x="{fmt(consumed_width)}" y="0" width="{fmt(remaining_width)}" height="{height}" rx="5"
          fill="{PALETTE['green']}" opacity=".7"/>
        <text class="buffer-label" x="{fmt(width / 2)}" y="{label_y}" text-anchor="middle">{esc(buffer['label'])}</text>
      </g>"""


def resource_buffer_markup(resource: dict[str, object], index: int) -> str:
    x = x_scale(float(resource["time"]))
    y = lane_y(str(resource["lane"])) - 34
    delay = 1.18 + index * 0.12
    return f"""
      <g class="resource-buffer" data-resource-buffer-id="{esc(resource['id'])}" data-task-id="{esc(resource['for'])}"
        transform="translate({fmt(x)} {fmt(y)})" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".25s" begin="{fmt(delay)}s" fill="freeze"/>
        <path d="M0 -8 L8 7 L-8 7 Z" fill="{PALETTE['purple']}" stroke="#ffffff" stroke-width="1.2"/>
        <text class="resource-buffer-label" x="0" y="-13" text-anchor="middle">{esc(resource['label'])}</text>
      </g>"""


def fever_chart_markup() -> str:
    x0 = PANEL_X + 28
    y0 = PANEL_Y + 92
    w = 188
    h = 132

    def px(complete: float) -> float:
        return x0 + complete * w

    def py(consumed: float) -> float:
        return y0 + h - consumed * h

    path = " ".join(
        ("M" if index == 0 else "L") + f"{fmt(px(point['complete']))} {fmt(py(point['consumed']))}"
        for index, point in enumerate(FEVER_POINTS)
    )
    point_markup = []
    for index, point in enumerate(FEVER_POINTS):
        delay = 2.25 + index * 0.09
        fill = PALETTE["red"] if index == len(FEVER_POINTS) - 1 else PALETTE["blue"]
        point_markup.append(
            f"""
        <circle class="fever-point" data-fever-point="{index}" data-chain-complete="{fmt(point['complete'])}"
          data-buffer-consumed="{fmt(point['consumed'])}" cx="{fmt(px(point['complete']))}" cy="{fmt(py(point['consumed']))}"
          r="0" fill="{fill}" stroke="#ffffff" stroke-width="1.5">
          <animate attributeName="r" values="0;4.8" dur=".24s" begin="{fmt(delay)}s" fill="freeze"/>
        </circle>"""
        )
    return f"""
      <g class="fever-chart" data-chain-complete="{fmt(FEVER_POINTS[-1]['complete'])}"
        data-buffer-consumed="{fmt(FEVER_POINTS[-1]['consumed'])}" transform="translate(0 0)">
        <text class="panel-heading" x="{PANEL_X + 22}" y="{PANEL_Y + 36}">Buffer fever</text>
        <text class="panel-copy" x="{PANEL_X + 22}" y="{PANEL_Y + 56}">chain complete vs. buffer used</text>
        <rect x="{fmt(x0)}" y="{fmt(y0)}" width="{w}" height="{h}" fill="{PALETTE['surface']}" stroke="{PALETTE['gray200']}"/>
        <rect x="{fmt(x0)}" y="{fmt(y0 + h * .66)}" width="{w}" height="{fmt(h * .34)}" fill="{PALETTE['green_highlight']}"/>
        <rect x="{fmt(x0)}" y="{fmt(y0 + h * .34)}" width="{w}" height="{fmt(h * .32)}" fill="{PALETTE['orange_highlight']}"/>
        <rect x="{fmt(x0)}" y="{fmt(y0)}" width="{w}" height="{fmt(h * .34)}" fill="{PALETTE['red_highlight']}"/>
        <line x1="{fmt(x0)}" y1="{fmt(y0 + h)}" x2="{fmt(x0 + w)}" y2="{fmt(y0 + h)}" stroke="{PALETTE['gray700']}" stroke-width="1.2"/>
        <line x1="{fmt(x0)}" y1="{fmt(y0)}" x2="{fmt(x0)}" y2="{fmt(y0 + h)}" stroke="{PALETTE['gray700']}" stroke-width="1.2"/>
        <text class="mini-axis-label" x="{fmt(x0 + w / 2)}" y="{fmt(y0 + h + 25)}" text-anchor="middle">critical chain complete</text>
        <text class="mini-axis-label" x="{fmt(x0 - 10)}" y="{fmt(y0 + 8)}" text-anchor="end">used</text>
        <path class="fever-line" d="{path}" fill="none" stroke="{PALETTE['red']}" stroke-width="2.8"
          stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
          <animate attributeName="stroke-dashoffset" values="1;0" dur=".75s" begin="2.18s" fill="freeze"/>
        </path>
        {''.join(point_markup)}
      </g>"""


def status_rows_markup() -> str:
    rows = [
        ("Critical chain", "78% complete", PALETTE["red"], PALETTE["red_highlight"]),
        ("Project buffer", "62% used", PALETTE["orange"], PALETTE["orange_highlight"]),
        ("Feed buffers", "39% avg", PALETTE["green"], PALETTE["green_highlight"]),
    ]
    parts = []
    for index, (label, value, stroke, fill) in enumerate(rows):
        y = PANEL_Y + 282 + index * 44
        parts.append(
            f"""
        <g class="status-row" data-status-index="{index}">
          <rect x="{PANEL_X + 22}" y="{y}" width="204" height="30" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.1"/>
          <text class="status-label" x="{PANEL_X + 34}" y="{y + 19}">{esc(label)}</text>
          <text class="status-value" x="{PANEL_X + 214}" y="{y + 19}" text-anchor="end">{esc(value)}</text>
        </g>"""
        )
    return "\n".join(parts)


def legend_markup() -> str:
    items = [
        ("Critical chain", PALETTE["red"], "line"),
        ("Feeding dependency", PALETTE["orange"], "line"),
        ("Consumed buffer", PALETTE["orange"], "rect"),
        ("Remaining buffer", PALETTE["green"], "rect"),
        ("Resource alert", PALETTE["purple"], "triangle"),
    ]
    x = 64
    y = 542
    parts = []
    cursor = x
    for index, (label, color, kind) in enumerate(items):
        if kind == "line":
            mark = f'<line x1="{cursor}" y1="{y}" x2="{cursor + 26}" y2="{y}" stroke="{color}" stroke-width="3" stroke-linecap="round"/>'
            text_x = cursor + 36
            step = 150
        elif kind == "triangle":
            mark = f'<path d="M{cursor + 12} {y - 8} L{cursor + 21} {y + 8} L{cursor + 3} {y + 8} Z" fill="{color}"/>'
            text_x = cursor + 36
            step = 132
        else:
            mark = f'<rect x="{cursor}" y="{y - 8}" width="26" height="16" rx="4" fill="{color}"/>'
            text_x = cursor + 36
            step = 144
        parts.append(
            f"""
      <g class="critical-legend-item" data-legend-index="{index}">
        {mark}
        <text class="legend-label" x="{text_x}" y="{y + 4}">{esc(label)}</text>
      </g>"""
        )
        cursor += step
    return "\n".join(parts)


def build_html() -> str:
    context_deps = [dep for dep in DEPENDENCIES if not dep.get("critical")]
    critical_deps = [dep for dep in DEPENDENCIES if dep.get("critical")]
    dependencies = "\n".join(
        dependency_markup(dep, index) for index, dep in enumerate([*context_deps, *critical_deps])
    )
    pulses = "\n".join(pulse_markup(dep, index) for index, dep in enumerate(critical_deps))
    tasks = "\n".join(task_markup(task, index) for index, task in enumerate(TASKS))
    buffers = "\n".join(buffer_markup(buffer, index) for index, buffer in enumerate(BUFFERS))
    resource_buffers = "\n".join(
        resource_buffer_markup(resource, index) for index, resource in enumerate(RESOURCE_BUFFERS)
    )
    critical_count = sum(1 for task in TASKS if task["critical"])
    feeding_buffer_count = sum(1 for buffer in BUFFERS if buffer["kind"] == "feeding")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Chain Buffer</title>
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
      width: min(100vw - 32px, 1180px);
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
      font-size: 23px;
      font-weight: 800;
    }}
    .root-subtitle, .panel-copy, .mini-axis-label {{
      fill: {PALETTE["gray600"]};
      font-size: 11px;
      font-weight: 700;
    }}
    .axis-label, .lane-label, .buffer-label, .deadline-label, .resource-buffer-label {{
      fill: {PALETTE["ink"]};
      font-size: 11px;
      font-weight: 800;
      paint-order: stroke;
      stroke: {PALETTE["surface"]};
      stroke-width: 4px;
      stroke-linejoin: round;
    }}
    .task-label {{
      font-size: 10.5px;
      font-weight: 800;
      pointer-events: none;
    }}
    .task-label-critical {{
      paint-order: stroke;
      stroke: rgba(0,0,0,.16);
      stroke-width: 1px;
      stroke-linejoin: round;
    }}
    .dependency-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .32));
    }}
    .critical-buffer {{
      font-size: 10px;
      font-weight: 800;
    }}
    .panel-heading {{
      fill: {PALETTE["ink"]};
      font-size: 15px;
      font-weight: 800;
    }}
    .status-label {{
      fill: {PALETTE["ink"]};
      font-size: 11px;
      font-weight: 800;
    }}
    .status-value {{
      fill: {PALETTE["ink"]};
      font-size: 11px;
      font-weight: 900;
    }}
    .legend-label {{
      fill: {PALETTE["ink"]};
      font-size: 11px;
      font-weight: 800;
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion {{
        dur: 1ms;
      }}
    }}
  </style>
</head>
<body>
  <svg id="critical-chain-buffer" data-pattern-id="d3-critical-chain-buffer"
    data-pattern-family="critical-chain" data-task-count="{len(TASKS)}"
    data-critical-task-count="{critical_count}" data-dependency-count="{len(DEPENDENCIES)}"
    data-buffer-count="{len(BUFFERS)}" data-feeding-buffer-count="{feeding_buffer_count}"
    data-resource-buffer-count="{len(RESOURCE_BUFFERS)}" data-project-buffer-consumed="0.62"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="critical-chain-buffer-title critical-chain-buffer-desc">
    <title id="critical-chain-buffer-title">Critical chain buffer</title>
    <desc id="critical-chain-buffer-desc">A deterministic schedule highlights the controlling critical chain, feeding dependencies, resource alerts, consumed feeding buffers, consumed project buffer, a deadline marker, and a buffer fever chart.</desc>
    <rect x="28" y="24" width="{WIDTH - 56}" height="{HEIGHT - 48}" rx="10" fill="{PALETTE["page"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.3"/>
    <text class="root-title" x="58" y="55">Critical chain buffer map</text>
    <text class="root-subtitle" x="58" y="76">Critical work protects the due date with feeding buffers, resource alerts, and one visible project buffer.</text>
    <rect x="50" y="92" width="752" height="408" rx="8" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <rect x="{PANEL_X}" y="{PANEL_Y}" width="{PANEL_W}" height="{PANEL_H}" rx="8" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <g class="axis">
{axis_markup()}
    </g>
    <g class="lanes">
{lane_markup()}
    </g>
    <g class="critical-chain-dependencies">
{dependencies}
    </g>
    <g class="resource-buffers">
{resource_buffers}
    </g>
    <g class="critical-chain-tasks">
{tasks}
    </g>
    <g class="critical-buffers">
{buffers}
    </g>
    <g class="dependency-pulses">
{pulses}
    </g>
    <g class="critical-status-panel">
{fever_chart_markup()}
{status_rows_markup()}
    </g>
    <g class="critical-legend">
{legend_markup()}
    </g>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Chain Buffer D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
