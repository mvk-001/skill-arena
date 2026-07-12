# Empirical CDF

- **Pattern ID:** `d3-ecdf`
- **Gallery source ID:** `ecdf`
- **Family:** Distribution
- **Use when:** Cumulative probability reveals quantiles and tails.
- **Renderer:** `renderEcdf`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderEcdf() {
    const svg = prepareSvg("ecdf", "Empirical CDF", "Sorted observations accumulate into cumulative probability.");
    const values = d3.range(48).map(i => 28 + Math.sin(i * .47) * 15 + Math.cos(i * .19) * 12 + i * .65).sort(d3.ascending);
    const data = values.map((value, i) => ({ value, p: (i + 1) / values.length }));
    const margin = { top: 38, right: 34, bottom: 52, left: 56 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const rug = svg.append("g").selectAll("line").data(values).join("line")
      .attr("x1", d => x(d)).attr("x2", d => x(d))
      .attr("y1", height - margin.bottom + 8).attr("y2", height - margin.bottom + 20)
      .attr("stroke", palette.cyan).attr("stroke-width", 1.4);
    fadeIn(rug, .03, .5);
    const line = d3.line().x(d => x(d.value)).y(d => y(d.p)).curve(d3.curveStepAfter);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3);
    drawPath(path, .15, 1);
    [.25, .5, .75].forEach(q => {
      const value = d3.quantileSorted(values, q);
      svg.append("line").attr("x1", x(value)).attr("x2", x(value)).attr("y1", y(q)).attr("y2", height - margin.bottom)
        .attr("stroke", palette.orange).attr("stroke-dasharray", "4 5");
      svg.append("text").attr("class", "label").attr("x", x(value) + 5).attr("y", y(q) - 5).text(`q${q * 100}`);
    });
  }
```
