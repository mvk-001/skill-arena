#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Fault Tree animated SVG HTML file."""

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
    "gray50": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray600": "#696969",
    "gray700": "#4f4f4f",
}

EVENTS = [
    {"id": "top", "type": "top", "x": 520, "y": 92, "w": 220, "h": 54, "lines": ["Critical cooling", "unavailable"], "color": "red", "fill": "red_highlight", "probability": "2.4e-4"},
    {"id": "pump-train", "type": "intermediate", "x": 250, "y": 250, "w": 172, "h": 50, "lines": ["Pump train", "unavailable"], "color": "orange", "fill": "orange_highlight", "probability": "1.1e-6"},
    {"id": "cooling-path", "type": "intermediate", "x": 520, "y": 250, "w": 176, "h": 50, "lines": ["Cooling path", "blocked"], "color": "red", "fill": "red_highlight", "probability": "2.0e-4"},
    {"id": "trip-inhibited", "type": "intermediate", "x": 790, "y": 250, "w": 176, "h": 50, "lines": ["Trip logic", "inhibited"], "color": "purple", "fill": "purple_highlight", "probability": "4.8e-5"},
    {"id": "pump-a", "type": "basic", "x": 146, "y": 456, "label": "Pump A fails", "code": "P-101A", "color": "orange", "fill": "orange_highlight", "probability": "1.2e-3", "cut": "C1"},
    {"id": "pump-b", "type": "basic", "x": 350, "y": 456, "label": "Pump B fails", "code": "P-101B", "color": "orange", "fill": "orange_highlight", "probability": "9.0e-4", "cut": "C1"},
    {"id": "valve-stuck", "type": "basic", "x": 520, "y": 456, "label": "Valve stuck shut", "code": "V-201", "color": "red", "fill": "red_highlight", "probability": "2.0e-4", "cut": "C2"},
    {"id": "sensor-fails", "type": "basic", "x": 724, "y": 456, "label": "Temp sensor fails", "code": "TT-301", "color": "purple", "fill": "purple_highlight", "probability": "8.0e-4", "cut": "C3"},
    {"id": "bypass-left", "type": "basic", "x": 910, "y": 456, "label": "Interlock bypassed", "code": "BYP-4", "color": "purple", "fill": "purple_highlight", "probability": "6.0e-2", "cut": "C3"},
    {"id": "common-cause", "type": "undeveloped", "x": 974, "y": 326, "label": "Common cause", "code": "CCF", "color": "gray600", "fill": "gray100", "probability": "screened"},
]

GATES = [
    {"id": "top-or", "kind": "OR", "x": 520, "y": 180, "color": "red"},
    {"id": "pump-and", "kind": "AND", "x": 250, "y": 342, "color": "orange"},
    {"id": "path-or", "kind": "OR", "x": 520, "y": 342, "color": "red"},
    {"id": "trip-and", "kind": "AND", "x": 790, "y": 342, "color": "purple"},
]

LINKS = [
    {"id": "top-to-or", "source": "top", "target": "top-or", "kind": "event-gate", "color": "red", "cut": ""},
    {"id": "or-to-pump", "source": "top-or", "target": "pump-train", "kind": "gate-event", "color": "orange", "cut": "C1"},
    {"id": "or-to-path", "source": "top-or", "target": "cooling-path", "kind": "gate-event", "color": "red", "cut": "C2"},
    {"id": "or-to-trip", "source": "top-or", "target": "trip-inhibited", "kind": "gate-event", "color": "purple", "cut": "C3"},
    {"id": "pump-to-and", "source": "pump-train", "target": "pump-and", "kind": "event-gate", "color": "orange", "cut": "C1"},
    {"id": "and-to-pump-a", "source": "pump-and", "target": "pump-a", "kind": "gate-event", "color": "orange", "cut": "C1"},
    {"id": "and-to-pump-b", "source": "pump-and", "target": "pump-b", "kind": "gate-event", "color": "orange", "cut": "C1"},
    {"id": "path-to-or", "source": "cooling-path", "target": "path-or", "kind": "event-gate", "color": "red", "cut": "C2"},
    {"id": "or-to-valve", "source": "path-or", "target": "valve-stuck", "kind": "gate-event", "color": "red", "cut": "C2"},
    {"id": "trip-to-and", "source": "trip-inhibited", "target": "trip-and", "kind": "event-gate", "color": "purple", "cut": "C3"},
    {"id": "and-to-sensor", "source": "trip-and", "target": "sensor-fails", "kind": "gate-event", "color": "purple", "cut": "C3"},
    {"id": "and-to-bypass", "source": "trip-and", "target": "bypass-left", "kind": "gate-event", "color": "purple", "cut": "C3"},
    {"id": "trip-to-common", "source": "trip-inhibited", "target": "common-cause", "kind": "screened", "color": "gray600", "cut": ""},
]

