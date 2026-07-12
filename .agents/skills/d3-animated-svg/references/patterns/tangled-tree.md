# Tangled Tree

- **Pattern ID:** `d3-tangled-tree`
- **Gallery source ID:** `tangled-tree`
- **Family:** Hierarchy
- **Use when:** A layered tree allows multiple parents per child.
- **Renderer:** `renderTangledTree`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTangledTree() {
    const svg = prepareSvg("tangled-tree", "Tangled tree", "A layered hierarchy with children that can inherit from multiple parents.");
    const nodes = [
      { id: "Root", layer: 0, row: 1 },
      { id: "Alpha", layer: 1, row: 0 }, { id: "Beta", layer: 1, row: 2 },
      { id: "Spec", layer: 2, row: 0 }, { id: "Model", layer: 2, row: 1.4 }, { id: "Ops", layer: 2, row: 2.8 },
      { id: "Pilot", layer: 3, row: .45 }, { id: "Launch", layer: 3, row: 1.65 }, { id: "Audit", layer: 3, row: 2.75 },
      { id: "Learn", layer: 4, row: 1.45 }
    ];
    const links = [
      ["Root", "Alpha"], ["Root", "Beta"], ["Alpha", "Spec"], ["Alpha", "Model"], ["Beta", "Model"], ["Beta", "Ops"],
      ["Spec", "Pilot"], ["Model", "Pilot"], ["Model", "Launch"], ["Ops", "Launch"], ["Ops", "Audit"], ["Pilot", "Learn"], ["Launch", "Learn"], ["Audit", "Learn"]
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const x = d3.scalePoint().domain([0, 1, 2, 3, 4]).range([72, width - 70]);
    const y = d3.scaleLinear().domain([0, 3]).range([78, 310]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const linkColors = [palette.blue, palette.orange, palette.green, palette.purple, palette.red];
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", ([source, target], i) => {
        const a = byId.get(source);
        const b = byId.get(target);
        return link({
          source: { x: x(a.layer) + 34, y: y(a.row) },
          target: { x: x(b.layer) - 34, y: y(b.row) }
        });
      })
      .attr("fill", "none")
      .attr("stroke", (d, i) => linkColors[i % linkColors.length])
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", .5);
    drawPath(paths, .08, .95);
    const groups = svg.append("g").selectAll("g").data(nodes).join("g")
      .attr("transform", d => `translate(${x(d.layer)},${y(d.row)})`);
    groups.append("rect")
      .attr("x", -39).attr("y", -16).attr("width", 78).attr("height", 32).attr("rx", 6)
      .attr("fill", d => d.layer === 0 ? palette.blueHover : d.layer === 4 ? palette.ink : palette.gray50)
      .attr("stroke", d => d.layer === 0 || d.layer === 4 ? palette.ink : palette.gray300)
      .attr("stroke-width", d => d.layer === 0 || d.layer === 4 ? 1.6 : 1.2);
    groups.append("text")
      .attr("class", d => d.layer === 0 || d.layer === 4 ? "reverse-label" : "mark-label")
      .attr("fill", d => d.layer === 0 || d.layer === 4 ? "#fff" : palette.ink)
      .attr("text-anchor", "middle").attr("dy", 4).text(d => d.id);
    fadeIn(groups, .18, .7);
  }
```
