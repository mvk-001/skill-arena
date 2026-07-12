# Sunburst

- **Pattern ID:** `d3-sunburst`
- **Gallery source ID:** `sunburst`
- **Family:** Hierarchy
- **Use when:** Radial partition for nested composition.
- **Renderer:** `renderSunburst`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSunburst() {
    const svg = prepareSvg("sunburst", "Sunburst", "D3 radial partition showing nested composition.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0);
    d3.partition().size([2 * Math.PI, 170])(root);
    const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0).outerRadius(d => d.y1 - 2);
    const color = d3.scaleOrdinal(["Create", "Serve", "Learn"], [palette.blue, palette.orange, palette.green]);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 10})`);
    const paths = g.selectAll("path").data(root.descendants().filter(d => d.depth)).join("path")
      .attr("d", arc).attr("fill", d => color((d.depth === 1 ? d : d.parent).data.name))
      .attr("fill-opacity", d => d.depth === 1 ? .72 : .95).attr("stroke", "#fff");
    fadeIn(paths, .08, .75);
    g.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", ".35em").text("Platform");
    const legend = svg.append("g").attr("transform", "translate(48,48)").selectAll("g").data(["Create", "Serve", "Learn"]).join("g")
      .attr("transform", (d, i) => `translate(0,${i * 22})`);
    legend.append("rect").attr("x", 0).attr("y", -10).attr("width", 13).attr("height", 13).attr("rx", 2).attr("fill", d => color(d));
    legend.append("text").attr("class", "mark-label").attr("x", 20).attr("y", 1).text(d => d);
  }
```