CUT_PATHS = [
    {"id": "c1", "label": "C1", "color": "orange", "d": "M146 456V390H250V342V275H250V250V218H520V146V92"},
    {"id": "c2", "label": "C2", "color": "red", "d": "M520 456V342V275H520V250V218H520V146V92"},
    {"id": "c3", "label": "C3", "color": "purple", "d": "M910 456V390H790V342V275H790V250V218H520V146V92"},
]

RISK_CARDS = [
    {"id": "C2", "label": "C2 valve", "value": "83%", "note": "single basic event", "color": "red", "fill": "red_highlight"},
    {"id": "C3", "label": "C3 trip", "value": "16%", "note": "sensor + bypass", "color": "purple", "fill": "purple_highlight"},
    {"id": "C1", "label": "C1 pumps", "value": "<1%", "note": "redundant train", "color": "orange", "fill": "orange_highlight"},
]


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def event_by_id(event_id: str) -> dict[str, object]:
    for event in EVENTS:
        if event["id"] == event_id:
            return event
    raise KeyError(event_id)


def gate_by_id(gate_id: str) -> dict[str, object]:
    for gate in GATES:
        if gate["id"] == gate_id:
            return gate
    raise KeyError(gate_id)


def anchor(record_id: str, role: str) -> tuple[float, float]:
    try:
        event = event_by_id(record_id)
    except KeyError:
        gate = gate_by_id(record_id)
        return float(gate["x"]), float(gate["y"]) + (28 if role == "bottom" else -28)

    if event["type"] in {"basic", "undeveloped"}:
        return float(event["x"]), float(event["y"]) + (34 if role == "bottom" else -34)
    return float(event["x"]), float(event["y"]) + (float(event["h"]) / 2 if role == "bottom" else -float(event["h"]) / 2)


def link_path(link: dict[str, object]) -> str:
    x0, y0 = anchor(str(link["source"]), "bottom")
    x1, y1 = anchor(str(link["target"]), "top")
    mid = (y0 + y1) / 2
    return f"M{fmt(x0)} {fmt(y0)} V{fmt(mid)} H{fmt(x1)} V{fmt(y1)}"


def event_box_markup(event: dict[str, object], index: int) -> str:
    x = float(event["x"])
    y = float(event["y"])
    w = float(event["w"])
    h = float(event["h"])
    color = PALETTE[str(event["color"])]
    fill = PALETTE[str(event["fill"])]
    text_lines = []
    for line_index, line in enumerate(event["lines"]):
        text_lines.append(
            f'<text class="mark-label" x="{fmt(x)}" y="{fmt(y - 6 + line_index * 16)}" text-anchor="middle">{esc(line)}</text>'
        )
    return f"""
      <g class="fault-event fault-event-box {'top-event' if event['type'] == 'top' else 'intermediate-event'}"
        data-event-id="{esc(event['id'])}" data-event-type="{esc(event['type'])}" data-probability="{esc(event['probability'])}"
        opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin="{fmt(0.08 + index * 0.05)}s" fill="freeze"/>
        <rect x="{fmt(x - w / 2)}" y="{fmt(y - h / 2)}" width="{fmt(w)}" height="{fmt(h)}" rx="8"
          fill="{fill}" stroke="{color}" stroke-width="{'2.2' if event['type'] == 'top' else '1.5'}"/>
        {''.join(text_lines)}
        <text class="caption" x="{fmt(x + w / 2 + 10)}" y="{fmt(y + 5)}" text-anchor="start">p={esc(event['probability'])}</text>
      </g>"""


