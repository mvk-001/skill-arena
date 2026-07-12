# D3 Flowchart DAG

- **Pattern ID:** `d3-flowchart-dag`
- **Gallery source ID:** `flowchart-dag`
- **Family:** Diagram
- **Use when:** Mermaid-style process logic drawn as explicit D3 nodes, links, and decisions.
- **Renderer:** `renderD3FlowchartDag`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3FlowchartDag() {
    const svg = prepareSvg("flowchart-dag", "D3 flowchart DAG", "A Mermaid-style flowchart rendered directly with D3 SVG marks.");
    const arrow = addArrowMarker(svg, "flowchart-dag", palette.green);
    const nodes = [
      { id: "start", label: "Start", type: "circle", x: 52, y: 210, w: 56, h: 56, fill: palette.blueHighlight, stroke: palette.blue },
      { id: "collect", label: "Collect\nrequest", type: "input", x: 145, y: 210, w: 90, h: 54, fill: palette.surface, stroke: palette.blue },
      { id: "validate", label: "Valid\npayload?", type: "diamond", x: 258, y: 210, w: 82, h: 70, fill: palette.yellowHighlight, stroke: palette.orange },
      { id: "persist", label: "Store\nevent", type: "store", x: 374, y: 140, w: 96, h: 48, fill: palette.yellowHighlight, stroke: palette.orange },
      { id: "repair", label: "Repair\ninput", type: "rect", x: 374, y: 282, w: 96, h: 48, fill: palette.redHighlight, stroke: palette.red },
      { id: "notify", label: "Notify\nsubscriber", type: "rect", x: 486, y: 140, w: 112, h: 48, fill: palette.greenHighlight, stroke: palette.green },
      { id: "done", label: "Done", type: "double", x: 522, y: 250, w: 58, h: 58, fill: palette.blueHighlight, stroke: palette.blue }
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const links = [
      { source: "start", target: "collect" },
      { source: "collect", target: "validate" },
      { source: "validate", target: "persist", label: "yes", bend: -42 },
      { source: "validate", target: "repair", label: "no", bend: 44 },
      { source: "repair", target: "collect", label: "retry", loop: true },
      { source: "persist", target: "notify" },
      { source: "notify", target: "done", bend: 54 }
    ];
    const nodeEdge = (node, toward) => {
      const dx = toward.x - node.x;
      const dy = toward.y - node.y;
      if (Math.abs(dx) > Math.abs(dy)) return { x: node.x + Math.sign(dx) * node.w / 2, y: node.y };
      return { x: node.x, y: node.y + Math.sign(dy) * node.h / 2 };
    };
    const edgePath = d => {
      const source = byId.get(d.source);
      const target = byId.get(d.target);
      if (d.loop) return "M330,282C248,336 132,326 116,238";
      const s = nodeEdge(source, target);
      const t = nodeEdge(target, source);
      const mx = (s.x + t.x) / 2;
      const bend = d.bend || 0;
      return `M${s.x},${s.y}C${mx},${s.y + bend} ${mx},${t.y + bend} ${t.x},${t.y}`;
    };
    const paths = svg.append("g").selectAll("path.flow-link").data(links).join("path")
      .attr("class", "flow-link")
      .attr("d", edgePath)
      .attr("fill", "none")
      .attr("stroke", palette.green)
      .attr("stroke-width", 2.2)
      .attr("stroke-linecap", "round")
      .attr("marker-end", arrow);
    drawPath(paths, .08, .85);
    svg.append("g").selectAll("text.flow-label").data(links.filter(d => d.label)).join("text")
      .attr("class", "caption")
      .attr("x", d => d.loop ? 205 : (byId.get(d.source).x + byId.get(d.target).x) / 2)
      .attr("y", d => d.loop ? 318 : (byId.get(d.source).y + byId.get(d.target).y) / 2 + (d.bend || 0) * .38 - 7)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.flow-node").data(nodes).join("g")
      .attr("class", "flow-node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.each(function (d) {
      const g = d3.select(this);
      if (d.type === "circle" || d.type === "double") {
        g.append("circle").attr("r", d.w / 2).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.3);
        if (d.type === "double") g.append("circle").attr("r", d.w / 2 - 6).attr("fill", "none").attr("stroke", d.stroke).attr("stroke-width", 1.4);
      } else if (d.type === "diamond") {
        g.append("path").attr("d", `M0,${-d.h / 2}L${d.w / 2},0L0,${d.h / 2}L${-d.w / 2},0Z`).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.3);
      } else if (d.type === "input") {
        g.append("path").attr("d", `M${-d.w / 2 + 12},${-d.h / 2}H${d.w / 2}L${d.w / 2 - 12},${d.h / 2}H${-d.w / 2}Z`).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.1);
      } else {
        g.append("rect").attr("x", -d.w / 2).attr("y", -d.h / 2).attr("width", d.w).attr("height", d.h).attr("rx", d.type === "store" ? 16 : 8).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.1);
      }
    });
    groups.selectAll("text").data(d => d.label.split("\n").map((line, i, lines) => ({ line, offset: (i - (lines.length - 1) / 2) * 14 }))).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("dy", d => d.offset + 4)
      .attr("font-weight", 800)
      .text(d => d.line);
    fadeIn(groups, .22, .48);
  }
```
