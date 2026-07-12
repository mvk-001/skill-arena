# 2D Rectangular Histogram

- **Pattern ID:** `d3-rectbin`
- **Gallery source ID:** `rectbin`
- **Family:** Density
- **Use when:** Rectangular bins aggregate point density without hex geometry.
- **Renderer:** `renderRectbinDensity`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRectbinDensity() {
    const svg = prepareSvg("rectbin", "2D rectangular histogram", "Rectangular bins aggregate point density without hex geometry.");
    const plot = { x: 64, y: 58, w: 430, h: 286 };
    const points = d3.range(180).map(i => ({
      x: 20 + ((i * 37 + i * i) % 80),
      y: 18 + ((i * 53 + Math.floor(i / 4) * 11) % 78)
    }));
    const x = d3.scaleLinear().domain([0, 100]).range([plot.x, plot.x + plot.w]);
    const y = d3.scaleLinear().domain([0, 100]).range([plot.y + plot.h, plot.y]);
    const nx = 12, ny = 8;
    const bins = d3.rollups(points, v => v.length, d => Math.floor(d.x / (100 / nx)), d => Math.floor(d.y / (100 / ny)))
      .flatMap(([bx, rows]) => rows.map(([by, count]) => ({ bx, by, count })));
    const color = quantizedRamp([0, d3.max(bins, d => d.count)], ramps.blue);
    const cells = svg.append("g").selectAll("rect").data(bins).join("rect")
      .attr("x", d => x(d.bx * 100 / nx)).attr("y", d => y((d.by + 1) * 100 / ny))
      .attr("width", plot.w / nx - 1).attr("height", plot.h / ny - 1).attr("fill", d => color(d.count)).attr("stroke", "#fff");
    fadeIn(cells, .06, .5);
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", "none").attr("stroke", palette.line);
    svg.append("text").attr("class", "mark-label").attr("x", plot.x).attr("y", plot.y - 16).text("low density");
    svg.append("text").attr("class", "mark-label").attr("x", plot.x + plot.w).attr("y", plot.y - 16).attr("text-anchor", "end").text("high density");
  }
```
