#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Category Burst animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
import math
from pathlib import Path


WIDTH = 560
HEIGHT = 420
CENTER_X = WIDTH / 2
CENTER_Y = HEIGHT / 2 + 4

PALETTE = {
    "blue": "#007298",
    "orange": "#e77204",
    "green": "#45842a",
    "red": "#9e1b32",
    "purple": "#652f6c",
    "ink": "#333e48",
    "surface": "#ffffff",
    "gray100": "#e7e7e7",
    "gray700": "#4f4f4f",
    "blue_hover": "#004d66",
    "orange_hover": "#994a00",
    "green_hover": "#294d19",
    "blue_highlight": "#cdf3ff",
    "orange_highlight": "#ffe5cc",
    "green_highlight": "#dbffcc",
    "red_highlight": "#ffccd5",
    "purple_highlight": "#f9ccff",
}

SPOKES = [
    {"id": "scope", "label": "Scope", "angle": 0, "distance": 132, "color": "blue", "fill": "blue_highlight", "r": 22},
    {"id": "inputs", "label": "Inputs", "angle": 42, "distance": 142, "color": "green", "fill": "green_highlight", "r": 19},
    {"id": "people", "label": "People", "angle": 90, "distance": 148, "color": "orange", "fill": "orange_highlight", "r": 21},
    {"id": "process", "label": "Process", "angle": 138, "distance": 142, "color": "purple", "fill": "purple_highlight", "r": 19},
    {"id": "tools", "label": "Tools", "angle": 180, "distance": 132, "color": "red", "fill": "red_highlight", "r": 21},
    {"id": "outputs", "label": "Outputs", "angle": 222, "distance": 142, "color": "blue_hover", "fill": "blue_highlight", "r": 20},
    {"id": "signals", "label": "Signals", "angle": 270, "distance": 148, "color": "green_hover", "fill": "green_highlight", "r": 19},
    {"id": "risks", "label": "Risks", "angle": 318, "distance": 142, "color": "orange_hover", "fill": "orange_highlight", "r": 18},
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def enriched_spokes() -> list[dict[str, float | int | str]]:
    result: list[dict[str, float | int | str]] = []
    for index, spoke in enumerate(SPOKES):
        angle = math.radians(spoke["angle"] - 90)
        radial_x = math.cos(angle)
        radial_y = math.sin(angle)
        tangent_x = -radial_y
        tangent_y = radial_x
        wobble = 18 if index % 2 == 0 else -18
        distance = float(spoke["distance"])
        result.append(
            {
                **spoke,
                "index": index,
                "radial_x": radial_x,
                "radial_y": radial_y,
                "x": CENTER_X + radial_x * distance,
                "y": CENTER_Y + radial_y * distance,
                "float_x": CENTER_X + radial_x * (distance * 0.78) + tangent_x * wobble,
                "float_y": CENTER_Y + radial_y * (distance * 0.78) + tangent_y * wobble,
                "delay": 0.72 + index * 0.075,
            }
        )
    return result


def path_for_spoke(spoke: dict[str, float | int | str]) -> str:
    bend = 20 if int(spoke["index"]) % 2 == 0 else -20
    radial_x = float(spoke["radial_x"])
    radial_y = float(spoke["radial_y"])
    distance = float(spoke["distance"])
    c1x = CENTER_X + radial_x * 54 - radial_y * bend
    c1y = CENTER_Y + radial_y * 54 + radial_x * bend
    c2x = CENTER_X + radial_x * (distance * 0.62) + radial_y * bend * 0.75
    c2y = CENTER_Y + radial_y * (distance * 0.62) - radial_x * bend * 0.75
    return (
        f"M{fmt(CENTER_X)} {fmt(CENTER_Y)} "
        f"C{fmt(c1x)} {fmt(c1y)}, {fmt(c2x)} {fmt(c2y)}, {fmt(float(spoke['x']))} {fmt(float(spoke['y']))}"
    )


def link_markup(spoke: dict[str, float | int | str]) -> str:
    distance = float(spoke["distance"])
    delay = 0.52 + int(spoke["index"]) * 0.07
    duration = 1.1
    total = delay + duration
    color = PALETTE[str(spoke["color"])]
    return f"""
      <path class="category-burst-link" data-subcategory-id="{html.escape(str(spoke['id']))}" d="{path_for_spoke(spoke)}"
        fill="none" stroke="{color}" stroke-width="2.2" stroke-opacity=".68" stroke-linecap="round"
        pathLength="{fmt(distance)}" stroke-dasharray="{fmt(distance)} {fmt(distance)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="{fmt(distance)};{fmt(distance)};0"
          keyTimes="0;{delay / total:.3f};1" dur="{fmt(total)}s" begin="0s" fill="freeze"/>
      </path>"""


def label_anchor(radial_x: float) -> str:
    if abs(radial_x) < 0.24:
        return "middle"
    return "start" if radial_x > 0 else "end"


def node_markup(spoke: dict[str, float | int | str]) -> str:
    delay = float(spoke["delay"])
    total = delay + 1.65
    float_at = (delay + 1.16) / total
    radius = float(spoke["r"])
    radial_x = float(spoke["radial_x"])
    radial_y = float(spoke["radial_y"])
    label_x = radial_x * (radius + 16)
    label_y = radial_y * (radius + 16) + 4
    label_delay = delay + 1.1
    label_dur = 0.42
    label_total = label_delay + label_dur
    color = PALETTE[str(spoke["color"])]
    fill = PALETTE[str(spoke["fill"])]
    label = html.escape(str(spoke["label"]))
    return f"""
      <g class="category-burst-node" data-node-role="subcategory" data-subcategory-id="{html.escape(str(spoke['id']))}"
        transform="translate({fmt(float(spoke['x']))} {fmt(float(spoke['y']))})" opacity="1">
        <animateTransform attributeName="transform" type="translate"
          values="{fmt(CENTER_X)} {fmt(CENTER_Y)};{fmt(CENTER_X)} {fmt(CENTER_Y)};{fmt(float(spoke['float_x']))} {fmt(float(spoke['float_y']))};{fmt(float(spoke['x']))} {fmt(float(spoke['y']))}"
          keyTimes="0;{delay / total:.3f};{float_at:.3f};1" dur="{fmt(total)}s" begin="0s" fill="freeze"
          calcMode="spline" keySplines=".4 0 .2 1;.22 .82 .22 1;.3 0 .1 1"/>
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{delay / (delay + 0.42):.3f};1"
          dur="{fmt(delay + 0.42)}s" begin="0s" fill="freeze"/>
        <circle r="{fmt(radius)}" fill="{fill}" stroke="{color}" stroke-width="2.4">
          <animate attributeName="r" values="5;{fmt(radius + 2)};{fmt(radius)}" dur=".72s"
            begin="{fmt(delay + 0.28)}s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1;.28 0 .22 1"/>
        </circle>
        <circle r="{fmt(radius + 5)}" fill="none" stroke="{color}" stroke-width="1.4" stroke-opacity=".18"/>
        <text class="mark-label" x="{fmt(label_x)}" y="{fmt(label_y)}" text-anchor="{label_anchor(radial_x)}"
          font-size="11.2" font-weight="800">{label}
          <animate attributeName="opacity" values="0;0;1" keyTimes="0;{label_delay / label_total:.3f};1"
            dur="{fmt(label_total)}s" begin="0s" fill="freeze"/>
        </text>
      </g>"""


def build_html() -> str:
    spokes = enriched_spokes()
    links = "\n".join(link_markup(spoke) for spoke in spokes)
    nodes = "\n".join(node_markup(spoke) for spoke in spokes)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Category Burst</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f7f7f7;
      color: {PALETTE["ink"]};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw - 32px, 760px);
      height: auto;
      display: block;
      background: {PALETTE["surface"]};
    }}
    .mark-label {{
      fill: {PALETTE["ink"]};
      paint-order: stroke;
      stroke: {PALETTE["surface"]};
      stroke-width: 3px;
      stroke-linejoin: round;
    }}
    .reverse-label {{
      fill: {PALETTE["surface"]};
      stroke: none;
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateTransform {{
        dur: 1ms;
      }}
    }}
  </style>
