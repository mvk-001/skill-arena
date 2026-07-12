#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Rotating Dot Rings animated SVG HTML file."""

from __future__ import annotations

import argparse
import math
from pathlib import Path


WIDTH = 1000
HEIGHT = 560
RING_COUNT = 12
GAP_PERCENT = 0.07
GAP_CENTER_DEGREES = -48.0

PALETTE = {
    "surface": "#ffffff",
    "ink": "#333e48",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
}


def fmt(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def angular_distance(a: float, b: float) -> float:
    return abs((a - b + math.pi) % math.tau - math.pi)


def ring_specs(
    width: int = WIDTH,
    height: int = HEIGHT,
    ring_count: int = RING_COUNT,
    gap_percent: float = GAP_PERCENT,
    gap_center_degrees: float = GAP_CENTER_DEGREES,
) -> list[dict[str, object]]:
    center_x = width / 2
    center_y = height / 2
    max_radius = min(width, height) * 0.43
    min_radius = max_radius * 0.11
    gap_center = math.radians(gap_center_degrees)
    specs: list[dict[str, object]] = []
    for index in range(ring_count):
        t = index / max(ring_count - 1, 1)
        radius = min_radius + (max_radius - min_radius) * (t**1.08)
        target_spacing = 10.8 + 3.9 * t
        source_dot_count = max(12, round(math.tau * radius / target_spacing))
        if source_dot_count % 2:
            source_dot_count += 1
        gap_dot_count = max(1, round(source_dot_count * gap_percent))
        direction = "clockwise" if index % 2 == 0 else "counterclockwise"
        dot_radius = 1.15 + 1.85 * (t**0.82)
        opacity = 0.14 + 0.24 * (t**0.85)
        phase = index * 0.37
        omitted_indexes = set(
            sorted(
                range(source_dot_count),
                key=lambda dot_index: angular_distance(math.tau * dot_index / source_dot_count + phase, gap_center),
            )[:gap_dot_count]
        )
        dots = []
        for dot_index in range(source_dot_count):
            if dot_index in omitted_indexes:
                continue
            theta = math.tau * dot_index / source_dot_count + phase
            size_wave = 0.88 + 0.16 * math.sin(theta * 3 + index * 0.72)
            opacity_wave = 0.82 + 0.18 * math.cos(theta * 2 - index * 0.4)
            dots.append(
                {
                    "source_index": dot_index,
                    "visible_index": len(dots),
                    "x": radius * math.cos(theta),
                    "y": radius * math.sin(theta),
                    "r": dot_radius * size_wave,
                    "opacity": opacity * opacity_wave,
                }
            )
        specs.append(
            {
                "index": index,
                "radius": radius,
                "source_dot_count": source_dot_count,
                "gap_dot_count": gap_dot_count,
                "dot_count": len(dots),
                "direction": direction,
                "duration": 30 + index * 4.6,
                "fill": PALETTE["gray200"] if index < ring_count * 0.66 else PALETTE["gray300"],
                "gap_percent": gap_percent,
                "gap_center_degrees": gap_center_degrees,
                "center_x": center_x,
                "center_y": center_y,
                "dots": dots,
            }
        )
    return specs


def dot_markup(ring: dict[str, object]) -> str:
    fill = str(ring["fill"])
    dots = []
    for dot in ring["dots"]:
        dots.append(
            f"""        <circle class="rotating-dot" data-dot-index="{int(dot['source_index'])}"
          data-visible-dot-index="{int(dot['visible_index'])}" cx="{fmt(float(dot['x']))}" cy="{fmt(float(dot['y']))}"
          r="{fmt(float(dot['r']))}" fill="{fill}" opacity="{fmt(float(dot['opacity']), 4)}"/>"""
        )
    return "\n".join(dots)


def ring_markup(ring: dict[str, object]) -> str:
    direction = str(ring["direction"])
    duration = float(ring["duration"])
    to_angle = 360 if direction == "clockwise" else -360
    return f"""
      <g class="dot-ring dot-ring-{direction}" data-ring-index="{int(ring['index'])}"
        data-direction="{direction}" data-radius="{fmt(float(ring['radius']))}"
        data-dot-count="{int(ring['dot_count'])}" data-source-dot-count="{int(ring['source_dot_count'])}"
        data-gap-dot-count="{int(ring['gap_dot_count'])}" data-gap-percent="{fmt(float(ring['gap_percent']), 4)}"
        data-gap-sector-center-degrees="{fmt(float(ring['gap_center_degrees']))}" data-duration-seconds="{fmt(duration)}">
        <animateTransform attributeName="transform" attributeType="XML" type="rotate"
          from="0 0 0" to="{to_angle} 0 0" dur="{fmt(duration)}s" repeatCount="indefinite"/>
{dot_markup(ring)}
      </g>"""


def build_html(
    width: int = WIDTH,
    height: int = HEIGHT,
    ring_count: int = RING_COUNT,
    gap_percent: float = GAP_PERCENT,
    gap_center_degrees: float = GAP_CENTER_DEGREES,
) -> str:
    center_x = width / 2
    center_y = height / 2
    rings = ring_specs(width, height, ring_count, gap_percent, gap_center_degrees)
    ring_nodes = "\n".join(ring_markup(ring) for ring in rings)
    total_dots = sum(int(ring["dot_count"]) for ring in rings)
    source_dots = sum(int(ring["source_dot_count"]) for ring in rings)
    gap_dots = sum(int(ring["gap_dot_count"]) for ring in rings)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rotating Dot Rings</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {PALETTE["surface"]};
      color: {PALETTE["ink"]};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw, {width}px);
      height: auto;
      display: block;
      background: {PALETTE["surface"]};
    }}
    .rotating-dot {{
      shape-rendering: geometricPrecision;
    }}
    .center-pin {{
      fill: {PALETTE["gray100"]};
      opacity: .72;
    }}
    @media (prefers-reduced-motion: reduce) {{
      animateTransform {{
        display: none;
      }}
    }}
  </style>
