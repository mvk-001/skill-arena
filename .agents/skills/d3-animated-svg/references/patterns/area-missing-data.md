# Area with Missing Data

- **Pattern ID:** `d3-area-missing-data`
- **Gallery source ID:** `area-missing-data`
- **Family:** Temporal
- **Use when:** Filled segments stop and restart around missing periods.
- **Renderer:** `renderAreaMissingData`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAreaMissingData() {
    const svg = prepareSvg("area-missing-data", "Area with missing data", "Filled segments stop and restart around missing periods.");
    const data = d3.range(18).map(i => ({ t: i, value: [12, 14, 19, 22, 21, null, null, 24, 28, 26, 30, 32, null, 29, 25, 27, 31, 34][i] }));
    const margin = { top: 44, right: 38, bottom: 50, left: 58 };
    const x = d3.scaleLinear().domain([0, 17]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 38]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const area = d3.area().defined(d => d.value != null).x(d => x(d.t)).y0(y(0)).y1(d => y(d.value)).curve(d3.curveMonotoneX);
    const fill = svg.append("path").datum(data).attr("d", area).attr("fill", palette.greenHighlight).attr("fill-opacity", .78).attr("stroke", palette.green).attr("stroke-width", 3);
    fadeIn(fill, .08, .65);
    const line = d3.line().defined(d => d.value != null).x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 2.6), .12, .9);
    svg.append("text").attr("class", "mark-label").attr("x", x(6.2)).attr("y", y(20)).text("gap");
    svg.append("text").attr("class", "mark-label").attr("x", x(12.2)).attr("y", y(26)).text("gap");
  }
```
