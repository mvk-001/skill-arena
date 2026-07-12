# Lasso Selection

- **Pattern ID:** `d3-lasso-selection`
- **Gallery source ID:** `lasso-selection`
- **Family:** Selection
- **Use when:** A freeform region isolates an irregular cluster.
- **Renderer:** `renderLassoSelection`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLassoSelection() {
    const svg = prepareSvg("lasso-selection", "Lasso selection", "A freeform polygon isolates an irregular point cluster.");
    const points = d3.range(46).map(i => ({
      x: 72 + (i * 61) % 414 + Math.sin(i * 1.2) * 15,
      y: 62 + (i * 43) % 272 + Math.cos(i * .9) * 14
    }));
    const lasso = [[178, 102], [292, 78], [392, 136], [365, 246], [250, 282], [158, 210], [178, 102]];
    points.forEach(point => point.selected = d3.polygonContains(lasso, [point.x, point.y]));
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.selected ? palette.orange : "#9aa7b5")
      .attr("fill-opacity", d => d.selected ? .88 : .28)
      .attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(dots, "r", 1, d => d.selected ? 6 : 4, .06, .55);
    const lassoPath = svg.append("path").attr("d", `${d3.line()(lasso)}Z`).attr("fill", palette.orange).attr("fill-opacity", .1).attr("stroke", palette.orange).attr("stroke-width", 2.5);
    drawPath(lassoPath, .2, .9);
    const selected = points.filter(d => d.selected).length;
    svg.append("text").attr("class", "mark-label").attr("x", 352).attr("y", 70).text(`${selected} selected`);
  }
```
