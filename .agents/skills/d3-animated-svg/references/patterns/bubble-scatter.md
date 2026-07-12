# Bubble Scatter

- **Pattern ID:** `d3-bubble-scatter`
- **Gallery source ID:** `bubble-scatter`
- **Family:** Correlation
- **Use when:** Position, radius, and group encoded together.
- **Renderer:** `renderBubbleScatter`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBubbleScatter() {
    const svg = prepareSvg("bubble-scatter", "Bubble scatter", "D3 scatterplot using radius and color encodings.");
    const data = d3.range(24).map(i => ({ x: 20 + i * 3 + (i % 4) * 8, y: 40 + Math.sin(i * .7) * 18 + (i % 5) * 9, r: 5 + (i % 6) * 2, group: i % 3 }));
    const margin = { top: 34, right: 36, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain([15, 120]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([15, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("fill", d => colors[d.group]).attr("fill-opacity", .78).attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.r, .08, .7);
  }
```
