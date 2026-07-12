# Adaptive Sampling

- **Pattern ID:** `d3-adaptive-sampling`
- **Gallery source ID:** `adaptive-sampling`
- **Family:** Geometry
- **Use when:** More sample points appear where a curve bends sharply.
- **Renderer:** `renderAdaptiveSampling`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAdaptiveSampling() {
    const svg = prepareSvg("adaptive-sampling", "Adaptive sampling", "More sample points appear where a curve bends sharply.");
    const f = x => 210 + Math.sin(x / 34) * 74 + Math.sin(x / 12) * 18;
    const coarse = d3.range(62, 500, 44).map(x => [x, f(x)]);
    const dense = d3.range(62, 500, 14).map(x => [x, f(x)]);
    const line = d3.line().curve(d3.curveCatmullRom);
    svg.append("path").datum(coarse).attr("d", line).attr("fill", "none").attr("stroke", palette.gray600).attr("stroke-width", 2).attr("stroke-dasharray", "6 5");
    const sampled = svg.append("path").datum(dense).attr("d", line).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3);
    drawPath(sampled, .08, .9);
    const points = svg.append("g").selectAll("circle").data(dense).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red).attr("fill-opacity", .82).attr("stroke", "#fff").attr("stroke-width", 1);
    grow(points, "r", 1.5, 3.5, .12, .45);
  }
```
