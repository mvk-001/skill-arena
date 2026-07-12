# Network Evolution

- **Pattern ID:** `d3-temporal-network`
- **Gallery source ID:** `temporal-network`
- **Family:** Network
- **Use when:** Topology snapshots settle as links change.
- **Renderer:** `renderTemporalNetwork`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTemporalNetwork() {
    const svg = prepareSvg("temporal-network", "Network evolution", "Stable nodes shift as topology snapshots change.");
    const nodes = ["API", "Auth", "Jobs", "Data", "UI", "Ops"].map((id, i) => ({ id, group: i % 3 }));
    const linksA = [["API", "Auth"], ["API", "Jobs"], ["Jobs", "Data"], ["UI", "API"], ["Ops", "Jobs"]];
    const linksB = [["API", "Auth"], ["Auth", "Data"], ["Data", "UI"], ["Ops", "API"], ["Jobs", "Ops"], ["UI", "Auth"]];
    const settle = links => {
      const simNodes = nodes.map(d => ({ ...d }));
      const simLinks = links.map(([source, target]) => ({ source, target }));
      const simulation = d3.forceSimulation(simNodes)
        .randomSource(d3.randomLcg(0.71))
        .force("link", d3.forceLink(simLinks).id(d => d.id).distance(82).strength(.7))
        .force("charge", d3.forceManyBody().strength(-230))
        .force("collide", d3.forceCollide(24))
        .force("center", d3.forceCenter(width / 2, height / 2 + 10))
        .stop();
      for (let i = 0; i < 180; i += 1) simulation.tick();
      return new Map(simNodes.map(d => [d.id, d]));
    };
    const start = settle(linksA);
    const end = settle(linksB);
    const linkLines = svg.append("g").selectAll("line").data(linksB).join("line")
      .attr("x1", d => end.get(d[0]).x).attr("y1", d => end.get(d[0]).y)
      .attr("x2", d => end.get(d[1]).x).attr("y2", d => end.get(d[1]).y)
      .attr("stroke", palette.gray300).attr("stroke-width", 2.2).attr("stroke-opacity", .72);
    fadeIn(linkLines, .2, .7);
    const node = svg.append("g").selectAll("g").data(nodes).join("g");
    node.attr("transform", d => `translate(${end.get(d.id).x},${end.get(d.id).y})`);
    node.append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "translate")
      .attr("from", d => `${start.get(d.id).x} ${start.get(d.id).y}`)
      .attr("to", d => `${end.get(d.id).x} ${end.get(d.id).y}`)
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    node.append("circle").attr("r", 17).attr("fill", d => colors[d.group]).attr("stroke", "#fff").attr("stroke-width", 2);
    node.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 34).text(d => d.id);
    svg.append("text").attr("class", "label").attr("x", 52).attr("y", 36).text("snapshot A -> B");
  }
```
