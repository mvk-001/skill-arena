# X/Y Zoom

- **Pattern ID:** `d3-xy-zoom`
- **Gallery source ID:** `xy-zoom`
- **Family:** Focus
- **Use when:** Independent axis windows crop a two-dimensional scatter field.
- **Renderer:** `renderXyZoom`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderXyZoom() {
    const svg = prepareSvg("xy-zoom", "X/Y zoom", "Independent axis windows crop a two-dimensional scatter field.");
    const data = d3.range(90).map(i => ({ x: ((i * 37) % 100), y: ((i * 61 + i * 3) % 100) }));
    const left = { x: 46, y: 68, w: 214, h: 238 };
    const right = { x: 314, y: 68, w: 200, h: 238 };
    const x0 = d3.scaleLinear().domain([0, 100]).range([left.x, left.x + left.w]);
    const y0 = d3.scaleLinear().domain([0, 100]).range([left.y + left.h, left.y]);
    const focus = { x0: 32, x1: 68, y0: 38, y1: 76 };
    const x1 = d3.scaleLinear().domain([focus.x0, focus.x1]).range([right.x, right.x + right.w]);
    const y1 = d3.scaleLinear().domain([focus.y0, focus.y1]).range([right.y + right.h, right.y]);
    svg.append("rect").attr("x", left.x).attr("y", left.y).attr("width", left.w).attr("height", left.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    svg.append("rect").attr("x", right.x).attr("y", right.y).attr("width", right.w).attr("height", right.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    svg.append("g").selectAll("circle.context").data(data).join("circle").attr("class", "context").attr("cx", d => x0(d.x)).attr("cy", d => y0(d.y)).attr("r", 3).attr("fill", palette.blue).attr("fill-opacity", .42);
    svg.append("rect").attr("x", x0(focus.x0)).attr("y", y0(focus.y1)).attr("width", x0(focus.x1) - x0(focus.x0)).attr("height", y0(focus.y0) - y0(focus.y1)).attr("fill", "#cdf3ff").attr("fill-opacity", .28).attr("stroke", palette.blue).attr("stroke-width", 2);
    const detail = data.filter(d => d.x >= focus.x0 && d.x <= focus.x1 && d.y >= focus.y0 && d.y <= focus.y1);
    const dots = svg.append("g").selectAll("circle.detail").data(detail).join("circle").attr("class", "detail").attr("cx", d => x1(d.x)).attr("cy", d => y1(d.y)).attr("fill", palette.red).attr("fill-opacity", .82);
    grow(dots, "r", 2, 5, .12, .45);
    svg.append("text").attr("class", "mark-label").attr("x", left.x).attr("y", 48).text("context");
  }
```
