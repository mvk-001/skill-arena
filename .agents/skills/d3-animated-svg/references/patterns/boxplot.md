# Box Plot

- **Pattern ID:** `d3-boxplot`
- **Gallery source ID:** `boxplot`
- **Family:** Distribution
- **Use when:** Quartiles, whiskers, and outliers per group.
- **Renderer:** `renderBoxPlot`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBoxPlot() {
    const svg = prepareSvg("boxplot", "Box plot", "Quartile summaries and outliers across groups.");
    const groups = ["A", "B", "C"];
    const values = groups.map((g, gi) => d3.range(28).map(i => 36 + gi * 12 + Math.sin(i * .6 + gi) * 10 + (i % 5)));
    const stats = values.map((arr, i) => {
      const sorted = arr.slice().sort(d3.ascending);
      return { group: groups[i], min: d3.min(sorted), q1: d3.quantile(sorted, .25), median: d3.quantile(sorted, .5), q3: d3.quantile(sorted, .75), max: d3.max(sorted) };
    });
    const x = d3.scaleBand().domain(groups).range([80, width - 50]).padding(.35);
    const y = d3.scaleLinear().domain([20, 85]).range([height - 58, 42]);
    axisLeft(svg, y, 56, 5);
    const g = svg.append("g").selectAll("g").data(stats).join("g").attr("transform", d => `translate(${x(d.group) + x.bandwidth() / 2},0)`);
    g.append("line").attr("y1", d => y(d.min)).attr("y2", d => y(d.max)).attr("stroke", palette.ink);
    g.append("rect").attr("x", -28).attr("y", d => y(d.q3)).attr("width", 56).attr("height", d => y(d.q1) - y(d.q3)).attr("fill", palette.orange).attr("fill-opacity", .75).attr("stroke", "#fff");
    g.append("line").attr("x1", -32).attr("x2", 32).attr("y1", d => y(d.median)).attr("y2", d => y(d.median)).attr("stroke", palette.ink).attr("stroke-width", 2);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - 58})`).call(d3.axisBottom(x));
    fadeIn(g, .05, .7);
  }
```
