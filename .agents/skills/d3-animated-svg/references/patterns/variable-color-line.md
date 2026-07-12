# Variable Color Line

- **Pattern ID:** `d3-variable-color-line`
- **Gallery source ID:** `variable-color-line`
- **Family:** Encoding
- **Use when:** Line segments change color as a thresholded value changes.
- **Renderer:** `renderVariableColorLine`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVariableColorLine() {
    const svg = prepareSvg("variable-color-line", "Variable color line", "A line changes segment color when values cross thresholds.");
    const data = d3.range(24).map(i => ({ t: i, y: 48 + Math.sin(i / 2) * 18 + Math.cos(i * .85) * 8 + i * .7 }));
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([25, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const threshold = 58;
    svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(threshold)).attr("y2", y(threshold)).attr("stroke", palette.gray600).attr("stroke-dasharray", "4 5");
    const segments = d3.pairs(data);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const paths = svg.append("g").selectAll("path").data(segments).join("path")
      .attr("d", d => line(d))
      .attr("fill", "none")
      .attr("stroke", d => d3.mean(d, p => p.y) >= threshold ? palette.red : palette.blue)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(paths, .03, .55);
    svg.append("text").attr("class", "mark-label").attr("x", width - 38).attr("y", y(threshold) - 8).attr("text-anchor", "end").text("threshold");
  }
```
