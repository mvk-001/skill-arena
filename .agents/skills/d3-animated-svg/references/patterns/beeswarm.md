# Beeswarm

- **Pattern ID:** `d3-beeswarm`
- **Gallery source ID:** `beeswarm`
- **Family:** Distribution
- **Use when:** Individual observations settle into grouped swarms.
- **Renderer:** `renderBeeswarm`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBeeswarm() {
    const svg = prepareSvg("beeswarm", "Beeswarm distribution", "D3 force collision layout for individual observations.");
    const data = [
      ["Baseline", 34], ["Baseline", 41], ["Baseline", 46], ["Baseline", 52], ["Baseline", 57], ["Baseline", 63], ["Baseline", 69], ["Baseline", 74],
      ["Pilot", 39], ["Pilot", 48], ["Pilot", 54], ["Pilot", 59], ["Pilot", 67], ["Pilot", 73], ["Pilot", 81], ["Pilot", 86],
      ["Scaled", 45], ["Scaled", 53], ["Scaled", 61], ["Scaled", 68], ["Scaled", 76], ["Scaled", 83], ["Scaled", 88], ["Scaled", 92]
    ].map((d, i) => ({ id: `p${i}`, group: d[0], score: d[1] }));
    const margin = { top: 36, right: 30, bottom: 56, left: 82 };
    const x = d3.scaleLinear().domain([30, 95]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(["Baseline", "Pilot", "Scaled"]).range([92, 300]).padding(.5);
    const groupColor = new Map([["Baseline", palette.blue], ["Pilot", palette.orange], ["Scaled", palette.green]]);
    const nodes = data.map(d => ({ ...d, x: x(d.score), y: y(d.group) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => x(d.score)).strength(.95))
      .force("y", d3.forceY(d => y(d.group)).strength(.25))
      .force("collide", d3.forceCollide(10.5)).stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();
    svg.append("g").attr("class", "grid").attr("transform", "translate(0,320)")
      .call(d3.axisBottom(x).ticks(6).tickSize(-260).tickFormat(""));
    axisBottom(svg, x, 320, 6);
    svg.selectAll(".group-label").data(y.domain()).join("text").attr("class", "label")
      .attr("x", margin.left - 18).attr("y", d => y(d)).attr("text-anchor", "end").attr("dy", "0.35em").text(d => d);
    const dots = svg.append("g").selectAll("circle").data(nodes, d => d.id).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => groupColor.get(d.group)).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 2, 9, .12, .65);
    fadeIn(dots, .05, .7);
  }
```
