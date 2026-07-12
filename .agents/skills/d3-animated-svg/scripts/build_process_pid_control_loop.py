#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Process P&ID Control Loop animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 760
HEIGHT = 500

PALETTE = {
    "blue": "#007298",
    "green": "#45842a",
    "purple": "#652f6c",
    "orange": "#e77204",
    "red": "#9e1b32",
    "ink": "#333e48",
    "surface": "#ffffff",
    "gray50": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray600": "#696969",
    "blue_highlight": "#cdf3ff",
    "green_highlight": "#dbffcc",
    "purple_highlight": "#f9ccff",
    "orange_highlight": "#ffe5cc",
    "red_highlight": "#ffccd5",
}

PROCESS_LINES = [
    {
        "id": "feed-main",
        "kind": "process",
        "points": [(52, 312), (176, 312), (238, 312), (346, 312), (394, 312), (506, 312), (566, 312), (724, 312)],
        "color": "blue",
        "width": 6,
        "dash": "",
        "arrow": "flow",
    },
    {
        "id": "steam-utility",
        "kind": "utility",
        "points": [(420, 432), (420, 360), (452, 360), (452, 340)],
        "color": "orange",
        "width": 4,
        "dash": "9 7",
        "arrow": "",
    },
    {
        "id": "reactor-drain",
        "kind": "drain",
        "points": [(604, 366), (604, 430), (656, 430)],
        "color": "gray600",
        "width": 3,
        "dash": "6 6",
        "arrow": "",
    },
]

VALVES = [
    {"id": "lv-101", "label": "LV-101", "x": 198, "y": 312, "color": "green", "fill": "green_highlight", "kind": "level-control"},
    {"id": "tv-102", "label": "TV-102", "x": 420, "y": 432, "color": "orange", "fill": "orange_highlight", "kind": "temperature-control", "label_x": 46, "label_y": 6, "label_anchor": "start"},
    {"id": "fv-103", "label": "FV-103", "x": 684, "y": 312, "color": "purple", "fill": "purple_highlight", "kind": "flow-control"},
]

INSTRUMENTS = [
    {"id": "lic-101", "tag": "LIC", "loop": "101", "x": 134, "y": 116, "color": "green"},
    {"id": "tic-102", "tag": "TIC", "loop": "102", "x": 452, "y": 108, "color": "orange"},
    {"id": "fic-103", "tag": "FIC", "loop": "103", "x": 684, "y": 126, "color": "purple"},
    {"id": "hs-104", "tag": "HS", "loop": "104", "x": 594, "y": 76, "color": "red"},
]

