# Density Contours

- **Pattern ID:** `d3-contours`
- **Gallery source ID:** `contours`
- **Family:** Density
- **Use when:** Two-dimensional concentration fields.
- **Renderer:** `renderContours`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderContours() {
    const svg = prepareSvg("contours", "Density contours", "D3 contourDensity estimates two-dimensional concentration.");
    const pts = d3.range(160).map(i => {
      const cluster = i % 3;
      const cx = [180, 300, 390][cluster], cy = [150, 240, 140][cluster];
      return [cx + Math.sin(i * 1.7) * (34 + cluster * 6), cy + Math.cos(i * 1.3) * (28 + cluster * 8)];
    });
    const contours = d3.contourDensity().x(d => d[0]).y(d => d[1]).size([width, height]).bandwidth(24).thresholds(8)(pts);
    const color = quantizedRamp([0, d3.max(contours, d => d.value)], [palette.purpleHighlight, palette.blueHighlight, palette.cyan, palette.blue, palette.blueHover]);
    const path = d3.geoPath();
    const shapes = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path).attr("fill", d => color(d.value)).attr("stroke", "#fff").attr("stroke-width", .8);
    fadeIn(shapes, .06, .8);
    svg.append("g").selectAll("circle").data(pts.filter((d, i) => i % 5 === 0)).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 2).attr("fill", palette.ink).attr("opacity", .35);
  }
```
