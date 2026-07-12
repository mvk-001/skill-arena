#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Cache Stampede animated SVG HTML file."""

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

REQUEST_SOURCES = [
    {"id": "web", "label": "Web clients", "rate": "4.1k/s", "kind": "hot key", "color": "blue", "y": 242},
    {"id": "api", "label": "Partner API", "rate": "3.0k/s", "kind": "hot key", "color": "blue", "y": 302},
    {"id": "mobile", "label": "Mobile app", "rate": "2.5k/s", "kind": "hot key", "color": "blue", "y": 362},
    {"id": "retry", "label": "Retry fanout", "rate": "2.2k/s", "kind": "amplifies", "color": "purple", "y": 422},
]

CACHE_STATE = {
    "key": "product:123",
    "state": "expired hot key",
    "soft_ttl": 30,
    "hard_ttl": 90,
    "stale_window": 60,
    "stampede_rate": "11.8k/s",
    "coalesced_origin_calls": 1,
    "lock_state": "single-flight active",
}

TREND_POINTS = [
    {"minute": -5, "hit": 96, "origin": 18},
    {"minute": -4, "hit": 95, "origin": 19},
    {"minute": -3, "hit": 94, "origin": 21},
    {"minute": -2, "hit": 90, "origin": 28},
    {"minute": -1, "hit": 72, "origin": 51},
    {"minute": 0, "hit": 18, "origin": 98},
    {"minute": 1, "hit": 42, "origin": 72},
    {"minute": 2, "hit": 76, "origin": 46},
    {"minute": 3, "hit": 90, "origin": 27},
    {"minute": 4, "hit": 95, "origin": 20},
]

TTL_MARKERS = [
    {"id": "soft-ttl", "label": "soft TTL", "value": 30, "note": "refresh early", "color": "orange", "x": 382},
    {"id": "hard-ttl", "label": "hard TTL", "value": 90, "note": "expire stale", "color": "red", "x": 518},
    {"id": "jitter", "label": "jitter", "value": 17, "note": "spread refresh", "color": "purple", "x": 654},
]

MITIGATIONS = [
    {"id": "coalesce", "label": "Coalesce misses", "note": "single-flight lock", "color": "purple"},
    {"id": "serve-stale", "label": "Serve stale", "note": "protect users", "color": "green"},
    {"id": "refresh-one", "label": "Refresh one copy", "note": "origin gets 1 call", "color": "blue"},
    {"id": "jitter-warm", "label": "Jitter + warm", "note": "spread expiries", "color": "orange"},
]

STATUS_CARDS = [
    ("hot key", "expired", "product:123 soft TTL passed", "red"),
    ("miss storm", "11.8k/s", "would hit origin together", "orange"),
    ("lock", "active", "one refresh in flight", "purple"),
    ("response", "serve stale", "hit ratio recovers", "green"),
]

CACHE_X = 408
CACHE_Y = 300
ORIGIN_X = 836
ORIGIN_Y = 306


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def source_x() -> float:
    return 80.0


def source_path(source: dict[str, object]) -> str:
    x0 = source_x() + 176
    y0 = float(source["y"])
    x1 = CACHE_X - 120
    y1 = CACHE_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 60)} {fmt(y0)} {fmt(x1 - 72)} {fmt(y1)} {x1} {fmt(y1)}"


def stampede_path() -> str:
    x0 = CACHE_X + 104
    y0 = CACHE_Y - 4
    x1 = ORIGIN_X - 126
    y1 = ORIGIN_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 74)} {fmt(y0 - 84)} {fmt(x1 - 84)} {fmt(y1 - 72)} {x1} {fmt(y1)}"


def refresh_path() -> str:
    x0 = CACHE_X + 108
    y0 = CACHE_Y + 54
    x1 = ORIGIN_X - 126
    y1 = ORIGIN_Y + 34
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 68)} {fmt(y0 + 30)} {fmt(x1 - 74)} {fmt(y1 + 26)} {x1} {fmt(y1)}"


