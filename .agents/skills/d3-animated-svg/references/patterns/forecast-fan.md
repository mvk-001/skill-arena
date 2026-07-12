# Forecast Fan

- **Pattern ID:** `d3-forecast-fan`
- **Gallery source ID:** `forecast-fan`
- **Family:** Uncertainty
- **Use when:** Prediction intervals widen across future periods.
- **Renderer:** `renderForecastFan`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderForecastFan() {
    const svg = prepareSvg("forecast-fan", "Forecast fan", "Nested prediction intervals widen across future periods.");
    const history = d3.range(12).map(i => ({ t: i, y: 42 + Math.sin(i / 2) * 8 + i * 1.5 }));
    const future = d3.range(12, 21).map(i => {
      const median = 42 + Math.sin(i / 2) * 8 + i * 1.5;
      const spread = (i - 11) * 2.3;
      return { t: i, median, lo80: median - spread, hi80: median + spread, lo50: median - spread * .55, hi50: median + spread * .55 };
    });
    const margin = { top: 34, right: 34, bottom: 50, left: 54 };
    const x = d3.scaleLinear().domain([0, 20]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([20, 95]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = (lo, hi) => d3.area().x(d => x(d.t)).y0(d => y(d[lo])).y1(d => y(d[hi])).curve(d3.curveMonotoneX);
    const bands = [
      { lo: "lo80", hi: "hi80", fill: palette.blueHighlight },
      { lo: "lo50", hi: "hi50", fill: palette.cyan }
    ];
    const bandPaths = svg.append("g").selectAll("path").data(bands).join("path")
      .attr("d", d => area(d.lo, d.hi)(future))
      .attr("fill", d => d.fill).attr("fill-opacity", .66);
    fadeIn(bandPaths, .12, .75);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y ?? d.median)).curve(d3.curveMonotoneX);
    const historyPath = svg.append("path").datum(history).attr("d", line).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2.6);
    const medianPath = svg.append("path").datum(future).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2.6).attr("stroke-dasharray", "5 4");
    drawPath(historyPath, .05, .9);
    drawPath(medianPath, .3, .8);
  }
```
