# Stacked to Grouped

- **Pattern ID:** `d3-stacked-grouped-bars`
- **Gallery source ID:** `stacked-grouped-bars`
- **Family:** Transition
- **Use when:** Bars move from composition to side-by-side comparison.
- **Renderer:** `renderStackedGroupedBars`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderStackedGroupedBars() {
    const svg = prepareSvg("stacked-grouped-bars", "Stacked to grouped bars", "Bars move from stacked composition into grouped category comparison.");
    const keys = ["Core", "Growth", "Ops"];
    const data = [
      { quarter: "Q1", Core: 32, Growth: 18, Ops: 12 },
      { quarter: "Q2", Core: 29, Growth: 25, Ops: 15 },
      { quarter: "Q3", Core: 36, Growth: 31, Ops: 19 },
      { quarter: "Q4", Core: 41, Growth: 34, Ops: 22 }
    ];
    const margin = { top: 42, right: 28, bottom: 52, left: 52 };
    const x0 = d3.scaleBand().domain(data.map(d => d.quarter)).range([margin.left, width - margin.right]).padding(.22);
    const x1 = d3.scaleBand().domain(keys).range([0, x0.bandwidth()]).padding(.08);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d3.sum(keys, key => d[key]))]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x0, height - margin.bottom, 4);
    axisLeft(svg, y, margin.left, 4);
    const stacked = d3.stack().keys(keys)(data);
    const marks = stacked.flatMap(series => series.map((d, i) => ({
      key: series.key,
      quarter: data[i].quarter,
      value: data[i][series.key],
      stack0: d[0],
      stack1: d[1]
    })));
    const rects = svg.append("g").selectAll("rect").data(marks).join("rect")
      .attr("x", d => x0(d.quarter) + x1(d.key))
      .attr("y", d => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", d => y(0) - y(d.value))
      .attr("fill", d => colors[keys.indexOf(d.key)])
      .attr("rx", 3);
    rects.append("animate").attr("attributeName", "x").attr("from", d => x0(d.quarter)).attr("to", d => x0(d.quarter) + x1(d.key)).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "width").attr("from", x0.bandwidth()).attr("to", x1.bandwidth()).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "y").attr("from", d => y(d.stack1)).attr("to", d => y(d.value)).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "height").attr("from", d => y(d.stack0) - y(d.stack1)).attr("to", d => y(0) - y(d.value)).attr("dur", "1s").attr("fill", "freeze");
    const legend = svg.append("g").attr("transform", "translate(70,24)").selectAll("g").data(keys).join("g")
      .attr("transform", (d, i) => `translate(${i * 94},0)`);
    legend.append("rect").attr("x", 0).attr("y", -9).attr("width", 13).attr("height", 13).attr("rx", 2).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "mark-label").attr("x", 18).attr("y", 2).text(d => d);
  }
```
