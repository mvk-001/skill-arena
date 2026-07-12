# Pivot Heat Table

- **Pattern ID:** `d3-pivot-heat-table`
- **Gallery source ID:** `pivot-heat-table`
- **Family:** Table
- **Use when:** A cross-tab table uses ordered color and totals to expose segment patterns.
- **Renderer:** `renderPivotHeatTable`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPivotHeatTable() {
    const svg = prepareSvg("pivot-heat-table", "Pivot heat table", "A pivot-style data table with heat-encoded values and totals.");
    const rows = ["Search", "Direct", "Partner", "Email", "Social"];
    const cols = ["Q1", "Q2", "Q3", "Q4"];
    const values = [
      [54, 61, 73, 88],
      [42, 58, 64, 77],
      [31, 46, 52, 69],
      [64, 62, 57, 71],
      [22, 28, 35, 44]
    ];
    const x0 = 118, y0 = 76, cellW = 70, cellH = 46;
    const color = d3.scaleQuantize().domain([20, 90]).range([palette.yellowHighlight, palette.orangeHighlight, palette.orange, palette.red]);
    const darkHeatCell = value => value >= 61;
    svg.append("rect").attr("x", 54).attr("y", 48).attr("width", 448).attr("height", 286).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("g").selectAll("text.col").data(cols).join("text")
      .attr("class", "caption")
      .attr("x", (d, i) => x0 + i * cellW + cellW / 2)
      .attr("y", y0 - 9)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .attr("font-size", 11.5)
      .text(d => d);
    svg.append("text").attr("class", "caption").attr("x", x0 + cols.length * cellW + 44).attr("y", y0 - 9).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 11.5).text("Total");
    svg.append("g").selectAll("text.row").data(rows).join("text")
      .attr("class", "mark-label")
      .attr("x", x0 - 16)
      .attr("y", (d, i) => y0 + i * cellH + cellH / 2 + 5)
      .attr("text-anchor", "end")
      .attr("font-size", 11.5)
      .text(d => d);
    const cells = rows.flatMap((r, ri) => cols.map((c, ci) => ({ row: r, col: c, ri, ci, value: values[ri][ci] })));
    const cell = svg.append("g").selectAll("g.pivot-cell").data(cells).join("g")
      .attr("class", "pivot-cell")
      .attr("transform", d => `translate(${x0 + d.ci * cellW},${y0 + d.ri * cellH})`);
    cell.append("rect")
      .attr("width", cellW - 4)
      .attr("height", cellH - 4)
      .attr("rx", 6)
      .attr("fill", d => color(d.value))
      .attr("stroke", d => darkHeatCell(d.value) ? palette.surface : palette.gray100)
      .attr("stroke-opacity", d => darkHeatCell(d.value) ? 1 : .86)
      .attr("stroke-width", d => darkHeatCell(d.value) ? 1.3 : .8);
    cell.append("text")
      .attr("class", d => d.value >= 73 ? "reverse-label" : "mark-label")
      .attr("x", (cellW - 4) / 2)
      .attr("y", (cellH - 4) / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .attr("font-size", 12)
      .attr("fill", d => d.value >= 73 ? palette.surface : palette.ink)
      .text(d => d.value);
    rows.forEach((row, i) => {
      const total = d3.sum(values[i]);
      svg.append("text").attr("class", "mark-label").attr("x", x0 + cols.length * cellW + 44).attr("y", y0 + i * cellH + cellH / 2 + 5).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 11.5).text(total);
    });
    fadeIn(cell, .06, .58);
  }
```
