#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a deterministic, self-contained Solar Terminator HTML artifact."""

from __future__ import annotations

import argparse
from datetime import datetime
import html
import math
from pathlib import Path


DEFAULT_TIMESTAMP = "2026-06-21T12:00:00Z"
WORLD_X = 70.0
WORLD_Y = 72.0
WORLD_WIDTH = 580.0
WORLD_HEIGHT = 290.0
LAND_RINGS = [
    ("North America", [(-168, 16), (-150, 68), (-108, 74), (-58, 50), (-80, 8), (-122, 12), (-168, 16)]),
    ("South America", [(-82, 12), (-50, 10), (-34, -54), (-70, -56), (-82, 12)]),
    ("Eurasia", [(-10, 35), (6, 70), (72, 76), (178, 54), (150, 8), (96, 6), (42, 28), (-10, 35)]),
    ("Africa", [(-18, 34), (48, 34), (42, -36), (12, -35), (-18, 34)]),
    ("Australia", [(112, -10), (154, -12), (150, -44), (114, -38), (112, -10)]),
    ("Greenland", [(-74, 60), (-60, 82), (-22, 84), (-20, 60), (-74, 60)]),
]


def parse_utc(value: str) -> datetime:
    if not value.endswith("Z"):
        raise argparse.ArgumentTypeError("timestamp must be an ISO-8601 UTC instant ending in Z")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid timestamp: {value}") from error
    if parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise argparse.ArgumentTypeError("timestamp must be UTC")
    return parsed


def solar_tuple(timestamp: datetime) -> tuple[float, float, float]:
    day_of_year = timestamp.timetuple().tm_yday
    days_in_year = 366 if timestamp.replace(month=12, day=31).timetuple().tm_yday == 366 else 365
    utc_hour = timestamp.hour + timestamp.minute / 60 + timestamp.second / 3600
    gamma = 2 * math.pi / days_in_year * (day_of_year - 1 + (utc_hour - 12) / 24)
    equation_of_time = 229.18 * (
        0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma)
    )
    declination_radians = (
        0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    )
    declination = math.degrees(declination_radians)
    longitude = ((720 - utc_hour * 60 - equation_of_time) / 4 + 540) % 360 - 180
    return equation_of_time, declination, longitude


def project(longitude: float, latitude: float) -> tuple[float, float]:
    x = WORLD_X + (longitude + 180) / 360 * WORLD_WIDTH
    y = WORLD_Y + (90 - latitude) / 180 * WORLD_HEIGHT
    return x, y


def path_from_ring(ring: list[tuple[float, float]]) -> str:
    points = [project(longitude, latitude) for longitude, latitude in ring]
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in points) + "Z"


def boundary_points(longitude: float, declination: float) -> float:
    hour_angle = math.radians(longitude)
    declination_radians = math.radians(declination)
    return math.degrees(math.atan(-math.cos(hour_angle) / math.tan(declination_radians)))


def longitude_label(value: float) -> str:
    return f"{abs(value):.2f}°{'E' if value >= 0 else 'W'}"


