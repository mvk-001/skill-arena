#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Dependency Blast Radius animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1040
HEIGHT = 620
CENTER = (520, 294)

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
    "gray600": "#696969",
    "gray700": "#4f4f4f",
}

RINGS = [
    {"id": "core", "label": "Core failure", "r": 88, "color": "red", "opacity": 0.18},
    {"id": "dependency", "label": "Direct dependency impact", "r": 178, "color": "orange", "opacity": 0.11},
    {"id": "surface", "label": "User-facing blast radius", "r": 284, "color": "blue", "opacity": 0.08},
]

NODES = [
    {"id": "checkout-api", "label": "Checkout API", "role": "critical-service", "x": 520, "y": 294, "status": "degraded", "color": "red", "w": 126},
    {"id": "payments", "label": "Payments", "role": "hard-dependency", "x": 322, "y": 178, "status": "critical", "color": "red", "w": 116},
    {"id": "auth", "label": "Auth", "role": "hard-dependency", "x": 320, "y": 286, "status": "healthy", "color": "blue", "w": 88},
    {"id": "inventory", "label": "Inventory", "role": "hard-dependency", "x": 332, "y": 396, "status": "warning", "color": "orange", "w": 116},
    {"id": "pricing", "label": "Pricing", "role": "soft-dependency", "x": 490, "y": 134, "status": "healthy", "color": "purple", "w": 98},
    {"id": "orders", "label": "Orders DB", "role": "storage", "x": 492, "y": 452, "status": "warning", "color": "orange", "w": 110},
    {"id": "backup-processor", "label": "Backup processor", "role": "failover", "x": 698, "y": 152, "status": "available", "color": "green", "w": 144},
    {"id": "web", "label": "Web", "role": "entrypoint", "x": 150, "y": 224, "status": "healthy", "color": "blue", "w": 84},
    {"id": "mobile", "label": "Mobile", "role": "entrypoint", "x": 150, "y": 344, "status": "healthy", "color": "blue", "w": 98},
    {"id": "checkout-ui", "label": "Checkout UI", "role": "impact-surface", "x": 808, "y": 244, "status": "degraded", "color": "orange", "w": 122},
    {"id": "fulfillment", "label": "Fulfillment", "role": "impact-surface", "x": 804, "y": 354, "status": "warning", "color": "orange", "w": 124},
    {"id": "support", "label": "Support queue", "role": "impact-surface", "x": 816, "y": 464, "status": "stable", "color": "green", "w": 126},
]

LINKS = [
    {"id": "web-checkout", "source": "web", "target": "checkout-api", "kind": "traffic", "severity": "normal", "color": "blue", "critical": False},
    {"id": "mobile-checkout", "source": "mobile", "target": "checkout-api", "kind": "traffic", "severity": "normal", "color": "blue", "critical": False},
    {"id": "payments-checkout", "source": "payments", "target": "checkout-api", "kind": "hard", "severity": "critical", "color": "red", "critical": True},
    {"id": "auth-checkout", "source": "auth", "target": "checkout-api", "kind": "hard", "severity": "normal", "color": "blue", "critical": False},
    {"id": "inventory-checkout", "source": "inventory", "target": "checkout-api", "kind": "hard", "severity": "warning", "color": "orange", "critical": False},
    {"id": "pricing-checkout", "source": "pricing", "target": "checkout-api", "kind": "soft", "severity": "normal", "color": "purple", "critical": False},
    {"id": "checkout-orders", "source": "checkout-api", "target": "orders", "kind": "write", "severity": "warning", "color": "orange", "critical": False},
    {"id": "checkout-ui", "source": "checkout-api", "target": "checkout-ui", "kind": "impact", "severity": "warning", "color": "orange", "critical": True},
    {"id": "checkout-fulfillment", "source": "checkout-api", "target": "fulfillment", "kind": "impact", "severity": "warning", "color": "orange", "critical": False},
    {"id": "checkout-support", "source": "checkout-api", "target": "support", "kind": "impact", "severity": "normal", "color": "green", "critical": False},
]

