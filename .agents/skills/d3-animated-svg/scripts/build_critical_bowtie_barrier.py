#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Bowtie Barrier animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 820
HEIGHT = 450

PALETTE = {
    "blue": "#007298",
    "orange": "#e77204",
    "green": "#45842a",
    "red": "#9e1b32",
    "purple": "#652f6c",
    "ink": "#333e48",
    "surface": "#ffffff",
    "page": "#f7f7f7",
    "gray50": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray600": "#696969",
    "blue_highlight": "#cdf3ff",
    "orange_highlight": "#ffe5cc",
    "green_highlight": "#dbffcc",
    "purple_highlight": "#f9ccff",
    "red_highlight": "#ffccd5",
}

ROWS = [128, 182, 236, 290]
BOX_W = 116
BOX_H = 34
BARRIER_W = 112
BARRIER_H = 38
CENTER = {"x": 410, "y": 216, "w": 142, "h": 58}
TOP_ENTRIES = [194, 208, 224, 238]

THREATS = [
    {"id": "corrosion-growth", "label": ["Corrosion", "growth"], "x": 96, "y": ROWS[0], "severity": "high"},
    {"id": "overpressure", "label": ["Overpressure", "spike"], "x": 96, "y": ROWS[1], "severity": "critical"},
    {"id": "seal-failure", "label": ["Seal", "failure"], "x": 96, "y": ROWS[2], "severity": "high"},
    {"id": "operator-error", "label": ["Operator", "error"], "x": 96, "y": ROWS[3], "severity": "medium"},
]

PREVENTIVE = [
    {"id": "inspection-program", "label": ["Inspection", "program"], "x": 252, "y": ROWS[0], "code": "B1", "status": "weak", "gap": True},
    {"id": "relief-valve", "label": ["Relief", "valve"], "x": 252, "y": ROWS[1], "code": "B2", "status": "healthy", "gap": False},
    {"id": "seal-plan", "label": ["Seal plan", "flush"], "x": 252, "y": ROWS[2], "code": "B3", "status": "healthy", "gap": False},
    {"id": "permit-check", "label": ["Permit", "check"], "x": 252, "y": ROWS[3], "code": "B4", "status": "healthy", "gap": False},
]

MITIGATIVE = [
    {"id": "gas-detection", "label": ["Gas", "detection"], "x": 568, "y": ROWS[0], "code": "M1", "status": "healthy", "gap": False},
    {"id": "deluge-system", "label": ["Deluge", "system"], "x": 568, "y": ROWS[1], "code": "M2", "status": "weak", "gap": True},
    {"id": "isolation-valves", "label": ["Remote", "isolation"], "x": 568, "y": ROWS[2], "code": "M3", "status": "healthy", "gap": False},
    {"id": "evacuation-plan", "label": ["Evacuation", "plan"], "x": 568, "y": ROWS[3], "code": "M4", "status": "healthy", "gap": False},
]

CONSEQUENCES = [
    {"id": "personnel-exposure", "label": ["Personnel", "exposure"], "x": 728, "y": ROWS[0], "severity": "critical"},
    {"id": "fire-escalation", "label": ["Fire", "escalation"], "x": 728, "y": ROWS[1], "severity": "critical"},
    {"id": "environmental-release", "label": ["Environmental", "release"], "x": 728, "y": ROWS[2], "severity": "high"},
    {"id": "production-outage", "label": ["Production", "outage"], "x": 728, "y": ROWS[3], "severity": "medium"},
]

GAPS = [
    {"id": "inspection-gap", "barrier_id": "inspection-program", "label": "inspection overdue", "x": 252, "y": 96, "target_x": 252, "target_y": ROWS[0] - 22},
    {"id": "deluge-gap", "barrier_id": "deluge-system", "label": "deluge offline", "x": 568, "y": 96, "target_x": 568, "target_y": ROWS[1] - 22, "via_x": 502},
]

CONTROLS = [
    {"id": "barrier-audit", "label": "Barrier audit", "value": "14 d", "x": 216, "color": "blue"},
    {"id": "proof-test", "label": "Proof test", "value": "due", "x": 410, "color": "red"},
    {"id": "override-review", "label": "Override review", "value": "open", "x": 604, "color": "purple"},
]


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def color(name: str) -> str:
    return PALETTE[name]


