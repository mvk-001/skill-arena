# Drag Collisions

- **Pattern ID:** `d3-drag-collisions`
- **Gallery source ID:** `drag-collisions`
- **Family:** Simulation
- **Use when:** Collision resolution spreads overlapping nodes from a dragged focus.
- **Renderer:** `renderDragCollisions`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDragCollisions() {
    const svg = prepareSvg("drag-collisions", "Drag collisions", "Collision resolution spreads overlapping nodes from a dragged focus.");
    const center = [width / 2, height / 2 + 14];
    const nodes = d3.range(30).map(i => ({
      id: i,
      startX: center[0] + Math.cos(i) * (18 + i % 5),
      startY: center[1] + Math.sin(i * 1.7) * (18 + i % 6),
      r: 7 + (i % 5)
    }));
    const simNodes = nodes.map(d => ({ ...d, x: d.startX, y: d.startY }));
    d3.forceSimulation(simNodes).randomSource(d3.randomLcg(.28))
      .force("x", d3.forceX(center[0]).strength(.035))
      .force("y", d3.forceY(center[1]).strength(.035))
      .force("collide", d3.forceCollide(d => d.r + 1.5).strength(1)).stop()
      .tick(180);
    const byId = new Map(simNodes.map(d => [d.id, d]));
    const circles = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => byId.get(d.id).x).attr("cy", d => byId.get(d.id).y).attr("r", d => d.r)
      .attr("fill", (d, i) => colors[i % 4]).attr("fill-opacity", .82).attr("stroke", d => d.r > 10 ? palette.gray700 : "#fff").attr("stroke-width", 1.4);
    circles.each(function (d, i) {
      const end = byId.get(d.id);
      const node = d3.select(this);
      node.append("animate").attr("attributeName", "cx").attr("from", d.startX).attr("to", end.x).attr("dur", ".9s").attr("begin", `${.04 + i * .006}s`).attr("fill", "freeze");
      node.append("animate").attr("attributeName", "cy").attr("from", d.startY).attr("to", end.y).attr("dur", ".9s").attr("begin", `${.04 + i * .006}s`).attr("fill", "freeze");
    });
    svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", 10).attr("fill", palette.ink).attr("stroke", "#fff").attr("stroke-width", 2);
  }
```