def basic_event_markup(event: dict[str, object], index: int) -> str:
    x = float(event["x"])
    y = float(event["y"])
    color = PALETTE[str(event["color"])]
    fill = PALETTE[str(event["fill"])]
    return f"""
      <g class="fault-event basic-event" data-event-id="{esc(event['id'])}" data-event-code="{esc(event['code'])}"
        data-minimal-cut="{esc(event['cut'])}" data-probability="{esc(event['probability'])}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin="{fmt(0.42 + index * 0.045)}s" fill="freeze"/>
        <circle cx="{fmt(x)}" cy="{fmt(y)}" r="34" fill="{fill}" stroke="{color}" stroke-width="2"/>
        <text class="mark-label" x="{fmt(x)}" y="{fmt(y - 8)}" text-anchor="middle">{esc(event['code'])}</text>
        <text class="caption" x="{fmt(x)}" y="{fmt(y + 9)}" text-anchor="middle">{esc(event['probability'])}</text>
        <text class="caption" x="{fmt(x)}" y="{fmt(y + 52)}" text-anchor="middle">{esc(event['label'])}</text>
        <rect class="minimal-cut-badge" x="{fmt(x + 22)}" y="{fmt(y - 46)}" width="32" height="18" rx="5" fill="#ffffff" stroke="{color}"/>
        <text class="mark-label" x="{fmt(x + 38)}" y="{fmt(y - 33)}" text-anchor="middle">{esc(event['cut'])}</text>
      </g>"""


def undeveloped_markup(event: dict[str, object]) -> str:
    x = float(event["x"])
    y = float(event["y"])
    color = PALETTE[str(event["color"])]
    fill = PALETTE[str(event["fill"])]
    return f"""
      <g class="fault-event undeveloped-event" data-event-id="{esc(event['id'])}" data-event-code="{esc(event['code'])}"
        data-probability="{esc(event['probability'])}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin=".66s" fill="freeze"/>
        <path d="M{fmt(x)} {fmt(y - 32)} L{fmt(x + 38)} {fmt(y)} L{fmt(x)} {fmt(y + 32)} L{fmt(x - 38)} {fmt(y)} Z"
          fill="{fill}" stroke="{color}" stroke-width="1.6"/>
        <text class="mark-label" x="{fmt(x)}" y="{fmt(y + 4)}" text-anchor="middle">{esc(event['code'])}</text>
        <text class="caption" x="{fmt(x)}" y="{fmt(y + 51)}" text-anchor="middle">screened</text>
      </g>"""


