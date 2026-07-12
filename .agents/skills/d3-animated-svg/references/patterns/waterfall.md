# Waterfall

- **Pattern ID:** `d3-waterfall`
- **Gallery source ID:** `waterfall`
- **Family:** Accounting
- **Use when:** Sequential deltas build toward a final total.
- **Renderer:** `renderWaterfall`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderWaterfall() {
    const svg = prepareSvg("waterfall", "Waterfall", "Sequential positive and negative deltas produce a final total.");
    const steps = [
      { name: "Start", value: 42, total: true },
      { name: "New", value: 18 },
      { name: "Upsell", value: 11 },
      { name: "Cost", value: -14 },
      { name: "Churn", value: -9 },
      { name: "End", total: true }
    ];
    let running = 0;
    const data = steps.map((step, i) => {
      if (i === 0) {
        running = step.value;
        return { ...step, start: 0, end: running };
      }
      if (step.total) {
        return { ...step, value: running, start: 0, end: running };
      }
      const start = running;
      running += step.value;
      return { ...step, start, end: running };
    });
    const margin = { top: 38, right: 30, bottom: 58, left: 54 };
    const x = d3.scaleBand().domain(data.map(d => d.name)).range([margin.left, width - margin.right]).padding(.28);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.start, d.end)) + 8]).nice().range([height - margin.bottom, margin.top]);
    axisLeft(svg, y, margin.left, 5);
    axisBottom(svg, x, height - margin.bottom, 6);
    const bars = svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", d => x(d.name))
      .attr("y", d => y(Math.max(d.start, d.end)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.abs(y(d.start) - y(d.end)))
      .attr("rx", 4)
      .attr("fill", d => d.total ? palette.blue : d.value >= 0 ? palette.green : palette.red);
    fadeIn(bars, .08, .65);
    const connectors = svg.append("g").selectAll("line").data(data.slice(0, -1)).join("line")
      .attr("x1", d => x(d.name) + x.bandwidth())
      .attr("x2", (d, i) => x(data[i + 1].name))
      .attr("y1", d => y(d.end)).attr("y2", d => y(d.end))
      .attr("stroke", palette.gray300).attr("stroke-dasharray", "3 4");
    fadeIn(connectors, .25, .5);
  }
```