SIGNALS = [
    {"id": "lic-to-lv", "source": "lic-101", "target": "lv-101", "points": [(134, 144), (134, 196), (198, 196), (198, 276)], "color": "green", "kind": "control"},
    {"id": "tic-to-tv", "source": "tic-102", "target": "tv-102", "points": [(452, 136), (452, 218), (420, 218), (420, 394)], "color": "orange", "kind": "control"},
    {"id": "fic-to-fv", "source": "fic-103", "target": "fv-103", "points": [(684, 154), (684, 276)], "color": "purple", "kind": "control"},
    {"id": "reactor-temp", "source": "r-101", "target": "tic-102", "points": [(604, 174), (604, 142), (480, 142)], "color": "orange", "kind": "measurement"},
    {"id": "high-high-trip", "source": "hs-104", "target": "fv-103", "points": [(594, 104), (656, 104), (656, 276)], "color": "red", "kind": "trip"},
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
        total += ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    return total


def draw_animation(points: list[tuple[int, int]], delay: float, duration: float) -> str:
    length = path_length(points)
    total = delay + duration
    return (
        f' stroke-dasharray="{fmt(length)} {fmt(length)}" stroke-dashoffset="0">'
        f'<animate attributeName="stroke-dashoffset" values="{fmt(length)};{fmt(length)};0" '
        f'keyTimes="0;{delay / total:.3f};1" dur="{fmt(total)}s" begin="0s" fill="freeze"/>'
    )


def marker_defs() -> str:
    return f"""
    <defs>
      <marker id="pid-flow-arrow" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,-5L10,0L0,5Z" fill="{PALETTE['blue']}"/>
      </marker>
      <marker id="pid-signal-arrow" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,-5L10,0L0,5Z" fill="{PALETTE['purple']}"/>
      </marker>
      <marker id="pid-trip-arrow" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,-5L10,0L0,5Z" fill="{PALETTE['red']}"/>
      </marker>
    </defs>"""


def process_lines_markup() -> str:
    lines: list[str] = []
    for index, line in enumerate(PROCESS_LINES):
        color = PALETTE[str(line["color"])]
        marker = ' marker-end="url(#pid-flow-arrow)"' if line["arrow"] else ""
        dash = str(line["dash"])
        if dash:
            lines.append(
                f"""
      <path id="pid-route-{esc(line['id'])}" class="pid-process-line" data-line-id="{esc(line['id'])}" data-line-kind="{esc(line['kind'])}"
        d="{path_for(line['points'])}" fill="none" stroke="{color}" stroke-width="{fmt(float(line['width']))}"
        stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="{esc(dash)}"{marker} opacity="1">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;.35;1" dur="{fmt(0.9 + index * 0.08)}s" begin="0s" fill="freeze"/>
      </path>"""
            )
        else:
            lines.append(
                f"""
      <path id="pid-route-{esc(line['id'])}" class="pid-process-line" data-line-id="{esc(line['id'])}" data-line-kind="{esc(line['kind'])}"
        d="{path_for(line['points'])}" fill="none" stroke="{color}" stroke-width="{fmt(float(line['width']))}"
        stroke-linecap="round" stroke-linejoin="round"{marker}{draw_animation(line['points'], 0.08, 1.18)}
      </path>"""
            )
    return "\n".join(lines)


def valve_markup(valve: dict[str, object]) -> str:
    color = PALETTE[str(valve["color"])]
    fill = PALETTE[str(valve["fill"])]
    x = valve["x"]
    y = valve["y"]
    label_x = valve.get("label_x", 0)
    label_y = valve.get("label_y", 38)
    label_anchor = valve.get("label_anchor", "middle")
    return f"""
      <g class="pid-valve {esc(valve['kind'])}" data-valve-id="{esc(valve['id'])}" transform="translate({x} {y})">
        <path d="M-18,-12L0,0L-18,12ZM18,-12L0,0L18,12Z" fill="{fill}" stroke="{color}" stroke-width="2" stroke-linejoin="round"/>
        <line x1="0" x2="0" y1="-22" y2="-4" stroke="{color}" stroke-width="1.5"/>
        <rect x="-12" y="-38" width="24" height="12" rx="3" fill="{PALETTE['surface']}" stroke="{color}" stroke-width="1.2"/>
        <text class="mark-label" x="{label_x}" y="{label_y}" text-anchor="{label_anchor}" font-size="11">{esc(valve['label'])}</text>
      </g>"""


def instrument_markup(item: dict[str, object]) -> str:
    color = PALETTE[str(item["color"])]
    return f"""
      <g class="pid-instrument" data-instrument-id="{esc(item['id'])}" data-loop="{esc(item['loop'])}" transform="translate({item['x']} {item['y']})">
        <circle r="27" fill="{PALETTE['surface']}" stroke="{color}" stroke-width="2"/>
        <line x1="-19" x2="19" y1="1" y2="1" stroke="{PALETTE['gray300']}" stroke-width="1"/>
        <text class="mark-label" x="0" y="-6" text-anchor="middle" font-size="11">{esc(item['tag'])}</text>
        <text class="mark-label" x="0" y="14" text-anchor="middle" font-size="10.5">{esc(item['loop'])}</text>
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;.2;1" dur="1.05s" begin="0s" fill="freeze"/>
      </g>"""


def signal_markup(signal: dict[str, object], index: int) -> str:
    color = PALETTE[str(signal["color"])]
    marker = "pid-trip-arrow" if signal["kind"] == "trip" else "pid-signal-arrow"
    dash = "9 6" if signal["kind"] == "trip" else "5 6"
    width = 2.4 if signal["kind"] == "trip" else 1.8
    class_name = "pid-signal-line pid-trip-line" if signal["kind"] == "trip" else "pid-signal-line"
    return f"""
      <path id="pid-signal-{esc(signal['id'])}" class="{class_name}" data-signal-id="{esc(signal['id'])}"
        data-source="{esc(signal['source'])}" data-target="{esc(signal['target'])}" data-signal-kind="{esc(signal['kind'])}"
        d="{path_for(signal['points'])}" fill="none" stroke="{color}" stroke-width="{fmt(width)}"
        stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="{dash}" marker-end="url(#{marker})" opacity="1">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;.45;1" dur="{fmt(1.15 + index * 0.06)}s" begin="0s" fill="freeze"/>
      </path>"""


def equipment_markup() -> str:
    return f"""
      <g class="pid-equipment pid-vessel" data-equipment-id="t-101">
        <rect x="92" y="210" width="74" height="126" fill="{PALETTE['gray50']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <ellipse cx="129" cy="210" rx="37" ry="11" fill="{PALETTE['surface']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <ellipse cx="129" cy="336" rx="37" ry="11" fill="{PALETTE['gray100']}" stroke="{PALETTE['ink']}" stroke-width="1.6"/>
        <rect x="100" y="268" width="58" height="58" fill="{PALETTE['blue_highlight']}" fill-opacity=".55"/>
        <line x1="100" x2="158" y1="268" y2="268" stroke="{PALETTE['blue']}" stroke-width="2.2"/>
        <text class="mark-label" x="129" y="366" text-anchor="middle">T-101 feed</text>
      </g>
      <g class="pid-equipment pid-pump" data-equipment-id="p-101" transform="translate(272 312)">
        <circle r="27" fill="{PALETTE['gray50']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <path d="M-10,-12L17,0L-10,12Z" fill="{PALETTE['blue_highlight']}" stroke="{PALETTE['blue']}" stroke-width="1.6"/>
        <text class="mark-label" x="0" y="48" text-anchor="middle">P-101</text>
      </g>
      <g class="pid-equipment pid-heat-exchanger" data-equipment-id="e-101">
        <rect x="394" y="268" width="104" height="72" rx="7" fill="{PALETTE['gray50']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <path d="M410,304C420,276 438,276 448,304S478,332 488,304" fill="none" stroke="{PALETTE['orange']}" stroke-width="3" stroke-linecap="round"/>
        <line x1="394" x2="498" y1="304" y2="304" stroke="{PALETTE['gray300']}" stroke-width="1.2"/>
        <text class="mark-label" x="446" y="258" text-anchor="middle">E-101 HX</text>
      </g>
      <g class="pid-equipment pid-reactor" data-equipment-id="r-101">
        <rect x="566" y="188" width="82" height="166" fill="{PALETTE['gray50']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <ellipse cx="607" cy="188" rx="41" ry="12" fill="{PALETTE['surface']}" stroke="{PALETTE['ink']}" stroke-width="2"/>
        <ellipse cx="607" cy="354" rx="41" ry="12" fill="{PALETTE['gray100']}" stroke="{PALETTE['ink']}" stroke-width="1.6"/>
        <path d="M586,230H628M586,270H628M586,310H628" stroke="{PALETTE['gray300']}" stroke-width="1.4" stroke-dasharray="5 5"/>
        <text class="mark-label" x="607" y="386" text-anchor="middle">R-101 reactor</text>
      </g>"""


def pulse_markup() -> str:
    pulses = []
    for index, begin in enumerate([0.0, 0.9, 1.8]):
        pulses.append(
            f"""
      <circle class="pid-flow-pulse" data-pulse-index="{index}" r="6" fill="{PALETTE['blue']}" stroke="{PALETTE['surface']}" stroke-width="1.5">
        <animateMotion dur="3.8s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#pid-route-feed-main"/>
        </animateMotion>
      </circle>"""
        )
    pulses.append(
        f"""
      <circle class="pid-utility-pulse" r="5.2" fill="{PALETTE['orange']}" stroke="{PALETTE['surface']}" stroke-width="1.4">
        <animateMotion dur="2.8s" begin=".75s" repeatCount="indefinite">
          <mpath href="#pid-route-steam-utility"/>
        </animateMotion>
      </circle>"""
    )
    return "\n".join(pulses)


def legend_markup() -> str:
    items = [
        ("process pipe", "blue", ""),
        ("control signal", "purple", "5 6"),
        ("safety trip", "red", "9 6"),
    ]
    parts = []
    for index, (label, color, dash) in enumerate(items):
        x = 80 + index * 210
        parts.append(
            f"""
      <line x1="{x}" x2="{x + 44}" y1="458" y2="458" stroke="{PALETTE[color]}" stroke-width="3" stroke-dasharray="{dash}"/>
      <text class="caption" x="{x + 54}" y="462">{esc(label)}</text>"""
        )
    return "\n".join(parts)


def svg_markup() -> str:
    grid_lines = []
    for x in range(74, WIDTH - 72, 52):
        grid_lines.append(f'<line x1="{x}" x2="{x}" y1="86" y2="418"/>')
    for y in range(106, 420, 52):
        grid_lines.append(f'<line x1="50" x2="710" y1="{y}" y2="{y}"/>')

    return f"""<svg id="process-control-loop" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="process-control-loop-title process-control-loop-desc"
    data-pattern-id="d3-process-control-loop" data-pattern-family="process-engineering"
    data-equipment-count="4" data-valve-count="{len(VALVES)}" data-instrument-count="{len(INSTRUMENTS)}"
    data-signal-line-count="{len(SIGNALS)}" data-process-line-count="{len(PROCESS_LINES)}">
    <title id="process-control-loop-title">P&amp;ID control loop</title>
    <desc id="process-control-loop-desc">A process engineering piping and instrumentation diagram with equipment, valves, instruments, dashed signal lines, interlock logic, and animated flow.</desc>
    {marker_defs()}
    <rect x="28" y="30" width="704" height="442" rx="10" fill="{PALETTE['surface']}" stroke="{PALETTE['gray200']}" stroke-width="1.6"/>
    <text class="caption" x="52" y="62">P&amp;ID 101 - reactor feed control</text>
    <g class="pid-grid" stroke="{PALETTE['gray100']}" stroke-width=".8">{''.join(grid_lines)}</g>
    <g class="pid-process-lines">{process_lines_markup()}</g>
    <g class="pid-equipment-layer">{equipment_markup()}</g>
    <g class="pid-valve-layer">{''.join(valve_markup(valve) for valve in VALVES)}</g>
    <g class="pid-instrument-layer">{''.join(instrument_markup(item) for item in INSTRUMENTS)}</g>
    <g class="pid-signal-lines">{''.join(signal_markup(signal, index) for index, signal in enumerate(SIGNALS))}</g>
    <g class="pid-flow-pulses">{pulse_markup()}</g>
    <g class="pid-safety-interlock" data-interlock-id="hh-104-shutdown">
      <rect x="522" y="34" width="134" height="28" rx="6" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.4"/>
      <text class="mark-label" x="589" y="53" text-anchor="middle" font-size="11">HH closes FV</text>
    </g>
    <g class="pid-legend">{legend_markup()}</g>
  </svg>"""


def html_document() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Process P&amp;ID Control Loop</title>
  <style>
    :root {{ color-scheme: light; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {PALETTE['gray50']};
      font-family: "Open Sans", Arial, sans-serif;
      color: {PALETTE['ink']};
    }}
    main {{ width: min(100vw - 32px, 960px); }}
    svg {{ width: 100%; height: auto; display: block; }}
    text {{ font-family: "Open Sans", Arial, sans-serif; }}
    .caption {{ fill: {PALETTE['gray600']}; font-size: 12px; font-weight: 700; }}
    .mark-label {{
      fill: {PALETTE['ink']};
      font-size: 12px;
      font-weight: 800;
      paint-order: stroke;
      stroke: {PALETTE['surface']};
      stroke-width: 3px;
      stroke-linejoin: round;
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{ display: none; }}
    }}
  </style>
</head>
<body>
  <main>
    {svg_markup()}
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html_document(), encoding="utf-8")
    print(f"Wrote Process P&ID Control Loop HTML to {args.output}")


if __name__ == "__main__":
    main()