def gate_markup(gate: dict[str, object], index: int) -> str:
    x = float(gate["x"])
    y = float(gate["y"])
    color = PALETTE[str(gate["color"])]
    if gate["kind"] == "AND":
        path = f"M{fmt(x - 44)} {fmt(y + 30)} V{fmt(y + 3)} C{fmt(x - 44)} {fmt(y - 29)} {fmt(x + 44)} {fmt(y - 29)} {fmt(x + 44)} {fmt(y + 3)} V{fmt(y + 30)} Z"
        fill = PALETTE["gray50"]
    else:
        path = f"M{fmt(x - 48)} {fmt(y + 30)} C{fmt(x - 30)} {fmt(y - 24)} {fmt(x + 30)} {fmt(y - 24)} {fmt(x + 48)} {fmt(y + 30)} C{fmt(x + 25)} {fmt(y + 15)} {fmt(x - 25)} {fmt(y + 15)} {fmt(x - 48)} {fmt(y + 30)} Z"
        fill = PALETTE["surface"]
    return f"""
      <g class="fault-gate {str(gate['kind']).lower()}-gate" data-gate-id="{esc(gate['id'])}" data-gate-kind="{esc(gate['kind'])}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".4s" begin="{fmt(0.24 + index * 0.05)}s" fill="freeze"/>
        <path class="fault-gate-symbol" d="{path}" fill="{fill}" stroke="{color}" stroke-width="2"/>
        <text class="mark-label" x="{fmt(x)}" y="{fmt(y + 17)}" text-anchor="middle">{esc(gate['kind'])}</text>
      </g>"""


def link_markup(link: dict[str, object], index: int) -> str:
    color = PALETTE[str(link["color"])]
    dash = "4 6" if link["kind"] == "screened" else "1 1"
    width = "3.4" if link["cut"] else "1.8"
    opacity = ".82" if link["cut"] else ".42"
    duration = 0.76 + index * 0.035
    return f"""
      <path id="fault-link-{esc(link['id'])}" class="fault-link{' minimal-cut-link' if link['cut'] else ''}{' screened-link' if link['kind'] == 'screened' else ''}"
        data-link-id="{esc(link['id'])}" data-source-id="{esc(link['source'])}" data-target-id="{esc(link['target'])}"
        data-minimal-cut="{esc(link['cut'])}" d="{link_path(link)}" fill="none" stroke="{color}"
        stroke-width="{width}" stroke-opacity="{opacity}" stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="{dash}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="{fmt(duration)}s" begin=".1s" fill="freeze"/>
      </path>"""


def pulse_markup(cut: dict[str, object], index: int) -> str:
    color = PALETTE[str(cut["color"])]
    begin = 0.55 + index * 0.7
    return f"""
      <path id="fault-minimal-cut-path-{esc(cut['id'])}" class="minimal-cut-motion-path" d="{esc(cut['d'])}" fill="none" stroke="none"/>
      <circle class="fault-cut-pulse" data-minimal-cut="{esc(cut['label'])}" r="7" fill="{color}" stroke="#ffffff" stroke-width="2">
        <animateMotion dur="3.2s" begin="{fmt(begin)}s" repeatCount="indefinite">
          <mpath href="#fault-minimal-cut-path-{esc(cut['id'])}"/>
        </animateMotion>
      </circle>"""


