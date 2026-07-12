# D3 State Machine

- **Pattern ID:** `d3-state-machine`
- **Gallery source ID:** `state-machine`
- **Family:** Diagram
- **Use when:** State, choice, fork, join, start, and end symbols laid out without Mermaid.
- **Renderer:** `renderD3StateMachine`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3StateMachine() {
    const svg = prepareSvg("state-machine", "D3 state machine", "A state diagram rendered with explicit D3 node symbols and transitions.");
    const arrow = addArrowMarker(svg, "state-machine", palette.purple);
    const nodes = [
      { id: "start", label: "", type: "start", x: 38, y: 210, w: 18, h: 18 },
      { id: "Draft", label: "Draft", type: "state", x: 112, y: 210, w: 78, h: 42 },
      { id: "Review", label: "Review", type: "state", x: 214, y: 210, w: 86, h: 42 },
      { id: "Choice", label: "", type: "choice", x: 306, y: 210, w: 36, h: 36 },
      { id: "Approved", label: "Approved", type: "state", x: 390, y: 142, w: 92, h: 42 },
      { id: "Fork", label: "", type: "barV", x: 476, y: 142, w: 9, h: 62 },
      { id: "Publish", label: "Publish", type: "state", x: 520, y: 96, w: 76, h: 38 },
      { id: "Archive", label: "Archive", type: "state", x: 520, y: 190, w: 76, h: 38 },
      { id: "Join", label: "", type: "barH", x: 438, y: 302, w: 62, h: 9 },
      { id: "end", label: "", type: "end", x: 520, y: 302, w: 22, h: 22 }
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const links = [
      ["start", "Draft", ""], ["Draft", "Review", "submit"], ["Review", "Choice", ""],
      ["Choice", "Approved", "accepted"], ["Choice", "Draft", "changes", true],
      ["Approved", "Fork", ""], ["Fork", "Publish", ""], ["Fork", "Archive", ""],
      ["Publish", "Join", ""], ["Archive", "Join", ""], ["Join", "end", ""]
    ].map(([source, target, label, loop]) => ({ source, target, label, loop }));
    const pathFor = d => {
      const a = byId.get(d.source);
      const b = byId.get(d.target);
      if (d.loop) return "M300,228C260,294 114,294 96,232";
      const bend = Math.abs(a.y - b.y) > 50 ? 34 : 0;
      return `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y + bend} ${(a.x + b.x) / 2},${b.y - bend} ${b.x},${b.y}`;
    };
    const paths = svg.append("g").selectAll("path.state-link").data(links).join("path")
      .attr("class", "state-link")
      .attr("d", pathFor)
      .attr("fill", "none")
      .attr("stroke", palette.purple)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .72)
      .attr("marker-end", arrow);
    drawPath(paths, .08, .85);
    svg.append("g").selectAll("text.state-link-label").data(links.filter(d => d.label)).join("text")
      .attr("class", "caption")
      .attr("x", d => d.loop ? 178 : (byId.get(d.source).x + byId.get(d.target).x) / 2)
      .attr("y", d => d.loop ? 286 : (byId.get(d.source).y + byId.get(d.target).y) / 2 - 8)
      .attr("text-anchor", "middle")
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.state-node").data(nodes).join("g")
      .attr("class", "state-node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.each(function (d) {
      const g = d3.select(this);
      if (d.type === "start") g.append("circle").attr("r", 9).attr("fill", palette.ink);
      else if (d.type === "end") {
        g.append("circle").attr("r", 13).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2);
        g.append("circle").attr("r", 8).attr("fill", palette.ink);
      } else if (d.type === "choice") {
        g.append("path").attr("d", "M0,-20L20,0L0,20L-20,0Z").attr("fill", palette.yellowHighlight).attr("stroke", palette.orange).attr("stroke-width", 2);
      } else if (d.type === "barV") g.append("rect").attr("x", -5).attr("y", -31).attr("width", 10).attr("height", 62).attr("rx", 4).attr("fill", palette.ink);
      else if (d.type === "barH") g.append("rect").attr("x", -31).attr("y", -5).attr("width", 62).attr("height", 10).attr("rx", 4).attr("fill", palette.ink);
      else g.append("rect").attr("x", -d.w / 2).attr("y", -d.h / 2).attr("width", d.w).attr("height", d.h).attr("rx", 10).attr("fill", palette.blueHighlight).attr("stroke", palette.blue).attr("stroke-width", 2);
    });
    groups.filter(d => d.label).append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.label);
    fadeIn(groups, .2, .45);
  }
```
