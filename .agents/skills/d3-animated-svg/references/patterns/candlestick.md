# Candlestick

- **Pattern ID:** `d3-candlestick`
- **Gallery source ID:** `candlestick`
- **Family:** Financial
- **Use when:** Open-high-low-close movement with wicks.
- **Renderer:** `renderCandlestick`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCandlestick() {
    const svg = prepareSvg("candlestick", "Candlestick", "D3 scales encode open, high, low, and close values.");
    const data = d3.range(18).map(i => {
      const open = 54 + Math.sin(i * .72) * 12 + i * .7;
      const close = open + Math.cos(i * .9) * 11;
      const high = Math.max(open, close) + 5 + (i % 4);
      const low = Math.min(open, close) - 5 - (i % 3);
      return { day: i + 1, open, close, high, low };
    });
    const margin = { top: 38, right: 32, bottom: 52, left: 54 };
    const x = d3.scaleBand().domain(data.map(d => d.day)).range([margin.left, width - margin.right]).padding(.36);
    const y = d3.scaleLinear().domain([d3.min(data, d => d.low) - 3, d3.max(data, d => d.high) + 3]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const g = svg.append("g").selectAll("g").data(data).join("g").attr("transform", d => `translate(${x(d.day) + x.bandwidth() / 2},0)`);
    const wicks = g.append("line")
      .attr("y1", d => y(d.low))
      .attr("y2", d => y(d.high))
      .attr("stroke", palette.ink)
      .attr("stroke-width", 1.3);
    fadeIn(wicks, .05, .6);
    const bodies = g.append("rect")
      .attr("x", -x.bandwidth() / 2)
      .attr("y", d => y(Math.max(d.open, d.close)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.max(2, Math.abs(y(d.open) - y(d.close))))
      .attr("fill", d => d.close >= d.open ? palette.green : palette.red)
      .attr("rx", 2);
    fadeIn(bodies, .12, .65);
    svg.append("text").attr("class", "mark-label").attr("x", width - 32).attr("y", 30).attr("text-anchor", "end").text("OHLC");
  }
```
