# Circle Packing

- **Pattern ID:** `d3-circle-pack`
- **Gallery source ID:** `circle-pack`
- **Family:** Hierarchy
- **Use when:** Containment and relative area in packed circles.
- **Renderer:** `renderCirclePack`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCirclePack() {
    const svg = prepareSvg("circle-pack", "Circle packing", "D3 pack layout showing containment and relative area.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.pack().size([width - 72, height - 72]).padding(8)(root);
    const g = svg.append("g").attr("transform", "translate(36,36)");
    const nodes = g.selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    const parentFill = new Map([["Create", palette.blueHighlight], ["Serve", palette.orangeHighlight], ["Learn", palette.greenHighlight]]);
    const leafFill = new Map([["Create", palette.blue], ["Serve", palette.orange], ["Learn", palette.green]]);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent?.data.name;
    nodes.append("circle").attr("fill", d => {
      if (d.depth === 0) return palette.gray50;
      if (d.children) return parentFill.get(d.data.name) || palette.blueHighlight;
      return leafFill.get(branchName(d)) || palette.blue;
    })
      .attr("fill-opacity", d => d.depth === 0 ? 1 : .94)
      .attr("stroke", d => d.depth === 0 ? palette.blueHighlight : "#fff").attr("stroke-width", d => d.depth === 0 ? 2 : 2.4);
    grow(nodes.selectAll("circle"), "r", 1, d => d.r, .05, .75);
    nodes.filter(d => d.depth === 1).append("text").attr("class", "mark-label")
      .attr("text-anchor", "middle").attr("y", d => -d.r - 8).text(d => d.data.name);
    nodes.filter(d => !d.children).append("text").attr("class", "reverse-label")
      .style("font-size", d => d.data.name.length > 5 ? "10px" : "12px")
      .attr("text-anchor", "middle").attr("dy", ".35em").text(d => d.data.name);
    fadeIn(nodes.selectAll("text"), .5, .45);
  }
```
