# Edge Bundling

- **Pattern ID:** `d3-edge-bundling`
- **Gallery source ID:** `edge-bundling`
- **Family:** Network
- **Use when:** Cross-links routed through hierarchy paths.
- **Renderer:** `renderEdgeBundling`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderEdgeBundling() {
    const svg = prepareSvg("edge-bundling", "Hierarchical edge bundling", "D3 curve bundle routing cross-links through a hierarchy.");
    const root = d3.hierarchy({
      name: "root",
      children: [
        { name: "UI", children: [{ name: "Forms" }, { name: "Canvas" }, { name: "Themes" }] },
        { name: "Data", children: [{ name: "Events" }, { name: "Index" }, { name: "Models" }] },
        { name: "Ops", children: [{ name: "Deploy" }, { name: "Logs" }, { name: "Alerts" }] }
      ]
    });
    d3.cluster().size([2 * Math.PI, 145])(root);
    const leaves = root.leaves();
    const byName = new Map(leaves.map(d => [d.data.name, d]));
    const pairs = [["Forms", "Events"], ["Canvas", "Models"], ["Themes", "Deploy"], ["Index", "Alerts"], ["Logs", "Forms"], ["Models", "Alerts"], ["Events", "Deploy"]];
    const line = d3.lineRadial().curve(d3.curveBundle.beta(.82)).radius(d => d.y).angle(d => d.x);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const paths = g.append("g").attr("fill", "none").attr("stroke", palette.purple).attr("stroke-opacity", .45).attr("stroke-width", 1.5)
      .selectAll("path").data(pairs).join("path").attr("d", d => line(byName.get(d[0]).path(byName.get(d[1]))));
    drawPath(paths, .15, 1.15);
    const labels = g.append("g").selectAll("text").data(leaves).join("text")
      .attr("class", "label").attr("dy", ".31em")
      .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y + 10})${d.x >= Math.PI ? " rotate(180)" : ""}`)
      .attr("text-anchor", d => d.x < Math.PI ? "start" : "end").text(d => d.data.name);
    fadeIn(labels, .35, .5);
  }
```
