# Line with Missing Data

- **Pattern ID:** `d3-line-missing-data`
- **Gallery source ID:** `line-missing-data`
- **Family:** Temporal
- **Use when:** Gaps preserve absent observations instead of implying continuity.
- **Renderer:** `renderLineMissingData`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLineMissingData() {
    const svg = prepareSvg("line-missing-data", "Line with missing data", "Gaps preserve absent observations instead of implying continuity.");
    const data = d3.range(16).map(i => ({ t: i, value: [5, 6, 8, 11, null, null, 16, 18, 17, 22, 24, null, 27, 29, 31, 30][i] }));
    const margin = { top: 44, right: 38, bottom: 50, left: 58 };
    const x = d3.scaleLinear().domain([0, 15]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 34]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().defined(d => d.value != null).x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3);
    drawPath(path, .08, 1);
    const dots = svg.append("g").selectAll("circle").data(data.filter(d => d.value != null)).join("circle").attr("cx", d => x(d.t)).attr("cy", d => y(d.value)).attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 2, 5, .12, .45);
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", x(4.8)).attr("y", y(12)).text("gap");
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", x(11.2)).attr("y", y(26)).text("gap");
  }
```