</head>
<body>
  <svg id="category-burst" data-pattern-id="d3-category-burst" viewBox="0 0 {WIDTH} {HEIGHT}"
    role="img" aria-labelledby="category-burst-title category-burst-desc">
    <title id="category-burst-title">Category burst</title>
    <desc id="category-burst-desc">A central main category appears, draws curved spokes outward, and settles eight floating subcategory circles into a radial concept map.</desc>
    <defs>
      <filter id="category-burst-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="{PALETTE["gray700"]}" flood-opacity=".18"/>
      </filter>
    </defs>
    <circle cx="{fmt(CENTER_X)}" cy="{fmt(CENTER_Y)}" r="152" fill="none" stroke="{PALETTE["gray100"]}"
      stroke-width="1.2" stroke-dasharray="4 8" opacity=".72"/>
    <circle cx="{fmt(CENTER_X)}" cy="{fmt(CENTER_Y)}" r="12" fill="none" stroke="{PALETTE["blue_highlight"]}"
      stroke-width="12" opacity=".55">
      <animate attributeName="r" from="12" to="54" dur=".85s" begin="0s" fill="freeze"/>
      <animate attributeName="opacity" from=".55" to="0" dur=".85s" begin="0s" fill="freeze"/>
    </circle>
    <g class="category-burst-links">
{links}
    </g>
    <g class="category-burst-root" data-node-role="root" transform="translate({fmt(CENTER_X)} {fmt(CENTER_Y)})"
      filter="url(#category-burst-soft-shadow)">
      <circle r="36" fill="{PALETTE["ink"]}" stroke="{PALETTE["surface"]}" stroke-width="3">
        <animate attributeName="r" values="0;36" dur=".56s" begin="0s" fill="freeze"
          calcMode="spline" keySplines=".2 .8 .2 1"/>
      </circle>
      <text class="reverse-label" text-anchor="middle" y="-4" font-size="12" font-weight="800">Main</text>
      <text class="reverse-label" text-anchor="middle" y="12" font-size="9" font-weight="700">category</text>
    </g>
    <g class="category-burst-nodes">
{nodes}
    </g>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Category Burst D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
