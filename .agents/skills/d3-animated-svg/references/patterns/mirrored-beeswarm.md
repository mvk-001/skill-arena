# Mirrored Beeswarm

- **Pattern ID:** `d3-mirrored-beeswarm`
- **Gallery source ID:** `mirrored-beeswarm`
- **Family:** Distribution
- **Use when:** Two groups mirror around a central quantitative axis.
- **Renderer:** `renderMirroredBeeswarm`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMirroredBeeswarm() {
    const svg = prepareSvg("mirrored-beeswarm", "Mirrored beeswarm", "Two groups mirror around a central quantitative axis.");
    const data = d3.range(54).map(i => ({ id: i, side: i % 2 ? "Current" : "Prior", value: 22 + ((i * 17) % 66) }));
    const x = d3.scaleLinear().domain([18, 90]).range([74, width - 64]);
    const y0 = height / 2 + 8;
    const nodes = data.map(d => ({ ...d, x: x(d.value), y: y0 + (d.side === "Current" ? -34 : 34) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(.77))
      .force("x", d3.forceX(d => x(d.value)).strength(.9))
      .force("y", d3.forceY(d => y0 + (d.side === "Current" ? -44 : 44)).strength(.35))
      .force("collide", d3.forceCollide(7.5)).stop();
    for (let i = 0; i < 150; i += 1) simulation.tick();
    axisBottom(svg, x, y0, 6);
    svg.append("line").attr("x1", 64).attr("x2", width - 56).attr("y1", y0).attr("y2", y0).attr("stroke", palette.line).attr("stroke-width", 1.4);
    const dots = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.side === "Current" ? palette.red : palette.blue).attr("fill-opacity", .86);
    grow(dots, "r", 2, 6.5, .06, .55);
    svg.append("rect").attr("x", 62).attr("y", y0 - 78).attr("width", width - 124).attr("height", 48).attr("fill", palette.redHighlight).attr("fill-opacity", .18).lower();
    svg.append("rect").attr("x", 62).attr("y", y0 + 30).attr("width", width - 124).attr("height", 64).attr("fill", palette.blueHighlight).attr("fill-opacity", .18).lower();
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", 72).attr("y", y0 - 72).text("Current");
    svg.append("text").attr("class", "mark-label").attr("fill", palette.blue).attr("x", 72).attr("y", y0 + 88).text("Prior");
  }
```
