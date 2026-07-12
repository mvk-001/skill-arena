#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone Natural Math Archetypes animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
import math
from pathlib import Path


WIDTH = 980
HEIGHT = 700
PANEL_W = 278
PANEL_H = 176

PHI = (1 + math.sqrt(5)) / 2
GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5))
HEX_CIRCLE_PACKING_DENSITY = math.pi / (2 * math.sqrt(3))

PALETTE = {
    "blue": "#007298",
    "orange": "#e77204",
    "green": "#45842a",
    "red": "#9e1b32",
    "purple": "#652f6c",
    "gold": "#f1c319",
    "ink": "#333e48",
    "muted": "#696969",
    "gray50": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "surface": "#ffffff",
    "blue_highlight": "#cdf3ff",
    "orange_highlight": "#ffe5cc",
    "yellow_highlight": "#fff4cc",
    "green_highlight": "#dbffcc",
    "purple_highlight": "#f9ccff",
}

LAYOUT = {
    "golden-angle-phyllotaxis": (44, 102),
    "pi-circular-wave": (352, 102),
    "logarithmic-spiral-shell": (660, 102),
    "fractal-branching": (44, 352),
    "hexagonal-packing": (352, 352),
    "voronoi-leaf-cells": (660, 352),
}


def fmt(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def verify_constants() -> None:
    if not math.isclose(GOLDEN_ANGLE, math.tau * (1 - 1 / PHI), rel_tol=0, abs_tol=1e-12):
        raise ValueError("Golden angle constant is inconsistent with phi.")
    if not math.isclose(math.degrees(GOLDEN_ANGLE), 137.50776405003785, rel_tol=0, abs_tol=1e-9):
        raise ValueError("Golden angle degree value drifted.")
    if not math.isclose(HEX_CIRCLE_PACKING_DENSITY, 0.9068996821171089, rel_tol=0, abs_tol=1e-12):
        raise ValueError("Hexagonal circle-packing density drifted.")


def panel_shell(panel_id: str, title: str, invariant: str, rule: str, nature: str) -> str:
    x, y = LAYOUT[panel_id]
    chips = [
        ("Invariant", invariant, PALETTE["blue_highlight"], PALETTE["blue"]),
        ("Rule", rule, PALETTE["green_highlight"], PALETTE["green"]),
        ("Nature", nature, PALETTE["purple_highlight"], PALETTE["purple"]),
    ]
    chip_markup = []
    for index, (label, value, fill, stroke) in enumerate(chips):
        cy = PANEL_H - 48 + index * 15
        chip_markup.append(
            f"""
      <g class="archetype-chip" data-chip-role="{esc(label.lower())}">
        <rect x="14" y="{cy - 10}" width="250" height="13" rx="4" fill="{fill}" stroke="{stroke}" stroke-opacity=".45"/>
        <text class="tiny-label" x="22" y="{cy}">{esc(label)}: {esc(value)}</text>
      </g>"""
        )
    return f"""
    <g class="natural-archetype" id="{panel_id}" data-archetype-id="{panel_id}" transform="translate({x} {y})">
      <rect width="{PANEL_W}" height="{PANEL_H}" rx="8" fill="{PALETTE['surface']}" stroke="{PALETTE['gray200']}" stroke-width="1.35"/>
      <text class="panel-title" x="14" y="24">{esc(title)}</text>
      {''.join(chip_markup)}
    </g>"""


def phyllotaxis_marks() -> str:
    x0, y0 = LAYOUT["golden-angle-phyllotaxis"]
    cx, cy = x0 + 139, y0 + 78
    seeds = []
    for index in range(76):
        theta = index * GOLDEN_ANGLE
        radius = 2.85 * math.sqrt(index)
        x = cx + radius * math.cos(theta)
        y = cy + radius * math.sin(theta)
        seed_radius = 1.8 + 0.65 * (1 - index / 76)
        color = [PALETTE["blue"], PALETTE["green"], PALETTE["orange"], PALETTE["purple"]][(index // 11) % 4]
        seeds.append(
            f"""
      <circle class="natural-seed" data-seed-index="{index}" data-divergence-degrees="{fmt(math.degrees(GOLDEN_ANGLE), 6)}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(seed_radius)}" fill="{color}" stroke="{PALETTE['surface']}" stroke-width=".45">
        <animate attributeName="r" values="0;{fmt(seed_radius)}" dur=".34s" begin="{fmt(0.05 + index * 0.007)}s" fill="freeze"/>
      </circle>"""
        )
    return f"""
    <g class="archetype-visual phyllotaxis-visual" data-model="phyllotaxis" data-phi="{fmt(PHI, 12)}"
      data-golden-angle-radians="{fmt(GOLDEN_ANGLE, 12)}" data-golden-angle-degrees="{fmt(math.degrees(GOLDEN_ANGLE), 9)}">
      <circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="38" fill="{PALETTE['yellow_highlight']}" stroke="{PALETTE['gray200']}"/>
      <circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="24" fill="none" stroke="{PALETTE['gray200']}" stroke-dasharray="3 5"/>
      {''.join(seeds)}
    </g>"""


def circular_wave_marks() -> str:
    x0, y0 = LAYOUT["pi-circular-wave"]
    cx, cy = x0 + 139, y0 + 72
    rings = [12, 22, 31, 40]
    ring_markup = []
    for index, radius in enumerate(rings):
        circumference = math.tau * radius
        ring_markup.append(
            f"""
      <circle class="natural-wave-ring" data-radius="{radius}" data-circumference="{fmt(circumference, 6)}"
        cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{PALETTE['blue']}" stroke-width="{fmt(2.6 - index * .35)}" stroke-opacity="{fmt(.78 - index * .12)}">
        <animate attributeName="stroke-opacity" values=".18;.86;.52" dur="1.4s" begin="{fmt(index * .18)}s" fill="freeze"/>
      </circle>"""
        )
    return f"""
    <g class="archetype-visual pi-circular-wave-visual" data-model="circle-wave" data-pi="{fmt(math.pi, 12)}">
      <circle cx="{cx}" cy="{cy}" r="5" fill="{PALETTE['orange']}" stroke="{PALETTE['surface']}" stroke-width="1.2"/>
      {''.join(ring_markup)}
    </g>"""


def logarithmic_spiral_marks() -> str:
    x0, y0 = LAYOUT["logarithmic-spiral-shell"]
    cx, cy = x0 + 134, y0 + 78
    a = 5.0
    b = 0.175
    points = []
    for step in range(116):
        theta = step * 0.118
        radius = a * math.exp(b * theta)
        points.append((cx + radius * math.cos(theta), cy + radius * math.sin(theta)))
    path = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in points)
    chambers = []
    for step in range(0, 116, 10):
        theta = step * 0.118
        radius = a * math.exp(b * theta)
        x = cx + radius * math.cos(theta)
        y = cy + radius * math.sin(theta)
        chambers.append(
            f"""
      <circle class="spiral-growth-sample" data-theta="{fmt(theta)}" data-radius="{fmt(radius)}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(2.2 + step * .028)}" fill="{PALETTE['orange_highlight']}"
        stroke="{PALETTE['orange']}" stroke-width=".9"/>"""
        )
    return f"""
    <g class="archetype-visual logarithmic-spiral-visual" data-model="logarithmic-spiral" data-spiral-a="{fmt(a)}" data-spiral-b="{fmt(b)}">
      <path class="natural-log-spiral" d="{path}" fill="none" stroke="{PALETTE['orange']}" stroke-width="3.2"
        stroke-linecap="round" pathLength="480" stroke-dasharray="480 480" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="480;0" dur="1.4s" begin=".1s" fill="freeze"/>
      </path>
      <path d="{path}" fill="none" stroke="{PALETTE['surface']}" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
      {''.join(chambers)}
    </g>"""


def branch_segments() -> list[tuple[float, float, float, float, int]]:
    x0, y0 = LAYOUT["fractal-branching"]
    base = (x0 + 140, y0 + 112)
    segments: list[tuple[float, float, float, float, int]] = []

    def grow_branch(x: float, y: float, length: float, angle: float, depth: int) -> None:
        x2 = x + math.cos(angle) * length
        y2 = y + math.sin(angle) * length
        segments.append((x, y, x2, y2, depth))
        if depth <= 0:
            return
        grow_branch(x2, y2, length * 0.67, angle - math.radians(28), depth - 1)
        grow_branch(x2, y2, length * 0.61, angle + math.radians(34), depth - 1)
        if depth >= 2:
            grow_branch(x2, y2, length * 0.46, angle + math.radians(5), depth - 1)

    grow_branch(base[0], base[1], 28, -math.pi / 2, 4)
    return segments


def fractal_branch_marks() -> str:
    segments = branch_segments()
    paths = []
    for index, (x1, y1, x2, y2, depth) in enumerate(segments):
        length = math.hypot(x2 - x1, y2 - y1)
        color = PALETTE["green"] if depth < 2 else PALETTE["blue"]
        paths.append(
            f"""
      <path class="fractal-branch" data-branch-index="{index}" data-depth="{depth}" pathLength="{fmt(length)}"
        d="M{fmt(x1)} {fmt(y1)}L{fmt(x2)} {fmt(y2)}" fill="none" stroke="{color}" stroke-width="{fmt(1.1 + depth * .55)}"
        stroke-linecap="round" stroke-dasharray="{fmt(length)} {fmt(length)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="{fmt(length)};0" dur=".52s" begin="{fmt(index * .015)}s" fill="freeze"/>
      </path>"""
        )
    return f"""
    <g class="archetype-visual fractal-branching-visual" data-model="recursive-branching" data-fractal-depth="4" data-branch-count="{len(segments)}">
      <line x1="{LAYOUT['fractal-branching'][0] + 76}" y1="{LAYOUT['fractal-branching'][1] + 114}"
        x2="{LAYOUT['fractal-branching'][0] + 204}" y2="{LAYOUT['fractal-branching'][1] + 114}" stroke="{PALETTE['gray200']}"/>
      {''.join(paths)}
    </g>"""


def hexagon_points(cx: float, cy: float, radius: float) -> str:
    return " ".join(
        f"{fmt(cx + radius * math.cos(math.radians(60 * i + 30)))},{fmt(cy + radius * math.sin(math.radians(60 * i + 30)))}"
        for i in range(6)
    )


def hex_packing_marks() -> str:
    x0, y0 = LAYOUT["hexagonal-packing"]
    r = 13
    dx = math.sqrt(3) * r
    dy = 1.5 * r
    cells = []
    index = 0
    for row in range(4):
        for col in range(5):
            if (row == 0 and col in (0, 4)) or (row == 3 and col in (0, 4)):
                continue
            cx = x0 + 82 + col * dx + (row % 2) * dx / 2
            cy = y0 + 45 + row * dy
            cells.append(
                f"""
      <polygon class="hex-pack-cell" data-cell-index="{index}" points="{hexagon_points(cx, cy, r)}"
        fill="{PALETTE['yellow_highlight']}" stroke="{PALETTE['gold']}" stroke-width="1.35">
        <animate attributeName="opacity" values="0;1" dur=".44s" begin="{fmt(index * .045)}s" fill="freeze"/>
      </polygon>"""
            )
            index += 1
    return f"""
    <g class="archetype-visual hexagonal-packing-visual" data-model="hexagonal-packing"
      data-neighbor-angle-degrees="120" data-circle-packing-density="{fmt(HEX_CIRCLE_PACKING_DENSITY, 12)}">
      {''.join(cells)}
    </g>"""


def voronoi_cells() -> str:
    x0, y0 = LAYOUT["voronoi-leaf-cells"]
    left, top = x0 + 38, y0 + 40
    width, height = 204, 70
    sites = [
        (24, 16),
        (55, 28),
        (91, 14),
        (132, 30),
        (170, 18),
        (31, 60),
        (75, 59),
        (116, 50),
        (154, 61),
        (194, 48),
    ]

    def clip_polygon(poly: list[tuple[float, float]], nx: float, ny: float, c: float) -> list[tuple[float, float]]:
        result: list[tuple[float, float]] = []
        for index, current in enumerate(poly):
            previous = poly[index - 1]
            dc = current[0] * nx + current[1] * ny - c
            dp = previous[0] * nx + previous[1] * ny - c
            current_inside = dc <= 1e-9
            previous_inside = dp <= 1e-9
            if current_inside != previous_inside:
                denom = (previous[0] - current[0]) * nx + (previous[1] - current[1]) * ny
                t = 0 if abs(denom) < 1e-9 else dp / denom
                result.append((previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t))
            if current_inside:
                result.append(current)
        return result

    polygons = []
    for i, site in enumerate(sites):
        poly = [(0, 0), (width, 0), (width, height), (0, height)]
        sx, sy = site
        for j, other in enumerate(sites):
            if i == j:
                continue
            ox, oy = other
            nx, ny = ox - sx, oy - sy
            c = (ox * ox + oy * oy - sx * sx - sy * sy) / 2
            poly = clip_polygon(poly, nx, ny, c)
            if not poly:
                break
        polygons.append(poly)

    path_markup = []
    for index, poly in enumerate(polygons):
        path = "M" + "L".join(f"{fmt(left + x)} {fmt(top + y)}" for x, y in poly) + "Z"
        fill = [PALETTE["blue_highlight"], PALETTE["green_highlight"], PALETTE["orange_highlight"], PALETTE["purple_highlight"]][index % 4]
        path_markup.append(
            f"""
      <path class="voronoi-leaf-cell" data-cell-index="{index}" d="{path}" fill="{fill}" stroke="{PALETTE['green']}" stroke-width=".95">
        <animate attributeName="opacity" values="0;1" dur=".5s" begin="{fmt(index * .05)}s" fill="freeze"/>
      </path>"""
        )
    site_markup = [
        f'<circle class="voronoi-site" data-site-index="{i}" cx="{fmt(left + x)}" cy="{fmt(top + y)}" r="2.3" fill="{PALETTE["green"]}"/>'
        for i, (x, y) in enumerate(sites)
    ]
    return f"""
    <g class="archetype-visual voronoi-leaf-cells-visual" data-model="voronoi" data-site-count="{len(sites)}">
      <path d="M{left},{top + 35}C{left + 22},{top - 6} {left + 182},{top - 6} {left + width},{top + 35}C{left + 182},{top + 76} {left + 20},{top + 74} {left},{top + 35}Z"
        fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.4"/>
      {''.join(path_markup)}
      {''.join(site_markup)}
      <path d="M{left + 12},{top + 35}C{left + 58},{top + 30} {left + 139},{top + 41} {left + 192},{top + 34}" fill="none"
        stroke="{PALETTE['green']}" stroke-width="1.2" stroke-dasharray="4 5"/>
    </g>"""


def build_html() -> str:
    verify_constants()
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Natural Math Archetypes</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {PALETTE['gray50']};
      color: {PALETTE['ink']};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw - 28px, 1120px);
      height: auto;
      display: block;
      background: {PALETTE['surface']};
    }}
    text {{ font-family: "Open Sans", Arial, sans-serif; }}
    .root-title {{ fill: {PALETTE['ink']}; font-size: 25px; font-weight: 850; }}
    .root-subtitle {{ fill: {PALETTE['muted']}; font-size: 13px; font-weight: 700; }}
    .panel-title {{ fill: {PALETTE['ink']}; font-size: 14px; font-weight: 850; }}
    .tiny-label {{ fill: {PALETTE['ink']}; font-size: 8.8px; font-weight: 800; }}
    .natural-archetype, .archetype-visual {{ transform-box: fill-box; transform-origin: center; }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{ dur: 1ms; }}
    }}
  </style>
