# Event Cascade

- **Pattern ID:** `d3-event-cascade`
- **Gallery source ID:** `event-cascade`
- **Family:** Causality
- **Use when:** Timed events propagate across lagged lanes.
- **Renderer:** `renderEventCascade`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderEventCascade() {
    const svg = prepareSvg("event-cascade", "Event cascade", "Timed lane events propagate through lagged dependencies.");
    const lanes = ["Detect", "Route", "Act", "Recover"];
    const events = [
      { id: "e1", lane: "Detect", t: 8 }, { id: "e2", lane: "Route", t: 21 }, { id: "e3", lane: "Act", t: 35 }, { id: "e4", lane: "Recover", t: 52 },
      { id: "e5", lane: "Detect", t: 28 }, { id: "e6", lane: "Route", t: 42 }, { id: "e7", lane: "Act", t: 58 }, { id: "e8", lane: "Recover", t: 76 }
    ];
    const links = [["e1", "e2"], ["e2", "e3"], ["e3", "e4"], ["e5", "e6"], ["e6", "e7"], ["e7", "e8"]];
    const byId = new Map(events.map(d => [d.id, d]));
    const x = d3.scaleLinear().domain([0, 84]).range([78, width - 42]);
    const y = d3.scaleBand().domain(lanes).range([70, 318]).padding(.42);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("text").data(lanes).join("text")
      .attr("class", "mark-label").attr("x", 66).attr("y", d => y(d) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d);
    lanes.forEach(lane => svg.append("line").attr("x1", x(0)).attr("x2", x(84)).attr("y1", y(lane) + y.bandwidth() / 2).attr("y2", y(lane) + y.bandwidth() / 2).attr("stroke", palette.gray100));
    const linkPath = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", ([source, target]) => linkPath({
        source: { x: x(byId.get(source).t), y: y(byId.get(source).lane) + y.bandwidth() / 2 },
        target: { x: x(byId.get(target).t), y: y(byId.get(target).lane) + y.bandwidth() / 2 }
      }))
      .attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.4).attr("stroke-opacity", .72);
    drawPath(paths, .15, .9);
    const dots = svg.append("g").selectAll("circle").data(events).join("circle")
      .attr("cx", d => x(d.t)).attr("cy", d => y(d.lane) + y.bandwidth() / 2)
      .attr("fill", d => colors[lanes.indexOf(d.lane)]).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 1, 7, .08, .55);
  }
```