FAILOVERS = [
    {"id": "payments-backup", "source": "payments", "target": "backup-processor", "protects": "checkout-api", "color": "green"},
    {"id": "backup-checkout", "source": "backup-processor", "target": "checkout-api", "protects": "checkout-api", "color": "green"},
]

STATUS_CARDS = [
    ("critical input", "Payments", "hard dependency failing", "red"),
    ("blast radius", "3 surfaces", "checkout + fulfillment + support", "orange"),
    ("mitigation", "backup route", "processor ready", "green"),
]

TIER_LABELS = [
    {"id": "core", "label": "Core failure", "note": "hard dependency", "color": "red", "y": 108},
    {"id": "dependency", "label": "Direct dependency", "note": "checkout degraded", "color": "orange", "y": 139},
    {"id": "surface", "label": "Surface impact", "note": "workflow effects", "color": "blue", "y": 170},
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


def node_anchor(node: dict[str, object], target: dict[str, object]) -> tuple[float, float]:
    x = float(node["x"])
    y = float(node["y"])
    w = float(node["w"])
    dx = float(target["x"]) - x
    if abs(dx) > 24:
        x += (w / 2 + 8) * (1 if dx > 0 else -1)
    return x, y


def link_path(record: dict[str, object]) -> str:
    source = node_by_id(str(record["source"]))
    target = node_by_id(str(record["target"]))
    x0, y0 = node_anchor(source, target)
    x1, y1 = node_anchor(target, source)
    dx = max(46, abs(x1 - x0) * 0.45)
    return f"M{fmt(x0)} {fmt(y0)} C{fmt(x0 + dx)} {fmt(y0)} {fmt(x1 - dx)} {fmt(y1)} {fmt(x1)} {fmt(y1)}"


def ring_markup() -> str:
    parts: list[str] = []
    cx, cy = CENTER
    for index, ring in enumerate(RINGS):
        color = PALETTE[str(ring["color"])]
        fill = PALETTE[f"{ring['color']}_highlight"]
        delay = 0.1 + index * 0.12
        r = float(ring["r"])
        parts.append(
            f"""
      <g class="blast-radius-ring" data-ring-id="{esc(ring['id'])}" data-ring-label="{esc(ring['label'])}">
        <circle cx="{cx}" cy="{cy}" r="{fmt(r)}" fill="{fill}" fill-opacity="{fmt(float(ring['opacity']))}"
          stroke="{color}" stroke-width="1.4" stroke-dasharray="6 9" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".42s" begin="{fmt(delay)}s" fill="freeze"/>
        </circle>
      </g>"""
        )
    return "\n".join(parts)


def blast_wave_markup() -> str:
    cx, cy = CENTER
    return f"""
      <circle class="blast-wave" data-origin-node-id="checkout-api" cx="{cx}" cy="{cy}" r="20"
        fill="none" stroke="{PALETTE['red']}" stroke-width="3" stroke-opacity=".42">
        <animate attributeName="r" values="28;132;274" keyTimes="0;.45;1" dur="2.6s" begin="1.35s" repeatCount="indefinite"/>
        <animate attributeName="stroke-opacity" values=".44;.18;0" dur="2.6s" begin="1.35s" repeatCount="indefinite"/>
      </circle>"""


def tier_label_markup() -> str:
    parts: list[str] = []
    for tier in TIER_LABELS:
        color = PALETTE[str(tier["color"])]
        fill = PALETTE[f"{tier['color']}_highlight"]
        parts.append(
            f"""
      <g class="blast-tier-label" data-ring-id="{esc(tier['id'])}" transform="translate(58 {tier['y']})">
        <rect x="0" y="0" width="188" height="26" rx="6" fill="{fill}" stroke="{color}" stroke-width="1.1"/>
        <circle cx="14" cy="13" r="5" fill="{color}"/>
        <text class="tier-label" x="27" y="10">{esc(tier['label'])}</text>
        <text class="tier-note" x="27" y="21">{esc(tier['note'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def link_markup(link: dict[str, object], index: int) -> str:
    color = PALETTE[str(link["color"])]
    width = 3.2 if link.get("critical") else 2.0
    delay = 0.52 + index * 0.055
    class_name = "dependency-link"
    if link.get("critical"):
        class_name += " critical-dependency-link"
    return f"""
      <path id="dependency-link-{esc(link['id'])}" class="{class_name}"
        data-link-id="{esc(link['id'])}" data-source-id="{esc(link['source'])}" data-target-id="{esc(link['target'])}"
        data-kind="{esc(link['kind'])}" data-severity="{esc(link['severity'])}"
        d="{link_path(link)}" fill="none" stroke="{color}" stroke-width="{fmt(width)}"
        stroke-opacity="{'.9' if link.get('critical') else '.55'}" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0"
          keyTimes="0;{delay / (delay + 0.75):.3f};1" dur="{fmt(delay + 0.75)}s" begin="0s" fill="freeze"/>
      </path>"""


def failover_markup(record: dict[str, object], index: int) -> str:
    color = PALETTE[str(record["color"])]
    delay = 1.55 + index * 0.12
    return f"""
      <path id="failover-path-{esc(record['id'])}" class="failover-path"
        data-failover-id="{esc(record['id'])}" data-source-id="{esc(record['source'])}" data-target-id="{esc(record['target'])}"
        data-protects="{esc(record['protects'])}" d="{link_path(record)}" fill="none"
        stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 8"
        pathLength="1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0"
          keyTimes="0;{delay / (delay + 0.85):.3f};1" dur="{fmt(delay + 0.85)}s" begin="0s" fill="freeze"/>
      </path>"""


def pulse_markup(link: dict[str, object], index: int) -> str:
    begin = 1.0 + index * 0.2
    color = PALETTE[str(link["color"])]
    return f"""
      <circle class="dependency-pulse" data-link-id="{esc(link['id'])}" r="5.6"
        fill="{color}" stroke="#ffffff" stroke-width="1.5" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + 0.12):.3f};1"
          dur="{fmt(begin + 0.12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.2s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#dependency-link-{esc(link['id'])}"/>
        </animateMotion>
      </circle>"""


def node_markup(node: dict[str, object], index: int) -> str:
    x = float(node["x"])
    y = float(node["y"])
    w = float(node["w"])
    h = 44 if node["role"] != "critical-service" else 56
    color = PALETTE[str(node["color"])]
    fill = PALETTE[f"{node['color']}_highlight"]
    delay = 0.28 + index * 0.045
    classes = "critical-dependency-node"
    if node["role"] == "impact-surface":
        classes += " impact-surface"
    if node["role"] == "critical-service":
        classes += " central-critical-service"
    return f"""
      <g class="{classes}" data-node-id="{esc(node['id'])}" data-node-role="{esc(node['role'])}" data-status="{esc(node['status'])}"
        transform="translate({fmt(x)} {fmt(y)})">
        <rect x="{fmt(-w / 2)}" y="{fmt(-h / 2)}" width="{fmt(w)}" height="{h}" rx="8"
          fill="{fill}" stroke="{color}" stroke-width="{2.6 if node['role'] == 'critical-service' else 1.7}" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".24s" begin="{fmt(delay)}s" fill="freeze"/>
          <animateTransform attributeName="transform" type="scale" values=".84;1.04;1" dur=".46s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <circle cx="{fmt(-w / 2 + 18)}" cy="0" r="6.4" fill="{color}" stroke="#ffffff" stroke-width="1.4"/>
        <text class="node-label" x="{fmt(-w / 2 + 34)}" y="-3">{esc(node['label'])}</text>
        <text class="node-status" x="{fmt(-w / 2 + 34)}" y="13">{esc(str(node['status']).replace('-', ' '))}</text>
      </g>"""


def status_card_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 54 + index * 306
        y = 522
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="blast-status-card" data-card-index="{index}" transform="translate({x} {y})">
        <rect x="0" y="0" width="268" height="62" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.3"/>
        <circle cx="18" cy="30" r="7" fill="{color}"/>
        <text class="card-eyebrow" x="34" y="18">{esc(eyebrow)}</text>
        <text class="card-value" x="34" y="35">{esc(value)}</text>
        <text class="card-note" x="34" y="51">{esc(note)}</text>
      </g>"""
        )
    return "\n".join(parts)


