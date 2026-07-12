# Sparkline Table

- **Pattern ID:** `d3-sparkline-table`
- **Gallery source ID:** `sparkline-table`
- **Family:** Table
- **Use when:** Each table row carries a mini trend line, final value, and directional delta.
- **Renderer:** `renderSparklineTable`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSparklineTable() {
    const svg = prepareSvg("sparkline-table", "Sparkline table", "Rows combine labels, miniature trends, current values, and deltas.");
    const x0 = 46, y0 = 92, rowH = 40;
    const rows = [
      { metric: "Latency", unit: "ms", values: [148, 132, 140, 121, 116, 104, 98] },
      { metric: "Throughput", unit: "rps", values: [320, 348, 360, 342, 388, 430, 468] },
      { metric: "Errors", unit: "%", values: [4.2, 3.8, 3.1, 2.9, 2.2, 1.7, 1.4] },
      { metric: "Adoption", unit: "%", values: [41, 44, 50, 57, 61, 68, 73] },
      { metric: "Cost", unit: "$", values: [88, 91, 84, 79, 77, 74, 70] }
    ];
    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 64).attr("width", 494).attr("height", 264).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Metric", 0],
      ["Trend", 148],
      ["Now", 352],
      ["Delta", 426]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.spark-row").data(rows).join("g")
      .attr("class", "spark-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    groups.append("rect").attr("x", -12).attr("y", -18).attr("width", 480).attr("height", rowH - 6).attr("rx", 6).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 12,
      x0 + 468,
      y0 - 18,
      y0 + rows.length * rowH - 18,
      d3.range(1, rows.length).map(i => y0 - 18 + i * rowH)
    );
    groups.append("text").attr("class", "mark-label").attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => d.metric);
    groups.each(function (d) {
      const g = d3.select(this);
      const x = d3.scalePoint().domain(d3.range(d.values.length)).range([148, 314]);
      const y = d3.scaleLinear().domain(d3.extent(d.values)).nice().range([18, -14]);
      const points = d.values.map((value, i) => ({ value, i }));
      const line = d3.line().x(p => x(p.i)).y(p => y(p.value)).curve(d3.curveMonotoneX);
      g.append("path").datum(points).attr("d", line).attr("fill", "none").attr("stroke", d.values.at(-1) >= d.values[0] ? palette.green : palette.blue).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
      g.append("circle").attr("cx", x(points.at(-1).i)).attr("cy", y(points.at(-1).value)).attr("r", 4.6).attr("fill", palette.red).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    });
    drawPath(groups.selectAll("path"), .08, .74);
    groups.append("text").attr("class", "mark-label").attr("x", 352).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => `${d.values.at(-1)}${d.unit}`);
    groups.append("text").attr("class", "mark-label").attr("x", 456).attr("y", 6).attr("text-anchor", "end").attr("fill", d => d.values.at(-1) >= d.values[0] ? palette.green : palette.blue)
      .attr("font-size", 11.5)
      .text(d => {
        const delta = d.values.at(-1) - d.values[0];
        return `${delta > 0 ? "+" : ""}${delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}`;
      });
    fadeIn(groups, .04, .45);
  }
```
