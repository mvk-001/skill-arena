# Population Pyramid

- **Pattern ID:** `d3-population-pyramid`
- **Gallery source ID:** `population-pyramid`
- **Family:** Demography
- **Use when:** Mirrored age bins compare two demographic groups.
- **Renderer:** `renderPopulationPyramid`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPopulationPyramid() {
    const svg = prepareSvg("population-pyramid", "Population pyramid", "Mirrored age bins compare two demographic groups.");
    const ages = ["80+", "70", "60", "50", "40", "30", "20", "10", "0"];
    const data = ages.map((age, i) => ({ age, left: 18 + i * 4 + (i % 3) * 3, right: 22 + (8 - i) * 3 + (i % 2) * 4 }));
    const x = d3.scaleLinear().domain([-60, 60]).range([72, width - 72]);
    const y = d3.scaleBand().domain(ages).range([58, 334]).padding(.18);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 48).attr("y2", 346).attr("stroke", palette.ink).attr("stroke-width", 1.4);
    const leftBars = svg.append("g").selectAll("rect.left").data(data).join("rect")
      .attr("class", "left").attr("x", d => x(-d.left)).attr("y", d => y(d.age)).attr("width", d => x(0) - x(-d.left)).attr("height", y.bandwidth()).attr("fill", palette.blue);
    const rightBars = svg.append("g").selectAll("rect.right").data(data).join("rect")
      .attr("class", "right").attr("x", x(0)).attr("y", d => y(d.age)).attr("width", d => x(d.right) - x(0)).attr("height", y.bandwidth()).attr("fill", palette.red);
    fadeIn(leftBars, .06, .55);
    fadeIn(rightBars, .1, .55);
    svg.append("text").attr("class", "mark-label").attr("x", x(-34)).attr("y", 38).attr("text-anchor", "middle").text("Group A");
    svg.append("text").attr("class", "mark-label").attr("x", x(34)).attr("y", 38).attr("text-anchor", "middle").text("Group B");
    svg.selectAll(".age-label").data(data).join("text").attr("class", "mark-label").attr("x", x(0)).attr("y", d => y(d.age) + y.bandwidth() / 2).attr("text-anchor", "middle").attr("dy", ".35em").text(d => d.age);
  }
```