def risk_cards_markup() -> str:
    parts = []
    for index, card in enumerate(RISK_CARDS):
        x = 74 + index * 220
        color = PALETTE[card["color"]]
        fill = PALETTE[card["fill"]]
        parts.append(
            f"""
      <g class="fault-risk-card" data-minimal-cut="{esc(card['id'])}" transform="translate({x} 560)" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".42s" begin="{fmt(0.8 + index * 0.08)}s" fill="freeze"/>
        <rect width="198" height="40" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
        <text class="mark-label" x="14" y="16">{esc(card['label'])}</text>
        <text class="risk-value" x="14" y="33" fill="{color}">{esc(card['value'])}</text>
        <text class="caption" x="72" y="32">{esc(card['note'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def build_svg() -> str:
    event_boxes = [event_box_markup(event, index) for index, event in enumerate(EVENTS) if event["type"] in {"top", "intermediate"}]
    basic_events = [basic_event_markup(event, index) for index, event in enumerate(EVENTS) if event["type"] == "basic"]
    undeveloped = [undeveloped_markup(event) for event in EVENTS if event["type"] == "undeveloped"]
    gates = [gate_markup(gate, index) for index, gate in enumerate(GATES)]
    links = [link_markup(link, index) for index, link in enumerate(LINKS)]
    pulses = [pulse_markup(cut, index) for index, cut in enumerate(CUT_PATHS)]
    return f"""<svg id="fault-tree" data-pattern-id="d3-fault-tree"
    data-pattern-family="fault-tree" data-event-count="{len(EVENTS)}" data-basic-event-count="5"
    data-gate-count="{len(GATES)}" data-minimal-cut-count="{len(CUT_PATHS)}" data-risk-panel-count="{len(RISK_CARDS)}"
    data-top-event-probability="2.4e-4" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="fault-tree-title fault-tree-desc">
    <title id="fault-tree-title">Critical fault tree</title>
    <desc id="fault-tree-desc">A safety fault tree traces a critical top event through OR and AND gates, basic events, minimal cut sets, and risk contribution.</desc>
    <rect x="22" y="22" width="1036" height="596" rx="12" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.5"/>
    <text class="caption" x="54" y="56">FTA - critical cooling unavailable</text>
    <g class="fault-hazard-band">
      <rect x="778" y="54" width="226" height="112" rx="10" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.5"/>
      <text class="mark-label" x="800" y="82">Top event probability</text>
      <text class="hazard-value" x="800" y="116">2.4e-4 / hr</text>
      <text class="caption" x="800" y="146">driven by 3 minimal cuts</text>
    </g>
    <g class="fault-tree-links">
      {''.join(links)}
    </g>
    <g class="fault-gates">
      {''.join(gates)}
    </g>
    <g class="fault-events">
      {''.join(event_boxes)}
      {''.join(basic_events)}
      {''.join(undeveloped)}
    </g>
    <g class="fault-cut-pulses">
      {''.join(pulses)}
    </g>
    <g class="fault-risk-panel" data-risk-panel-id="minimal-cut-contribution">
      {risk_cards_markup()}
    </g>
    <g class="fault-tree-legend" transform="translate(786 552)">
      <rect x="0" y="-12" width="20" height="14" rx="3" fill="#ffffff" stroke="{PALETTE['red']}"/>
      <text class="caption" x="30" y="0">rectangle = event</text>
      <circle cx="10" cy="20" r="8" fill="#ffffff" stroke="{PALETTE['orange']}"/>
      <text class="caption" x="30" y="24">circle = basic event</text>
      <path d="M10 38 L22 50 L10 62 L-2 50 Z" fill="#ffffff" stroke="{PALETTE['gray600']}"/>
      <text class="caption" x="30" y="54">diamond = undeveloped</text>
    </g>
  </svg>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Fault Tree</title>
  <style>
    :root {{
      color-scheme: light;
      --page: {PALETTE['page']};
      --ink: {PALETTE['ink']};
      --muted: {PALETTE['gray600']};
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--page);
      color: var(--ink);
      font-family: "Open Sans", Arial, sans-serif;
    }}
    main {{
      width: min(1120px, calc(100vw - 32px));
      padding: 18px;
    }}
    svg {{
      width: 100%;
      height: auto;
      display: block;
    }}
    text {{
      font-family: "Open Sans", Arial, sans-serif;
      fill: var(--ink);
    }}
    .mark-label {{
      font-size: 13px;
      font-weight: 850;
      letter-spacing: 0;
    }}
    .caption {{
      font-size: 11px;
      fill: var(--muted);
      font-weight: 760;
      letter-spacing: 0;
    }}
    .hazard-value {{
      font-size: 28px;
      fill: {PALETTE['red']};
      font-weight: 900;
      letter-spacing: 0;
    }}
    .risk-value {{
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0;
    }}
    .minimal-cut-link {{
      filter: drop-shadow(0 1px 0 rgba(255,255,255,.85));
    }}
    .fault-cut-pulse {{
      filter: drop-shadow(0 1px 2px rgba(51,62,72,.24));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate,
      animateMotion {{
        animation-duration: .001ms !important;
      }}
    }}
  </style>
</head>
<body>
  <main>
    {build_svg()}
  </main>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Fault Tree SVG/HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
