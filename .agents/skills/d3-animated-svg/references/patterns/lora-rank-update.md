# LoRA Rank Update

- **Pattern ID:** `d3-lora-rank-update`
- **Gallery source ID:** `lora-rank-update`
- **Family:** Adaptation
- **Use when:** A frozen weight matrix receives a compact low-rank update path.
- **Renderer:** `renderLoraRankUpdate`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLoraRankUpdate() {
    const svg = prepareSvg("lora-rank-update", "LoRA rank update", "Frozen model weights receive a compact low-rank adaptation update.");

    const drawMatrix = (group, rows, cols, cell, colorFn, delayBase = .1) => {
      const cells = d3.range(rows * cols).map(index => ({ row: Math.floor(index / cols), col: index % cols, index }));
      const rects = group.selectAll("rect.matrix-cell").data(cells).join("rect")
        .attr("class", "matrix-cell")
        .attr("x", d => d.col * (cell + 3))
        .attr("y", d => d.row * (cell + 3))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", colorFn)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1);
      rects.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".35s")
        .attr("begin", d => `${delayBase + d.index * .01}s`)
        .attr("fill", "freeze");
      return rects;
    };

    const base = svg.append("g").attr("transform", "translate(58,112)");
    base.append("text").attr("class", "mark-label").attr("x", 62).attr("y", -18).attr("text-anchor", "middle").text("frozen W");
    drawMatrix(base, 7, 7, 16, d => (d.row + d.col) % 2 ? palette.gray200 : palette.gray100, .08);

    const a = svg.append("g").attr("transform", "translate(224,104)");
    a.append("text").attr("class", "mark-label").attr("x", 22).attr("y", -18).attr("text-anchor", "middle").text("A");
    drawMatrix(a, 7, 2, 16, d => [palette.blue, palette.green][d.col], .34);

    const b = svg.append("g").attr("transform", "translate(302,126)");
    b.append("text").attr("class", "mark-label").attr("x", 63).attr("y", -18).attr("text-anchor", "middle").text("B");
    drawMatrix(b, 2, 7, 16, d => [palette.orange, palette.purple][d.row], .52);

    const delta = svg.append("g").attr("transform", "translate(410,112)");
    delta.append("text").attr("class", "mark-label").attr("x", 62).attr("y", -18).attr("text-anchor", "middle").text("Delta W");
    drawMatrix(delta, 7, 7, 16, d => {
      const score = (d.row * 2 + d.col * 3) % 6;
      return [palette.blueHighlight, palette.greenHighlight, palette.orangeHighlight, palette.purpleHighlight, palette.yellowHighlight, palette.redHighlight][score];
    }, .82);

    const formula = svg.append("g").attr("transform", "translate(82,306)");
    [
      { text: "W", x: 0, fill: palette.gray700 },
      { text: "+", x: 64, fill: palette.ink },
      { text: "B", x: 118, fill: palette.orange },
      { text: "A", x: 170, fill: palette.blue },
      { text: "=", x: 230, fill: palette.ink },
      { text: "adapted layer", x: 306, fill: palette.red }
    ].forEach((item, i) => {
      const label = formula.append("text").attr("class", "mark-label").attr("x", item.x).attr("y", 0).attr("font-size", i === 5 ? 18 : 25).attr("font-weight", 800).attr("fill", item.fill).text(item.text);
      label.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".24s").attr("begin", `${1.15 + i * .08}s`).attr("fill", "freeze");
    });

    [["M184,170C206,170 210,154 224,154", palette.blue], ["M270,154C288,154 292,154 302,154", palette.orange], ["M394,154C404,154 408,154 410,154", palette.red]].forEach(([d, stroke], i) => {
      const path = svg.append("path").attr("d", d).attr("fill", "none").attr("stroke", stroke).attr("stroke-width", 2.2).attr("stroke-linecap", "round");
      drawPath(path, .65 + i * .18, .7);
    });
  }
```