</head>
<body>
  <svg id="nature-geometry" data-pattern-id="d3-nature-geometry"
    data-pattern-family="natural-math" data-archetype-count="6" data-theory-of-three="invariant-rule-nature"
    data-phi="{fmt(PHI, 12)}" data-pi="{fmt(math.pi, 12)}" data-golden-angle-degrees="{fmt(math.degrees(GOLDEN_ANGLE), 9)}"
    data-hex-circle-packing-density="{fmt(HEX_CIRCLE_PACKING_DENSITY, 12)}"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="nature-geometry-title nature-geometry-desc">
    <title id="nature-geometry-title">Natural math archetypes</title>
    <desc id="nature-geometry-desc">Six mathematically specified natural archetypes shown as invariant, generative rule, and natural expression: golden-angle phyllotaxis, pi circular waves, logarithmic shell spirals, fractal branching, hexagonal packing, and Voronoi leaf cells.</desc>
    <rect x="24" y="22" width="{WIDTH - 48}" height="{HEIGHT - 44}" rx="12" fill="{PALETTE['gray50']}" stroke="{PALETTE['gray200']}" stroke-width="1.4"/>
    <text class="root-title" x="44" y="55">Natural math archetypes for the theory of three</text>
    <text class="root-subtitle" x="44" y="78">Each panel keeps a three-part contract: invariant, generative rule, natural expression.</text>
    {panel_shell('golden-angle-phyllotaxis', 'Golden-angle phyllotaxis', 'phi and 137.507764 deg', 'theta=n*pi*(3-sqrt(5))', 'seed head or rosette')}
    {panel_shell('pi-circular-wave', 'Pi circular wave', 'C=2*pi*r', 'equal radius expansion', 'ripples and rings')}
    {panel_shell('logarithmic-spiral-shell', 'Logarithmic spiral', 'r=a*exp(b*theta)', 'constant-angle growth', 'shell-like accretion')}
    {panel_shell('fractal-branching', 'Fractal branching', 'self-similar scale', 'recursive bifurcation', 'ferns, trees, rivers')}
    {panel_shell('hexagonal-packing', 'Hexagonal packing', 'pi/(2*sqrt(3))', 'six-neighbor tiling', 'honeycomb cells')}
    {panel_shell('voronoi-leaf-cells', 'Voronoi cell field', 'nearest-site boundary', 'perpendicular bisectors', 'leaf pavement cells')}
    {phyllotaxis_marks()}
    {circular_wave_marks()}
    {logarithmic_spiral_marks()}
    {fractal_branch_marks()}
    {hex_packing_marks()}
    {voronoi_cells()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Natural Math Archetypes SVG/HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8", newline="\n")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
