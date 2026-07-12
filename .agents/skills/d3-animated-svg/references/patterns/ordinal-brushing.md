# Ordinal Brushing

- **Pattern ID:** `d3-ordinal-brushing`
- **Gallery source ID:** `ordinal-brushing`
- **Family:** Interaction
- **Use when:** Categorical bins are selected with an ordinal brush range.
- **Renderer:** `renderOrdinalBrushing`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderOrdinalBrushing() {
    const svg = prepareSvg("ordinal-brushing", "Ordinal brushing", "Categorical bins are selected with an ordinal brush range.");
    const groups = ["A", "B", "C", "D", "E", "F", "G"];
    const x = d3.scalePoint().domain(groups).range([74, width - 74]);
    const y = d3.scaleLinear().domain([0, 100]).range([304, 72]);
    const data = groups.flatMap((g, gi) => d3.range(8).map(i => ({ group: g, value: 18 + ((gi * 23 + i * 11) % 72), selected: gi >= 2 && gi <= 4 })));
    svg.append("g").selectAll("line").data(groups).join("line").attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 72).attr("y2", 304).attr("stroke", "#e7e7e7");
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.group) + (((d.value * 7) % 17) - 8)).attr("cy", d => y(d.value))
      .attr("fill", d => d.selected ? palette.red : palette.blue).attr("fill-opacity", d => d.selected ? .9 : .42);
    grow(dots, "r", 2, 4.6, .05, .45);
    const x0 = x("C") - 32, x1 = x("E") + 32;
    const brush = svg.append("rect").attr("x", x0).attr("y", 62).attr("width", x1 - x0).attr("height", 254).attr("fill", "#ffccd5").attr("fill-opacity", .28).attr("stroke", palette.red).attr("stroke-width", 2);
    fadeIn(brush, .14, .45);
    svg.selectAll(".ordinal-label").data(groups).join("text").attr("class", "mark-label").attr("x", d => x(d)).attr("y", 336).attr("text-anchor", "middle").text(d => d);
  }
```
