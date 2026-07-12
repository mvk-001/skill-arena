# Q-Q Plot

- **Pattern ID:** `d3-qq-plot`
- **Gallery source ID:** `qq-plot`
- **Family:** Diagnostics
- **Use when:** Sample quantiles are compared against a reference line.
- **Renderer:** `renderQqPlot`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderQqPlot() {
    const svg = prepareSvg("qq-plot", "Q-Q plot", "Sample quantiles are compared against a theoretical reference line.");
    const theoretical = [-2.05, -1.55, -1.2, -.94, -.72, -.53, -.34, -.17, 0, .17, .34, .53, .72, .94, 1.2, 1.55, 2.05];
    const sample = theoretical.map((q, i) => ({ q, value: q * 1.12 + Math.sin(i * .8) * .32 + (i > 12 ? .3 : 0) }));
    const margin = { top: 40, right: 40, bottom: 56, left: 58 };
    const x = d3.scaleLinear().domain([-2.3, 2.3]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([-2.6, 2.8]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const ref = svg.append("line").attr("x1", x(-2.2)).attr("x2", x(2.2)).attr("y1", y(-2.2)).attr("y2", y(2.2)).attr("stroke", palette.gray400).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(ref, .05, .5);
    const dots = svg.append("g").selectAll("circle").data(sample).join("circle")
      .attr("cx", d => x(d.q)).attr("cy", d => y(d.value)).attr("fill", d => Math.abs(d.value - d.q) > .42 ? palette.red : palette.blue).attr("stroke", "#fff");
    grow(dots, "r", 1, 6, .08, .55);
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", width - 46).attr("y", 34).attr("text-anchor", "end").text("tail deviation");
  }
```
