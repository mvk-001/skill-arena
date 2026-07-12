#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Replication Failover animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1080
HEIGHT = 640
LAG_MAX = 25.0

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

NODES = [
    {
        "id": "primary-us-east",
        "label": "Primary us-east",
        "role": "primary",
        "state": "degraded",
        "lag": "writer frozen",
        "color": "red",
        "x": 190,
        "y": 292,
        "w": 190,
        "h": 62,
    },
    {
        "id": "replica-us-west",
        "label": "Replica us-west",
        "role": "replica",
        "state": "promotion candidate",
        "lag": "2.4s lag",
        "color": "green",
        "x": 486,
        "y": 216,
        "w": 190,
        "h": 60,
    },
    {
        "id": "replica-eu",
        "label": "Replica eu-central",
        "role": "replica",
        "state": "catching up",
        "lag": "8.7s lag",
        "color": "orange",
        "x": 486,
        "y": 316,
        "w": 190,
        "h": 60,
    },
    {
        "id": "replica-asia",
        "label": "Replica ap-south",
        "role": "replica",
        "state": "stale",
        "lag": "19.4s lag",
        "color": "red",
        "x": 486,
        "y": 416,
        "w": 190,
        "h": 60,
    },
    {
        "id": "witness",
        "label": "Witness quorum",
        "role": "witness",
        "state": "voting",
        "lag": "3 / 5 votes",
        "color": "purple",
        "x": 810,
        "y": 292,
        "w": 178,
        "h": 62,
    },
]

LINKS = [
    {"id": "primary-to-west", "source": "primary-us-east", "target": "replica-us-west", "kind": "wal", "color": "green", "lag": "2.4s"},
    {"id": "primary-to-eu", "source": "primary-us-east", "target": "replica-eu", "kind": "wal", "color": "orange", "lag": "8.7s"},
    {"id": "primary-to-asia", "source": "primary-us-east", "target": "replica-asia", "kind": "wal", "color": "red", "lag": "19.4s"},
    {"id": "primary-to-witness", "source": "primary-us-east", "target": "witness", "kind": "quorum", "color": "purple", "lag": "vote"},
]

LAG_SAMPLES = [
    {"minute": -9, "lag": 1.2},
    {"minute": -8, "lag": 1.6},
    {"minute": -7, "lag": 2.1},
    {"minute": -6, "lag": 3.8},
    {"minute": -5, "lag": 8.7},
    {"minute": -4, "lag": 17.9},
    {"minute": -3, "lag": 19.4},
    {"minute": -2, "lag": 13.5},
    {"minute": -1, "lag": 6.1},
    {"minute": 0, "lag": 2.4},
]

QUORUM_VOTES = [
    {"id": "primary", "label": "primary", "state": "frozen", "color": "red", "vote": "no writes"},
    {"id": "west", "label": "west", "state": "yes", "color": "green", "vote": "promote"},
    {"id": "eu", "label": "eu", "state": "yes", "color": "orange", "vote": "lag ok"},
    {"id": "asia", "label": "asia", "state": "reject", "color": "red", "vote": "stale"},
    {"id": "witness", "label": "witness", "state": "yes", "color": "purple", "vote": "quorum"},
]

FAILOVER_STEPS = [
    {"id": "freeze", "label": "Freeze writes", "note": "stop split-brain", "color": "red"},
    {"id": "quorum", "label": "Verify quorum", "note": "3 of 5 agree", "color": "purple"},
    {"id": "promote", "label": "Promote us-west", "note": "2.4s behind", "color": "green"},
    {"id": "reroute", "label": "Reroute traffic", "note": "RTO target 60s", "color": "blue"},
]

STATUS_CARDS = [
    ("primary", "degraded", "writes frozen before promotion", "red"),
    ("best replica", "2.4s lag", "promotion candidate", "green"),
    ("RPO gap", "8 events", "unreplayed writes at risk", "orange"),
    ("RTO target", "60s", "failover path is active", "purple"),
]

