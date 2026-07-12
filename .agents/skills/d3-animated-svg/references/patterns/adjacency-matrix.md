# Adjacency Matrix

- **Pattern ID:** `d3-adjacency-matrix`
- **Gallery source ID:** `adjacency-matrix`
- **Family:** Network
- **Use when:** Dense relationships as a sortable grid.
- **Renderer:** `renderAdjacencyMatrix`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAdjacencyMatrix() {
    const svg = prepareSvg("adjacency-matrix", "Adjacency matrix", "Dense network relationship weights as cells.");
    const names = ["API", "Auth", "Jobs", "Search", "Index", "Events", "Reports"];
    const links = [["API", "Auth", 4], ["API", "Jobs", 3], ["API", "Search", 5], ["Search", "Index", 4], ["Jobs", "Events", 2], ["Events", "Reports", 5], ["Auth", "Reports", 2], ["Index", "Reports", 3]];
    const matrix = new Map(links.flatMap(([a, b, v]) => [[[a, b].join("|"), v], [[b, a].join("|"), v]]));
    const band = d3.scaleBand().domain(names).range([82, 352]).padding(.04);
    const color = quantizedRamp([1, 5], ramps.blue);
    const cells = svg.append("g").selectAll("rect").data(names.flatMap(a => names.map(b => ({ a, b, value: matrix.get([a, b].join("|")) || 0 })))).join("rect")
      .attr("x", d => band(d.a)).attr("y", d => band(d.b)).attr("width", band.bandwidth()).attr("height", band.bandwidth())
      .attr("fill", d => d.value ? color(d.value) : palette.gray100).attr("stroke", "#fff");
    fadeIn(cells, .05, .55);
    svg.append("g").selectAll("text.row").data(names).join("text").attr("class", "label").attr("x", 74).attr("y", d => band(d) + band.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d);
    svg.append("g").selectAll("text.col").data(names).join("text").attr("class", "label").attr("transform", d => `translate(${band(d) + band.bandwidth() / 2},74) rotate(-45)`).attr("text-anchor", "start").text(d => d);
  }
```
