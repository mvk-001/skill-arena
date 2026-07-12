# Column Profile Table

- **Pattern ID:** `d3-column-profile`
- **Gallery source ID:** `column-profile`
- **Family:** Table
- **Use when:** Column-level data quality, cardinality, and distributions are rendered as row profiles.
- **Renderer:** `renderColumnProfileTable`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderColumnProfileTable() {
    const svg = prepareSvg("column-profile", "Column profile table", "A data profiling table rendered with D3 row profiles and mini distributions.");
    const x0 = 46, y0 = 92, rowH = 38;
    const rows = [
      { column: "customer_id", type: "string", complete: 1, unique: 1180, bins: [1, 1, 1, 1, 1, 1] },
      { column: "region", type: "category", complete: .98, unique: 5, bins: [34, 22, 18, 16, 10] },
      { column: "plan", type: "category", complete: .96, unique: 4, bins: [48, 26, 18, 8] },
      { column: "score", type: "number", complete: .93, unique: 74, bins: [4, 9, 18, 27, 24, 12, 6] },
      { column: "latency_ms", type: "number", complete: .89, unique: 122, bins: [28, 34, 22, 9, 5, 2] }
    ];
    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 64).attr("width", 494).attr("height", 246).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Column", 0],
      ["Type", 138],
      ["Filled", 236],
      ["Unique", 366],
      ["Dist.", 428]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.profile-row").data(rows).join("g")
      .attr("class", "profile-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    groups.append("rect").attr("x", -12).attr("y", -17).attr("width", 480).attr("height", rowH - 6).attr("rx", 6).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 12,
      x0 + 468,
      y0 - 17,
      y0 + rows.length * rowH - 17,
      d3.range(1, rows.length).map(i => y0 - 17 + i * rowH)
    );
    groups.append("text").attr("class", "mark-label").attr("y", 6).attr("font-weight", 800).attr("font-size", 11.2).text(d => d.column);
    groups.append("rect").attr("x", 138).attr("y", -11).attr("width", 76).attr("height", 22).attr("rx", 6).attr("fill", d => d.type === "number" ? palette.blueHighlight : palette.greenHighlight).attr("stroke", "none");
    groups.append("text").attr("class", "mark-label").attr("x", 176).attr("y", 6).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 10.5).text(d => d.type);
    groups.append("rect").attr("x", 236).attr("y", -9).attr("width", 72).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
    const completeBars = groups.append("rect").attr("x", 236).attr("y", -9).attr("height", 18).attr("rx", 5).attr("fill", d => d.complete >= .95 ? palette.green : palette.orange).attr("stroke", palette.surface).attr("stroke-width", .9);
    grow(completeBars, "width", 0, d => d.complete * 72, .12, .58);
    groups.append("text").attr("class", "mark-label").attr("x", 314).attr("y", 6).attr("font-weight", 800).attr("font-size", 11).text(d => d3.format(".0%")(d.complete));
    groups.append("text").attr("class", "mark-label").attr("x", 366).attr("y", 6).attr("font-weight", 800).attr("font-size", 11).text(d => d3.format(",")(d.unique));
    groups.each(function (d) {
      const g = d3.select(this);
      const barW = 7;
      const gap = 3;
      const y = d3.scaleLinear().domain([0, d3.max(d.bins)]).range([0, 24]);
      const bars = g.append("g").selectAll("rect.dist").data(d.bins).join("rect")
        .attr("class", "dist")
        .attr("x", (value, i) => 428 + i * (barW + gap))
        .attr("y", value => 12 - y(value))
        .attr("width", barW)
        .attr("height", value => y(value))
        .attr("rx", 2)
        .attr("fill", d.type === "number" ? palette.blue : palette.purple)
        .attr("fill-opacity", .82)
        .attr("stroke", palette.surface)
        .attr("stroke-width", .7);
      fadeIn(bars, .18, .45);
    });
    fadeIn(groups, .04, .45);
  }
```
