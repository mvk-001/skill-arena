# Temperature Softmax

- **Pattern ID:** `d3-temperature-softmax`
- **Gallery source ID:** `temperature-softmax`
- **Family:** LLM
- **Use when:** The same logits sharpen or flatten as temperature changes.
- **Renderer:** `renderTemperatureSoftmax`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTemperatureSoftmax() {
    const svg = prepareSvg("temperature-softmax", "Temperature softmax", "The same logits are normalized into sharper or flatter next-token distributions.");
    const logits = [
      { token: "safe", logit: 3.6 },
      { token: "fast", logit: 2.3 },
      { token: "novel", logit: 1.8 },
      { token: "rare", logit: 1.1 },
      { token: "wild", logit: .6 }
    ];
    const softmax = temp => {
      const weights = logits.map(d => Math.exp(d.logit / temp));
      const sum = d3.sum(weights);
      return logits.map((d, i) => ({ ...d, p: weights[i] / sum }));
    };
    const panels = [
      { label: "T = 0.4", color: palette.blue, y: 72, values: softmax(.4) },
      { label: "T = 1.4", color: palette.orange, y: 236, values: softmax(1.4) }
    ];
    const x = d3.scaleLinear().domain([0, .84]).range([150, 486]);
    const rowHeight = 22;
    panels.forEach((panel, panelIndex) => {
      svg.append("text").attr("class", "mark-label").attr("x", 48).attr("y", panel.y - 18).attr("font-weight", 800).text(panel.label);
      const rows = svg.append("g").selectAll(`g.temperature-row-${panelIndex}`).data(panel.values).join("g")
        .attr("transform", (d, i) => `translate(0,${panel.y + i * 27})`);
      rows.append("text")
        .attr("class", "mark-label")
        .attr("x", 104)
        .attr("y", 16)
        .attr("text-anchor", "end")
        .text(d => d.token);
      rows.append("rect")
        .attr("x", x(0))
        .attr("y", 1)
        .attr("width", d => x(d.p) - x(0))
        .attr("height", rowHeight)
        .attr("rx", 5)
        .attr("fill", (d, i) => i === 0 ? panel.color : palette.gray300)
        .attr("fill-opacity", (d, i) => i === 0 ? .86 : .55)
        .each(function (d, i) {
          d3.select(this).append("animate")
            .attr("attributeName", "width")
            .attr("from", 0)
            .attr("to", x(d.p) - x(0))
            .attr("dur", ".8s")
            .attr("begin", `${.12 + panelIndex * .35 + i * .05}s`)
            .attr("fill", "freeze");
        });
      rows.append("text")
        .attr("class", "caption")
        .attr("x", d => x(d.p) + 7)
        .attr("y", 16)
        .text(d => `${Math.round(d.p * 100)}%`);
    });
    svg.append("path")
      .attr("d", "M66,206H494")
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.4)
      .attr("stroke-dasharray", "4 5");
  }
```
