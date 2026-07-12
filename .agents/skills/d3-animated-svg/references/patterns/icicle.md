# Icicle

- **Pattern ID:** `d3-icicle`
- **Gallery source ID:** `icicle`
- **Family:** Hierarchy
- **Use when:** Rectangular partition for drilldown paths.
- **Renderer:** `renderIcicle`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderIcicle() {
    const svg = prepareSvg("icicle", "Icicle", "D3 partition laid out as horizontal nested bands.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0);
    d3.partition().size([width - 48, height - 58]).padding(2)(root);
    const color = d3.scaleOrdinal(["Platform", "Create", "Serve", "Learn"], [palette.purple, palette.blue, palette.orange, palette.green]);
    const g = svg.append("g").attr("transform", "translate(24,30)");
    const nodes = g.selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.x0},${d.y0})`);
    nodes.append("rect").attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("fill", d => color(d.depth <= 1 ? d.data.name : d.parent.data.name)).attr("fill-opacity", d => d.depth ? .85 : .22)
      .attr("stroke", "#fff").attr("rx", 2);
    nodes.filter(d => (d.x1 - d.x0) > 42).append("text")
      .attr("class", d => d.depth === 0 ? "mark-label" : "reverse-label")
      .style("font-size", d => (d.x1 - d.x0) < 64 ? "10px" : "12px")
      .attr("x", 5).attr("y", 18).text(d => d.data.name);
    fadeIn(nodes, .05, .7);
  }
```