def label_lines(lines: list[str], x: float, y: float, size: float = 8.4, cls: str = "mark-label") -> str:
    parts = []
    for index, line in enumerate(lines):
        parts.append(
            f'<text class="{cls}" x="{x}" y="{y + index * (size + 2.8):.1f}" text-anchor="middle" '
            f'font-size="{size}" font-weight="{760 if cls == "caption" else 850}">{esc(line)}</text>'
        )
    return "\n".join(parts)


def side_path(from_x: float, from_y: float, to_x: float, to_y: float, bend: float) -> str:
    return f"M{from_x},{from_y}C{from_x + bend},{from_y} {to_x - bend},{to_y} {to_x},{to_y}"


def left_link_path(index: int) -> str:
    threat = THREATS[index]
    barrier = PREVENTIVE[index]
    return (
        f"M{threat['x'] + BOX_W / 2},{threat['y']}H{barrier['x'] - BARRIER_W / 2}"
        f"M{barrier['x'] + BARRIER_W / 2},{barrier['y']}"
        f"C{barrier['x'] + BARRIER_W / 2 + 72},{barrier['y']} "
        f"{CENTER['x'] - CENTER['w'] / 2 - 72},{TOP_ENTRIES[index]} "
        f"{CENTER['x'] - CENTER['w'] / 2},{TOP_ENTRIES[index]}"
    )


def right_link_path(index: int) -> str:
    consequence = CONSEQUENCES[index]
    barrier = MITIGATIVE[index]
    return (
        f"M{CENTER['x'] + CENTER['w'] / 2},{TOP_ENTRIES[index]}"
        f"C{CENTER['x'] + CENTER['w'] / 2 + 72},{TOP_ENTRIES[index]} "
        f"{barrier['x'] - BARRIER_W / 2 - 72},{barrier['y']} {barrier['x'] - BARRIER_W / 2},{barrier['y']}"
        f"M{barrier['x'] + BARRIER_W / 2},{barrier['y']}H{consequence['x'] - BOX_W / 2}"
    )


def motion_path_left(index: int) -> str:
    threat = THREATS[index]
    barrier = PREVENTIVE[index]
    return (
        f"M{threat['x'] + BOX_W / 2},{threat['y']}H{barrier['x']}H{barrier['x'] + BARRIER_W / 2}"
        f"C{barrier['x'] + BARRIER_W / 2 + 72},{barrier['y']} "
        f"{CENTER['x'] - CENTER['w'] / 2 - 72},{TOP_ENTRIES[index]} "
        f"{CENTER['x'] - CENTER['w'] / 2},{TOP_ENTRIES[index]}"
    )


def motion_path_right(index: int) -> str:
    consequence = CONSEQUENCES[index]
    barrier = MITIGATIVE[index]
    return (
        f"M{CENTER['x'] + CENTER['w'] / 2},{TOP_ENTRIES[index]}"
        f"C{CENTER['x'] + CENTER['w'] / 2 + 72},{TOP_ENTRIES[index]} "
        f"{barrier['x'] - BARRIER_W / 2 - 72},{barrier['y']} {barrier['x'] - BARRIER_W / 2},{barrier['y']}"
        f"H{barrier['x'] + BARRIER_W / 2}H{consequence['x'] - BOX_W / 2}"
    )


def endpoint(record: dict[str, object], class_name: str, stroke: str, fill: str) -> str:
    x = float(record["x"])
    y = float(record["y"])
    width = BOX_W
    height = BOX_H
    return f"""
      <g class="{class_name}" data-node-id="{esc(record['id'])}" data-severity="{esc(record['severity'])}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin=".28s" fill="freeze"/>
        <rect x="{x - width / 2}" y="{y - height / 2}" width="{width}" height="{height}" rx="6"
          fill="{fill}" stroke="{stroke}" stroke-width="{'1.8' if record['severity'] == 'critical' else '1.2'}"/>
        {label_lines(record['label'], x, y - 3, 8.2)}
      </g>"""


