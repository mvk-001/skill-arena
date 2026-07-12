# Voronoi Stippling

- **Pattern ID:** `d3-voronoi-stippling`
- **Gallery source ID:** `voronoi-stippling`
- **Family:** Sampling
- **Use when:** Points and cells approximate a continuous intensity field.
- **Renderer:** `renderVoronoiStippling`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVoronoiStippling() {
    const svg = prepareSvg("voronoi-stippling", "Voronoi stippling", "Voronoi cells and weighted points approximate a continuous intensity image.");
    const bounds = [58, 52, width - 58, height - 52];
    const field = (x, y) => {
      const a = Math.exp(-(((x - 214) / 95) ** 2 + ((y - 174) / 70) ** 2));
      const b = Math.exp(-(((x - 338) / 74) ** 2 + ((y - 244) / 86) ** 2)) * .85;
      const c = Math.exp(-(((x - 292) / 128) ** 2 + ((y - 118) / 44) ** 2)) * .5;
      return Math.min(1, a + b + c);
    };
    const points = d3.range(72).map(i => {
      const x = 74 + (i * 67) % 414 + Math.sin(i * 1.7) * 13;
      const y = 64 + (i * 47) % 286 + Math.cos(i * .83) * 15;
      return { x, y, weight: field(x, y) };
    }).filter(d => d.weight > .13);
    const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
    const voronoi = delaunay.voronoi(bounds);
    const cells = svg.append("g").selectAll("path").data(points).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i))
      .attr("fill", d => quantizedRamp([0, 1], ramps.gray)(d.weight))
      .attr("stroke", "#d6dde6")
      .attr("stroke-width", .8);
    fadeIn(cells, .025, .6);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.ink)
      .attr("fill-opacity", d => .34 + d.weight * .55);
    grow(dots, "r", .8, d => 1.9 + d.weight * 4.8, .1, .65);
    svg.append("path")
      .attr("d", "M168,68 C244,38 384,62 432,144 C480,226 410,330 286,344 C176,356 92,278 106,184 C114,126 124,92 168,68Z")
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 2.2)
      .attr("stroke-dasharray", "6 7");
  }
```
