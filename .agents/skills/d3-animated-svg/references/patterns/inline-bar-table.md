# Inline Bar Table

- **Pattern ID:** `d3-inline-bar-table`
- **Gallery source ID:** `inline-bar-table`
- **Family:** Table
- **Use when:** A compact token-price table embeds bars directly inside input and output cost cells.
- **Renderer:** `renderInlineBarTable`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderInlineBarTable() {
    const svg = prepareSvg("inline-bar-table", "Inline bar table", "A D3 SVG table with embedded bars inside input and output token-price cells.");
    const x0 = 34, y0 = 76, rowH = 30;
    const rows = [
      { model: "Gemma 4 E4B", provider: "Google API", input: 0.2, output: 0.2, color: palette.blue },
      { model: "Gemma 4 31B", provider: "Google API", input: 0.12, output: 0.35, color: palette.purple },
      { model: "Gemini 3.5 Flash", provider: "Google", input: 1.5, output: 9, color: palette.red },
      { model: "Gemini 3.1 Pro", provider: "Google", input: 2, output: 12, color: palette.blue },
      { model: "GPT-5.5", provider: "OpenAI", input: 5, output: 30, color: palette.green },
      { model: "Opus 4.7", provider: "Anthropic", input: 5, output: 25, color: palette.orange }
    ];
    const visibleRows = rows.filter(row => row.visible !== false);
    const price = value => value === 0 ? "$0" : value < 0.1 ? `$${value.toFixed(3)}` : value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(2)}`;
    const columns = [
      { label: "Model", x: 0 },
      { label: "Input / 1M", x: 190 },
      { label: "Output / 1M", x: 350 }
    ];
    const metricConfigs = [
      { key: "input", x: 188, barWidth: 86, fill: () => palette.blue, labelX: 282, text: d => price(d.input), opacity: 1 },
      { key: "output", x: 350, barWidth: 86, fill: () => palette.purple, labelX: 444, text: d => price(d.output), opacity: 1 }
    ];
    const metrics = metricConfigs.map(metric => {
      const columnMax = d3.max(visibleRows, d => d[metric.key]) || 1;
      return {
        ...metric,
        columnMax,
        scale: d3.scaleLinear().domain([0, columnMax]).range([0, metric.barWidth])
      };
    });
    svg.append("rect").attr("x", x0 - 10).attr("y", y0 - 48).attr("width", 504).attr("height", 232).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("g").selectAll("text").data(columns).join("text")
      .attr("class", "caption")
      .attr("x", d => x0 + d.x)
      .attr("y", y0 - 24)
      .attr("font-weight", 800)
      .attr("font-size", 11.5)
      .text(d => d.label);
    const g = svg.append("g").selectAll("g.inline-row").data(rows).join("g")
      .attr("class", "inline-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    g.append("rect").attr("x", -10).attr("y", -18).attr("width", 504).attr("height", rowH).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 10,
      x0 + 494,
      y0 - 18,
      y0 + rows.length * rowH - 18,
      d3.range(1, rows.length).map(i => y0 - 18 + i * rowH)
    );
    g.append("circle").attr("cx", 4).attr("cy", 1).attr("r", 3.2).attr("fill", d => d.color).attr("fill-opacity", .86);
    g.append("text").attr("class", "mark-label").attr("x", 14).attr("y", 1).attr("font-weight", 700).attr("font-size", 11.5).text(d => d.model);
    g.append("text").attr("class", "caption").attr("x", 14).attr("y", 14).attr("font-weight", 700).attr("font-size", 9.2).attr("fill", palette.gray600).text(d => d.provider);
    metrics.forEach(metric => {
      g.append("rect").attr("x", metric.x).attr("y", -9).attr("width", metric.barWidth).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
      const bars = g.append("rect")
        .attr("class", "inline-bar")
        .attr("data-metric-key", metric.key)
        .attr("data-value", d => d[metric.key])
        .attr("data-column-max", metric.columnMax)
        .attr("data-bar-width", metric.barWidth)
        .attr("x", metric.x)
        .attr("y", -9)
        .attr("height", 18)
        .attr("rx", 5)
        .attr("fill", metric.fill)
        .attr("fill-opacity", metric.opacity);
      grow(bars, "width", 0, d => metric.scale(d[metric.key]), .12, .58);
      g.append("text").attr("class", "mark-label").attr("x", metric.labelX).attr("y", 6).attr("text-anchor", "start").attr("font-size", 11).text(metric.text);
    });
    fadeIn(g, .04, .45);
  }
```
