# Voronoi Field

- **Pattern ID:** `d3-voronoi`
- **Gallery source ID:** `voronoi`
- **Family:** Proximity
- **Use when:** Nearest-neighbor cells around point anchors.
- **Renderer:** `renderVoronoi`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVoronoi() {
    const svg = prepareSvg("voronoi", "Voronoi field", "D3 Delaunay triangulation converted to nearest-neighbor cells.");
    const points = [[88, 95, "North"], [168, 62, "Edge"], [265, 112, "Core"], [378, 72, "Lab"], [470, 135, "Field"], [128, 204, "Ops"], [240, 232, "Design"], [346, 205, "Data"], [438, 282, "Pilot"], [180, 318, "Scale"], [304, 336, "Learn"]];
    const delaunay = d3.Delaunay.from(points, d => d[0], d => d[1]);
    const voronoi = delaunay.voronoi([34, 34, width - 34, height - 34]);
    const color = d3.scaleOrdinal(d3.range(points.length), ["#d7e5f7", "#f7dfc6", "#d9ebd7", "#ece1f5", "#dcecef", "#f2d3d0", "#cfddf0", "#f2e4bd", "#d8e7de", "#e4ddf2", "#f0d8c4"]);
    const cells = svg.append("g").selectAll("path").data(points).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i)).attr("fill", (d, i) => color(i))
      .attr("stroke", "#ffffff").attr("stroke-width", 2);
    fadeIn(cells, .05, .8);
    svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 5).attr("fill", palette.red);
    svg.append("g").selectAll("text").data(points).join("text").attr("class", "mark-label")
      .attr("x", d => d[0] + 9).attr("y", d => d[1] + 4).text(d => d[2]);
  }
```
