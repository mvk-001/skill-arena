# Scaled Dot-Product Attention

- **Pattern ID:** `d3-scaled-dot-product-attention`
- **Gallery source ID:** `scaled-dot-product-attention`
- **Family:** Attention
- **Use when:** QK scores are masked, normalized, then applied to V.
- **Renderer:** `renderScaledDotProductAttention`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderScaledDotProductAttention() {
    const svg = prepareSvg("scaled-dot-product-attention", "Scaled dot-product attention", "Query-key scores are masked, passed through softmax, and used to weight value vectors.");
    svg.append("text").attr("class", "mark-label").attr("x", width / 2).attr("y", 42).attr("text-anchor", "middle")
      .text("softmax((QK^T / sqrt(d_k)) + mask) V");
    const cell = 15;
    const gap = 3;
    const n = 5;
    const drawMatrix = (x0, y0, rows, cols, label, color, valueFn, delay) => {
      const group = svg.append("g").attr("transform", `translate(${x0},${y0})`);
      group.append("text").attr("class", "mark-label").attr("x", cols * (cell + gap) / 2 - gap).attr("y", -14).attr("text-anchor", "middle").text(label);
      group.append("rect").attr("x", -8).attr("y", -8).attr("width", cols * (cell + gap) + 4).attr("height", rows * (cell + gap) + 4).attr("rx", 8).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      const cells = d3.range(rows * cols).map(index => ({ row: Math.floor(index / cols), col: index % cols, index, value: valueFn(Math.floor(index / cols), index % cols) }));
      group.selectAll("rect.attn-step-cell").data(cells).join("rect")
        .attr("class", "attn-step-cell")
        .attr("x", d => d.col * (cell + gap))
        .attr("y", d => d.row * (cell + gap))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", d => d.value < 0 ? palette.gray100 : color)
        .attr("fill-opacity", d => d.value < 0 ? .5 : .18 + d.value * .72)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".24s")
        .attr("begin", d => `${delay + d.index * .01}s`)
        .attr("fill", "freeze");
      return group;
    };

    drawMatrix(42, 126, n, 3, "Q", palette.red, (r, c) => .25 + ((r + c * 2) % 4) * .16, .08);
    drawMatrix(134, 126, 3, n, "K^T", palette.blue, (r, c) => .22 + ((r * 2 + c) % 5) * .13, .18);
    drawMatrix(246, 112, n, n, "scaled scores", palette.orange, (r, c) => c > r ? -1 : .2 + ((r + c * 3) % 5) * .14, .45);
    drawMatrix(376, 112, n, n, "softmax", palette.green, (r, c) => c > r ? .02 : Math.max(.08, .68 - Math.abs(r - c) * .16), .82);
    drawMatrix(476, 126, n, 2, "V", palette.purple, (r, c) => .24 + ((r + c) % 4) * .15, 1.02);

    [
      { d: "M116,164H132", color: palette.gray500, text: "x", labelX: 124, labelY: 156 },
      { d: "M228,164H244", color: palette.gray500, text: "mask", labelX: 236, labelY: 156 },
      { d: "M352,164H374", color: palette.green, text: "softmax", labelX: 363, labelY: 156 },
      { d: "M454,164H474", color: palette.gray500, text: "x", labelX: 464, labelY: 156 }
    ].forEach((route, i) => {
      const path = svg.append("path").attr("d", route.d).attr("fill", "none").attr("stroke", route.color).attr("stroke-width", 2.4).attr("stroke-linecap", "round");
      drawPath(path, .55 + i * .16, .38);
      svg.append("text").attr("class", "caption").attr("x", route.labelX).attr("y", route.labelY).attr("text-anchor", "middle").text(route.text);
    });

    const activeY = 112 + 3 * (cell + gap);
    const row = svg.append("rect").attr("x", 376 - 5).attr("y", activeY - 5).attr("width", n * (cell + gap) + 1).attr("height", cell + 10).attr("rx", 6).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.4).attr("opacity", 0);
    row.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.55;1").attr("dur", ".9s").attr("begin", "1.25s").attr("fill", "freeze");

    const out = svg.append("g").attr("transform", "translate(226,296)");
    out.append("rect").attr("x", -12).attr("y", -28).attr("width", 124).attr("height", 56).attr("rx", 10).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    [34, 58, 82].forEach((x, i) => {
      out.append("rect").attr("x", x).attr("y", -16).attr("width", 14).attr("height", 32).attr("rx", 4).attr("fill", [palette.blue, palette.green, palette.orange][i]).attr("fill-opacity", .74)
        .append("animate").attr("attributeName", "height").attr("from", 4).attr("to", 32).attr("dur", ".35s").attr("begin", `${1.45 + i * .12}s`).attr("fill", "freeze");
    });
    out.append("text").attr("class", "mark-label").attr("x", 50).attr("y", 47).attr("text-anchor", "middle").text("weighted output");
    fadeIn(out, 1.2, .32);
  }
```
