# Projected Routes

- **Pattern ID:** `d3-geo-route`
- **Gallery source ID:** `geo-route`
- **Family:** Geospatial
- **Use when:** Coordinates, projection, and route motion.
- **Renderer:** `renderGeoRoute`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderGeoRoute() {
    const svg = prepareSvg("geo-route", "Projected routes", "D3 geographic projection and route motion.");
    const projection = d3.geoNaturalEarth1().fitExtent([[38, 42], [width - 38, height - 52]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    const graticule = d3.geoGraticule10();
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .22).attr("stroke", palette.gray300);
    appendSchematicLand(svg, path);
    svg.append("path").datum(graticule).attr("d", path).attr("fill", "none").attr("stroke", "#d4dbe4").attr("stroke-width", .7);
    const cities = [
      { name: "SF", lon: -122.4, lat: 37.8, dx: 7, dy: -7, anchor: "start" },
      { name: "NY", lon: -74, lat: 40.7, dx: 7, dy: -7, anchor: "start" },
      { name: "LDN", lon: -0.1, lat: 51.5, dx: -8, dy: -10, anchor: "end" },
      { name: "BER", lon: 13.4, lat: 52.5, dx: 8, dy: 13, anchor: "start" },
      { name: "TKY", lon: 139.7, lat: 35.7, dx: 7, dy: -7, anchor: "start" }
    ];
    const route = { type: "LineString", coordinates: cities.map(d => [d.lon, d.lat]) };
    const routePath = svg.append("path").datum(route).attr("d", path).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.8);
    drawPath(routePath, .2, 1.2);
    svg.append("g").selectAll("circle").data(cities).join("circle").attr("cx", d => projection([d.lon, d.lat])[0]).attr("cy", d => projection([d.lon, d.lat])[1]).attr("r", 4.5).attr("fill", palette.blue);
    svg.append("g").selectAll("text").data(cities).join("text").attr("class", "mark-label")
      .attr("x", d => projection([d.lon, d.lat])[0] + d.dx).attr("y", d => projection([d.lon, d.lat])[1] + d.dy)
      .attr("text-anchor", d => d.anchor).text(d => d.name);
  }
```
