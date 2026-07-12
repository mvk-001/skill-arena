# Connected Scatter

- **Pattern ID:** `d3-connected-scatter`
- **Gallery source ID:** `connected-scatter`
- **Family:** Correlation
- **Use when:** Trajectory across two changing measures.
- **Renderer:** `renderConnectedScatter`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderConnectedScatter() {
    const svg = prepareSvg("connected-scatter", "Connected scatter", "A D3 line through paired measures over time.");
    const data = d3.range(10).map(i => ({ t: i, x: 20 + i * 8 + Math.sin(i) * 5, y: 25 + i * 6 + Math.cos(i * .8) * 16 }));
    const margin = { top: 34, right: 36, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain([15, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([10, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveCatmullRom);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 3);
    drawPath(path, .1, 1);
    svg.append("g").selectAll("circle").data(data).join("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 5).attr("fill", palette.orange);
  }
```