def build_html(timestamp: datetime) -> str:
    equation_of_time, declination, subsolar_longitude = solar_tuple(timestamp)
    night_rects: list[str] = []
    for latitude in range(-90, 90, 10):
        for longitude in range(-180, 180, 10):
            center_latitude = latitude + 5
            center_longitude = longitude + 5
            hour_angle = math.radians(center_longitude - subsolar_longitude)
            cosine_zenith = (
                math.sin(math.radians(center_latitude)) * math.sin(math.radians(declination))
                + math.cos(math.radians(center_latitude)) * math.cos(math.radians(declination)) * math.cos(hour_angle)
            )
            if cosine_zenith <= 0:
                x, y_bottom = project(longitude, latitude)
                _, y_top = project(longitude, latitude + 10)
                width = WORLD_WIDTH / 36
                height = y_bottom - y_top
                night_rects.append(
                    f'<rect x="{x:.2f}" y="{y_top:.2f}" width="{width + 0.2:.2f}" height="{height + 0.2:.2f}"/>'
                )

    land_paths = "\n".join(
        f'<path d="{path_from_ring(ring)}" aria-label="{html.escape(name)}"/>'
        for name, ring in LAND_RINGS
    )
    grid_lines: list[str] = []
    for longitude in range(-150, 180, 30):
        x, _ = project(longitude, 0)
        grid_lines.append(f'<line x1="{x:.2f}" y1="{WORLD_Y}" x2="{x:.2f}" y2="{WORLD_Y + WORLD_HEIGHT}"/>')
    for latitude in range(-60, 90, 30):
        _, y = project(0, latitude)
        grid_lines.append(f'<line x1="{WORLD_X}" y1="{y:.2f}" x2="{WORLD_X + WORLD_WIDTH}" y2="{y:.2f}"/>')

    boundary = [
        project(longitude, boundary_points(longitude - subsolar_longitude, declination))
        for longitude in range(-180, 181, 2)
    ]
    boundary_path = "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in boundary)
    sun_x, sun_y = project(subsolar_longitude, declination)
    timestamp_iso = timestamp.isoformat().replace("+00:00", "Z")
    visible_timestamp = timestamp.strftime("%Y-%m-%d %H:%M UTC")
    hemisphere_declination = f"{abs(declination):.2f}°{'N' if declination >= 0 else 'S'}"

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solar Terminator · D3 Pattern</title>
  <style>
    :root {{ color-scheme: light; font-family: "Open Sans", Arial, sans-serif; background: #f3f4f5; color: #333e48; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }}
    main {{ width: min(960px, 100%); background: #fff; border: 1px solid #d7dadd; border-radius: 12px; padding: 20px; }}
    header {{ display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 12px; }}
    h1 {{ margin: 0 0 4px; font-size: clamp(1.35rem, 3vw, 2rem); }}
    p {{ margin: 0; color: #606b75; line-height: 1.45; }}
    button {{ border: 1px solid #b6bcc2; border-radius: 6px; background: #fff; color: #333e48; padding: 8px 12px; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }}
    .frame {{ overflow-x: auto; }}
    svg {{ display: block; width: 100%; min-width: 620px; height: auto; font-family: "Open Sans", Arial, sans-serif; }}
    .land path {{ fill: #f7f7f7; stroke: #9ba3aa; stroke-width: 1; stroke-linejoin: round; }}
    .night-layer {{ fill: #333e48; opacity: .46; }}
    .grid line {{ stroke: #9ecae1; stroke-width: .75; opacity: .65; }}
    .terminator {{ fill: none; stroke: #f05a28; stroke-width: 4; stroke-linecap: round; pathLength: 1; }}
    .replaying .night-layer {{ animation: night-in 1s ease both; }}
    .replaying .terminator {{ stroke-dasharray: 1; animation: trace 1.4s ease both; }}
    .replaying .sun circle {{ transform-box: fill-box; transform-origin: center; animation: pulse 1.4s ease-in-out both; }}
    .legend {{ display: flex; flex-wrap: wrap; gap: 12px 18px; margin-top: 10px; font-size: .82rem; color: #606b75; }}
    .key {{ display: inline-flex; align-items: center; gap: 6px; }}
    .swatch {{ width: 12px; height: 12px; border-radius: 2px; border: 1px solid #9ba3aa; }}
    @keyframes night-in {{ from {{ opacity: 0; }} to {{ opacity: .46; }} }}
    @keyframes trace {{ from {{ stroke-dashoffset: 1; }} to {{ stroke-dashoffset: 0; }} }}
    @keyframes pulse {{ 0% {{ transform: scale(.55); }} 70% {{ transform: scale(1.2); }} 100% {{ transform: scale(1); }} }}
    @media (prefers-reduced-motion: reduce) {{ .replaying * {{ animation: none !important; }} .night-layer {{ opacity: .46; }} .sun circle, .terminator {{ opacity: 1; }} .terminator {{ stroke-dashoffset: 0; }} }}
    @media (max-width: 640px) {{ body {{ padding: 10px; }} main {{ padding: 14px; }} header {{ display: block; }} button {{ margin-top: 10px; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <div><h1>Solar Terminator</h1><p>A fixed UTC instant drives one internally consistent day/night state.</p></div>
    <button id="replay" type="button" aria-controls="d3-solar-terminator">Replay animation</button>
  </header>
  <div class="frame">
    <svg id="d3-solar-terminator" class="replaying" viewBox="0 0 720 460" role="img"
      aria-labelledby="solar-title solar-desc" data-pattern-id="d3-solar-terminator"
      data-timestamp="{timestamp_iso}" data-astronomy-model="noaa-fractional-year"
      data-equation-of-time-minutes="{equation_of_time:.3f}"
      data-subsolar-longitude="{subsolar_longitude:.3f}"
      data-subsolar-declination="{declination:.3f}">
      <title id="solar-title">Solar terminator at {visible_timestamp}</title>
      <desc id="solar-desc">Schematic world map with day and night regions, an astronomically derived terminator, and a labeled subsolar point at {longitude_label(subsolar_longitude)}, {hemisphere_declination}.</desc>
      <defs>
        <style>
          .land path {{ fill: #f7f7f7; stroke: #9ba3aa; stroke-width: 1; stroke-linejoin: round; }}
          .night-layer {{ fill: #333e48; opacity: .46; }}
          .grid line {{ stroke: #9ecae1; stroke-width: .75; opacity: .65; }}
          .terminator {{ fill: none; stroke: #f05a28; stroke-width: 4; stroke-linecap: round; }}
          .replaying .night-layer {{ animation: night-in 1s ease both; }}
          .replaying .terminator {{ stroke-dasharray: 1; animation: trace 1.4s ease both; }}
          .replaying .sun circle {{ transform-box: fill-box; transform-origin: center; animation: pulse 1.4s ease-in-out both; }}
          @keyframes night-in {{ from {{ opacity: 0; }} to {{ opacity: .46; }} }}
          @keyframes trace {{ from {{ stroke-dashoffset: 1; }} to {{ stroke-dashoffset: 0; }} }}
          @keyframes pulse {{ 0% {{ transform: scale(.55); }} 70% {{ transform: scale(1.2); }} 100% {{ transform: scale(1); }} }}
          @media (prefers-reduced-motion: reduce) {{ .replaying * {{ animation: none !important; }} .night-layer {{ opacity: .46; }} .sun circle, .terminator {{ opacity: 1; }} .terminator {{ stroke-dashoffset: 0; }} }}
        </style>
        <clipPath id="world-clip"><rect x="{WORLD_X}" y="{WORLD_Y}" width="{WORLD_WIDTH}" height="{WORLD_HEIGHT}" rx="8"/></clipPath>
      </defs>
      <rect x="{WORLD_X}" y="{WORLD_Y}" width="{WORLD_WIDTH}" height="{WORLD_HEIGHT}" rx="8" fill="#d9f3fb" stroke="#9ba3aa"/>
      <g clip-path="url(#world-clip)">
        <g class="land">{land_paths}</g>
        <g class="night-layer">{''.join(night_rects)}</g>
        <g class="grid">{''.join(grid_lines)}</g>
        <path class="terminator" d="{boundary_path}" pathLength="1"/>
        <g class="sun" transform="translate({sun_x:.2f} {sun_y:.2f})">
          <circle r="10" fill="#ffd166" stroke="#d97706" stroke-width="2"/>
          <circle r="3" fill="#fff" opacity=".65"/>
        </g>
      </g>
      <text x="{sun_x + 14:.2f}" y="{sun_y - 12:.2f}" font-size="12" font-weight="800" fill="#333e48" stroke="#fff" stroke-width="4" paint-order="stroke">subsolar point</text>
      <text x="70" y="392" font-size="13" font-weight="800" fill="#333e48">{visible_timestamp}</text>
      <text x="70" y="414" font-size="12" fill="#606b75">Subsolar {longitude_label(subsolar_longitude)} · declination {hemisphere_declination} · equation of time {equation_of_time:.2f} min</text>
      <text x="70" y="436" font-size="11" fill="#606b75">Astronomy: NOAA fractional-year approximation · geography: schematic context</text>
    </svg>
  </div>
  <div class="legend" aria-label="Visual legend">
    <span class="key"><span class="swatch" style="background:#d9f3fb"></span>day</span>
    <span class="key"><span class="swatch" style="background:#7f8992"></span>night</span>
    <span class="key"><span class="swatch" style="background:#f05a28"></span>terminator</span>
  </div>
</main>
<script>
  const visual = document.querySelector("#d3-solar-terminator");
  const replay = document.querySelector("#replay");
  function restart() {{
    visual.classList.remove("replaying");
    void visual.getBoundingClientRect();
    visual.classList.add("replaying");
  }}
  replay.addEventListener("click", restart);
  restart();
</script>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Exact HTML output path")
    parser.add_argument("--timestamp", type=parse_utc, default=parse_utc(DEFAULT_TIMESTAMP))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    artifact = build_html(args.timestamp)
    required = ["<svg", "<title", "<desc", 'data-pattern-id="d3-solar-terminator"', "prefers-reduced-motion"]
    missing = [token for token in required if token not in artifact]
    if missing:
        raise SystemExit(f"Builder invariant failed; missing: {', '.join(missing)}")
    output.write_text(artifact, encoding="utf-8")
    equation_of_time, declination, longitude = solar_tuple(args.timestamp)
    print(f"Wrote {output}")
    print(
        f"timestamp={args.timestamp.isoformat().replace('+00:00', 'Z')} "
        f"equation_of_time={equation_of_time:.3f}min "
        f"declination={declination:.3f}deg subsolar_longitude={longitude:.3f}deg"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
