# Hexbin Map

- **Pattern ID:** `d3-hexbin-map`
- **Gallery source ID:** `hexbin-map`
- **Family:** Geospatial
- **Use when:** Projected points aggregate into geographic hexagonal bins.
- **Renderer:** `renderHexbinMap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHexbinMap() {
    const svg = prepareSvg("hexbin-map", "Hexbin map", "Projected points aggregate into geographic hexagonal bins.");
    const projection = d3.geoNaturalEarth1().fitExtent([[54, 54], [506, 336]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.gray100).attr("stroke", palette.gray200);
    appendSchematicLand(svg, path, palette.surface);
    const points = d3.range(90).map(i => projection([-125 + ((i * 29) % 255), -52 + ((i * 43 + i * 2) % 104)])).filter(Boolean);
    const size = 26;
    const bins = d3.rollups(points, v => v.length, p => `${Math.round(p[0] / (size * .86))},${Math.round(p[1] / (size * .75))}`)
      .map(([key, count]) => {
        const [qx, qy] = key.split(",").map(Number);
        return { x: qx * size * .86, y: qy * size * .75, count };
      })
      .filter(d => d.x > 70 && d.x < width - 70 && d.y > 70 && d.y < height - 70);
    const color = quantizedRamp([1, d3.max(bins, d => d.count)], ramps.heat);
    const hex = d => d3.range(6).map(i => {
      const a = Math.PI / 3 * i + Math.PI / 6;
      return [d.x + Math.cos(a) * 13, d.y + Math.sin(a) * 13];
    });
    const cells = svg.append("g").selectAll("path").data(bins).join("path")
      .attr("d", d => `${d3.line()(hex(d))}Z`).attr("fill", d => color(d.count)).attr("fill-opacity", .78).attr("stroke", "#fff").attr("stroke-width", 1.2);
    fadeIn(cells, .08, .6);
    const legend = svg.append("g").attr("transform", "translate(64,370)");
    ramps.heat.forEach((colorValue, index) => legend.append("rect").attr("x", index * 38).attr("width", 38).attr("height", 12).attr("fill", colorValue));
    legend.append("text").attr("class", "caption").attr("x", 0).attr("y", -6).text("low density");
    legend.append("text").attr("class", "caption").attr("x", ramps.heat.length * 38).attr("y", -6).attr("text-anchor", "end").text("high density");
  }
```
