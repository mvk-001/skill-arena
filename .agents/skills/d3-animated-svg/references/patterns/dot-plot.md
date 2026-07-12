# Dot Plot

- **Pattern ID:** `d3-dot-plot`
- **Gallery source ID:** `dot-plot`
- **Family:** Ranking
- **Use when:** Compact ranked points compare paired measures.
- **Renderer:** `renderDotPlot`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDotPlot() {
    const svg = prepareSvg("dot-plot", "Dot plot", "Compact ranked points compare paired measures.");
    const data = [
      ["Model", 68, 82], ["Data", 54, 71], ["UX", 46, 63], ["Ops", 73, 78], ["Infra", 38, 56], ["QA", 62, 69]
    ].map(d => ({ name: d[0], a: d[1], b: d[2] }));
    const margin = { top: 44, right: 48, bottom: 48, left: 100 };
    const x = d3.scaleLinear().domain([30, 90]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(data.map(d => d.name)).range([76, 316]).padding(.5);
    axisBottom(svg, x, 340, 6);
    svg.selectAll(".dot-label").data(data).join("text").attr("class", "mark-label").attr("x", margin.left - 14).attr("y", d => y(d.name)).attr("text-anchor", "end").attr("dy", ".35em").text(d => d.name);
    const links = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.a)).attr("x2", d => x(d.b)).attr("y1", d => y(d.name)).attr("y2", d => y(d.name)).attr("stroke", palette.line).attr("stroke-width", 3);
    fadeIn(links, .08, .55);
    const points = svg.append("g").selectAll("circle").data(data.flatMap(d => [{ ...d, value: d.a, color: palette.blue }, { ...d, value: d.b, color: palette.red }])).join("circle")
      .attr("cx", d => x(d.value)).attr("cy", d => y(d.name)).attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(points, "r", 2, 7, .12, .55);
  }
```
