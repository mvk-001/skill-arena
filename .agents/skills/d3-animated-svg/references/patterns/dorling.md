# Dorling Cartogram

- **Pattern ID:** `d3-dorling`
- **Gallery source ID:** `dorling`
- **Family:** Geospatial
- **Use when:** Values collide around geographic anchors.
- **Renderer:** `renderDorlingCartogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDorlingCartogram() {
    const svg = prepareSvg("dorling", "Dorling cartogram", "D3 force collision places value circles near geographic anchors.");
    const projection = d3.geoNaturalEarth1().fitExtent([[42, 48], [width - 42, height - 56]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#eef3f7").attr("stroke", "#c1cbd6");
    const regions = [
      { name: "NA", lon: -100, lat: 43, value: 42 }, { name: "SA", lon: -60, lat: -15, value: 24 },
      { name: "EU", lon: 12, lat: 50, value: 31 }, { name: "AF", lon: 22, lat: 2, value: 27 },
      { name: "IN", lon: 78, lat: 22, value: 36 }, { name: "EA", lon: 116, lat: 34, value: 44 },
      { name: "OC", lon: 135, lat: -25, value: 18 }
    ].map((d, i) => {
      const [x, y] = projection([d.lon, d.lat]);
      return { ...d, index: i, anchorX: x, anchorY: y, x, y };
    });
    const r = d3.scaleSqrt().domain([18, 44]).range([18, 36]);
    const nodes = regions.map(d => ({ ...d, radius: r(d.value) }));
    const simulation = d3.forceSimulation(nodes)
      .randomSource(d3.randomLcg(0.28))
      .force("x", d3.forceX(d => d.anchorX).strength(.42))
      .force("y", d3.forceY(d => d.anchorY).strength(.42))
      .force("collide", d3.forceCollide(d => d.radius + 2))
      .stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();
    svg.append("g").selectAll("line").data(nodes).join("line")
      .attr("x1", d => d.anchorX).attr("y1", d => d.anchorY)
      .attr("x2", d => d.x).attr("y2", d => d.y)
      .attr("stroke", "#c9d2dc").attr("stroke-dasharray", "3 4");
    const circles = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => colors[d.index % colors.length])
      .attr("fill-opacity", .78)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    grow(circles, "r", 2, d => d.radius, .12, .72);
    svg.append("g").selectAll("text").data(nodes).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y + 4)
      .attr("text-anchor", "middle")
      .text(d => d.name);
  }
```
