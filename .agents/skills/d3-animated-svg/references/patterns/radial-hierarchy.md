# Radial Hierarchy

- **Pattern ID:** `d3-radial-hierarchy`
- **Gallery source ID:** `radial-hierarchy`
- **Family:** Hierarchy
- **Use when:** A tree layout with curved parent-child paths.
- **Renderer:** `renderRadialHierarchy`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRadialHierarchy() {
    const svg = prepareSvg("radial-hierarchy", "Radial hierarchy", "D3 radial cluster with drawn parent-child paths.");
    const root = d3.hierarchy(hierarchyData());
    const radius = 156;
    d3.cluster().size([2 * Math.PI, radius])(root);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const radialPoint = d => [Math.cos(d.x - Math.PI / 2) * d.y, Math.sin(d.x - Math.PI / 2) * d.y];
    const link = d3.linkRadial().angle(d => d.x).radius(d => d.y);
    const links = center.append("g").attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 1.7)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .15, 1.15);
    const nodes = center.append("g").selectAll("g").data(root.descendants()).join("g")
      .attr("transform", d => `translate(${radialPoint(d)})`);
    nodes.append("circle").attr("r", d => d.depth === 0 ? 18 : d.children ? 12 : 7)
      .attr("fill", d => d.depth === 0 ? palette.purple : d.children ? palette.blue : palette.green)
      .attr("stroke", "#fff").attr("stroke-width", 2);
    nodes.append("text").attr("class", "label").attr("dy", d => d.depth === 0 ? 34 : 4)
      .attr("x", d => d.depth === 0 ? 0 : (d.x < Math.PI ? 12 : -12))
      .attr("text-anchor", d => d.depth === 0 ? "middle" : (d.x < Math.PI ? "start" : "end"))
      .text(d => d.data.name);
    fadeIn(nodes, .35, .7);
  }
```
