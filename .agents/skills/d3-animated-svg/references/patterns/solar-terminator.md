# Solar Terminator

- **Pattern ID:** `d3-solar-terminator`
- **Gallery source ID:** `solar-terminator`
- **Family:** Geospatial
- **Use when:** A day-night boundary sweeps across a world grid.
- **Renderer:** `renderSolarTerminator`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.


## Astronomical Contract

For standalone or offline HTML, use the bundled deterministic builder instead of reimplementing the astronomy or accessibility shell:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_solar_terminator.py <exact-output-path>.html
uv run --script skills/d3-animated-svg/scripts/check_self_contained_html.py <exact-output-path>.html
```

Run the builder once with the user's exact requested path, then run the checker once. The builder already emits direct SVG `title` and `desc`, stable metadata, responsive overflow behavior, visible final-state marks, replay animation, and reduced-motion fallbacks.

After the checker passes, stop validation. Do not run `rg`, `grep`, `Select-String`, or another negative no-match probe for remote URLs or missing tokens; the checker already covers those contracts, while no-match exit code 1 is a strict-trace tool error.

Derive the timestamp, equation of time, solar declination, and subsolar longitude as one deterministic tuple. Never copy a longitude constant into an artifact that labels a different UTC instant.

Use the NOAA fractional-year approximation shown in the source excerpt. With east-positive longitude and a UTC timestamp:

```text
subsolar_longitude = (720 - utc_minutes - equation_of_time_minutes) / 4
```

Normalize the result to `[-180, 180]`. For the fixed fixture instant `2026-06-21T12:00:00Z`, the approximation should yield an equation of time near `-1.33` minutes, declination near `23.45°N`, and subsolar longitude near `0.33°E`. Treat a result tens of degrees away as a timestamp/longitude consistency failure.

Expose the fixed instant and derived values as `data-timestamp`, `data-astronomy-model`, `data-equation-of-time-minutes`, `data-subsolar-longitude`, and `data-subsolar-declination`. Show the instant, longitude hemisphere, and declination outside hover-only UI.

Source: NOAA Global Monitoring Laboratory, `General Solar Position Calculations` (`https://gml.noaa.gov/grad/solcalc/solareqns.PDF`).

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSolarTerminator() {
    const timestamp = new Date("2026-06-21T12:00:00Z");
    const year = timestamp.getUTCFullYear();
    const dayOfYear = Math.floor((Date.UTC(year, timestamp.getUTCMonth(), timestamp.getUTCDate()) - Date.UTC(year, 0, 0)) / 86400000);
    const daysInYear = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
    const utcHour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60 + timestamp.getUTCSeconds() / 3600;
    const gamma = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (utcHour - 12) / 24);
    const equationOfTime = 229.18 * (
      .000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma)
      - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma)
    );
    const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma)
      - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma)
      - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
    const normalizeLongitude = value => ((value + 540) % 360) - 180;
    const subsolar = {
      lon: normalizeLongitude((720 - utcHour * 60 - equationOfTime) / 4),
      lat: declination * 180 / Math.PI
    };
    const svg = prepareSvg("solar-terminator", "Solar terminator", "An astronomical day-night boundary is derived consistently from a fixed UTC timestamp using the NOAA fractional-year approximation.");
    const projection = d3.geoEquirectangular().fitExtent([[48, 58], [512, 324]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg
      .attr("data-timestamp", timestamp.toISOString())
      .attr("data-astronomy-model", "noaa-fractional-year")
      .attr("data-equation-of-time-minutes", equationOfTime.toFixed(3))
      .attr("data-subsolar-longitude", subsolar.lon.toFixed(3))
      .attr("data-subsolar-declination", subsolar.lat.toFixed(3));
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("stroke", palette.gray300);
    appendSchematicLand(svg, path, palette.surface);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .7);
    const boundary = d3.range(-180, 181, 2).map(lon => {
      const hourAngle = (lon - subsolar.lon) * Math.PI / 180;
      const declination = subsolar.lat * Math.PI / 180;
      const lat = Math.atan(-Math.cos(hourAngle) / Math.tan(declination)) * 180 / Math.PI;
      return [lon, lat];
    });
    const night = { type: "Polygon", coordinates: [[[-180, -90], [180, -90], ...boundary.slice().reverse(), [-180, -90]]] };
    const nightPath = svg.append("path").datum(night).attr("d", path).attr("fill", palette.ink).attr("fill-opacity", .38);
    fadeIn(nightPath, .12, .55);
    const line = svg.append("path").datum({ type: "LineString", coordinates: boundary }).attr("d", path).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3.5);
    drawPath(line, .15, 1);
    const sun = projection([subsolar.lon, subsolar.lat]);
    svg.append("circle").attr("cx", sun[0]).attr("cy", sun[1]).attr("r", 10).attr("fill", palette.gold).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    svg.append("text").attr("class", "mark-label").attr("x", sun[0] + 14).attr("y", sun[1] - 12).text("subsolar point");
    const longitudeLabel = `${Math.abs(subsolar.lon).toFixed(2)}°${subsolar.lon >= 0 ? "E" : "W"}`;
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 48)
      .attr("y", 354)
      .attr("font-size", 10.5)
      .attr("font-weight", 760)
      .text(`2026-06-21 12:00 UTC · subsolar ${longitudeLabel} · declination ${subsolar.lat.toFixed(2)}°N`);
  }
```
