# Sortable Rank Table

- **Pattern ID:** `d3-rank-table`
- **Gallery source ID:** `rank-table`
- **Family:** Table
- **Use when:** Rows animate from input order into a score-sorted analytical table.
- **Renderer:** `renderSortableRankTable`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSortableRankTable() {
    const svg = prepareSvg("rank-table", "Sortable rank table", "Rows animate from source order into score-sorted order.");
    const x0 = 54, y0 = 92, rowH = 34, tableW = 450;
    const rows = [
      { name: "Atlas", segment: "Core", score: 78, delta: 5 },
      { name: "Beacon", segment: "Growth", score: 91, delta: 12 },
      { name: "Cedar", segment: "Ops", score: 66, delta: -3 },
      { name: "Delta", segment: "Core", score: 84, delta: 7 },
      { name: "Echo", segment: "Growth", score: 72, delta: 2 },
      { name: "Flux", segment: "Ops", score: 88, delta: 9 }
    ];
    const sorted = rows.slice().sort((a, b) => d3.descending(a.score, b.score));
    const rank = new Map(sorted.map((d, i) => [d.name, i]));
    const score = d3.scaleLinear().domain([60, 95]).range([0, 132]);
    svg.append("rect").attr("x", x0 - 16).attr("y", y0 - 64).attr("width", tableW + 32).attr("height", 274).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Rank", 0],
      ["Team", 54],
      ["Seg.", 156],
      ["Score", 258],
      ["Delta", 406]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.sort-row").data(rows).join("g")
      .attr("class", "sort-row")
      .attr("transform", d => `translate(${x0},${y0 + rank.get(d.name) * rowH})`);
    groups.each(function (d, i) {
      const finalY = y0 + rank.get(d.name) * rowH;
      const startY = y0 + i * rowH;
      d3.select(this).append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "translate")
        .attr("from", `${x0} ${startY}`)
        .attr("to", `${x0} ${finalY}`)
        .attr("dur", ".95s")
        .attr("begin", ".22s")
        .attr("fill", "freeze");
    });
    groups.append("rect").attr("x", -8).attr("y", -16).attr("width", tableW + 24).attr("height", rowH - 4).attr("rx", 6).attr("fill", d => rank.get(d.name) === 0 ? palette.blueHighlight : palette.gray50).attr("stroke", "none");
    groups.append("line").attr("x1", -8).attr("x2", tableW + 16).attr("y1", 16).attr("y2", 16).attr("stroke", palette.gray100).attr("stroke-opacity", .86).attr("stroke-width", .8).attr("shape-rendering", "crispEdges");
    groups.append("text").attr("class", "mark-label").attr("x", 14).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => rank.get(d.name) + 1);
    groups.append("text").attr("class", "mark-label").attr("x", 54).attr("y", 6).attr("font-weight", 700).attr("font-size", 11.5).text(d => d.name);
    groups.append("text").attr("class", "caption").attr("x", 156).attr("y", 6).attr("font-size", 11).text(d => d.segment);
    groups.append("rect").attr("x", 258).attr("y", -9).attr("width", 142).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
    const bars = groups.append("rect").attr("x", 258).attr("y", -9).attr("height", 18).attr("rx", 5).attr("fill", palette.blue).attr("stroke", palette.surface).attr("stroke-width", .9);
    grow(bars, "width", 0, d => score(d.score), .62, .55);
    groups.append("text").attr("class", "mark-label").attr("x", 407).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => d.score);
    groups.append("text").attr("class", "mark-label").attr("x", 452).attr("y", 6).attr("text-anchor", "end").attr("fill", d => d.delta < 0 ? palette.red : palette.green).attr("font-size", 11.5).text(d => `${d.delta > 0 ? "+" : ""}${d.delta}`);
    fadeIn(groups, .04, .45);
  }
```
