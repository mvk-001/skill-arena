# Data Table Grid

- **Pattern ID:** `d3-data-grid`
- **Gallery source ID:** `data-grid`
- **Family:** Table
- **Use when:** Rows, typed columns, status chips, and row focus composed as SVG marks.
- **Renderer:** `renderDataTableGrid`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDataTableGrid() {
    const svg = prepareSvg("data-grid", "Data table grid", "A D3-built SVG table with typed columns and row-level emphasis.");
    const x0 = 32, y0 = 56, tableW = 496, rowH = 36, headerH = 34;
    const columns = [
      { key: "id", label: "ID", x: 14, w: 58 },
      { key: "owner", label: "Owner", x: 82, w: 102 },
      { key: "stage", label: "Stage", x: 194, w: 98 },
      { key: "risk", label: "Risk", x: 304, w: 72 },
      { key: "eta", label: "ETA", x: 388, w: 86 }
    ];
    const rows = [
      { id: "A-17", owner: "Nora", stage: "Design", risk: "Low", eta: "2d", color: palette.green },
      { id: "B-04", owner: "Kai", stage: "Build", risk: "Med", eta: "5d", color: palette.orange },
      { id: "C-22", owner: "Mira", stage: "Review", risk: "High", eta: "1d", color: palette.red },
      { id: "D-11", owner: "Sol", stage: "Ship", risk: "Low", eta: "0d", color: palette.blue },
      { id: "E-08", owner: "Jules", stage: "Learn", risk: "Med", eta: "7d", color: palette.purple },
      { id: "F-31", owner: "Rae", stage: "Build", risk: "Low", eta: "3d", color: palette.green }
    ];
    svg.append("rect").attr("x", x0).attr("y", y0).attr("width", tableW).attr("height", headerH + rows.length * rowH).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("rect").attr("x", x0).attr("y", y0).attr("width", tableW).attr("height", headerH).attr("rx", 8).attr("fill", palette.ink);
    svg.append("rect").attr("x", x0).attr("y", y0 + headerH - 8).attr("width", tableW).attr("height", 8).attr("fill", palette.ink);
    addSoftTableRules(
      svg,
      x0,
      x0 + tableW,
      y0,
      y0 + headerH,
      [y0 + headerH],
      [x0 + 70, x0 + 184, x0 + 292, x0 + 380],
      palette.surface,
      .58,
      1
    );
    svg.append("g").selectAll("text").data(columns).join("text")
      .attr("class", "reverse-label")
      .attr("x", d => x0 + d.x)
      .attr("y", y0 + 22)
      .attr("font-weight", 800)
      .attr("font-size", 12.5)
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.table-row").data(rows).join("g")
      .attr("class", "table-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + headerH + i * rowH})`);
    groups.append("rect")
      .attr("width", tableW)
      .attr("height", rowH)
      .attr("fill", (d, i) => d.risk === "High" ? palette.redHighlight : i % 2 ? palette.gray50 : palette.surface)
      .attr("stroke", "none");
    addSoftTableRules(
      svg,
      x0,
      x0 + tableW,
      y0 + headerH,
      y0 + headerH + rows.length * rowH,
      d3.range(rows.length).map(i => y0 + headerH + i * rowH),
      [x0 + 70, x0 + 184, x0 + 292, x0 + 380]
    );
    groups.append("circle").attr("cx", 20).attr("cy", rowH / 2).attr("r", 4.6).attr("fill", d => d.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
    columns.forEach(col => {
      groups.append("text")
        .attr("class", "mark-label")
        .attr("x", col.key === "id" ? col.x + 18 : col.x)
        .attr("y", rowH / 2 + 5)
        .attr("font-weight", col.key === "risk" ? 800 : 600)
        .attr("font-size", 12)
        .text(d => d[col.key]);
    });
    fadeIn(groups, .06, .5);
  }
```
