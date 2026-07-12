#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical SLO Burn Rate animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1080
HEIGHT = 640
DOMAIN_MIN_HOUR = -6
DOMAIN_MAX_HOUR = 8
TIME_TO_EXHAUST_HOURS = 4

PALETTE = {
    "red": "#9e1b32",
    "red_highlight": "#ffccd5",
    "orange": "#e77204",
    "orange_highlight": "#ffe5cc",
    "yellow": "#f1c319",
    "yellow_highlight": "#fff4cc",
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

CHART = {"x": 58, "y": 142, "w": 622, "h": 320}
BAR = {"x": 792, "y": 158, "w": 196, "h": 22, "max": 20.0}

BUDGET_POINTS = [
    {"hour": -6, "remaining": 87, "label": "steady"},
    {"hour": -5, "remaining": 84, "label": "deploy"},
    {"hour": -4, "remaining": 82, "label": "healthy"},
    {"hour": -3, "remaining": 78, "label": "latency"},
    {"hour": -2, "remaining": 74, "label": "errors"},
    {"hour": -1, "remaining": 66, "label": "watch"},
    {"hour": 0, "remaining": 58, "label": "fast burn"},
    {"hour": 1, "remaining": 44, "label": "page"},
    {"hour": 2, "remaining": 31, "label": "mitigate"},
    {"hour": 3, "remaining": 22, "label": "hold"},
    {"hour": 4, "remaining": 18, "label": "critical"},
    {"hour": 5, "remaining": 14, "label": "exhaust risk"},
]

BURN_WINDOWS = [
    {"id": "fast-page", "label": "5m / 1h", "current": 18.2, "threshold": 14.4, "notification": "page", "severity": "critical", "note": "spike burns budget in hours", "color": "red"},
    {"id": "slow-page", "label": "30m / 6h", "current": 7.1, "threshold": 6.0, "notification": "page", "severity": "critical", "note": "sustained user impact", "color": "red"},
    {"id": "ticket-fast", "label": "2h / 24h", "current": 2.4, "threshold": 2.0, "notification": "ticket", "severity": "warning", "note": "investigate today", "color": "orange"},
    {"id": "long-watch", "label": "6h / 3d", "current": 0.9, "threshold": 1.0, "notification": "watch", "severity": "normal", "note": "below slow-burn ticket", "color": "green"},
]

THRESHOLD_BANDS = [
    {"id": "safe", "label": "safe budget", "min": 60, "max": 100, "color": "green"},
    {"id": "watch", "label": "watch", "min": 25, "max": 60, "color": "orange"},
    {"id": "critical", "label": "critical", "min": 0, "max": 25, "color": "red"},
]

ACTION_STEPS = [
    {"id": "page", "label": "Page on-call", "owner": "SRE", "state": "active", "color": "red"},
    {"id": "hold-release", "label": "Hold release", "owner": "Product + SRE", "state": "active", "color": "purple"},
    {"id": "mitigate", "label": "Mitigate hot path", "owner": "Checkout team", "state": "running", "color": "orange"},
    {"id": "review", "label": "Review policy", "owner": "Reliability council", "state": "queued", "color": "blue"},
]

SUMMARY_CARDS = [
    ("SLO target", "99.9%", "30-day request success", "blue"),
    ("budget left", "18%", "page-level burn active", "red"),
    ("time to exhaust", "4h", "at current fast burn", "orange"),
    ("decision", "release hold", "until burn normalizes", "purple"),
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def x_for_hour(hour: float) -> float:
    left = CHART["x"] + 44
    right = CHART["x"] + CHART["w"] - 36
    return left + (hour - DOMAIN_MIN_HOUR) / (DOMAIN_MAX_HOUR - DOMAIN_MIN_HOUR) * (right - left)


def y_for_budget(value: float) -> float:
    top = CHART["y"] + 42
    bottom = CHART["y"] + CHART["h"] - 42
    return bottom - (value / 100.0) * (bottom - top)


def budget_points() -> list[tuple[float, float]]:
    return [(x_for_hour(float(point["hour"])), y_for_budget(float(point["remaining"]))) for point in BUDGET_POINTS]


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def area_path(points: list[tuple[float, float]]) -> str:
    bottom = y_for_budget(0)
    first_x = points[0][0]
    last_x = points[-1][0]
    return f"M{fmt(first_x)} {fmt(bottom)} " + " ".join(f"L{fmt(x)} {fmt(y)}" for x, y in points) + f" L{fmt(last_x)} {fmt(bottom)} Z"


def burn_width(value: float) -> float:
    return min(BAR["w"], max(0.0, value / BAR["max"] * BAR["w"]))


def band_markup() -> str:
    parts: list[str] = []
    for index, band in enumerate(THRESHOLD_BANDS):
        y0 = y_for_budget(float(band["max"]))
        y1 = y_for_budget(float(band["min"]))
        fill = PALETTE[f"{band['color']}_highlight"]
        stroke = PALETTE[str(band["color"])]
        label_y = y1 - 16 if band["id"] == "critical" else y0 + 18
        parts.append(
            f"""
      <g class="slo-threshold-band" data-band-id="{esc(band['id'])}" data-band-min="{band['min']}" data-band-max="{band['max']}">
        <rect x="{CHART['x'] + 44}" y="{fmt(y0)}" width="{CHART['w'] - 80}" height="{fmt(y1 - y0)}"
          fill="{fill}" fill-opacity=".34" stroke="{stroke}" stroke-width=".8" stroke-opacity=".35">
          <animate attributeName="fill-opacity" values=".18;.34" dur=".5s" begin="{fmt(index * .08)}s" fill="freeze"/>
        </rect>
        <text class="band-label" x="{CHART['x'] + CHART['w'] - 112}" y="{fmt(label_y)}">{esc(band['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def grid_markup() -> str:
    parts: list[str] = []
    for value in [100, 75, 50, 25, 0]:
        y = y_for_budget(value)
        parts.append(
            f"""
      <g class="budget-grid-line" data-budget-value="{value}">
        <line x1="{CHART['x'] + 44}" x2="{CHART['x'] + CHART['w'] - 36}" y1="{fmt(y)}" y2="{fmt(y)}" stroke="{PALETTE['gray200']}" stroke-width="1"/>
        <text class="axis-label" x="{CHART['x'] + 12}" y="{fmt(y + 4)}">{value}%</text>
      </g>"""
        )
    for hour in [-6, -4, -2, 0, 2, 4, 6, 8]:
        x = x_for_hour(hour)
        label = f"{hour}h" if hour != 0 else "now"
        parts.append(
            f"""
      <g class="budget-time-tick" data-hour="{hour}">
        <line x1="{fmt(x)}" x2="{fmt(x)}" y1="{CHART['y'] + CHART['h'] - 38}" y2="{CHART['y'] + CHART['h'] - 30}" stroke="{PALETTE['gray300']}" stroke-width="1"/>
        <text class="axis-label" x="{fmt(x)}" y="{CHART['y'] + CHART['h'] - 14}" text-anchor="middle">{esc(label)}</text>
      </g>"""
        )
    now_x = x_for_hour(0)
    parts.append(
        f"""
      <g class="slo-now-marker" data-hour="0">
        <line x1="{fmt(now_x)}" x2="{fmt(now_x)}" y1="{CHART['y'] + 42}" y2="{CHART['y'] + CHART['h'] - 42}"
          stroke="{PALETTE['purple']}" stroke-width="1.6" stroke-dasharray="5 7"/>
        <text class="now-label" x="{fmt(now_x + 8)}" y="{CHART['y'] + 58}">now</text>
      </g>"""
    )
    return "\n".join(parts)


def point_markup(points: list[tuple[float, float]]) -> str:
    parts: list[str] = []
    for index, (point, (x, y)) in enumerate(zip(BUDGET_POINTS, points)):
        color = PALETTE["red"] if float(point["remaining"]) <= 25 else PALETTE["orange"] if float(point["remaining"]) <= 60 else PALETTE["green"]
        parts.append(
            f"""
      <circle class="slo-budget-point" data-point-index="{index}" data-hour="{point['hour']}" data-budget-remaining="{point['remaining']}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{4.5 if index in (7, 10, 11) else 3.2}" fill="{color}" stroke="#ffffff" stroke-width="1.4">
        <animate attributeName="r" values="2.4;5.6;{4.5 if index in (7, 10, 11) else 3.2}" dur=".42s" begin="{fmt(.62 + index * .045)}s" fill="freeze"/>
      </circle>"""
        )
    return "\n".join(parts)


def exhaustion_projection_markup() -> str:
    start_hour = 4
    start_remaining = 18
    end_hour = start_hour + TIME_TO_EXHAUST_HOURS
    x0 = x_for_hour(start_hour)
    y0 = y_for_budget(start_remaining)
    x1 = x_for_hour(end_hour)
    y1 = y_for_budget(0)
    return f"""
      <path class="slo-exhaustion-projection" data-start-hour="{start_hour}" data-end-hour="{end_hour}"
        data-time-to-exhaust-hours="{TIME_TO_EXHAUST_HOURS}" d="M{fmt(x0)} {fmt(y0)} L{fmt(x1)} {fmt(y1)}"
        fill="none" stroke="{PALETTE['red']}" stroke-width="2.2" stroke-dasharray="7 7" stroke-linecap="round" opacity=".75"/>
      <text class="projection-label" x="{fmt(x1 - 4)}" y="{fmt(y1 - 12)}" text-anchor="end">projected exhaust</text>"""


def budget_markup() -> str:
    points = budget_points()
    line = line_path(points)
    area = area_path(points)
    return f"""
    <g class="slo-budget-panel" data-panel-id="budget-remaining">
      <rect x="{CHART['x']}" y="{CHART['y']}" width="{CHART['w']}" height="{CHART['h']}" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="{CHART['x'] + 20}" y="{CHART['y'] + 28}">Error budget remaining</text>
      <text class="panel-subtitle" x="{CHART['x'] + 218}" y="{CHART['y'] + 28}">critical after fast burn crosses page thresholds</text>
{band_markup()}
{grid_markup()}
      <path class="slo-budget-area" data-series-id="budget-remaining-area" d="{area}" fill="{PALETTE['red_highlight']}" fill-opacity=".28"/>
      <path id="slo-budget-path" class="slo-budget-line" data-series-id="budget-remaining" data-sample-count="{len(BUDGET_POINTS)}"
        d="{line}" fill="none" stroke="{PALETTE['red']}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.35s" begin=".42s" fill="freeze"/>
      </path>
{point_markup(points)}
{exhaustion_projection_markup()}
      <text class="budget-callout-value" x="{fmt(points[-2][0] - 16)}" y="{fmt(points[-2][1] - 30)}" text-anchor="end">18% left</text>
      <path class="budget-callout-line" d="M{fmt(points[-2][0])} {fmt(points[-2][1] - 22)} L{fmt(points[-2][0])} {fmt(points[-2][1] - 3)}" stroke="{PALETTE['red']}" stroke-width="1.3"/>
    </g>"""


def pulse_markup() -> str:
    parts = []
    for index, begin in enumerate([1.05, 1.75, 2.45]):
        parts.append(
            f"""
      <circle class="burn-rate-pulse" data-pulse-index="{index}" r="5.8" fill="{PALETTE['red']}" stroke="#ffffff" stroke-width="1.5" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.9s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#slo-budget-path"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def burn_window_markup() -> str:
    parts: list[str] = []
    for index, window in enumerate(BURN_WINDOWS):
        x = 708
        y = 142 + index * 76
        color = PALETTE[str(window["color"])]
        fill = PALETTE[f"{window['color']}_highlight"]
        bar_y = y + 36
        current_w = burn_width(float(window["current"]))
        threshold_x = BAR["x"] + burn_width(float(window["threshold"]))
        parts.append(
            f"""
      <g class="slo-burn-window" data-window-id="{esc(window['id'])}" data-current-burn="{window['current']}" data-threshold-burn="{window['threshold']}"
        data-notification="{esc(window['notification'])}" data-severity="{esc(window['severity'])}" transform="translate({x} {y})">
        <rect x="0" y="0" width="326" height="62" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <text class="burn-window-label" x="14" y="19">{esc(window['label'])}</text>
        <text class="burn-window-note" x="86" y="19">{esc(window['note'])}</text>
        <text class="burn-window-value" x="14" y="43">{window['current']}x</text>
        <rect class="burn-rate-track" x="{BAR['x'] - x}" y="{bar_y - y}" width="{BAR['w']}" height="{BAR['h']}" rx="5" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1"/>
        <rect class="burn-rate-bar" data-window-id="{esc(window['id'])}" x="{BAR['x'] - x}" y="{bar_y - y}" width="{fmt(current_w)}" height="{BAR['h']}" rx="5" fill="{color}">
          <animate attributeName="width" values="0;{fmt(current_w)}" dur=".8s" begin="{fmt(.72 + index * .12)}s" fill="freeze"/>
        </rect>
        <line class="burn-threshold-marker" data-window-id="{esc(window['id'])}" x1="{fmt(threshold_x - x)}" x2="{fmt(threshold_x - x)}"
          y1="{bar_y - y - 5}" y2="{bar_y - y + BAR['h'] + 5}" stroke="{PALETTE['ink']}" stroke-width="2" stroke-linecap="round">
          <animate attributeName="stroke-width" values="2;4;2" dur="1.1s" begin="{fmt(1.65 + index * .15)}s" repeatCount="indefinite"/>
        </line>
        <text class="threshold-label" x="{fmt(threshold_x - x)}" y="{bar_y - y + BAR['h'] + 18}" text-anchor="middle">{window['threshold']}x</text>
        <g class="slo-alert-state" data-window-id="{esc(window['id'])}" data-notification="{esc(window['notification'])}" transform="translate(252 13)">
          <rect x="0" y="0" width="58" height="22" rx="11" fill="#ffffff" stroke="{color}" stroke-width="1"/>
          <text class="alert-state-label" x="29" y="15" text-anchor="middle">{esc(window['notification'])}</text>
        </g>
      </g>"""
        )
    return "\n".join(parts)


def summary_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(SUMMARY_CARDS):
        x = 58 + index * 245
        y = 84
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="slo-summary-card" data-card-index="{index}" transform="translate({x} {y})">
        <rect x="0" y="0" width="224" height="52" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
        <circle cx="18" cy="26" r="6.2" fill="{color}"/>
        <text class="summary-eyebrow" x="34" y="16">{esc(eyebrow)}</text>
        <text class="summary-value" x="34" y="32">{esc(value)}</text>
        <text class="summary-note" x="34" y="46">{esc(note)}</text>
      </g>"""
        )
    return "\n".join(parts)


def action_markup() -> str:
    parts: list[str] = []
    for index, action in enumerate(ACTION_STEPS):
        x = 58 + index * 245
        y = 500
        color = PALETTE[str(action["color"])]
        fill = PALETTE[f"{action['color']}_highlight"]
        parts.append(
            f"""
      <g class="slo-action-step" data-action-id="{esc(action['id'])}" data-state="{esc(action['state'])}" transform="translate({x} {y})">
        <rect x="0" y="0" width="224" height="68" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="20" cy="34" r="8" fill="{color}"/>
        <text class="action-label" x="38" y="25">{esc(action['label'])}</text>
        <text class="action-owner" x="38" y="43">{esc(action['owner'])}</text>
        <text class="action-state" x="38" y="58">{esc(action['state'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def legend_markup() -> str:
    items = [
        ("page", PALETTE["red"], "critical fast burn"),
        ("ticket", PALETTE["orange"], "sustained slow burn"),
        ("safe", PALETTE["green"], "within budget"),
    ]
    parts = []
    for index, (label, color, text) in enumerate(items):
        x = 706 + index * 104
        y = 74
        parts.append(
            f"""
      <g class="slo-legend-item" data-legend-key="{esc(label)}" transform="translate({x} {y})">
        <line x1="0" x2="24" y1="0" y2="0" stroke="{color}" stroke-width="3" stroke-linecap="round"/>
        <text class="legend-label" x="30" y="4">{esc(text)}</text>
      </g>"""
        )
    return "\n".join(parts)


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical SLO Burn Rate</title>
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
    .root-subtitle, .panel-subtitle, .axis-label, .burn-window-note, .summary-note, .action-owner, .action-state, .legend-label, .band-label, .threshold-label {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .summary-value, .burn-window-value, .action-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .burn-window-label, .summary-eyebrow, .alert-state-label {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .budget-callout-value {{
      fill: {PALETTE["red"]};
      font-size: 13px;
      font-weight: 900;
    }}
    .projection-label, .now-label {{
      fill: {PALETTE["purple"]};
      font-size: 10px;
      font-weight: 850;
      paint-order: stroke;
      stroke: {PALETTE["surface"]};
      stroke-width: 4px;
      stroke-linejoin: round;
    }}
    .projection-label {{
      fill: {PALETTE["red"]};
    }}
    .burn-rate-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .32));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
    }}
  </style>
</head>
<body>
  <svg id="slo-burn-rate" data-pattern-id="d3-slo-burn-rate"
    data-pattern-family="critical-slo" data-budget-point-count="{len(BUDGET_POINTS)}"
    data-window-count="{len(BURN_WINDOWS)}" data-threshold-band-count="{len(THRESHOLD_BANDS)}"
    data-action-count="{len(ACTION_STEPS)}" data-summary-card-count="{len(SUMMARY_CARDS)}"
    data-pulse-count="3" data-time-to-exhaust-hours="{TIME_TO_EXHAUST_HOURS}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="slo-burn-rate-title slo-burn-rate-desc">
    <title id="slo-burn-rate-title">Critical SLO burn rate</title>
    <desc id="slo-burn-rate-desc">A deterministic burn-rate dashboard shows SLO error budget remaining, page and ticket thresholds across alert windows, time-to-exhaust risk, and immediate reliability actions.</desc>
    <rect x="28" y="24" width="1024" height="580" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical SLO burn rate</text>
    <text class="root-subtitle" x="58" y="80">Multi-window burn-rate thresholds catch fast budget loss before the service runs out of error budget.</text>
    <g class="slo-legend">
{legend_markup()}
    </g>
    <g class="slo-summary-cards">
{summary_markup()}
    </g>
{budget_markup()}
    <g class="burn-rate-pulses">
{pulse_markup()}
    </g>
    <g class="slo-burn-windows">
{burn_window_markup()}
    </g>
    <g class="slo-action-steps">
{action_markup()}
    </g>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical SLO Burn Rate D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
