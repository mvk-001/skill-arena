# Tanglegram

- **Pattern ID:** `d3-tanglegram`
- **Gallery source ID:** `tanglegram`
- **Family:** Comparison
- **Use when:** Two trees connect matched leaves across the middle.
- **Renderer:** `renderTanglegram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTanglegram() {
    const svg = prepareSvg("tanglegram", "Tanglegram", "Two comparable trees connect matched leaves across a shared center.");
    const left = [
      { id: "L0", label: "Source", x: 74, y: 202 },
      { id: "L1", label: "A", x: 150, y: 124, parent: "L0" }, { id: "L2", label: "B", x: 150, y: 278, parent: "L0" },
      { id: "L3", label: "a1", x: 230, y: 84, parent: "L1" }, { id: "L4", label: "a2", x: 230, y: 164, parent: "L1" },
      { id: "L5", label: "b1", x: 230, y: 252, parent: "L2" }, { id: "L6", label: "b2", x: 230, y: 326, parent: "L2" }
    ];
    const right = [
      { id: "R0", label: "Target", x: 486, y: 202 },
      { id: "R1", label: "X", x: 410, y: 114, parent: "R0" }, { id: "R2", label: "Y", x: 410, y: 278, parent: "R0" },
      { id: "R3", label: "x1", x: 330, y: 86, parent: "R1" }, { id: "R4", label: "x2", x: 330, y: 182, parent: "R1" },
      { id: "R5", label: "y1", x: 330, y: 248, parent: "R2" }, { id: "R6", label: "y2", x: 330, y: 330, parent: "R2" }
    ];
    const byId = new Map([...left, ...right].map(d => [d.id, d]));
    const treeLinks = [...left, ...right].filter(d => d.parent).map(d => [d.parent, d.id]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const treePaths = svg.append("g").selectAll("path").data(treeLinks).join("path")
      .attr("d", ([source, target]) => link({ source: byId.get(source), target: byId.get(target) }))
      .attr("fill", "none")
      .attr("stroke", "#aebaca")
      .attr("stroke-width", 1.8);
    drawPath(treePaths, .05, .7);
    const matches = [["L3", "R5"], ["L4", "R3"], ["L5", "R6"], ["L6", "R4"]];
    const matchPaths = svg.append("g").selectAll("path").data(matches).join("path")
      .attr("d", ([source, target]) => link({ source: byId.get(source), target: byId.get(target) }))
      .attr("fill", "none")
      .attr("stroke", (d, i) => colors[i])
      .attr("stroke-width", 2.4)
      .attr("stroke-opacity", .72);
    drawPath(matchPaths, .25, .9);
    const nodes = svg.append("g").selectAll("g").data([...left, ...right]).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    nodes.append("circle").attr("fill", d => d.parent ? "#fff" : palette.ink).attr("stroke", palette.blue).attr("stroke-width", 2);
    grow(nodes.selectAll("circle"), "r", 3, d => d.parent ? 8 : 12, .15, .55);
    nodes.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", d => d.parent ? -13 : 25).text(d => d.label);
  }
```
