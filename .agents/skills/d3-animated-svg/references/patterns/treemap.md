# Treemap

- **Pattern ID:** `d3-treemap`
- **Gallery source ID:** `treemap`
- **Family:** Hierarchy
- **Use when:** Nested area allocation with readable groups.
- **Renderer:** `renderTreemap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTreemap() {
    const svg = prepareSvg("treemap", "Treemap", "D3 treemap layout showing nested area allocation.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([width - 48, height - 56]).paddingOuter(5).paddingTop(20).paddingInner(3).round(true)(root);
    const g = svg.append("g").attr("transform", "translate(24,28)");
    const color = d3.scaleOrdinal(root.children.map(d => d.data.name), colors);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent.data.name;
    const nodes = g.selectAll("g").data(root.descendants().filter(d => d.depth)).join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);
    nodes.append("rect").attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("rx", 3).attr("fill", d => color(branchName(d))).attr("fill-opacity", d => d.children ? .25 : .82)
      .attr("stroke", "#fff");
    nodes.filter(d => d.children && (d.x1 - d.x0) > 52 && (d.y1 - d.y0) > 22).append("text")
      .attr("class", "treemap-parent-label")
      .attr("x", 7).attr("y", 15)
      .attr("fill", palette.ink)
      .attr("stroke", "none")
      .attr("font-size", 12)
      .attr("font-weight", 800)
      .text(d => d.data.name);
    nodes.filter(d => !d.children && (d.x1 - d.x0) > 52 && (d.y1 - d.y0) > 24).append("text")
      .attr("class", "treemap-leaf-label")
      .attr("x", 7).attr("y", 17)
      .attr("fill", d => branchName(d) === "Create" ? palette.gray900 : palette.surface)
      .attr("stroke", "none")
      .attr("font-size", 12)
      .attr("font-weight", 760)
      .text(d => d.data.name);
    fadeIn(nodes, .05, .7);
  }
```
