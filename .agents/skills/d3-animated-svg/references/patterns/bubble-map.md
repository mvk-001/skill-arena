# Bubble Map

- **Pattern ID:** `d3-bubble-map`
- **Gallery source ID:** `bubble-map`
- **Family:** Geospatial
- **Use when:** Projected point symbols encode regional magnitude.
- **Renderer:** `renderBubbleMap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBubbleMap() {
    const svg = prepareSvg("bubble-map", "Bubble map", "Projected point symbols encode regional magnitude.");
    const projection = d3.geoNaturalEarth1().fitExtent([[44, 58], [516, 330]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#f7f7f7").attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([40, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", "#e7e7e7").attr("stroke-width", .8);
    const data = [
      [-100, 40, 34], [-58, -15, 22], [8, 48, 41], [34, -2, 26], [77, 21, 32], [116, 35, 46], [144, -25, 19]
    ].map(d => ({ xy: projection([d[0], d[1]]), value: d[2] }));
    const r = d3.scaleSqrt().domain([15, 50]).range([8, 30]);
    const bubbles = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("fill", palette.blue).attr("fill-opacity", .42).attr("stroke", palette.blue).attr("stroke-width", 2);
    grow(bubbles, "r", 2, d => r(d.value), .08, .65);
    const sizeLegend = svg.append("g").attr("transform", "translate(404,360)");
    [15, 50].forEach((value, index) => {
      const x = index * 72;
      sizeLegend.append("circle").attr("cx", x).attr("cy", 0).attr("r", r(value)).attr("fill", palette.blueHighlight).attr("stroke", palette.blue);
      sizeLegend.append("text").attr("class", "caption").attr("x", x).attr("y", 4).attr("text-anchor", "middle").text(value);
    });
  }
```
