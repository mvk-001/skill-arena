# Critical Path DAG

- **Pattern ID:** `d3-critical-path`
- **Gallery source ID:** `critical-path`
- **Family:** Flow
- **Use when:** Weighted dependencies reveal the bottleneck route.
- **Renderer:** `renderCriticalPath`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCriticalPath() {
    const svg = prepareSvg("critical-path", "Critical path DAG", "Weighted dependencies reveal the bottleneck route.");
    const nodes = [
      { id: "Plan", rank: 0, row: 1 }, { id: "Design", rank: 1, row: 0 }, { id: "Data", rank: 1, row: 2 },
      { id: "Build", rank: 2, row: 1 }, { id: "Review", rank: 3, row: 0 }, { id: "Launch", rank: 4, row: 1 }, { id: "Learn", rank: 5, row: 1 }
    ];
    const links = [
      ["Plan", "Design", 4, true], ["Plan", "Data", 3, false], ["Design", "Build", 8, true],
      ["Data", "Build", 5, false], ["Build", "Review", 6, true], ["Review", "Launch", 3, true],
      ["Build", "Launch", 4, false], ["Launch", "Learn", 2, true]
    ].map(([source, target, duration, critical]) => ({ source, target, duration, critical }));
    const byId = new Map(nodes.map(d => [d.id, d]));
    const x = d3.scalePoint().domain([0, 1, 2, 3, 4, 5]).range([70, width - 56]);
    const y = d3.scalePoint().domain([0, 1, 2]).range([82, 298]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", d => link({ source: { x: x(byId.get(d.source).rank), y: y(byId.get(d.source).row) }, target: { x: x(byId.get(d.target).rank), y: y(byId.get(d.target).row) } }))
      .attr("fill", "none").attr("stroke", d => d.critical ? palette.red : "#b8c4d1")
      .attr("stroke-width", d => d.critical ? 3 : 1.8).attr("stroke-opacity", d => d.critical ? .88 : .55);
    drawPath(paths, .08, .85);
    const groups = svg.append("g").selectAll("g").data(nodes).join("g").attr("transform", d => `translate(${x(d.rank)},${y(d.row)})`);
    const circles = groups.append("circle").attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(circles, "r", 4, 18, .15, .55);
    groups.append("text").attr("class", "label").attr("text-anchor", "middle").attr("dy", 34).text(d => d.id);
  }
```
