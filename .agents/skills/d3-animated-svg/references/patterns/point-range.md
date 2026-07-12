# Point Range

- **Pattern ID:** `d3-point-range`
- **Gallery source ID:** `point-range`
- **Family:** Uncertainty
- **Use when:** Estimates with confidence intervals by group.
- **Renderer:** `renderPointRange`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPointRange() {
    const svg = prepareSvg("point-range", "Point range", "Estimates and uncertainty intervals show overlap across groups.");
    const data = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((name, i) => {
      const estimate = [42, 55, 63, 48, 71][i];
      const low = estimate - [8, 11, 7, 13, 9][i];
      const high = estimate + [10, 8, 12, 9, 7][i];
      return { name, estimate, low, high };
    });
    const x = d3.scaleLinear().domain([25, 85]).range([86, width - 44]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([64, 326]).padding(.45);
    axisBottom(svg, x, 350, 5);
    const ranges = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.low)).attr("x2", d => x(d.high))
      .attr("y1", d => y(d.name) + y.bandwidth() / 2)
      .attr("y2", d => y(d.name) + y.bandwidth() / 2)
      .attr("stroke", "#8fa0b3").attr("stroke-width", 4).attr("stroke-linecap", "round");
    drawPath(ranges, .08, .75);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.estimate)).attr("cy", d => y(d.name) + y.bandwidth() / 2)
      .attr("fill", palette.orange).attr("stroke", "#fff").attr("stroke-width", 1.6);
    grow(dots, "r", 2, 8, .18, .55);
    svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label").attr("x", 74).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d.name);
  }
```
