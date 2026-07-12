# Sketchy Gemma Compare

- **Pattern ID:** `d3-sketchy-gemma-comparison`
- **Gallery source ID:** `sketchy-gemma-comparison`
- **Family:** Sketchy AI
- **Use when:** Two Gemma sizes balance benchmark strength against memory and cloud hardware cost.
- **Renderer:** `renderSketchyGemmaComparison`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyGemmaComparison() {
    const svg = prepareSvg("sketchy-gemma-comparison", "Sketchy Gemma comparison", "Two Google Gemma model sizes compared by benchmark score, memory footprint, hardware fit, and estimated GPU VM cost.");
    const { models, metricRows, tokens } = gemmaComparisonData();
    const score = d3.scaleLinear().domain([35, 92]).range([152, 498]);
    const mem = d3.scaleLinear().domain([0, 80]).range([0, 118]);
    const price = d3.scaleLinear().domain([0, 6]).range([0, 118]);
    const fmtScore = d3.format(".1f");

    const topCards = [
      { model: models[0], x: 42, y: 28, w: 224, h: 76 },
      { model: models[1], x: 294, y: 28, w: 224, h: 76 }
    ];
    topCards.forEach((card, i) => {
      appendSketchRect(svg, card.x, card.y, card.w, card.h, {
        fill: card.model.light,
        fillOpacity: .36,
        stroke: card.model.color,
        strokeWidth: 1.7,
        seed: 1360 + i * 31,
        roughness: 1.2,
        delay: .03 + i * .04,
        dur: .58,
        hachure: false
      });
      const text = svg.append("g").attr("transform", `translate(${card.x + 14},${card.y + 22})`);
      text.append("text")
        .attr("class", "mark-label")
        .attr("font-size", 14)
        .attr("font-weight", 800)
        .attr("fill", card.model.color)
        .text(card.model.name);
      text.append("text")
        .attr("class", "caption")
        .attr("y", 22)
        .text(`${card.model.params} / ${card.model.context}`);
      text.append("text")
        .attr("class", "caption")
        .attr("y", 42)
        .text(card.model.modalities);
      fadeIn(text.selectAll("text"), .08 + i * .05, .48);
    });

    metricRows.forEach((row, i) => {
      const y = 142 + i * 32;
      appendSketchStroke(svg, [[score(35), y], [score(92), y]], {
        stroke: tokens.grid,
        strokeWidth: 1.1,
        opacity: .78,
        seed: 1420 + i,
        roughness: .55,
        delay: .08,
        dur: .44
      });
      svg.append("text")
        .attr("class", "label")
        .attr("x", 52)
        .attr("y", y + 4)
        .attr("font-size", 11.4)
        .text(row.label);
      appendSketchStroke(svg, models.map(model => [score(model.metrics[row.key]), y]), {
        stroke: tokens.connector,
        strokeWidth: 1.45,
        opacity: .7,
        seed: 1460 + i * 13,
        roughness: .9,
        delay: .22 + i * .08,
        dur: .55
      });
      models.forEach((model, mi) => {
        const x = score(model.metrics[row.key]);
        appendSketchBlob(svg, x, y, 5.7, {
          fill: model.color,
          fillOpacity: .84,
          stroke: palette.surface,
          strokeWidth: 1.1,
          seed: 1500 + i * 29 + mi * 11,
          roughness: .12,
          edgeRoughness: .72,
          delay: .32 + i * .08 + mi * .04,
          dur: .42
        });
        svg.append("text")
          .attr("class", "caption")
          .attr("x", x + (mi === 0 ? -9 : 9))
          .attr("y", y + (mi === 0 ? -8 : 15))
          .attr("text-anchor", mi === 0 ? "end" : "start")
          .attr("font-size", 10.2)
          .attr("font-weight", 700)
          .attr("fill", model.color)
          .text(fmtScore(model.metrics[row.key]));
      });
    });
    [40, 60, 80].forEach((tick, i) => {
      const x = score(tick);
      appendSketchStroke(svg, [[x, 270], [x, 278]], {
        stroke: tokens.axis,
        strokeWidth: 1,
        seed: 1580 + i,
        roughness: .45,
        delay: .18,
        dur: .35
      });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", x)
        .attr("y", 294)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .text(tick);
    });
    appendSketchStroke(svg, [[score(35), 274], [score(92), 274]], {
      stroke: tokens.axis,
      strokeWidth: 1.1,
      seed: 1590,
      roughness: .6,
      delay: .14,
      dur: .45
    });
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 502)
      .attr("y", 294)
      .attr("text-anchor", "end")
      .attr("font-size", 10.5)
      .text("score %");

    const footprintCards = [
      { model: models[0], x: 42, y: 316, w: 224, h: 70 },
      { model: models[1], x: 294, y: 316, w: 224, h: 70 }
    ];
    footprintCards.forEach((card, i) => {
      appendSketchRect(svg, card.x, card.y, card.w, card.h, {
        fill: tokens.sketchPanel,
        fillOpacity: .9,
        stroke: tokens.sketchPanelStroke,
        strokeWidth: 1.3,
        seed: 1620 + i * 31,
        roughness: 1.05,
        delay: .46 + i * .04,
        dur: .52,
        hachure: false
      });
      const barX = card.x + 58;
      const rows = [
        { label: "BF16", value: card.model.bf16, max: mem, suffix: " GB", y: card.y + 20, fill: card.model.light, stroke: card.model.color },
        { label: "Q4", value: card.model.q4, max: mem, suffix: " GB", y: card.y + 40, fill: tokens.q4Fill, stroke: tokens.q4Stroke },
        { label: "VM", value: card.model.cost, max: price, suffix: "/h", y: card.y + 60, fill: tokens.costFill, stroke: tokens.costStroke }
      ];
      rows.forEach((row, ri) => {
        svg.append("text")
          .attr("class", "caption")
          .attr("x", card.x + 14)
          .attr("y", row.y + 4)
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label);
        appendSketchRect(svg, barX, row.y - 8, row.max(row.value), 10, {
          fill: row.fill,
          fillOpacity: .72,
          stroke: row.stroke,
          strokeWidth: 1.1,
          seed: 1680 + i * 41 + ri * 11,
          roughness: .55,
          delay: .54 + i * .04 + ri * .05,
          dur: .42,
          hachure: false
        });
        svg.append("text")
          .attr("class", "caption")
          .attr("x", card.x + card.w - 14)
          .attr("y", row.y + 4)
          .attr("text-anchor", "end")
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label === "VM" ? `$${row.value.toFixed(row.value < 1 ? 3 : 2)}${row.suffix}` : `${row.value}${row.suffix}`);
      });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", card.x + card.w - 14)
        .attr("y", card.y - 7)
        .attr("text-anchor", "end")
        .attr("font-size", 10.4)
        .attr("font-weight", 700)
        .attr("fill", card.model.color)
        .text(`${card.model.hardware} / ${card.model.instance}`);
    });
  }
```
