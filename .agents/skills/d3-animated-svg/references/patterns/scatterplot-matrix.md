# Scatterplot Matrix

- **Pattern ID:** `d3-scatterplot-matrix`
- **Gallery source ID:** `scatterplot-matrix`
- **Family:** Multivariate
- **Use when:** Pairwise relationships fill a compact grid of panels.
- **Renderer:** `renderScatterplotMatrix`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderScatterplotMatrix() {
    const svg = prepareSvg("scatterplot-matrix", "Scatterplot matrix", "Pairwise relationships are repeated across a compact grid.");
    const vars = ["speed", "load", "latency"];
    const data = d3.range(30).map(i => ({
      speed: 20 + (i * 17) % 78,
      load: 25 + (i * 29 + Math.sin(i) * 8) % 70,
      latency: 18 + (i * 11 + Math.cos(i * .7) * 18) % 76,
      group: i % 3
    }));
    const size = 104;
    const gap = 16;
    const startX = 112;
    const startY = 60;
    const scales = new Map(vars.map(v => [v, d3.scaleLinear().domain(d3.extent(data, d => d[v])).nice().range([14, size - 14])]));
    const panels = svg.append("g").selectAll("g").data(vars.flatMap((yVar, yi) => vars.map((xVar, xi) => ({ xVar, yVar, xi, yi })))).join("g")
      .attr("transform", d => `translate(${startX + d.xi * (size + gap)},${startY + d.yi * (size + gap)})`);
    panels.append("rect").attr("width", size).attr("height", size).attr("rx", 5).attr("fill", d => d.xi === d.yi ? palette.gray100 : palette.gray50).attr("stroke", palette.gray200);
    panels.filter(d => d.xi === d.yi).append("text").attr("class", "mark-label").attr("x", size / 2).attr("y", size / 2 + 4).attr("text-anchor", "middle").text(d => d.xVar);
    const offDiagonal = panels.filter(d => d.xi !== d.yi);
    const dots = offDiagonal.selectAll("circle").data(d => data.map(row => ({ row, xVar: d.xVar, yVar: d.yVar }))).join("circle")
      .attr("cx", d => scales.get(d.xVar)(d.row[d.xVar]))
      .attr("cy", d => size - scales.get(d.yVar)(d.row[d.yVar]))
      .attr("fill", d => colors[d.row.group])
      .attr("fill-opacity", .7)
      .attr("stroke", "#fff")
      .attr("stroke-width", .8);
    grow(dots, "r", 1, 3.4, .02, .45);
  }
```
