#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Organic Growth Patterns animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
import math
from pathlib import Path


WIDTH = 960
HEIGHT = 700
PANEL_W = 410
PANEL_H = 250

PALETTE = {
    "blue": "#007298",
    "green": "#45842a",
    "purple": "#652f6c",
    "orange": "#e77204",
    "red": "#9e1b32",
    "gold": "#f1c319",
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
    "yellow_highlight": "#fff4cc",
}

PANEL_LAYOUT = {
    "phyllotaxis": (50, 82),
    "lsystem": (500, 82),
    "reaction": (50, 386),
    "dla": (500, 386),
}


class Rng:
    def __init__(self, seed: int) -> None:
        self.state = seed & 0x7FFFFFFF

    def random(self) -> float:
        self.state = (1103515245 * self.state + 12345) & 0x7FFFFFFF
        return self.state / 0x80000000

    def choice(self, items: list[tuple[int, int]]) -> tuple[int, int]:
        return items[int(self.random() * len(items)) % len(items)]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * max(0.0, min(1.0, t)))


def mix_hex(start: str, end: str, t: float) -> str:
    start = start.lstrip("#")
    end = end.lstrip("#")
    sr, sg, sb = int(start[0:2], 16), int(start[2:4], 16), int(start[4:6], 16)
    er, eg, eb = int(end[0:2], 16), int(end[2:4], 16), int(end[4:6], 16)
    return f"#{lerp(sr, er, t):02x}{lerp(sg, eg, t):02x}{lerp(sb, eb, t):02x}"


def panel_frame(panel_id: str, title: str, subtitle: str) -> str:
    x, y = PANEL_LAYOUT[panel_id]
    return f"""
    <g class="organic-panel" data-panel-id="{panel_id}" transform="translate({x} {y})">
      <rect width="{PANEL_W}" height="{PANEL_H}" rx="8" fill="{PALETTE['surface']}" stroke="{PALETTE['gray200']}" stroke-width="1.4"/>
      <text class="panel-title" x="18" y="28">{esc(title)}</text>
      <text class="panel-subtitle" x="18" y="48">{esc(subtitle)}</text>
    </g>"""


