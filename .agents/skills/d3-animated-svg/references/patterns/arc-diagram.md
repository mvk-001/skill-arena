# Arc Diagram

- **Pattern ID:** `d3-arc-diagram`
- **Gallery source ID:** `arc-diagram`
- **Family:** Network
- **Use when:** Ordered dependencies shown as curved arcs.
- **Renderer:** `renderArcDiagram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderArcDiagram() {
    const svg = prepareSvg("arc-diagram", "Arc diagram", "Ordered dependencies as curved arcs over nodes.");
    const nodes = ["Auth", "API", "Jobs", "Index", "Search", "Events", "Billing", "Reports"];
    const links = [["Auth", "API", 2], ["API", "Jobs", 4], ["API", "Search", 3], ["Jobs", "Events", 2], ["Index", "Search", 3], ["Events", "Reports", 4], ["Billing", "Reports", 2], ["API", "Reports", 1]];
    const x = d3.scalePoint().domain(nodes).range([52, width - 52]);
    const y = 300;
    const path = d => {
      const x1 = x(d[0]), x2 = x(d[1]), r = Math.abs(x2 - x1) / 2;
      return `M${x1},${y}A${r},${r} 0 0,1 ${x2},${y}`;
    };
    const arcs = svg.append("g").attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .55)
      .selectAll("path").data(links).join("path").attr("d", path).attr("stroke-width", d => d[2]);
    drawPath(arcs, .12, .9);
    svg.append("g").selectAll("circle").data(nodes).join("circle").attr("cx", d => x(d)).attr("cy", y).attr("r", 6).attr("fill", palette.orange);
    svg.append("g").selectAll("text").data(nodes).join("text").attr("class", "label").attr("x", d => x(d)).attr("y", y + 22).attr("text-anchor", "middle").text(d => d);
  }
```
