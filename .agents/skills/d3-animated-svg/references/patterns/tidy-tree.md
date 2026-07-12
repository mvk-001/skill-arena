# Tidy Tree

- **Pattern ID:** `d3-tidy-tree`
- **Gallery source ID:** `tidy-tree`
- **Family:** Hierarchy
- **Use when:** Layered node-link hierarchy with balanced spacing.
- **Renderer:** `renderTidyTree`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTidyTree() {
    const svg = prepareSvg("tidy-tree", "Tidy tree", "D3 tree layout with horizontal links.");
    const root = d3.hierarchy(hierarchyData());
    d3.tree().size([height - 72, width - 150])(root);
    const g = svg.append("g").attr("transform", "translate(70,36)");
    const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);
    const links = g.append("g").attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 1.8)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .08, .9);
    const nodes = g.append("g").selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.y},${d.x})`);
    nodes.append("circle").attr("r", d => d.children ? 8 : 6).attr("fill", d => d.children ? palette.blue : palette.green).attr("stroke", "#fff").attr("stroke-width", 2);
    nodes.append("text").attr("class", "label").attr("x", d => d.children ? -12 : 12).attr("dy", ".35em").attr("text-anchor", d => d.children ? "end" : "start").text(d => d.data.name);
    fadeIn(nodes, .28, .5);
  }
```
