# Gemma Compare

- **Pattern ID:** `d3-gemma-comparison`
- **Gallery source ID:** `gemma-comparison`
- **Family:** AI Model
- **Use when:** A clean model scorecard compares two Gemma sizes across quality, memory, and GPU cost.
- **Renderer:** `renderGemmaComparison`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderGemmaComparison() {
    const svg = prepareSvg("gemma-comparison", "Gemma model comparison", "Two Google Gemma model sizes compared by benchmark score, memory footprint, hardware fit, and estimated GPU VM cost.");
    const { models, metricRows, tokens } = gemmaComparisonData();
    const score = d3.scaleLinear().domain([35, 92]).range([150, 502]);
    const mem = d3.scaleLinear().domain([0, 80]).range([0, 120]);
    const price = d3.scaleLinear().domain([0, 6]).range([0, 120]);
    const fmtScore = d3.format(".1f");

    const modelCards = [
      { model: models[0], x: 38, y: 30, w: 232, h: 78 },
      { model: models[1], x: 290, y: 30, w: 232, h: 78 }
    ];
    const cards = svg.append("g").selectAll("g.model-card")
      .data(modelCards)
      .join("g")
      .attr("class", "model-card");
    cards.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", tokens.panel)
      .attr("fill-opacity", .88)
      .attr("stroke", tokens.panelStroke)
      .attr("stroke-width", .85);
    cards.append("circle")
      .attr("cx", d => d.x + 15)
      .attr("cy", d => d.y + 23)
      .attr("r", 3.8)
      .attr("fill", d => d.model.color)
      .each(function (d, i) {
        d3.select(this).append("animate")
          .attr("attributeName", "r")
          .attr("from", 0)
          .attr("to", 3.8)
          .attr("dur", ".38s")
          .attr("begin", `${.05 + i * .08}s`)
          .attr("fill", "freeze");
      });
    cards.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + 25)
      .attr("y", d => d.y + 27)
      .attr("font-size", 14)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.model.name);
    cards.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 47)
      .attr("font-size", 10.8)
      .text(d => `${d.model.params} / ${d.model.context}`);
    cards.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 65)
      .attr("font-size", 10.8)
      .text(d => d.model.modalities);
    fadeIn(cards.selectAll("rect, text"), .04, .48);

    const benchmarkGroup = svg.append("g");
    metricRows.forEach((row, i) => {
      const y = 144 + i * 32;
      benchmarkGroup.append("line")
        .attr("x1", score(35))
        .attr("x2", score(92))
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", tokens.grid)
        .attr("stroke-width", 1);
      benchmarkGroup.append("text")
        .attr("class", "label")
        .attr("x", 50)
        .attr("y", y + 4)
        .attr("font-size", 11.2)
        .text(row.label);
      const connector = benchmarkGroup.append("path")
        .attr("d", `M${score(models[0].metrics[row.key])},${y}L${score(models[1].metrics[row.key])},${y}`)
        .attr("fill", "none")
        .attr("stroke", tokens.connector)
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round");
      drawPath(connector, .18 + i * .07, .48);
      models.forEach((model, mi) => {
        const x = score(model.metrics[row.key]);
        const dot = benchmarkGroup.append("circle")
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", 5.8)
          .attr("fill", model.color)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.2);
        dot.append("animate")
          .attr("attributeName", "r")
          .attr("from", 0)
          .attr("to", 5.8)
          .attr("dur", ".38s")
          .attr("begin", `${.28 + i * .07 + mi * .05}s`)
          .attr("fill", "freeze");
        const value = benchmarkGroup.append("text")
          .attr("class", "caption")
          .attr("x", x + (mi === 0 ? -9 : 9))
          .attr("y", y + (mi === 0 ? -8 : 15))
          .attr("text-anchor", mi === 0 ? "end" : "start")
          .attr("font-size", 10.2)
          .attr("font-weight", 700)
          .attr("fill", model.color)
          .text(fmtScore(model.metrics[row.key]));
        fadeIn(value, .34 + i * .07 + mi * .05, .35);
      });
    });
    [40, 60, 80].forEach(tick => {
      const x = score(tick);
      benchmarkGroup.append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 269)
        .attr("y2", 277)
        .attr("stroke", tokens.axis)
        .attr("stroke-width", 1);
      benchmarkGroup.append("text")
        .attr("class", "caption")
        .attr("x", x)
        .attr("y", 294)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .text(tick);
    });
    benchmarkGroup.append("line")
      .attr("x1", score(35))
      .attr("x2", score(92))
      .attr("y1", 273)
      .attr("y2", 273)
      .attr("stroke", tokens.axis)
      .attr("stroke-width", 1.1);
    benchmarkGroup.append("text")
      .attr("class", "caption")
      .attr("x", 502)
      .attr("y", 294)
      .attr("text-anchor", "end")
      .attr("font-size", 10.5)
      .text("score %");

    const footprintCards = [
      { model: models[0], x: 38, y: 316, w: 232, h: 72 },
      { model: models[1], x: 290, y: 316, w: 232, h: 72 }
    ];
    const footprint = svg.append("g").selectAll("g.footprint-card")
      .data(footprintCards)
      .join("g")
      .attr("class", "footprint-card");
    footprint.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", tokens.panel)
      .attr("stroke", tokens.panelStroke)
      .attr("stroke-width", 1.1);
    footprint.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + d.w - 12)
      .attr("y", d => d.y - 8)
      .attr("text-anchor", "end")
      .attr("font-size", 10.4)
      .attr("font-weight", 700)
      .attr("fill", palette.gray700)
      .text(d => `${d.model.hardware} / ${d.model.instance}`);

    footprint.each(function (card, cardIndex) {
      const group = d3.select(this);
      const barX = card.x + 58;
      const rows = [
        { label: "BF16", value: card.model.bf16, scale: mem, suffix: " GB", y: card.y + 20, fill: card.model.light, stroke: card.model.color },
        { label: "Q4", value: card.model.q4, scale: mem, suffix: " GB", y: card.y + 41, fill: tokens.q4Fill, stroke: tokens.q4Stroke },
        { label: "VM", value: card.model.cost, scale: price, suffix: "/h", y: card.y + 62, fill: tokens.costFill, stroke: tokens.costStroke }
      ];
      rows.forEach((row, rowIndex) => {
        group.append("text")
          .attr("class", "caption")
          .attr("x", card.x + 14)
          .attr("y", row.y + 4)
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label);
        group.append("rect")
          .attr("x", barX)
          .attr("y", row.y - 8)
          .attr("width", row.scale(row.value))
          .attr("height", 10)
          .attr("rx", 2)
          .attr("fill", row.fill)
          .attr("fill-opacity", .78)
          .attr("stroke", "none")
          .each(function () {
            d3.select(this).append("animate")
              .attr("attributeName", "width")
              .attr("from", 0)
              .attr("to", row.scale(row.value))
              .attr("dur", ".54s")
              .attr("begin", `${.48 + cardIndex * .08 + rowIndex * .06}s`)
              .attr("fill", "freeze");
          });
        group.append("text")
          .attr("class", "caption")
          .attr("x", card.x + card.w - 12)
          .attr("y", row.y + 4)
          .attr("text-anchor", "end")
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label === "VM" ? `$${row.value.toFixed(row.value < 1 ? 3 : 2)}${row.suffix}` : `${row.value}${row.suffix}`);
      });
    });
    fadeIn(svg.selectAll(".footprint-card text, .footprint-card > rect"), .38, .42);
  }
```
