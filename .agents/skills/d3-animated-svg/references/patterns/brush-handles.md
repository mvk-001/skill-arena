# Brush Handles

- **Pattern ID:** `d3-brush-handles`
- **Gallery source ID:** `brush-handles`
- **Family:** Interaction
- **Use when:** Custom brush handles make a selected interval legible.
- **Renderer:** `renderBrushHandles`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBrushHandles() {
    const svg = prepareSvg("brush-handles", "Brush handles", "Custom brush handles make a selected interval legible.");
    const x = d3.scaleLinear().domain([0, 100]).range([62, width - 56]);
    const y = d3.scaleLinear().domain([0, 80]).range([296, 76]);
    const data = d3.range(32).map(i => ({ x: i * 3.1, y: 28 + Math.sin(i / 3) * 18 + (i % 7) * 2 }));
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-width", 2.6), .08, .8);
    axisBottom(svg, x, 316, 6);
    const brush = { x0: x(24), x1: x(64), y0: 82, y1: 296 };
    const rect = svg.append("rect").attr("x", brush.x0).attr("y", brush.y0).attr("width", brush.x1 - brush.x0).attr("height", brush.y1 - brush.y0)
      .attr("fill", "#cdf3ff").attr("fill-opacity", .42).attr("stroke", palette.blue).attr("stroke-width", 1.8);
    rect.append("animate").attr("attributeName", "x").attr("from", x(16)).attr("to", brush.x0).attr("dur", ".75s").attr("begin", ".12s").attr("fill", "freeze");
    const handles = svg.append("g").selectAll("rect").data([brush.x0, brush.x1]).join("rect")
      .attr("x", d => d - 5).attr("y", brush.y0 - 6).attr("width", 10).attr("height", brush.y1 - brush.y0 + 12).attr("rx", 5)
      .attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.4);
    fadeIn(handles, .16, .45);
  }
```
