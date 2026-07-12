# Difference Chart

- **Pattern ID:** `d3-difference-chart`
- **Gallery source ID:** `difference-chart`
- **Family:** Temporal
- **Use when:** Two series expose over and under performance bands.
- **Renderer:** `renderDifferenceChart`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDifferenceChart() {
    const svg = prepareSvg("difference-chart", "Difference chart", "Area between two time series highlights over and under performance.");
    const data = d3.range(16).map(i => ({
      t: i,
      plan: 54 + Math.sin(i / 2.2) * 8 + i * 1.2,
      actual: 52 + Math.cos(i / 2.4) * 10 + i * 1.55 + Math.sin(i * .9) * 5
    }));
    const margin = { top: 36, right: 36, bottom: 52, left: 56 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([35, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = d3.area().x(d => x(d.t)).y0(d => y(d.plan)).y1(d => y(d.actual)).curve(d3.curveMonotoneX);
    const band = svg.append("path").datum(data).attr("d", area).attr("fill", palette.green).attr("fill-opacity", .22);
    fadeIn(band, .1, .6);
    const line = key => d3.line().x(d => x(d.t)).y(d => y(d[key])).curve(d3.curveMonotoneX);
    const plan = svg.append("path").datum(data).attr("d", line("plan")).attr("fill", "none").attr("stroke", palette.muted).attr("stroke-width", 2.3).attr("stroke-dasharray", "5 5");
    const actual = svg.append("path").datum(data).attr("d", line("actual")).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 3);
    drawPath(plan, .08, .9);
    drawPath(actual, .15, .95);
    const end = data.at(-1);
    svg.append("text").attr("class", "mark-label").attr("x", x(end.t) - 4).attr("y", y(end.actual) - 10).attr("text-anchor", "end").text("actual");
    svg.append("text").attr("class", "mark-label").attr("x", x(end.t) - 4).attr("y", y(end.plan) + 18).attr("text-anchor", "end").text("plan");
  }
```
