# Antimeridian Cutting

- **Pattern ID:** `d3-antimeridian-cutting`
- **Gallery source ID:** `antimeridian-cutting`
- **Family:** Projection
- **Use when:** A route splits cleanly at the dateline instead of crossing the map.
- **Renderer:** `renderAntimeridianCutting`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAntimeridianCutting() {
    const svg = prepareSvg("antimeridian-cutting", "Antimeridian cutting", "A route splits cleanly at the dateline instead of crossing the map.");
    const projection = d3.geoEquirectangular().fitExtent([[52, 58], [508, 334]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .18).attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const seamXs = [projection([-180, 0])[0], projection([180, 0])[0]];
    svg.append("g").selectAll("line").data(seamXs).join("line")
      .attr("x1", d => d).attr("x2", d => d).attr("y1", 58).attr("y2", 334)
      .attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-opacity", .72).attr("stroke-dasharray", "6 4");
    const segments = [
      { type: "LineString", coordinates: [[132, 36], [160, 42], [179, 38]] },
      { type: "LineString", coordinates: [[-179, 38], [-150, 34], [-124, 40]] }
    ];
    const routes = svg.append("g").selectAll("path").data(segments).join("path").attr("d", path).attr("fill", "none").attr("stroke", palette.blueHover).attr("stroke-width", 3.4).attr("stroke-linecap", "round");
    drawPath(routes, .1, .85);
    const seamEndpoints = [[179, 38], [-179, 38]].map(coord => projection(coord));
    const endpoints = svg.append("g").selectAll("circle").data(seamEndpoints).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    grow(endpoints, "r", 1, 5, .25, .4);
    svg.append("text").attr("class", "mark-label").attr("x", width / 2).attr("y", 46).attr("text-anchor", "middle").text("route splits cleanly at +/-180 deg");
  }
```
