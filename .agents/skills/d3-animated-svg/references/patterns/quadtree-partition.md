# Animated Quadtree

- **Pattern ID:** `d3-quadtree-partition`
- **Gallery source ID:** `quadtree-partition`
- **Family:** Indexing
- **Use when:** Recursive spatial partitions reveal point index depth.
- **Renderer:** `renderAnimatedQuadtree`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAnimatedQuadtree() {
    const svg = prepareSvg("quadtree-partition", "Animated quadtree", "Recursive spatial partitions reveal point index depth.");
    const plot = { x: 54, y: 48, w: 452, h: 308 };
    const points = d3.range(34).map(i => ({
      x: plot.x + 24 + ((i * 71) % (plot.w - 48)),
      y: plot.y + 20 + ((i * 43 + i * i * 5) % (plot.h - 40))
    }));
    const tree = d3.quadtree().x(d => d.x).y(d => d.y).extent([[plot.x, plot.y], [plot.x + plot.w, plot.y + plot.h]]).addAll(points);
    const cells = [];
    tree.visit((node, x0, y0, x1, y1) => {
      cells.push({ x0, y0, x1, y1, depth: Math.round(Math.log2(plot.w / Math.max(1, x1 - x0))) });
      return false;
    });
    const visibleCells = cells.map(cell => ({
      ...cell,
      x0: Math.max(plot.x, cell.x0),
      y0: Math.max(plot.y, cell.y0),
      x1: Math.min(plot.x + plot.w, cell.x1),
      y1: Math.min(plot.y + plot.h, cell.y1)
    })).filter(cell => cell.x1 > cell.x0 && cell.y1 > cell.y0);
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    const rects = svg.append("g").selectAll("rect").data(visibleCells).join("rect")
      .attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0)
      .attr("fill", "none").attr("stroke", d => d.depth > 2 ? palette.blue : palette.gray300).attr("stroke-opacity", d => .25 + Math.min(d.depth, 5) * .08).attr("stroke-width", 1);
    rects.each(function (_, i) {
      d3.select(this).append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".45s").attr("begin", `${.02 + i * .012}s`).attr("fill", "freeze");
    });
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1.5, 4, .15, .45);
  }
```
