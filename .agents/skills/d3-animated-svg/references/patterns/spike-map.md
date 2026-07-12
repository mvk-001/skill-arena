# Spike Map

- **Pattern ID:** `d3-spike-map`
- **Gallery source ID:** `spike-map`
- **Family:** Geospatial
- **Use when:** Local intensity rises as vertical spikes over a projected grid.
- **Renderer:** `renderSpikeMap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSpikeMap() {
    const svg = prepareSvg("spike-map", "Spike map", "Local intensity rises as vertical spikes over a projected grid.");
    const projection = d3.geoMercator().fitExtent([[34, 44], [526, 344]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#f7f7f7").attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", "#e7e7e7").attr("stroke-width", .8);
    const points = [
      [-122, 38, 54], [-74, 41, 78], [-46, -23, 42], [2, 49, 66], [31, 30, 48],
      [77, 28, 58], [103, 1, 72], [139, 36, 62], [151, -34, 36], [18, -34, 44]
    ].map(d => ({ coord: [d[0], d[1]], value: d[2], xy: projection([d[0], d[1]]) }));
    const spikes = svg.append("g").selectAll("line").data(points).join("line")
      .attr("x1", d => d.xy[0]).attr("x2", d => d.xy[0]).attr("y1", d => d.xy[1]).attr("y2", d => d.xy[1] - d.value)
      .attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    spikes.each(function (d, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "y2").attr("from", d.xy[1]).attr("to", d.xy[1] - d.value)
        .attr("dur", ".75s").attr("begin", `${.05 + i * .035}s`).attr("fill", "freeze");
    });
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("fill", palette.ink);
    grow(dots, "r", 2, 4, .12, .45);
    svg.append("line").attr("x1", 472).attr("x2", 472).attr("y1", 318).attr("y2", 264).attr("stroke", palette.red).attr("stroke-width", 3);
    svg.append("text").attr("class", "caption").attr("x", 482).attr("y", 272).text("54 units");
  }
```
