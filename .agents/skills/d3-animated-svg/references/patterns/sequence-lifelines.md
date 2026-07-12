# D3 Sequence Lifelines

- **Pattern ID:** `d3-sequence-lifelines`
- **Gallery source ID:** `sequence-lifelines`
- **Family:** Diagram
- **Use when:** Actor boxes, lifelines, activations, and replies composed directly in SVG.
- **Renderer:** `renderD3SequenceLifelines`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3SequenceLifelines() {
    const svg = prepareSvg("sequence-lifelines", "D3 sequence lifelines", "A sequence diagram rendered from actor and message records.");
    const arrow = addArrowMarker(svg, "sequence-lifelines", palette.blueHover);
    const actors = [
      { id: "Client", x: 54, color: palette.blueHighlight },
      { id: "API", x: 176, color: palette.yellowHighlight },
      { id: "DB", x: 294, color: palette.greenHighlight },
      { id: "Job", x: 412, color: palette.purpleHighlight },
      { id: "Worker", x: 514, color: palette.blueHighlight }
    ];
    const x = new Map(actors.map(d => [d.id, d.x]));
    const messages = [
      { from: "Client", to: "API", y: 118, label: "Submit order" },
      { from: "API", to: "DB", y: 156, label: "Reserve inventory" },
      { from: "DB", to: "API", y: 194, label: "Reservation id", reply: true },
      { from: "API", to: "Job", y: 232, label: "Schedule pick list" },
      { from: "API", to: "Client", y: 270, label: "Accepted", reply: true },
      { from: "Worker", to: "Job", y: 314, label: "Process queue item" },
      { from: "Job", to: "Worker", y: 352, label: "Complete", reply: true }
    ];
    const actorGroups = svg.append("g").selectAll("g.seq-actor").data(actors).join("g")
      .attr("class", "seq-actor")
      .attr("transform", d => `translate(${d.x},50)`);
    actorGroups.append("rect").attr("x", -39).attr("y", -17).attr("width", 78).attr("height", 34).attr("rx", 8).attr("fill", d => d.color).attr("stroke", palette.blue).attr("stroke-width", 1.7);
    actorGroups.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.id);
    fadeIn(actorGroups, .06, .38);
    const lifelines = svg.append("g").selectAll("line.seq-lifeline").data(actors).join("line")
      .attr("class", "seq-lifeline")
      .attr("x1", d => d.x)
      .attr("x2", d => d.x)
      .attr("y1", 72)
      .attr("y2", 374)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4 5");
    drawPath(lifelines, .15, .75);
    const activation = svg.append("rect").attr("x", x.get("API") - 8).attr("y", 104).attr("width", 16).attr("height", 182).attr("rx", 4).attr("fill", palette.yellowHighlight).attr("stroke", palette.orange).attr("stroke-width", 1.4);
    fadeIn(activation, .35, .4);
    const msg = svg.append("g").selectAll("g.seq-message").data(messages).join("g").attr("class", "seq-message");
    const paths = msg.append("path")
      .attr("d", d => `M${x.get(d.from)},${d.y}H${x.get(d.to)}`)
      .attr("fill", "none")
      .attr("stroke", d => d.reply ? palette.green : palette.blueHover)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", d => d.reply ? "5 5" : null)
      .attr("marker-end", arrow);
    drawPath(paths, .28, .72);
    msg.append("text")
      .attr("class", "caption")
      .attr("x", d => (x.get(d.from) + x.get(d.to)) / 2)
      .attr("y", d => d.y - 7)
      .attr("text-anchor", "middle")
      .attr("font-size", 10.5)
      .text(d => d.label);
    const note = svg.append("g").attr("transform", "translate(64,386)");
    note.append("rect").attr("width", 386).attr("height", 22).attr("rx", 7).attr("fill", palette.greenHighlight).attr("stroke", palette.green).attr("stroke-width", 1.2);
    note.append("text").attr("class", "caption").attr("x", 193).attr("y", 15).attr("text-anchor", "middle").text("actors, activations, replies");
    fadeIn(note, .95, .35);
  }
```
