# Quadtree Search

- **Pattern ID:** `d3-quadtree-search`
- **Gallery source ID:** `quadtree-search`
- **Family:** Indexing
- **Use when:** Spatial index partitions reveal nearest lookup.
- **Renderer:** `renderQuadtreeSearch`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderQuadtreeSearch() {
    const svg = prepareSvg("quadtree-search", "Quadtree search", "D3 quadtree partitions points for nearest-neighbor lookup.");
    const bounds = { x0: 50, y0: 42, x1: width - 42, y1: height - 46 };
    const points = d3.range(42).map(i => ({
      id: i,
      x: bounds.x0 + 16 + ((i * 83) % 420) + Math.sin(i * 1.4) * 10,
      y: bounds.y0 + 16 + ((i * 47) % 292) + Math.cos(i * .8) * 9
    }));
    const tree = d3.quadtree().x(d => d.x).y(d => d.y).extent([[bounds.x0, bounds.y0], [bounds.x1, bounds.y1]]).addAll(points);
    const cells = [];
    tree.visit((node, x0, y0, x1, y1) => {
      cells.push({ x0, y0, x1, y1, leaf: !node.length });
      return false;
    });
    const visibleCells = cells.map(cell => ({
      ...cell,
      x0: Math.max(bounds.x0, cell.x0),
      y0: Math.max(bounds.y0, cell.y0),
      x1: Math.min(bounds.x1, cell.x1),
      y1: Math.min(bounds.y1, cell.y1)
    })).filter(cell => cell.x1 > cell.x0 && cell.y1 > cell.y0);
    const target = [366, 178];
    const nearest = tree.find(target[0], target[1]);
    const cellRects = svg.append("g").selectAll("rect").data(visibleCells).join("rect")
      .attr("x", d => d.x0).attr("y", d => d.y0)
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("fill", "none")
      .attr("stroke", d => d.leaf ? palette.gray100 : palette.gray300)
      .attr("stroke-width", d => d.leaf ? .8 : 1.2);
    fadeIn(cellRects, .04, .55);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", palette.blue).attr("fill-opacity", .72).attr("stroke", "#fff");
    grow(dots, "r", 1, 4.4, .1, .55);
    const link = svg.append("line")
      .attr("x1", target[0]).attr("y1", target[1])
      .attr("x2", nearest.x).attr("y2", nearest.y)
      .attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-dasharray", "4 5");
    fadeIn(link, .25, .55);
    svg.append("circle").attr("cx", target[0]).attr("cy", target[1]).attr("r", 10).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2);
    svg.append("text").attr("class", "mark-label").attr("x", target[0] + 14).attr("y", target[1] - 10).text("query");
  }
```