def barrier(record: dict[str, object], class_name: str, side: str, normal_color: str) -> str:
    x = float(record["x"])
    y = float(record["y"])
    is_gap = bool(record["gap"])
    stroke = color("red") if is_gap else normal_color
    fill = color("red_highlight") if is_gap else color("gray50")
    status = color("red") if is_gap else color("green")
    dash = "5 3" if is_gap else ""
    return f"""
      <g class="bowtie-barrier {class_name}{' degraded-barrier' if is_gap else ''}"
        data-barrier-id="{esc(record['id'])}" data-barrier-code="{esc(record['code'])}"
        data-barrier-side="{side}" data-status="{esc(record['status'])}" data-critical-gap="{str(is_gap).lower()}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".44s" begin=".34s" fill="freeze"/>
        <rect x="{x - BARRIER_W / 2}" y="{y - BARRIER_H / 2}" width="{BARRIER_W}" height="{BARRIER_H}" rx="6"
          fill="{fill}" stroke="{stroke}" stroke-width="{'2' if is_gap else '1.4'}" stroke-dasharray="{dash}"/>
        <rect x="{x - BARRIER_W / 2}" y="{y - BARRIER_H / 2}" width="9" height="{BARRIER_H}" rx="4" fill="{status}"/>
        <circle cx="{x + BARRIER_W / 2 - 13}" cy="{y - BARRIER_H / 2 + 11}" r="4.2" fill="{status}" stroke="#ffffff" stroke-width="1"/>
        <text class="caption" x="{x - BARRIER_W / 2 + 16}" y="{y - 6}" font-size="7.2" font-weight="850">{esc(record['code'])}</text>
        {label_lines(record['label'], x, y + 4, 7.8)}
      </g>"""


def gap_markup(gap: dict[str, object]) -> str:
    if "via_x" in gap:
        leader_d = f"M{gap['x']},{gap['y'] + 12}H{gap['via_x']}V{gap['target_y']}H{gap['target_x']}"
    else:
        leader_d = f"M{gap['x']},{gap['y'] + 12}L{gap['target_x']},{gap['target_y']}"
    return f"""
      <g class="critical-barrier-gap" data-gap-id="{esc(gap['id'])}" data-barrier-id="{esc(gap['barrier_id'])}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin=".68s" fill="freeze"/>
        <path d="{leader_d}" fill="none" stroke="{color('red')}"
          stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#critical-bowtie-gap)"/>
        <rect x="{gap['x'] - 52}" y="{gap['y'] - 11}" width="104" height="22" rx="6" fill="#ffffff" stroke="{color('red')}" stroke-width="1.1"/>
        <text class="caption" x="{gap['x']}" y="{gap['y'] + 4}" text-anchor="middle" font-size="7.2" font-weight="850" fill="{color('red')}">{esc(gap['label'])}</text>
      </g>"""


def control_markup(control: dict[str, object]) -> str:
    x = float(control["x"])
    stroke = color(str(control["color"]))
    return f"""
      <g class="degradation-control" data-control-id="{esc(control['id'])}" transform="translate({x} 386)" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".4s" begin=".76s" fill="freeze"/>
        <rect x="-72" y="-12" width="144" height="34" rx="6" fill="{color('gray50')}" stroke="{stroke}" stroke-width="1.1"/>
        <circle cx="-56" cy="5" r="5" fill="{stroke}"/>
        <text class="mark-label" x="-44" y="1" font-size="7.6">{esc(control['label'])}</text>
        <text class="caption" x="-44" y="15" font-size="7.2">status: {esc(control['value'])}</text>
      </g>"""


