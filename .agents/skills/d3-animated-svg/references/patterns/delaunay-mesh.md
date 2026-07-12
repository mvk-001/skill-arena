# Delaunay Mesh

- **Pattern ID:** `d3-delaunay-mesh`
- **Gallery source ID:** `delaunay-mesh`
- **Family:** Proximity
- **Use when:** Triangulated neighbor structure behind points.
- **Renderer:** `renderDelaunayMesh`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDelaunayMesh() {
    const svg = prepareSvg("delaunay-mesh", "Delaunay mesh", "D3 Delaunay triangulation reveals nearest-neighbor topology.");
    const pts = d3.range(38).map(i => [
      58 + (i * 89 % 440) + Math.sin(i * 1.1) * 16,
      54 + (i * 53 % 292) + Math.cos(i * .9) * 14
    ]);
    const delaunay = d3.Delaunay.from(pts);
    const mesh = svg.append("path")
      .attr("d", delaunay.render())
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.1);
    drawPath(mesh, .08, 1);
    const dots = svg.append("g").selectAll("circle").data(pts).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1])
      .attr("fill", palette.purple)
      .attr("fill-opacity", .86)
      .attr("stroke", "#fff");
    grow(dots, "r", 1, 4.6, .18, .62);
  }
```
