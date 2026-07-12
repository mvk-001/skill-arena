# Symbol Glyphs

- **Pattern ID:** `d3-symbol-glyphs`
- **Gallery source ID:** `symbol-glyphs`
- **Family:** Glyphs
- **Use when:** Custom point marks encode type and magnitude.
- **Renderer:** `renderSymbolGlyphs`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSymbolGlyphs() {
    const svg = prepareSvg("symbol-glyphs", "Symbol glyphs", "D3 symbol marks encode category, magnitude, and position.");
    const types = [d3.symbolCircle, d3.symbolTriangle, d3.symbolDiamond, d3.symbolSquare, d3.symbolCross];
    const names = ["Ops", "Data", "UX", "Infra", "ML"];
    const data = d3.range(25).map(i => ({
      x: 12 + (i * 17) % 82,
      y: 18 + (i * 29) % 74,
      value: 2 + (i * 7) % 9,
      type: i % types.length
    }));
    const margin = { top: 38, right: 34, bottom: 52, left: 54 };
    const x = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const size = d3.scaleLinear().domain([2, 10]).range([42, 280]);
    const symbol = d3.symbol().type(d => types[d.type]).size(d => size(d.value));
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const glyphs = svg.append("g").selectAll("path").data(data).join("path")
      .attr("d", symbol)
      .attr("transform", d => `translate(${x(d.x)},${y(d.y)})`)
      .attr("fill", d => colors[d.type])
      .attr("fill-opacity", .78)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    fadeIn(glyphs, .06, .72);
    const legend = svg.append("g").attr("transform", "translate(84,28)").selectAll("g").data(names).join("g")
      .attr("transform", (d, i) => `translate(${i * 84},0)`);
    legend.append("path").attr("d", (d, i) => d3.symbol().type(types[i]).size(82)()).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "label").attr("x", 11).attr("y", 4).text(d => d);
  }
```
