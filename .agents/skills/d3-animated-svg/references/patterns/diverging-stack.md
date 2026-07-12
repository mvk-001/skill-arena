# Diverging Stack

- **Pattern ID:** `d3-diverging-stack`
- **Gallery source ID:** `diverging-stack`
- **Family:** Sentiment
- **Use when:** Likert responses split around a neutral center.
- **Renderer:** `renderDivergingStack`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDivergingStack() {
    const svg = prepareSvg("diverging-stack", "Diverging stack", "Likert-style stacked bars diverge around neutral responses.");
    const keys = ["Strong no", "No", "Neutral", "Yes", "Strong yes"];
    const data = [
      { name: "Docs", values: [8, 14, 18, 36, 24] },
      { name: "API", values: [5, 11, 16, 40, 28] },
      { name: "UX", values: [14, 20, 22, 30, 14] },
      { name: "Speed", values: [7, 12, 17, 34, 30] }
    ];
    const x = d3.scaleLinear().domain([-50, 80]).range([88, width - 34]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([70, 320]).padding(.32);
    const segmentColors = [palette.red, palette.redHighlight, palette.gray200, palette.greenHighlight, palette.green];
    const legend = svg.append("g").attr("transform", "translate(48,28)");
    const legendItems = legend.selectAll("g").data(keys).join("g").attr("transform", (_, i) => `translate(${i * 100},0)`);
    legendItems.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", (_, i) => segmentColors[i]).attr("stroke", palette.gray200);
    legendItems.append("text").attr("class", "caption").attr("x", 16).attr("y", 9).attr("font-size", 9).text(d => d);
    axisBottom(svg, x, 344, 5);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 48).attr("y2", 330).attr("stroke", palette.ink).attr("stroke-opacity", .45);
    const segments = [];
    data.forEach(row => {
      let neg = -row.values[2] / 2;
      let pos = row.values[2] / 2;
      row.values.forEach((value, i) => {
        if (i < 2) {
          const x1 = neg;
          neg -= value;
          segments.push({ row: row.name, key: keys[i], i, x0: neg, x1, value });
        } else if (i === 2) {
          segments.push({ row: row.name, key: keys[i], i, x0: -value / 2, x1: value / 2, value });
        } else {
          const x0 = pos;
          pos += value;
          segments.push({ row: row.name, key: keys[i], i, x0, x1: pos, value });
        }
      });
    });
    const rects = svg.append("g").selectAll("rect").data(segments).join("rect")
      .attr("x", d => x(Math.min(d.x0, d.x1)))
      .attr("y", d => y(d.row))
      .attr("width", d => Math.abs(x(d.x1) - x(d.x0)))
      .attr("height", y.bandwidth())
      .attr("fill", d => segmentColors[d.i])
      .attr("stroke", "#fff");
    fadeIn(rects, .05, .62);
    svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label").attr("x", 76).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d.name);
  }
```
