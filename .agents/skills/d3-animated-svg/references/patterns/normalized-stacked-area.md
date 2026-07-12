# Normalized Stacked Area

- **Pattern ID:** `d3-normalized-stacked-area`
- **Gallery source ID:** `normalized-stacked-area`
- **Family:** Temporal
- **Use when:** Category shares sum to 100 percent across time.
- **Renderer:** `renderNormalizedStackedArea`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderNormalizedStackedArea() {
    const svg = prepareSvg("normalized-stacked-area", "Normalized stacked area", "Category shares sum to 100 percent across time.");
    const keys = ["Search", "Assist", "Build", "Review"];
    const data = d3.range(10).map(i => ({
      t: i,
      Search: 28 + Math.sin(i / 1.4) * 8,
      Assist: 22 + i * 2.2,
      Build: 30 + Math.cos(i / 1.7) * 9,
      Review: 16 + Math.sin(i / 2 + 1) * 6
    }));
    const margin = { top: 42, right: 34, bottom: 54, left: 58 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetExpand)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    const area = d3.area().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
    const layers = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", area).attr("fill", (d, i) => colors[i]).attr("opacity", .88);
    fadeIn(layers, .08, .75);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y.tickFormat ? y : y, margin.left, 4);
    svg.append("text").attr("class", "label").attr("x", margin.left).attr("y", 30).text("share of total");
  }
```
