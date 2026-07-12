# Streamgraph

- **Pattern ID:** `d3-streamgraph`
- **Gallery source ID:** `streamgraph`
- **Family:** Temporal
- **Use when:** Layered composition changes across time.
- **Renderer:** `renderStreamgraph`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderStreamgraph() {
    const svg = prepareSvg("streamgraph", "Streamgraph", "D3 stacked areas with wiggle offset over time.");
    const keys = ["Search", "Assist", "Automate", "Review"];
    const color = d3.scaleOrdinal(keys, [palette.blue, palette.green, palette.orange, palette.purple]);
    const data = d3.range(12).map(i => ({
      month: i,
      Search: 20 + Math.sin(i / 1.6) * 8 + i * 1.2,
      Assist: 18 + Math.cos(i / 2.2) * 7 + i * .8,
      Automate: 10 + Math.sin(i / 1.3 + 1) * 6 + i * 1.4,
      Review: 12 + Math.cos(i / 1.9 + 2) * 5 + i * .5
    }));
    const margin = { top: 34, right: 24, bottom: 44, left: 28 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.month)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
      .domain([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))])
      .range([height - margin.bottom, margin.top]);
    const area = d3.area().x(d => x(d.data.month)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
    const layers = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", area).attr("fill", d => color(d.key)).attr("opacity", .88);
    fadeIn(layers, .1, .9);
    axisBottom(svg, x, height - margin.bottom, 6);
    svg.selectAll(".stream-label").data(series).join("text").attr("class", "mark-label")
      .attr("x", width - margin.right - 4)
      .attr("y", d => y((d[d.length - 2][0] + d[d.length - 2][1]) / 2))
      .attr("text-anchor", "end").text(d => d.key);
  }
```
