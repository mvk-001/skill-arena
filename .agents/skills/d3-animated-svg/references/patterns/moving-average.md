# Moving Average

- **Pattern ID:** `d3-moving-average`
- **Gallery source ID:** `moving-average`
- **Family:** Analysis
- **Use when:** A smoothed trend line separates signal from noise.
- **Renderer:** `renderMovingAverage`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMovingAverage() {
    const svg = prepareSvg("moving-average", "Moving average", "A rolling mean separates a smoother trend from noisy observations.");
    const data = d3.range(32).map(i => ({ t: i, y: 44 + Math.sin(i / 2.4) * 13 + Math.cos(i * .85) * 7 + i * .8 }));
    const smooth = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 2), Math.min(data.length, i + 3));
      return { t: d.t, y: d3.mean(window, item => item.y) };
    });
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([25, 88]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const noisy = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 2);
    const avg = svg.append("path").datum(smooth).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3.3);
    drawPath(noisy, .05, .8);
    drawPath(avg, .35, 1);
    const dots = svg.append("g").selectAll("circle").data(data.filter((_, i) => i % 3 === 0)).join("circle")
      .attr("cx", d => x(d.t)).attr("cy", d => y(d.y)).attr("fill", palette.orange).attr("stroke", "#fff");
    grow(dots, "r", 1, 4, .18, .45);
  }
```
