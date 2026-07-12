# Histogram

- **Pattern ID:** `d3-histogram`
- **Gallery source ID:** `histogram`
- **Family:** Distribution
- **Use when:** Binned frequency with animated bars.
- **Renderer:** `renderHistogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHistogram() {
    const svg = prepareSvg("histogram", "Histogram", "D3 bins continuous values into frequency bars.");
    const values = d3.range(90).map(i => 42 + Math.sin(i * .31) * 18 + Math.cos(i * .17) * 13 + (i % 7));
    const margin = { top: 34, right: 28, bottom: 48, left: 48 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(12)(values);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const bars = svg.append("g").selectAll("rect").data(bins).join("rect")
      .attr("x", d => x(d.x0) + 1).attr("y", d => y(d.length)).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => y(0) - y(d.length)).attr("fill", palette.blue).attr("rx", 2);
    fadeIn(bars, .05, .7);
  }
```