def phyllotaxis_markup() -> str:
    x0, y0 = PANEL_LAYOUT["phyllotaxis"]
    cx = x0 + PANEL_W / 2
    cy = y0 + 150
    golden_angle = math.radians(137.507764)
    colors = [PALETTE["blue"], PALETTE["green"], PALETTE["orange"], PALETTE["purple"]]
    seeds: list[str] = []
    count = 170
    for index in range(count):
        theta = index * golden_angle
        radius = 5.2 * math.sqrt(index)
        x = cx + radius * math.cos(theta)
        y = cy + radius * math.sin(theta)
        seed_radius = 2.2 + 1.15 * (1 - index / count)
        delay = 0.06 + index * 0.0045
        color = colors[(index // 13) % len(colors)]
        seeds.append(
            f"""
      <circle class="organic-seed" data-seed-index="{index}" data-divergence-degrees="137.507764"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(seed_radius)}" fill="{color}" fill-opacity=".9"
        stroke="#ffffff" stroke-width=".45">
        <animate attributeName="r" values="0;{fmt(seed_radius)}" dur=".38s" begin="{fmt(delay)}s" fill="freeze"/>
        <animate attributeName="opacity" values="0;1" dur=".28s" begin="{fmt(delay)}s" fill="freeze"/>
      </circle>"""
        )
    return f"""
    <g class="organic-variant phyllotaxis-seed-head" data-pattern-id="d3-phyllotaxis-seed-head"
      data-pattern-family="organic-growth" data-seed-count="{count}" data-divergence-degrees="137.507764">
      <circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="92" fill="{PALETTE['yellow_highlight']}" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="64" fill="none" stroke="{PALETTE['gray200']}" stroke-dasharray="4 6"/>
      {''.join(seeds)}
      <text class="organic-caption" x="{fmt(x0 + 24)}" y="{fmt(y0 + PANEL_H - 20)}">golden-angle seed packing</text>
    </g>"""


def expand_lsystem(axiom: str, rules: dict[str, str], iterations: int) -> str:
    current = axiom
    for _ in range(iterations):
        current = "".join(rules.get(symbol, symbol) for symbol in current)
    return current


def lsystem_segments() -> list[dict[str, float]]:
    sentence = expand_lsystem("F", {"F": "F[+F]F[-F]F"}, 3)
    angle = math.radians(24)
    step = 7.2
    x = 0.0
    y = 0.0
    heading = -math.pi / 2
    depth = 0
    stack: list[tuple[float, float, float, int]] = []
    segments: list[dict[str, float]] = []
    for symbol in sentence:
        if symbol == "F":
            length = step * (0.93 ** depth)
            nx = x + math.cos(heading) * length
            ny = y + math.sin(heading) * length
            segments.append({"x1": x, "y1": y, "x2": nx, "y2": ny, "depth": depth, "order": len(segments)})
            x, y = nx, ny
        elif symbol == "+":
            heading += angle
        elif symbol == "-":
            heading -= angle
        elif symbol == "[":
            stack.append((x, y, heading, depth))
            depth += 1
        elif symbol == "]" and stack:
            x, y, heading, depth = stack.pop()
    return segments


def lsystem_markup() -> str:
    x0, y0 = PANEL_LAYOUT["lsystem"]
    segments = lsystem_segments()
    min_x = min(min(segment["x1"], segment["x2"]) for segment in segments)
    max_x = max(max(segment["x1"], segment["x2"]) for segment in segments)
    min_y = min(min(segment["y1"], segment["y2"]) for segment in segments)
    max_y = max(max(segment["y1"], segment["y2"]) for segment in segments)
    scale = min(320 / (max_x - min_x), 168 / (max_y - min_y))
    offset_x = x0 + PANEL_W / 2 - (min_x + max_x) * scale / 2
    offset_y = y0 + 222 - max_y * scale
    paths: list[str] = []
    for segment in segments:
        x1 = offset_x + segment["x1"] * scale
        y1 = offset_y + segment["y1"] * scale
        x2 = offset_x + segment["x2"] * scale
        y2 = offset_y + segment["y2"] * scale
        depth = int(segment["depth"])
        order = int(segment["order"])
        color = PALETTE["green"] if depth >= 2 else PALETTE["blue"]
        width = max(0.75, 4.4 - depth * 0.72)
        length = math.hypot(x2 - x1, y2 - y1)
        delay = 0.05 + order * 0.006
        paths.append(
            f"""
      <path class="organic-branch" data-branch-index="{order}" data-branch-depth="{depth}"
        d="M{fmt(x1)} {fmt(y1)}L{fmt(x2)} {fmt(y2)}" fill="none" stroke="{color}"
        stroke-width="{fmt(width)}" stroke-linecap="round" pathLength="{fmt(length)}"
        stroke-dasharray="{fmt(length)} {fmt(length)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="{fmt(length)};0" dur=".68s" begin="{fmt(delay)}s" fill="freeze"/>
      </path>"""
        )
    tips = sorted(segments, key=lambda item: item["y2"])[:18]
    leaves = []
    for index, segment in enumerate(tips):
        x = offset_x + segment["x2"] * scale
        y = offset_y + segment["y2"] * scale
        leaves.append(
            f"""
      <ellipse class="organic-leaf" data-leaf-index="{index}" cx="{fmt(x)}" cy="{fmt(y)}"
        rx="0" ry="0" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width=".8">
        <animate attributeName="rx" values="0;5.6" dur=".42s" begin="{fmt(0.9 + index * 0.025)}s" fill="freeze"/>
        <animate attributeName="ry" values="0;2.7" dur=".42s" begin="{fmt(0.9 + index * 0.025)}s" fill="freeze"/>
      </ellipse>"""
        )
    return f"""
    <g class="organic-variant lsystem-canopy" data-pattern-id="d3-lsystem-canopy"
      data-pattern-family="organic-growth" data-grammar="F[+F]F[-F]F" data-iteration-count="3"
      data-branch-count="{len(segments)}">
      <line x1="{fmt(x0 + 66)}" y1="{fmt(y0 + 224)}" x2="{fmt(x0 + PANEL_W - 66)}" y2="{fmt(y0 + 224)}"
        stroke="{PALETTE['gray200']}" stroke-width="1"/>
      {''.join(paths)}
      {''.join(leaves)}
      <text class="organic-caption" x="{fmt(x0 + 24)}" y="{fmt(y0 + PANEL_H - 20)}">bracketed L-system canopy</text>
    </g>"""


def simulate_gray_scott(cols: int = 56, rows: int = 34, steps: int = 82) -> list[list[float]]:
    u = [[1.0 for _ in range(cols)] for _ in range(rows)]
    v = [[0.0 for _ in range(cols)] for _ in range(rows)]
    seeds = [(cols // 2, rows // 2, 5), (cols // 3, rows // 2 + 3, 3), (cols * 2 // 3, rows // 2 - 3, 3)]
    for cx, cy, radius in seeds:
        for y in range(max(1, cy - radius), min(rows - 1, cy + radius + 1)):
            for x in range(max(1, cx - radius), min(cols - 1, cx + radius + 1)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= radius**2:
                    u[y][x] = 0.45
                    v[y][x] = 0.82
    du = 1.0
    dv = 0.5
    feed = 0.0367
    kill = 0.0649
    weights = [(-1, -1, 0.05), (0, -1, 0.2), (1, -1, 0.05), (-1, 0, 0.2), (0, 0, -1.0), (1, 0, 0.2), (-1, 1, 0.05), (0, 1, 0.2), (1, 1, 0.05)]
    for _ in range(steps):
        next_u = [row[:] for row in u]
        next_v = [row[:] for row in v]
        for y in range(1, rows - 1):
            for x in range(1, cols - 1):
                lap_u = sum(u[y + dy][x + dx] * weight for dx, dy, weight in weights)
                lap_v = sum(v[y + dy][x + dx] * weight for dx, dy, weight in weights)
                reaction = u[y][x] * v[y][x] * v[y][x]
                next_u[y][x] = min(1.0, max(0.0, u[y][x] + (du * lap_u - reaction + feed * (1.0 - u[y][x]))))
                next_v[y][x] = min(1.0, max(0.0, v[y][x] + (dv * lap_v + reaction - (feed + kill) * v[y][x])))
        u, v = next_u, next_v
    return v


def reaction_diffusion_markup() -> str:
    x0, y0 = PANEL_LAYOUT["reaction"]
    grid = simulate_gray_scott()
    rows = len(grid)
    cols = len(grid[0])
    cell = 5.2
    gx = x0 + 48
    gy = y0 + 64
    max_v = max(max(row) for row in grid)
    cells: list[str] = []
    for row_index, row in enumerate(grid):
        for col_index, value in enumerate(row):
            normalized = 0 if max_v == 0 else value / max_v
            if normalized < 0.035:
                fill = PALETTE["gray50"]
                opacity = 0.28
            else:
                fill = mix_hex(PALETTE["blue_highlight"], PALETTE["purple"], min(1, normalized * 1.18))
                opacity = 0.58 + min(0.36, normalized * 0.36)
            cells.append(
                f"""
      <rect class="organic-rd-cell" data-row="{row_index}" data-col="{col_index}"
        data-concentration="{fmt(value)}" x="{fmt(gx + col_index * cell)}" y="{fmt(gy + row_index * cell)}"
        width="{fmt(cell + 0.35)}" height="{fmt(cell + 0.35)}" fill="{fill}" opacity="{fmt(opacity)}"/>"""
            )
    sweep_x = gx + cols * cell + 8
    return f"""
    <g class="organic-variant reaction-diffusion-field" data-pattern-id="d3-reaction-diffusion-field"
      data-pattern-family="organic-growth" data-model="gray-scott" data-feed-rate="0.0367"
      data-kill-rate="0.0649" data-grid-size="{cols}x{rows}" data-step-count="82">
      <rect x="{fmt(gx - 5)}" y="{fmt(gy - 5)}" width="{fmt(cols * cell + 10)}" height="{fmt(rows * cell + 10)}"
        fill="{PALETTE['gray50']}" stroke="{PALETTE['gray200']}" stroke-width="1"/>
      <g class="organic-rd-cells">
      {''.join(cells)}
        <animate attributeName="opacity" values=".25;1" dur=".9s" begin=".1s" fill="freeze"/>
      </g>
      <line class="organic-rd-sweep" x1="{fmt(gx - 6)}" y1="{fmt(gy - 8)}" x2="{fmt(gx - 6)}" y2="{fmt(gy + rows * cell + 8)}"
        stroke="{PALETTE['orange']}" stroke-width="3" stroke-linecap="round" opacity=".78">
        <animate attributeName="x1" values="{fmt(gx - 6)};{fmt(sweep_x)}" dur="1.7s" begin=".18s" fill="freeze"/>
        <animate attributeName="x2" values="{fmt(gx - 6)};{fmt(sweep_x)}" dur="1.7s" begin=".18s" fill="freeze"/>
      </line>
      <text class="organic-caption" x="{fmt(x0 + 24)}" y="{fmt(y0 + PANEL_H - 20)}">Gray-Scott activator field</text>
    </g>"""


NEIGHBORS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]
STEPS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def generate_dla(count: int = 150) -> list[dict[str, object]]:
    rng = Rng(20260628)
    occupied: dict[tuple[int, int], int] = {(0, 0): 0}
    particles: list[dict[str, object]] = [{"x": 0, "y": 0, "parent": None, "order": 0}]
    max_radius = 4.0
    attempts = 0
    while len(particles) < count and attempts < count * 180:
        attempts += 1
        launch = max_radius + 7 + rng.random() * 4
        angle = rng.random() * math.tau
        x = round(math.cos(angle) * launch)
        y = round(math.sin(angle) * launch)
        kill_radius = launch + 18
        for _ in range(2600):
            adjacent = [(x + dx, y + dy) for dx, dy in NEIGHBORS if (x + dx, y + dy) in occupied]
            if adjacent and (x, y) not in occupied:
                parent_point = min(adjacent, key=lambda point: (x - point[0]) ** 2 + (y - point[1]) ** 2)
                order = len(particles)
                occupied[(x, y)] = order
                particles.append({"x": x, "y": y, "parent": occupied[parent_point], "order": order})
                max_radius = max(max_radius, math.hypot(x, y))
                break
            dx, dy = rng.choice(STEPS)
            x += dx
            y += dy
            if math.hypot(x, y) > kill_radius:
                angle = rng.random() * math.tau
                x = round(math.cos(angle) * launch)
                y = round(math.sin(angle) * launch)
    return particles


def dla_markup() -> str:
    x0, y0 = PANEL_LAYOUT["dla"]
    particles = generate_dla()
    xs = [int(p["x"]) for p in particles]
    ys = [int(p["y"]) for p in particles]
    scale = min(308 / (max(xs) - min(xs) + 1), 168 / (max(ys) - min(ys) + 1))
    cx = x0 + PANEL_W / 2 - (min(xs) + max(xs)) * scale / 2
    cy = y0 + 144 - (min(ys) + max(ys)) * scale / 2
    point_by_order = {int(p["order"]): p for p in particles}
    links: list[str] = []
    nodes: list[str] = []
    for particle in particles[1:]:
        order = int(particle["order"])
        parent = point_by_order[int(particle["parent"])]
        x1 = cx + int(parent["x"]) * scale
        y1 = cy + int(parent["y"]) * scale
        x2 = cx + int(particle["x"]) * scale
        y2 = cy + int(particle["y"]) * scale
        length = math.hypot(x2 - x1, y2 - y1)
        delay = 0.08 + order * 0.008
        links.append(
            f"""
      <path class="organic-dla-link" data-particle-index="{order}" data-parent-index="{particle['parent']}"
        d="M{fmt(x1)} {fmt(y1)}L{fmt(x2)} {fmt(y2)}" fill="none" stroke="{PALETTE['gray300']}"
        stroke-width="1.15" pathLength="{fmt(length)}" stroke-dasharray="{fmt(length)} {fmt(length)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="{fmt(length)};0" dur=".36s" begin="{fmt(delay)}s" fill="freeze"/>
      </path>"""
        )
    for particle in particles:
        order = int(particle["order"])
        x = cx + int(particle["x"]) * scale
        y = cy + int(particle["y"]) * scale
        t = order / max(1, len(particles) - 1)
        color = mix_hex(PALETTE["blue"], PALETTE["green"], min(1, t * 1.2))
        if t > 0.72:
            color = mix_hex(PALETTE["green"], PALETTE["orange"], (t - 0.72) / 0.28)
        radius = 2.25 if order else 4.8
        delay = 0.04 + order * 0.008
        nodes.append(
            f"""
      <circle class="organic-aggregate-particle" data-particle-index="{order}" data-parent-index="{particle['parent'] if particle['parent'] is not None else ''}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(radius)}" fill="{color}" stroke="#ffffff" stroke-width=".65">
        <animate attributeName="r" values="0;{fmt(radius)}" dur=".3s" begin="{fmt(delay)}s" fill="freeze"/>
      </circle>"""
        )
    return f"""
    <g class="organic-variant diffusion-limited-aggregation" data-pattern-id="d3-diffusion-limited-aggregation"
      data-pattern-family="organic-growth" data-particle-count="{len(particles)}" data-seed="20260628">
      <circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="98" fill="none" stroke="{PALETTE['gray100']}" stroke-width="1.1"/>
      <g class="organic-dla-links">{''.join(links)}</g>
      <g class="organic-dla-particles">{''.join(nodes)}</g>
      <text class="organic-caption" x="{fmt(x0 + 24)}" y="{fmt(y0 + PANEL_H - 20)}">random-walk aggregation</text>
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Organic Growth Patterns</title>
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
      width: min(100vw - 32px, 1120px);
      height: auto;
      display: block;
      background: {PALETTE['surface']};
    }}
    text {{
      font-family: "Open Sans", Arial, sans-serif;
    }}
    .root-title {{
      fill: {PALETTE['ink']};
      font-size: 23px;
      font-weight: 800;
    }}
    .root-subtitle,
    .panel-subtitle,
    .organic-caption {{
      fill: {PALETTE['gray600']};
      font-size: 12px;
      font-weight: 700;
    }}
    .panel-title {{
      fill: {PALETTE['ink']};
      font-size: 15px;
      font-weight: 800;
    }}
    .organic-caption {{
      paint-order: stroke;
      stroke: {PALETTE['surface']};
      stroke-width: 4px;
      stroke-linejoin: round;
    }}
    .organic-seed,
    .organic-leaf,
    .organic-aggregate-particle {{
      filter: drop-shadow(0 1px 0 rgba(51, 62, 72, .12));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
    }}
  </style>
</head>
<body>
  <svg id="organic-growth" data-pattern-id="d3-organic-growth"
    data-pattern-family="organic-growth" data-variant-count="4" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="organic-growth-title organic-growth-desc">
    <title id="organic-growth-title">Organic growth patterns</title>
    <desc id="organic-growth-desc">Four deterministic organic mathematics patterns: phyllotaxis seed packing, bracketed L-system branching, Gray-Scott reaction diffusion, and diffusion-limited aggregation.</desc>
    <rect x="22" y="20" width="{WIDTH - 44}" height="{HEIGHT - 40}" rx="10" fill="{PALETTE['gray50']}" stroke="{PALETTE['gray200']}" stroke-width="1.4"/>
    <text class="root-title" x="50" y="50">Organic growth pattern lab</text>
    <text class="root-subtitle" x="50" y="70">Fractal, botanical, and morphogenesis rules converted into D3-ready SVG contracts.</text>
    {panel_frame('phyllotaxis', 'Phyllotaxis seed head', 'golden angle, radial packing')}
    {panel_frame('lsystem', 'L-system canopy', 'parallel rewrite, turtle branches')}
    {panel_frame('reaction', 'Reaction diffusion field', 'Gray-Scott feed and kill rates')}
    {panel_frame('dla', 'Diffusion-limited aggregation', 'walkers attach to a growing cluster')}
    {phyllotaxis_markup()}
    {lsystem_markup()}
    {reaction_diffusion_markup()}
    {dla_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Organic Growth Patterns D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