def stale_path() -> str:
    x0 = CACHE_X - 118
    y0 = CACHE_Y + 62
    x1 = source_x() + 178
    y1 = 462
    return f"M{x0} {fmt(y0)} C{fmt(x0 - 74)} {fmt(y0 + 56)} {fmt(x1 + 78)} {fmt(y1)} {x1} {fmt(y1)}"


def hit_x(minute: float) -> float:
    left = 104
    right = 594
    return left + ((minute + 5) / 9.0) * (right - left)


def metric_y(value: float) -> float:
    top = 526
    bottom = 582
    return bottom - (value / 100.0) * (bottom - top)


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def summary_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        y = 88
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="cache-status-card" data-card-index="{index}" transform="translate({x} {y})">
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
    <g class="cache-topology-panel" data-panel-id="cache-topology">
      <rect x="58" y="160" width="970" height="304" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Hot-key cache stampede control</text>
      <text class="panel-subtitle" x="78" y="203">one expired key can fan out to origin unless misses are coalesced and stale data remains usable</text>
      <line x1="316" x2="316" y1="214" y2="446" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="688" x2="688" y1="214" y2="446" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <text class="lane-label" x="92" y="450">request pressure</text>
      <text class="lane-label" x="760" y="450">origin protection</text>
    </g>"""


def sources_markup() -> str:
    parts: list[str] = []
    for source in REQUEST_SOURCES:
        color_name = str(source["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="cache-request-source" data-source-id="{esc(source['id'])}" data-rate="{esc(source['rate'])}" data-kind="{esc(source['kind'])}"
        transform="translate({source_x()} {float(source['y']) - 24})">
        <rect x="0" y="0" width="176" height="48" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="18" cy="24" r="6.4" fill="{color}"/>
        <text class="source-label" x="34" y="20">{esc(source['label'])}</text>
        <text class="source-rate" x="34" y="36">{esc(source['rate'])} - {esc(source['kind'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def cache_layer_markup() -> str:
    return f"""
    <g class="cache-layer" data-layer-id="edge-cache" transform="translate({CACHE_X - 124} {CACHE_Y - 86})">
      <rect x="0" y="0" width="248" height="172" rx="10" fill="{PALETTE['orange_highlight']}" stroke="{PALETTE['orange']}" stroke-width="1.35"/>
      <text class="panel-title" x="18" y="25">Edge cache</text>
      <text class="panel-subtitle" x="18" y="43">soft TTL passed - stale value still held</text>
      <g class="cache-hot-key" data-hot-key="{esc(CACHE_STATE['key'])}" data-state="{esc(CACHE_STATE['state'])}" transform="translate(18 61)">
        <rect x="0" y="0" width="212" height="58" rx="8" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.25"/>
        <circle cx="18" cy="29" r="7" fill="{PALETTE['red']}">
          <animate attributeName="r" values="6;9;7" dur="1.15s" begin=".8s" repeatCount="indefinite"/>
        </circle>
        <text class="hot-key-label" x="36" y="23">{esc(CACHE_STATE['key'])}</text>
        <text class="hot-key-state" x="36" y="41">{esc(CACHE_STATE['state'])}</text>
      </g>
      <g class="singleflight-lock" data-lock-id="refresh-lock" data-state="{esc(CACHE_STATE['lock_state'])}" transform="translate(18 132)">
      <rect x="0" y="0" width="212" height="28" rx="7" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.1"/>
        <path d="M17 17 v-5 a7 7 0 0 1 14 0 v5" fill="none" stroke="{PALETTE['purple']}" stroke-width="2" stroke-linecap="round"/>
        <rect x="14" y="16" width="20" height="10" rx="2" fill="{PALETTE['purple']}"/>
        <text class="lock-label" x="46" y="18">{esc(CACHE_STATE['lock_state'])}</text>
      </g>
      <g class="request-collapse-gate" data-collapse-id="single-flight-collapse" data-input-rate="{esc(CACHE_STATE['stampede_rate'])}" data-origin-calls="{CACHE_STATE['coalesced_origin_calls']}" transform="translate(124 132)">
        <rect x="42" y="0" width="64" height="28" rx="7" fill="#ffffff" stroke="{PALETTE['purple']}" stroke-width="1"/>
        <text class="collapse-label" x="74" y="18" text-anchor="middle">{esc(CACHE_STATE['stampede_rate'])} -> 1</text>
      </g>
    </g>"""


def origin_markup() -> str:
    return f"""
    <g class="origin-shield" data-origin-id="catalog-origin" data-load-peak="98" transform="translate({ORIGIN_X - 126} {ORIGIN_Y - 72})">
      <rect x="0" y="0" width="252" height="144" rx="10" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.35"/>
      <text class="panel-title" x="18" y="26">Origin + database</text>
      <text class="panel-subtitle" x="18" y="45">protected by one refresh request</text>
      <rect x="24" y="66" width="204" height="42" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1"/>
      <circle cx="45" cy="87" r="7.2" fill="{PALETTE['green']}"/>
      <text class="origin-label" x="64" y="83">Origin calls</text>
      <text class="origin-note" x="64" y="99">1 refresh instead of 11.8k/s</text>
      <path d="M16 122 C56 106 92 134 132 116 C164 102 198 108 236 95" fill="none" stroke="{PALETTE['green']}" stroke-width="2.2" stroke-linecap="round"/>
    </g>"""


def flow_markup() -> str:
    parts: list[str] = []
    for index, source in enumerate(REQUEST_SOURCES):
        color = PALETTE[str(source["color"])]
        parts.append(
            f"""
      <path id="cache-flow-source-{esc(source['id'])}" class="cache-flow-path" data-flow-id="source-{esc(source['id'])}"
        data-source="{esc(source['id'])}" data-target="edge-cache" data-kind="request" d="{source_path(source)}"
        fill="none" stroke="{color}" stroke-width="2.25" stroke-opacity=".68" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".8s" begin="{fmt(.18 + index * .06)}s" fill="freeze"/>
      </path>"""
        )
    parts.append(
        f"""
      <path id="cache-flow-stampede" class="cache-flow-path stampede-wave" data-flow-id="stampede"
        data-source="edge-cache" data-target="catalog-origin" data-kind="miss-storm" d="{stampede_path()}"
        fill="none" stroke="{PALETTE['red']}" stroke-width="6" stroke-opacity=".28" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.05s" begin=".72s" fill="freeze"/>
        <animate attributeName="stroke-opacity" values=".16;.34;.22" dur="1.4s" begin="1.2s" repeatCount="indefinite"/>
      </path>
      <path id="cache-flow-refresh" class="cache-flow-path" data-flow-id="refresh-one"
        data-source="edge-cache" data-target="catalog-origin" data-kind="single-refresh" d="{refresh_path()}"
        fill="none" stroke="{PALETTE['purple']}" stroke-width="3" stroke-opacity=".86" stroke-linecap="round"
        stroke-dasharray="8 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.55;1" dur="1.65s" begin="0s" fill="freeze"/>
      </path>
      <path id="cache-flow-stale" class="stale-response-path cache-flow-path" data-flow-id="serve-stale"
        data-source="edge-cache" data-target="request-sources" data-kind="stale-response" d="{stale_path()}"
        fill="none" stroke="{PALETTE['green']}" stroke-width="3.4" stroke-opacity=".9" stroke-linecap="round"
        stroke-dasharray="9 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.62;1" dur="1.8s" begin="0s" fill="freeze"/>
      </path>"""
    )
    return "\n".join(parts)


def pulse_markup() -> str:
    pulse_defs = [
        ("web", "cache-flow-source-web", "blue", 1.0, "request"),
        ("api", "cache-flow-source-api", "blue", 1.15, "request"),
        ("mobile", "cache-flow-source-mobile", "blue", 1.3, "request"),
        ("retry", "cache-flow-source-retry", "purple", 1.45, "retry"),
        ("stampede-a", "cache-flow-stampede", "red", 1.25, "miss-storm"),
        ("stampede-b", "cache-flow-stampede", "red", 1.55, "miss-storm"),
        ("refresh", "cache-flow-refresh", "purple", 1.85, "single-refresh"),
        ("stale", "cache-flow-stale", "green", 2.05, "stale-response"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        parts.append(
            f"""
      <circle class="cache-request-pulse" data-pulse-id="{esc(pulse_id)}" data-pulse-kind="{esc(kind)}" r="5.5" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.35" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.6s" begin="{fmt(begin + index * .035)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def ttl_markup() -> str:
    parts: list[str] = []
    for index, marker in enumerate(TTL_MARKERS):
        color_name = str(marker["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="ttl-marker" data-marker-id="{esc(marker['id'])}" data-seconds="{marker['value']}" transform="translate({marker['x']} 428)">
        <rect x="-48" y="-17" width="96" height="40" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.05"/>
        <circle cx="0" cy="-2" r="6.4" fill="{color}">
          <animate attributeName="r" values="5.3;7.8;6.4" dur="1.25s" begin="{fmt(1.1 + index * .15)}s" repeatCount="indefinite"/>
        </circle>
        <text class="ttl-label" x="0" y="10" text-anchor="middle">{esc(marker['label'])}</text>
        <text class="ttl-note" x="0" y="21" text-anchor="middle">{esc(marker['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="ttl-policy" data-policy-id="stampede-ttl-policy">
      <line x1="342" x2="690" y1="426" y2="426" stroke="{PALETTE['gray300']}" stroke-width="2" stroke-linecap="round"/>
{''.join(parts)}
    </g>"""


def trend_markup() -> str:
    hit_points = [(hit_x(float(point["minute"])), metric_y(float(point["hit"]))) for point in TREND_POINTS]
    origin_points = [(hit_x(float(point["minute"])), metric_y(float(point["origin"]))) for point in TREND_POINTS]
    hit_line = line_path(hit_points)
    origin_line = line_path(origin_points)
    hit_marks: list[str] = []
    origin_marks: list[str] = []
    for index, (point, (x, y)) in enumerate(zip(TREND_POINTS, hit_points)):
        color_name = "red" if float(point["hit"]) < 50 else "orange" if float(point["hit"]) < 85 else "green"
        hit_marks.append(
            f"""
      <circle class="hit-ratio-point" data-minute="{point['minute']}" data-hit-ratio="{point['hit']}" cx="{fmt(x)}" cy="{fmt(y)}" r="{4.8 if point['minute'] == 0 else 3.4}" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.25"/>"""
        )
    for point, (x, y) in zip(TREND_POINTS, origin_points):
        color_name = "red" if float(point["origin"]) >= 80 else "orange" if float(point["origin"]) >= 50 else "blue"
        origin_marks.append(
            f"""
      <circle class="origin-load-point" data-minute="{point['minute']}" data-origin-load="{point['origin']}" cx="{fmt(x)}" cy="{fmt(y)}" r="{4.8 if point['minute'] == 0 else 3.2}" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.25"/>"""
        )
    return f"""
    <g class="cache-trend-panel" data-panel-id="cache-trend">
      <rect x="58" y="474" width="598" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="496">Hit ratio collapse and origin load spike</text>
      <text class="panel-subtitle" x="78" y="512">lock + stale response recover before origin stays saturated</text>
      <line x1="104" x2="594" y1="{fmt(metric_y(85))}" y2="{fmt(metric_y(85))}" stroke="{PALETTE['green']}" stroke-width="1.1" stroke-dasharray="5 6"/>
      <line x1="104" x2="594" y1="{fmt(metric_y(80))}" y2="{fmt(metric_y(80))}" stroke="{PALETTE['red']}" stroke-width="1.1" stroke-dasharray="5 6"/>
      <path class="hit-ratio-line" data-sample-count="{len(TREND_POINTS)}" d="{hit_line}" fill="none" stroke="{PALETTE['green']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.05s" begin=".55s" fill="freeze"/>
      </path>
      <path class="origin-load-line" data-sample-count="{len(TREND_POINTS)}" d="{origin_line}" fill="none" stroke="{PALETTE['red']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.05s" begin=".68s" fill="freeze"/>
      </path>
{''.join(hit_marks)}
{''.join(origin_marks)}
      <g class="trend-legend" transform="translate(492 528)">
        <line x1="0" x2="28" y1="0" y2="0" stroke="{PALETTE['green']}" stroke-width="3"/>
        <text class="legend-label" x="34" y="4">hit ratio</text>
        <line x1="0" x2="28" y1="18" y2="18" stroke="{PALETTE['red']}" stroke-width="3"/>
        <text class="legend-label" x="34" y="22">origin load</text>
      </g>
      <text class="axis-label" x="104" y="594">-5m</text>
      <text class="axis-label" x="584" y="594" text-anchor="end">+4m</text>
    </g>"""


def mitigation_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(MITIGATIONS):
        col = index % 2
        row = index // 2
        x = 690 + col * 164
        y = 512 + row * 42
        color_name = str(step["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="cache-mitigation-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
        <rect x="0" y="0" width="150" height="34" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.1">
          <animate attributeName="opacity" values=".45;1" dur=".35s" begin="{fmt(1.1 + index * .15)}s" fill="freeze"/>
        </rect>
        <circle cx="17" cy="17" r="7" fill="{color}"/>
        <text class="step-index" x="17" y="20" text-anchor="middle">{index + 1}</text>
        <text class="step-label" x="31" y="14">{esc(step['label'])}</text>
        <text class="step-note" x="31" y="28">{esc(step['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="cache-mitigation-panel" data-panel-id="cache-mitigation">
      <rect x="672" y="474" width="356" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="692" y="498">Stampede mitigation</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Cache Stampede</title>
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
    .root-subtitle, .panel-subtitle, .status-note, .source-rate, .hot-key-state, .lock-label, .origin-note, .axis-label, .legend-label, .lane-label, .ttl-note, .step-note {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .source-label, .hot-key-label, .origin-label, .step-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .collapse-label {{
      fill: {PALETTE["purple"]};
      font-size: 9px;
      font-weight: 900;
    }}
    .status-eyebrow, .ttl-label {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .collapse-label {{
      fill: {PALETTE["purple"]};
      font-size: 8.5px;
      font-weight: 900;
    }}
    .step-index {{
      fill: #ffffff;
      font-size: 10px;
      font-weight: 900;
    }}
    .cache-request-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .26));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .cache-request-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="cache-stampede" data-pattern-id="d3-cache-stampede"
    data-pattern-family="critical-cache" data-request-source-count="{len(REQUEST_SOURCES)}"
    data-cache-flow-count="7" data-cache-pulse-count="8" data-hit-ratio-point-count="{len(TREND_POINTS)}"
    data-origin-load-point-count="{len(TREND_POINTS)}" data-ttl-marker-count="{len(TTL_MARKERS)}"
    data-mitigation-count="{len(MITIGATIONS)}" data-status-card-count="{len(STATUS_CARDS)}"
    data-hot-key="{esc(CACHE_STATE['key'])}" data-soft-ttl-seconds="{CACHE_STATE['soft_ttl']}"
    data-hard-ttl-seconds="{CACHE_STATE['hard_ttl']}" data-origin-load-peak="98"
    data-stale-window-seconds="{CACHE_STATE['stale_window']}" data-stampede-rate="{esc(CACHE_STATE['stampede_rate'])}"
    data-coalesced-origin-calls="{CACHE_STATE['coalesced_origin_calls']}"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="cache-stampede-title cache-stampede-desc">
    <title id="cache-stampede-title">Critical cache stampede</title>
    <desc id="cache-stampede-desc">A deterministic cache-stampede pattern shows request sources, an expired hot key, miss fan-out, single-flight lock, stale response, origin shielding, TTL policy, hit-ratio collapse, origin load spike, and mitigation steps.</desc>
    <rect x="28" y="24" width="1024" height="590" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical cache stampede</text>
    <text class="root-subtitle" x="58" y="80">Coalesce hot-key misses, serve stale, and refresh one copy before origin saturates.</text>
    <g class="cache-status-cards">
{summary_markup()}
    </g>
{topology_panel_markup()}
    <g class="cache-flow-paths">
{flow_markup()}
    </g>
    <g class="cache-request-sources">
{sources_markup()}
    </g>
{cache_layer_markup()}
{origin_markup()}
{ttl_markup()}
    <g class="cache-request-pulses">
{pulse_markup()}
    </g>
{trend_markup()}
{mitigation_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Cache Stampede D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