</head>
<body>
  <svg id="rotating-dot-rings" data-pattern-id="d3-rotating-dot-rings"
    data-pattern-family="radial-dot-field" data-ring-count="{ring_count}"
    data-dot-count="{total_dots}" data-source-dot-count="{source_dots}" data-gap-dot-count="{gap_dots}"
    data-gap-percent="{fmt(gap_percent, 4)}" data-gap-sector-center-degrees="{fmt(gap_center_degrees)}"
    data-direction-rule="alternating-clockwise-counterclockwise"
    viewBox="0 0 {width} {height}" role="img"
    aria-labelledby="rotating-dot-rings-title rotating-dot-rings-desc">
    <title id="rotating-dot-rings-title">Rotating dot rings</title>
    <desc id="rotating-dot-rings-desc">A white radial field of concentric dotted rings. Each ring is made from discrete gray points, has a small omitted sector for white space, and adjacent rings rotate in alternating clockwise and counterclockwise directions.</desc>
    <rect width="{width}" height="{height}" fill="{PALETTE["surface"]}"/>
    <g class="dot-ring-field" transform="translate({fmt(center_x)} {fmt(center_y)})">
{ring_nodes}
      <circle class="center-pin" data-center-role="quiet-origin" cx="0" cy="0" r="2.4"/>
    </g>
  </svg>
</body>
</html>
"""


def build_d3_renderer(gap_percent: float = GAP_PERCENT, gap_center_degrees: float = GAP_CENTER_DEGREES) -> str:
    return f"""/*
 * D3 renderer for d3-rotating-dot-rings.
 * Requires D3 v7 as globalThis.d3 or options.d3.
 */
