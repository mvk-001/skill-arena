# Radial Area

- **Pattern ID:** `d3-radial-area`
- **Gallery source ID:** `radial-area`
- **Family:** Radial
- **Use when:** A cyclic time series wraps into a filled polar profile.
- **Renderer:** `renderRadialArea`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRadialArea() {
    const svg = prepareSvg("radial-area", "Radial area", "A cyclic time series wraps into a filled polar profile.");
    const data = d3.range(36).map(i => ({ angle: i / 36 * Math.PI * 2, value: 58 + Math.sin(i / 3) * 20 + Math.cos(i / 5) * 12 }));
    const r = d3.scaleLinear().domain([20, 92]).range([48, 158]);
    const area = d3.radialArea().angle(d => d.angle).innerRadius(42).outerRadius(d => r(d.value)).curve(d3.curveCatmullRomClosed);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 10})`);
    d3.range(1, 4).forEach(i => center.append("circle").attr("r", 42 + i * 36).attr("fill", "none").attr("stroke", "#e7e7e7"));
    const mark = center.append("path").datum(data).attr("d", area).attr("fill", palette.blueHighlight).attr("fill-opacity", .58).attr("stroke", palette.blue).attr("stroke-width", 2.8);
    fadeIn(mark, .08, .7);
    drawPath(center.append("path").datum(data).attr("d", d3.lineRadial().angle(d => d.angle).radius(d => r(d.value)).curve(d3.curveCatmullRomClosed)).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2.1), .1, 1);
  }
```