def build_svg() -> str:
    left_paths = []
    right_paths = []
    motion_paths = []
    pulses = []
    for index, threat in enumerate(THREATS):
        barrier_record = PREVENTIVE[index]
        path_id = f"bowtie-threat-motion-{threat['id']}"
        left_paths.append(
            f'<path id="bowtie-link-{esc(threat["id"])}-to-top" class="bowtie-link threat-to-top{" critical-gap-link" if barrier_record["gap"] else ""}" '
            f'data-source-id="{esc(threat["id"])}" data-target-id="loss-of-containment" d="{left_link_path(index)}" fill="none" '
            f'stroke="{color("red") if barrier_record["gap"] else color("orange")}" stroke-width="{"2.8" if barrier_record["gap"] else "2.1"}" '
            f'stroke-opacity="{"0.86" if barrier_record["gap"] else "0.58"}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#critical-bowtie-threat)" '
            'pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" dur=".72s" begin=".12s" fill="freeze"/></path>'
        )
        motion_paths.append(f'<path id="{path_id}" d="{motion_path_left(index)}" fill="none" stroke="none"/>')
        pulses.append(
            f'<circle class="bowtie-threat-pulse" data-threat-id="{esc(threat["id"])}" r="{"5.4" if barrier_record["gap"] else "4.4"}" '
            f'fill="{color("red") if barrier_record["gap"] else color("orange")}" stroke="#ffffff" stroke-width="1.2">'
            f'<animateMotion dur="3.2s" begin="{0.42 + index * 0.34:.2f}s" repeatCount="indefinite"><mpath href="#{path_id}"/></animateMotion></circle>'
        )
    for index, consequence in enumerate(CONSEQUENCES):
        barrier_record = MITIGATIVE[index]
        path_id = f"bowtie-consequence-motion-{consequence['id']}"
        right_paths.append(
            f'<path id="bowtie-link-top-to-{esc(consequence["id"])}" class="bowtie-link top-to-consequence{" critical-gap-link" if barrier_record["gap"] else ""}" '
            f'data-source-id="loss-of-containment" data-target-id="{esc(consequence["id"])}" d="{right_link_path(index)}" fill="none" '
            f'stroke="{color("red") if barrier_record["gap"] else color("purple")}" stroke-width="{"2.8" if barrier_record["gap"] else "2.1"}" '
            f'stroke-opacity="{"0.86" if barrier_record["gap"] else "0.58"}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#critical-bowtie-consequence)" '
            'pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" dur=".72s" begin=".12s" fill="freeze"/></path>'
        )
        motion_paths.append(f'<path id="{path_id}" d="{motion_path_right(index)}" fill="none" stroke="none"/>')
        pulses.append(
            f'<circle class="bowtie-consequence-pulse" data-consequence-id="{esc(consequence["id"])}" r="{"5.4" if barrier_record["gap"] else "4.4"}" '
            f'fill="{color("red") if barrier_record["gap"] else color("purple")}" stroke="#ffffff" stroke-width="1.2">'
            f'<animateMotion dur="3.4s" begin="{0.74 + index * 0.34:.2f}s" repeatCount="indefinite"><mpath href="#{path_id}"/></animateMotion></circle>'
        )

    return f"""<svg id="bowtie-barriers" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
  aria-labelledby="bowtie-barriers-title bowtie-barriers-desc"
  data-pattern-id="d3-bowtie-barriers" data-pattern-family="bowtie-barriers"
  data-threat-count="4" data-preventive-barrier-count="4" data-mitigative-barrier-count="4" data-consequence-count="4"
  data-barrier-count="8" data-critical-gap-count="2" data-degradation-control-count="3" data-top-event="loss-of-containment">
  <title id="bowtie-barriers-title">Critical bowtie barrier</title>
  <desc id="bowtie-barriers-desc">A bowtie barrier diagram maps threats, a top event, preventive barriers, mitigative barriers, consequences, and degraded controls.</desc>
  <defs>
    <marker id="critical-bowtie-threat" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="{color('orange')}"/></marker>
    <marker id="critical-bowtie-consequence" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="{color('purple')}"/></marker>
    <marker id="critical-bowtie-gap" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="{color('red')}"/></marker>
    <style><![CDATA[
      text {{ font-family: "Open Sans", Arial, sans-serif; fill: {color('ink')}; }}
      .label {{ font-weight: 900; }}
      .mark-label {{ font-weight: 850; }}
      .caption {{ fill: {color('gray600')}; font-size: 7.6px; }}
      .bowtie-link {{ vector-effect: non-scaling-stroke; }}
      .critical-gap-link {{ stroke-dasharray: 8 4; }}
    ]]></style>
  </defs>
  <rect width="{WIDTH}" height="{HEIGHT}" rx="10" fill="{color('page')}"/>
  <rect x="18" y="22" width="784" height="410" rx="8" fill="{color('surface')}" stroke="{color('gray200')}" stroke-width="1.2"/>
  <text class="caption" x="36" y="48">Bowtie - pressure release risk</text>
  <text class="caption" x="93" y="68" text-anchor="middle">Threats</text>
  <text class="caption" x="252" y="68" text-anchor="middle">Preventive barriers</text>
  <text class="caption" x="568" y="68" text-anchor="middle">Mitigative barriers</text>
  <text class="caption" x="728" y="86" text-anchor="middle">Consequences</text>
  <g class="bowtie-hazard" transform="translate(328 42)">
    <rect width="164" height="42" rx="7" fill="{color('red_highlight')}" stroke="{color('red')}" stroke-width="1.4"/>
    <text class="mark-label" x="82" y="17" text-anchor="middle" font-size="8.2">Hazard</text>
    <text class="caption" x="82" y="31" text-anchor="middle" font-size="7.6">pressurized ammonia</text>
  </g>
  <g class="bowtie-health-panel" transform="translate(650 30)">
    <rect width="132" height="34" rx="7" fill="{color('gray50')}" stroke="{color('gray200')}"/>
    <text class="caption" x="10" y="13" font-size="7.4">Barrier health</text>
    <text class="label" x="10" y="28" font-size="12" fill="{color('green')}">6 OK</text>
    <text class="label" x="54" y="28" font-size="12" fill="{color('red')}">2 weak</text>
  </g>
  <g class="bowtie-links">{''.join(left_paths)}{''.join(right_paths)}</g>
  <g class="bowtie-motion-paths">{''.join(motion_paths)}</g>
  <g class="bowtie-pulses">{''.join(pulses)}</g>
  <g class="bowtie-top-event" data-event-id="loss-of-containment" opacity="0">
    <animate attributeName="opacity" values="0;1" dur=".45s" begin=".2s" fill="freeze"/>
    <rect x="{CENTER['x'] - CENTER['w'] / 2}" y="{CENTER['y'] - CENTER['h'] / 2}" width="{CENTER['w']}" height="{CENTER['h']}" rx="8" fill="{color('red_highlight')}" stroke="{color('red')}" stroke-width="2.2"/>
    <text class="caption" x="{CENTER['x']}" y="{CENTER['y'] - 10}" text-anchor="middle" font-size="7.6">TOP EVENT</text>
    <text class="mark-label" x="{CENTER['x']}" y="{CENTER['y'] + 5}" text-anchor="middle" font-size="10.1">Loss of</text>
    <text class="mark-label" x="{CENTER['x']}" y="{CENTER['y'] + 19}" text-anchor="middle" font-size="10.1">containment</text>
  </g>
  <g class="bowtie-threats">{''.join(endpoint(d, 'bowtie-threat', color('orange'), color('orange_highlight')) for d in THREATS)}</g>
  <g class="bowtie-consequences">{''.join(endpoint(d, 'bowtie-consequence', color('purple'), color('purple_highlight')) for d in CONSEQUENCES)}</g>
  <g class="preventive-barriers">{''.join(barrier(d, 'preventive-barrier', 'preventive', color('blue')) for d in PREVENTIVE)}</g>
  <g class="mitigative-barriers">{''.join(barrier(d, 'mitigative-barrier', 'mitigative', color('purple')) for d in MITIGATIVE)}</g>
  <g class="critical-barrier-gaps">{''.join(gap_markup(d) for d in GAPS)}</g>
  <g class="degradation-controls">
    <text class="caption" x="56" y="376">Degradation controls</text>
    {''.join(control_markup(d) for d in CONTROLS)}
  </g>
</svg>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Bowtie Barrier</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {color('page')};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw, 1180px);
      height: auto;
      display: block;
    }}
  </style>
</head>
<body>
{build_svg()}
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Output HTML file")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
