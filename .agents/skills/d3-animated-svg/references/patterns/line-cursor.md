# Line Cursor

- **Pattern ID:** `d3-line-cursor`
- **Gallery source ID:** `line-cursor`
- **Family:** Interaction
- **Use when:** A nearest-point cursor links a vertical guide and value label.
- **Renderer:** `renderLineCursor`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLineCursor() {
    const svg = prepareSvg("line-cursor", "Line cursor", "A nearest-point cursor links a vertical guide and value label.");
    const margin = { top: 44, right: 48, bottom: 52, left: 58 };
    const data = d3.range(14).map(i => ({ t: i, v: 32 + i * 3.5 + Math.sin(i / 1.5) * 13 }));
    const x = d3.scaleLinear().domain([0, 13]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([20, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3), .06, .85);
    const target = data[9];
    const guide = svg.append("line").attr("x1", x(target.t)).attr("x2", x(target.t)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(guide, .35, .4);
    const dot = svg.append("circle").attr("cx", x(target.t)).attr("cy", y(target.v)).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(dot, "r", 2, 7, .42, .45);
    svg.append("text").attr("class", "mark-label").attr("x", x(target.t) + 12).attr("y", y(target.v) - 14).text(`t${target.t}: ${Math.round(target.v)}`);
  }
```