def legend_markup() -> str:
    items = [
        ("critical", PALETTE["red"], "failing hard dependency"),
        ("warning", PALETTE["orange"], "degraded impact"),
        ("failover", PALETTE["green"], "protected route"),
    ]
    parts = []
    for index, (label, color, desc) in enumerate(items):
        x = 724
        y = 72 + index * 25
        parts.append(
            f"""
      <g class="blast-legend-item" data-legend-key="{esc(label)}" transform="translate({x} {y})">
        <line x1="0" x2="28" y1="0" y2="0" stroke="{color}" stroke-width="3" stroke-linecap="round"/>
        <text class="legend-label" x="38" y="4">{esc(desc)}</text>
      </g>"""
        )
    return "\n".join(parts)


def build_html() -> str:
    critical_links = [link for link in LINKS if link.get("critical")]
    rings = ring_markup()
    links = "\n".join(link_markup(link, index) for index, link in enumerate(LINKS))
    failovers = "\n".join(failover_markup(record, index) for index, record in enumerate(FAILOVERS))
    pulses = "\n".join(pulse_markup(link, index) for index, link in enumerate(critical_links))
    nodes = "\n".join(node_markup(node, index) for index, node in enumerate(NODES))
    impacts = sum(1 for node in NODES if node["role"] == "impact-surface")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Dependency Blast Radius</title>
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
    .root-subtitle, .legend-label, .node-status, .card-note {{
      fill: {PALETTE["gray700"]};
      font-size: 10.5px;
      font-weight: 700;
    }}
    .node-label, .card-value, .tier-label {{
      fill: {PALETTE["ink"]};
      font-size: 11.5px;
      font-weight: 900;
    }}
    .card-eyebrow, .tier-note {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 850;
    }}
    .card-eyebrow {{
      text-transform: uppercase;
    }}
    .dependency-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .28));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .blast-wave {{
        stroke-opacity: .18;
      }}
    }}
  </style>