(function attachRotatingDotRingsRenderer(global) {{
  const palette = {{
    surface: "{PALETTE['surface']}",
    ink: "{PALETTE['ink']}",
    gray100: "{PALETTE['gray100']}",
    gray200: "{PALETTE['gray200']}",
    gray300: "{PALETTE['gray300']}"
  }};

  function angularDistance(a, b) {{
    return Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI);
  }}

  function ringSpecs(width, height, ringCount, gapPercent = {fmt(gap_percent, 4)}, gapCenterDegrees = {fmt(gap_center_degrees)}) {{
    const maxRadius = Math.min(width, height) * 0.43;
    const minRadius = maxRadius * 0.11;
    const gapCenter = gapCenterDegrees * Math.PI / 180;
    return Array.from({{ length: ringCount }}, (_, index) => {{
      const t = index / Math.max(ringCount - 1, 1);
      const radius = minRadius + (maxRadius - minRadius) * Math.pow(t, 1.08);
      const targetSpacing = 10.8 + 3.9 * t;
      let sourceDotCount = Math.max(12, Math.round(Math.PI * 2 * radius / targetSpacing));
      if (sourceDotCount % 2) sourceDotCount += 1;
      const direction = index % 2 === 0 ? "clockwise" : "counterclockwise";
      const dotRadius = 1.15 + 1.85 * Math.pow(t, 0.82);
      const opacity = 0.14 + 0.24 * Math.pow(t, 0.85);
      const phase = index * 0.37;
      const gapDotCount = Math.max(1, Math.round(sourceDotCount * gapPercent));
      const omittedIndexes = new Set(Array.from({{ length: sourceDotCount }}, (_, dotIndex) => dotIndex)
        .sort((a, b) =>
          angularDistance(Math.PI * 2 * a / sourceDotCount + phase, gapCenter) -
          angularDistance(Math.PI * 2 * b / sourceDotCount + phase, gapCenter)
        )
        .slice(0, gapDotCount));
      const dots = [];
      for (let dotIndex = 0; dotIndex < sourceDotCount; dotIndex += 1) {{
        if (omittedIndexes.has(dotIndex)) continue;
        const theta = Math.PI * 2 * dotIndex / sourceDotCount + phase;
        const sizeWave = 0.88 + 0.16 * Math.sin(theta * 3 + index * 0.72);
        const opacityWave = 0.82 + 0.18 * Math.cos(theta * 2 - index * 0.4);
        dots.push({{
          sourceIndex: dotIndex,
          visibleIndex: dots.length,
          x: radius * Math.cos(theta),
          y: radius * Math.sin(theta),
          r: dotRadius * sizeWave,
          opacity: opacity * opacityWave
        }});
      }}
      return {{
        index,
        radius,
        sourceDotCount,
        gapDotCount,
        dotCount: dots.length,
        direction,
        duration: 30 + index * 4.6,
        fill: index < ringCount * 0.66 ? palette.gray200 : palette.gray300,
        gapPercent,
        gapCenterDegrees,
        dots
      }};
    }});
  }}

  function renderRotatingDotRings(target, options = {{}}) {{
    const d3 = options.d3 || global.d3;
    if (!d3) {{
      throw new Error("renderRotatingDotRings requires D3 v7 as globalThis.d3 or options.d3.");
    }}

    const width = options.width || {WIDTH};
    const height = options.height || {HEIGHT};
    const ringCount = options.ringCount || {RING_COUNT};
    const gapPercent = options.gapPercent ?? {fmt(gap_percent, 4)};
    const gapCenterDegrees = options.gapCenterDegrees ?? {fmt(gap_center_degrees)};
    const rings = ringSpecs(width, height, ringCount, gapPercent, gapCenterDegrees);
    const totalDots = rings.reduce((sum, ring) => sum + ring.dotCount, 0);
    const sourceDots = rings.reduce((sum, ring) => sum + ring.sourceDotCount, 0);
    const gapDots = rings.reduce((sum, ring) => sum + ring.gapDotCount, 0);
    const svg = typeof target === "string" ? d3.select(target) : d3.select(target);

    svg.selectAll("*").remove();
    svg
      .attr("id", options.id || "rotating-dot-rings")
      .attr("data-pattern-id", "d3-rotating-dot-rings")
      .attr("data-pattern-family", "radial-dot-field")
      .attr("data-ring-count", ringCount)
      .attr("data-dot-count", totalDots)
      .attr("data-source-dot-count", sourceDots)
      .attr("data-gap-dot-count", gapDots)
      .attr("data-gap-percent", gapPercent)
      .attr("data-gap-sector-center-degrees", gapCenterDegrees)
      .attr("data-direction-rule", "alternating-clockwise-counterclockwise")
      .attr("viewBox", `0 0 ${{width}} ${{height}}`)
      .attr("role", "img")
      .attr("aria-labelledby", "rotating-dot-rings-title rotating-dot-rings-desc");

    svg.append("title")
      .attr("id", "rotating-dot-rings-title")
      .text("Rotating dot rings");
    svg.append("desc")
      .attr("id", "rotating-dot-rings-desc")
      .text("Concentric dotted rings rotate in alternating clockwise and counterclockwise directions.");
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", palette.surface);

    const field = svg.append("g")
      .attr("class", "dot-ring-field")
      .attr("transform", `translate(${{width / 2}} ${{height / 2}})`);

    const ring = field.selectAll("g.dot-ring")
      .data(rings, d => d.index)
      .join("g")
      .attr("class", d => `dot-ring dot-ring-${{d.direction}}`)
      .attr("data-ring-index", d => d.index)
      .attr("data-direction", d => d.direction)
      .attr("data-radius", d => d.radius.toFixed(3))
      .attr("data-dot-count", d => d.dotCount)
      .attr("data-source-dot-count", d => d.sourceDotCount)
      .attr("data-gap-dot-count", d => d.gapDotCount)
      .attr("data-gap-percent", d => d.gapPercent)
      .attr("data-gap-sector-center-degrees", d => d.gapCenterDegrees)
      .attr("data-duration-seconds", d => d.duration.toFixed(3));

    ring.append("animateTransform")
      .attr("attributeName", "transform")
      .attr("attributeType", "XML")
      .attr("type", "rotate")
      .attr("from", "0 0 0")
      .attr("to", d => `${{d.direction === "clockwise" ? 360 : -360}} 0 0`)
      .attr("dur", d => `${{d.duration}}s`)
      .attr("repeatCount", "indefinite");

    ring.each(function drawDots(d) {{
      d3.select(this).selectAll("circle.rotating-dot")
        .data(d.dots, dot => dot.sourceIndex)
        .join("circle")
        .attr("class", "rotating-dot")
        .attr("data-dot-index", dot => dot.sourceIndex)
        .attr("data-visible-dot-index", dot => dot.visibleIndex)
        .attr("cx", dot => dot.x)
        .attr("cy", dot => dot.y)
        .attr("r", dot => dot.r)
        .attr("fill", d.fill)
        .attr("opacity", dot => dot.opacity);
    }});

    field.append("circle")
      .attr("class", "center-pin")
      .attr("data-center-role", "quiet-origin")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 2.4)
      .attr("fill", palette.gray100)
      .attr("opacity", 0.72);

    return {{ svg: svg.node(), rings }};
  }}

  global.renderRotatingDotRings = renderRotatingDotRings;
  if (typeof module !== "undefined" && module.exports) {{
    module.exports = {{ renderRotatingDotRings }};
  }}
}})(globalThis);
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Rotating Dot Rings SVG/HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    parser.add_argument("--d3-renderer-output", type=Path, help="Optional D3 renderer JavaScript output path.")
    parser.add_argument("--width", type=int, default=WIDTH, help=f"SVG width. Default: {WIDTH}")
    parser.add_argument("--height", type=int, default=HEIGHT, help=f"SVG height. Default: {HEIGHT}")
    parser.add_argument("--rings", type=int, default=RING_COUNT, help=f"Number of rings. Default: {RING_COUNT}")
    parser.add_argument(
        "--gap-percent",
        type=float,
        default=GAP_PERCENT,
        help=f"Fraction of dots to omit from one sector on each ring. Default: {GAP_PERCENT}",
    )
    parser.add_argument(
        "--gap-center-degrees",
        type=float,
        default=GAP_CENTER_DEGREES,
        help=f"Sector center angle in SVG degrees, where 0 is right and -90 is up. Default: {GAP_CENTER_DEGREES}",
    )
    args = parser.parse_args()

    if args.width < 320 or args.height < 240:
        parser.error("width and height must be at least 320x240")
    if not 3 <= args.rings <= 24:
        parser.error("rings must be between 3 and 24")
    if not 0 < args.gap_percent <= 0.35:
        parser.error("gap-percent must be greater than 0 and at most 0.35")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        build_html(args.width, args.height, args.rings, args.gap_percent, args.gap_center_degrees),
        encoding="utf-8",
        newline="\n",
    )
    print(f"Wrote HTML artifact: {args.output}")

    if args.d3_renderer_output:
        args.d3_renderer_output.parent.mkdir(parents=True, exist_ok=True)
        args.d3_renderer_output.write_text(
            build_d3_renderer(args.gap_percent, args.gap_center_degrees),
            encoding="utf-8",
            newline="\n",
        )
        print(f"Wrote D3 renderer: {args.d3_renderer_output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