THRESHOLD_BANDS = [
    {"id": "safe", "label": "safe lag", "min": 0, "max": 5, "color": "green"},
    {"id": "warning", "label": "review lag", "min": 5, "max": 15, "color": "orange"},
    {"id": "critical", "label": "stale", "min": 15, "max": 25, "color": "red"},
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def node_by_id(node_id: str) -> dict[str, object]:
    for node in NODES:
        if node["id"] == node_id:
            return node
    raise KeyError(node_id)


def node_edge(node: dict[str, object], side: str) -> tuple[float, float]:
    x = float(node["x"])
    y = float(node["y"])
    w = float(node["w"])
    if side == "right":
        return x + w / 2, y
    if side == "left":
        return x - w / 2, y
    if side == "top":
        return x, y - float(node["h"]) / 2
    return x, y + float(node["h"]) / 2


def link_path(link: dict[str, object]) -> str:
    source = node_by_id(str(link["source"]))
    target = node_by_id(str(link["target"]))
    x0, y0 = node_edge(source, "right")
    x1, y1 = node_edge(target, "left")
    if link["target"] == "witness":
        y0 = y0 - 12
        x1, y1 = node_edge(target, "left")
        y1 = y1 - 12
        return f"M{fmt(x0)} {fmt(y0)} C{fmt(x0 + 128)} {fmt(y0 - 28)} {fmt(x1 - 128)} {fmt(y1 - 32)} {fmt(x1)} {fmt(y1)}"
    return f"M{fmt(x0)} {fmt(y0)} C{fmt(x0 + 86)} {fmt(y0)} {fmt(x1 - 86)} {fmt(y1)} {fmt(x1)} {fmt(y1)}"


def promotion_path() -> str:
    candidate = node_by_id("replica-us-west")
    witness = node_by_id("witness")
    x0, y0 = node_edge(candidate, "right")
    x1, y1 = node_edge(witness, "left")
    return f"M{fmt(x0)} {fmt(y0)} C{fmt(x0 + 92)} {fmt(y0 - 46)} {fmt(x1 - 72)} {fmt(y1 - 34)} {fmt(x1)} {fmt(y1)}"


def traffic_reroute_path() -> str:
    witness = node_by_id("witness")
    x0, y0 = node_edge(witness, "right")
    x1, y1 = 996.0, 226.0
    return f"M{fmt(x0)} {fmt(y0 + 12)} C{fmt(x0 + 34)} {fmt(y0 + 6)} {fmt(x1 - 58)} {fmt(y1)} {fmt(x1)} {fmt(y1)}"


def lag_x(minute: float) -> float:
    left = 104
    right = 584
    return left + ((minute + 9) / 9.0) * (right - left)


def lag_y(lag: float) -> float:
    top = 496
    bottom = 566
    return bottom - (lag / LAG_MAX) * (bottom - top)


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def status_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        y = 88
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="replication-status-card" data-card-index="{index}" transform="translate({x} {y})">
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
    <g class="replication-topology-panel" data-panel-id="replication-topology">
      <rect x="58" y="160" width="970" height="296" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Replication topology and promotion decision</text>
      <text class="panel-subtitle" x="78" y="203">freeze the old writer, choose the lowest-lag replica, then route through quorum</text>
      <line x1="318" x2="318" y1="214" y2="438" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="652" x2="652" y1="214" y2="438" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <text class="lane-label" x="88" y="438">writer</text>
      <text class="lane-label" x="430" y="438">replicas</text>
      <text class="lane-label" x="762" y="438">quorum / routing</text>
    </g>"""


def write_fence_markup() -> str:
    return f"""
    <g class="write-fence" data-fence-id="primary-fenced" data-fenced-node="primary-us-east" data-fence-state="active" transform="translate(304 352)">
      <rect x="-74" y="0" width="148" height="24" rx="6" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.1"/>
      <path d="M-46 12 L-32 12 M-39 5 L-39 19" stroke="{PALETTE['red']}" stroke-width="2" stroke-linecap="round"/>
      <text class="fence-label" x="-20" y="16">old writer fenced</text>
    </g>"""


def traffic_reroute_markup() -> str:
    return f"""
    <g class="traffic-reroute" data-reroute-id="writer-endpoint-reroute" data-source="witness" data-target="writer-endpoint" data-rto-seconds="60">
      <path id="traffic-reroute-path" class="traffic-reroute-path" d="{traffic_reroute_path()}" fill="none"
        stroke="{PALETTE['blue']}" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.66;1" dur="1.9s" begin="0s" fill="freeze"/>
      </path>
      <g class="writer-endpoint" data-endpoint-id="writer-endpoint" transform="translate(902 198)">
        <rect x="0" y="0" width="120" height="54" rx="8" fill="{PALETTE['blue_highlight']}" stroke="{PALETTE['blue']}" stroke-width="1.15"/>
        <circle cx="18" cy="27" r="6.4" fill="{PALETTE['blue']}"/>
        <text class="endpoint-label" x="34" y="21">Writer endpoint</text>
        <text class="endpoint-note" x="34" y="37">rerouted</text>
      </g>
    </g>"""


def links_markup() -> str:
    parts: list[str] = []
    for index, link in enumerate(LINKS):
        color = PALETTE[str(link["color"])]
        parts.append(
            f"""
      <path id="replication-link-{esc(link['id'])}" class="replication-link"
        data-link-id="{esc(link['id'])}" data-source="{esc(link['source'])}" data-target="{esc(link['target'])}" data-kind="{esc(link['kind'])}" data-lag="{esc(link['lag'])}"
        d="{link_path(link)}" fill="none" stroke="{color}" stroke-width="{2.9 if link['kind'] == 'quorum' else 2.5}"
        stroke-opacity=".72" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{fmt(.2 + index * .08)}s" fill="freeze"/>
      </path>"""
        )
    parts.append(
        f"""
      <path id="promotion-path-us-west" class="promotion-path" data-promotion-source="replica-us-west" data-promotion-target="witness"
        d="{promotion_path()}" fill="none" stroke="{PALETTE['green']}" stroke-width="3.4" stroke-opacity=".9"
        stroke-linecap="round" stroke-dasharray="8 7" pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.62;1" dur="1.75s" begin="0s" fill="freeze"/>
      </path>"""
    )
    return "\n".join(parts)


def pulse_markup() -> str:
    pulse_defs = [
        ("wal-west", "replication-link-primary-to-west", "green", 1.0, "candidate"),
        ("wal-eu", "replication-link-primary-to-eu", "orange", 1.24, "catchup"),
        ("wal-asia", "replication-link-primary-to-asia", "red", 1.48, "stale"),
        ("quorum", "replication-link-primary-to-witness", "purple", 1.72, "vote"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        parts.append(
            f"""
      <circle class="replication-pulse" data-pulse-id="{esc(pulse_id)}" data-pulse-kind="{esc(kind)}" r="5.4" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.4" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.65s" begin="{fmt(begin + index * .04)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def nodes_markup() -> str:
    parts: list[str] = []
    for index, node in enumerate(NODES):
        color_name = str(node["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        x = float(node["x"]) - float(node["w"]) / 2
        y = float(node["y"]) - float(node["h"]) / 2
        role_class = "primary-node" if node["role"] == "primary" else "witness-node" if node["role"] == "witness" else "replica-node"
        parts.append(
            f"""
      <g class="replication-node {role_class}" data-node-id="{esc(node['id'])}" data-role="{esc(node['role'])}" data-state="{esc(node['state'])}" data-lag="{esc(node['lag'])}"
        transform="translate({fmt(x)} {fmt(y)})">
        <rect x="0" y="0" width="{node['w']}" height="{node['h']}" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.35">
          <animate attributeName="opacity" values=".72;1" dur=".42s" begin="{fmt(.24 + index * .08)}s" fill="freeze"/>
        </rect>
        <circle cx="20" cy="{fmt(float(node['h']) / 2)}" r="7" fill="{color}">
          <animate attributeName="r" values="6.2;8.4;7" dur="1.6s" begin="{fmt(1.3 + index * .12)}s" repeatCount="indefinite"/>
        </circle>
        <text class="node-label" x="38" y="23">{esc(node['label'])}</text>
        <text class="node-state" x="38" y="39">{esc(node['state'])}</text>
        <text class="node-lag" x="38" y="53">{esc(node['lag'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def vote_markup() -> str:
    parts: list[str] = []
    for index, vote in enumerate(QUORUM_VOTES):
        color_name = str(vote["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        x = 704 + index * 60
        y = 365
        parts.append(
            f"""
      <g class="quorum-vote" data-vote-id="{esc(vote['id'])}" data-state="{esc(vote['state'])}" data-vote="{esc(vote['vote'])}" transform="translate({x} {y})">
        <rect x="-24" y="-15" width="48" height="48" rx="8" fill="{fill}" stroke="{color}" stroke-width="1"/>
        <circle cx="0" cy="0" r="7.2" fill="{color}">
          <animate attributeName="r" values="5.8;8.8;7.2" dur="1.2s" begin="{fmt(1.45 + index * .12)}s" repeatCount="indefinite"/>
        </circle>
        <text class="vote-label" x="0" y="19" text-anchor="middle">{esc(vote['label'])}</text>
        <text class="vote-state" x="0" y="31" text-anchor="middle">{esc(vote['state'])}</text>
      </g>"""
        )
    return f"""
    <g class="quorum-votes" data-panel-id="quorum-votes">
      <text class="panel-title" x="704" y="346">Quorum votes</text>
{''.join(parts)}
    </g>"""


def lag_chart_markup() -> str:
    points = [(lag_x(float(sample["minute"])), lag_y(float(sample["lag"]))) for sample in LAG_SAMPLES]
    line = line_path(points)
    band_parts: list[str] = []
    for index, band in enumerate(THRESHOLD_BANDS):
        y0 = lag_y(float(band["max"]))
        y1 = lag_y(float(band["min"]))
        color_name = str(band["color"])
        band_parts.append(
            f"""
      <g class="lag-threshold-band" data-band-id="{esc(band['id'])}" data-band-min="{band['min']}" data-band-max="{band['max']}">
        <rect x="104" y="{fmt(y0)}" width="480" height="{fmt(y1 - y0)}" fill="{PALETTE[f'{color_name}_highlight']}" fill-opacity=".32"/>
        <text class="band-label" x="578" y="{fmt(y0 + 12)}" text-anchor="end">{esc(band['label'])}</text>
      </g>"""
        )
    point_parts: list[str] = []
    for index, (sample, (x, y)) in enumerate(zip(LAG_SAMPLES, points)):
        color_name = "red" if float(sample["lag"]) >= 15 else "orange" if float(sample["lag"]) >= 5 else "green"
        point_parts.append(
            f"""
      <circle class="lag-sample-point" data-minute="{sample['minute']}" data-lag="{sample['lag']}" cx="{fmt(x)}" cy="{fmt(y)}"
        r="{4.9 if index in (6, 9) else 3.4}" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.25">
        <animate attributeName="r" values="2.2;5.5;{4.9 if index in (6, 9) else 3.4}" dur=".44s" begin="{fmt(.78 + index * .05)}s" fill="freeze"/>
      </circle>"""
        )
    rpo_x = points[6][0] - 22
    rpo_y = points[6][1] - 31
    return f"""
    <g class="lag-chart-panel" data-panel-id="lag-chart">
      <rect x="58" y="462" width="566" height="126" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="486">Replica lag during failover</text>
      <text class="panel-subtitle" x="294" y="486">candidate returns below 5s before promotion</text>
{''.join(band_parts)}
      <line x1="104" x2="584" y1="{fmt(lag_y(5))}" y2="{fmt(lag_y(5))}" stroke="{PALETTE['green']}" stroke-width="1.2" stroke-dasharray="5 6"/>
      <line x1="104" x2="584" y1="{fmt(lag_y(15))}" y2="{fmt(lag_y(15))}" stroke="{PALETTE['red']}" stroke-width="1.2" stroke-dasharray="5 6"/>
      <path class="lag-chart-line" data-sample-count="{len(LAG_SAMPLES)}" d="{line}" fill="none" stroke="{PALETTE['red']}" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.18s" begin=".58s" fill="freeze"/>
      </path>
{''.join(point_parts)}
      <g class="rpo-gap" data-risk-events="8" data-peak-lag="19.4" transform="translate({fmt(rpo_x)} {fmt(rpo_y)})">
        <rect x="0" y="0" width="118" height="25" rx="5" fill="#ffffff" stroke="{PALETTE['red']}" stroke-width="1.15"/>
        <text class="rpo-label" x="10" y="17">RPO gap: 8 events</text>
      </g>
      <text class="axis-label" x="104" y="580">-9m</text>
      <text class="axis-label" x="566" y="580" text-anchor="end">now</text>
    </g>"""


def failover_steps_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(FAILOVER_STEPS):
        col = index % 2
        row = index // 2
        x = 660 + col * 178
        y = 498 + row * 43
        color_name = str(step["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="failover-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
        <rect x="0" y="0" width="160" height="35" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.15">
          <animate attributeName="opacity" values=".45;1" dur=".35s" begin="{fmt(1.0 + index * .16)}s" fill="freeze"/>
        </rect>
        <circle cx="18" cy="17.5" r="7.2" fill="{color}"/>
        <text class="step-index" x="18" y="21" text-anchor="middle">{index + 1}</text>
        <text class="step-label" x="34" y="15">{esc(step['label'])}</text>
        <text class="step-note" x="34" y="29">{esc(step['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="failover-steps-panel" data-panel-id="failover-steps">
      <rect x="642" y="462" width="386" height="126" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="662" y="486">Failover runbook</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Replication Failover</title>
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
    .root-subtitle, .panel-subtitle, .status-note, .node-state, .node-lag, .axis-label, .band-label, .vote-state, .step-note, .lane-label, .endpoint-note {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .node-label, .step-label, .endpoint-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .fence-label {{
      fill: {PALETTE["red"]};
      font-size: 10px;
      font-weight: 900;
    }}
    .status-eyebrow, .step-index {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .vote-label, .vote-state {{
      fill: {PALETTE["ink"]};
      font-size: 8.5px;
      font-weight: 850;
    }}
    .step-index {{
      fill: #ffffff;
    }}
    .rpo-label {{
      fill: {PALETTE["red"]};
      font-size: 11px;
      font-weight: 900;
    }}
    .replication-pulse {{
      filter: drop-shadow(0 0 5px rgba(0, 114, 152, .28));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .replication-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="replication-failover" data-pattern-id="d3-replication-failover"
    data-pattern-family="critical-replication" data-node-count="{len(NODES)}"
    data-replication-link-count="{len(LINKS)}" data-lag-sample-count="{len(LAG_SAMPLES)}"
    data-quorum-vote-count="{len(QUORUM_VOTES)}" data-failover-step-count="{len(FAILOVER_STEPS)}"
    data-status-card-count="{len(STATUS_CARDS)}" data-pulse-count="4" data-rpo-events-at-risk="8"
    data-rto-target-seconds="60" data-write-fence-count="1" data-traffic-reroute-count="1"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="replication-failover-title replication-failover-desc">
    <title id="replication-failover-title">Critical replication failover</title>
    <desc id="replication-failover-desc">A deterministic database failover pattern shows a degraded primary, replica lag, quorum votes, RPO exposure, selected promotion candidate, RTO target, and animated replication pulses.</desc>
    <rect x="28" y="24" width="1024" height="580" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical replication failover</text>
    <text class="root-subtitle" x="58" y="80">Promote the lowest-lag replica only after freezing writes and reaching quorum.</text>
    <g class="replication-status-cards">
{status_markup()}
    </g>
{topology_panel_markup()}
    <g class="replication-links">
{links_markup()}
    </g>
{traffic_reroute_markup()}
    <g class="replication-nodes">
{nodes_markup()}
    </g>
{write_fence_markup()}
{vote_markup()}
    <g class="replication-pulses">
{pulse_markup()}
    </g>
{lag_chart_markup()}
{failover_steps_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Replication Failover D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