</head>
<body>
  <svg id="dependency-blast-radius" data-pattern-id="d3-dependency-blast-radius"
    data-pattern-family="critical-dependency" data-node-count="{len(NODES)}"
    data-link-count="{len(LINKS)}" data-critical-link-count="{len(critical_links)}"
    data-impact-count="{impacts}" data-ring-count="{len(RINGS)}"
    data-tier-label-count="{len(TIER_LABELS)}" data-failover-count="{len(FAILOVERS)}"
    data-status-card-count="{len(STATUS_CARDS)}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="dependency-blast-radius-title dependency-blast-radius-desc">
    <title id="dependency-blast-radius-title">Critical dependency blast radius</title>
    <desc id="dependency-blast-radius-desc">A deterministic service dependency map shows a degraded checkout API, a failing payments dependency, affected surfaces, blast-radius rings, failover paths, and animated propagation pulses.</desc>
    <defs>
      <clipPath id="blast-field-clip">
        <rect x="58" y="108" width="930" height="408" rx="0"/>
      </clipPath>
    </defs>
    <rect x="34" y="28" width="972" height="566" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="54" y="62">Critical dependency blast radius</text>
    <text class="root-subtitle" x="54" y="84">Hard dependency failure, direct-service impact, user-facing surfaces, and protected failover route.</text>
    <g class="blast-legend">
{legend_markup()}
    </g>
    <g class="blast-tier-labels">
{tier_label_markup()}
    </g>
    <g class="blast-rings" clip-path="url(#blast-field-clip)">
{rings}
{blast_wave_markup()}
    </g>
    <g class="dependency-links">
{links}
    </g>
    <g class="failover-paths">
{failovers}
    </g>
    <g class="dependency-nodes">
{nodes}
    </g>
    <g class="dependency-pulses">
{pulses}
    </g>
    <g class="blast-status-cards">
{status_card_markup()}
    </g>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Dependency Blast Radius D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
