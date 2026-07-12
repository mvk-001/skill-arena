# Multi-Head Attention Merge

- **Pattern ID:** `d3-multi-head-attention-merge`
- **Gallery source ID:** `multi-head-attention-merge`
- **Family:** Transformer
- **Use when:** Several attention heads specialize before concatenation and output projection.
- **Renderer:** `renderMultiHeadAttentionMerge`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMultiHeadAttentionMerge() {
    const svg = prepareSvg("multi-head-attention-merge", "Multi-head attention merge", "Attention heads specialize independently before concatenation and output projection.");
    const heads = [
      { name: "syntax", x: 74, y: 82, color: palette.blue, hot: [3, 0] },
      { name: "entity", x: 228, y: 82, color: palette.green, hot: [2, 1] },
      { name: "position", x: 74, y: 222, color: palette.orange, hot: [3, 3] },
      { name: "tool", x: 228, y: 222, color: palette.purple, hot: [1, 2] }
    ];
    const n = 4;
    const cell = 19;
    const gap = 3;
    heads.forEach((head, headIndex) => {
      const group = svg.append("g").attr("transform", `translate(${head.x},${head.y})`);
      group.append("rect").attr("x", -14).attr("y", -24).attr("width", 112).attr("height", 122).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", head.color).attr("stroke-width", 1.8);
      group.append("text").attr("class", "mark-label").attr("x", 42).attr("y", -8).attr("text-anchor", "middle").style("font-size", "10px").text(head.name);
      const cells = d3.range(n * n).map(index => {
        const row = Math.floor(index / n);
        const col = index % n;
        const future = col > row;
        const focused = row === head.hot[0] && col === head.hot[1];
        return { row, col, index, future, focused, value: focused ? .95 : future ? .02 : .18 + ((row + col + headIndex) % 4) * .13 };
      });
      group.selectAll("rect.head-cell").data(cells).join("rect")
        .attr("class", "head-cell")
        .attr("x", d => d.col * (cell + gap))
        .attr("y", d => 14 + d.row * (cell + gap))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 4)
        .attr("fill", d => d.future ? palette.gray100 : d.focused ? palette.red : head.color)
        .attr("fill-opacity", d => d.future ? .46 : .22 + d.value * .62)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".25s")
        .attr("begin", d => `${.08 + headIndex * .14 + d.index * .008}s`)
        .attr("fill", "freeze");
    });

    const concatX = 398;
    const concatY = 118;
    const strips = heads.map((head, i) => ({ ...head, y: concatY + i * 42 }));
    strips.forEach((strip, i) => {
      svg.append("rect").attr("x", concatX).attr("y", strip.y).attr("width", 74).attr("height", 24).attr("rx", 6).attr("fill", strip.color).attr("fill-opacity", .72).attr("stroke", palette.surface);
      svg.append("text").attr("class", "reverse-label").attr("x", concatX + 37).attr("y", strip.y + 16).attr("text-anchor", "middle").style("font-size", "9px").text(`head ${i + 1}`);
      const source = { x: strip.x + 86, y: strip.y < 210 ? strip.y - 20 : strip.y + 6 };
      const path = svg.append("path")
        .attr("d", `M${source.x},${source.y}C${source.x + 56},${source.y} ${concatX - 42},${strip.y + 12} ${concatX},${strip.y + 12}`)
        .attr("fill", "none")
        .attr("stroke", strip.color)
        .attr("stroke-width", 2.1)
        .attr("stroke-opacity", .5)
        .attr("stroke-linecap", "round");
      drawPath(path, .72 + i * .09, .72);
    });
    svg.append("text").attr("class", "mark-label").attr("x", concatX + 37).attr("y", 92).attr("text-anchor", "middle").text("concat");
    const output = svg.append("g").attr("transform", "translate(398,310)");
    output.append("rect").attr("width", 112).attr("height", 42).attr("rx", 9).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    output.append("text").attr("class", "mark-label").attr("x", 56).attr("y", 26).attr("text-anchor", "middle").attr("font-weight", 800).text("W_o projection");
    fadeIn(output, 1.18, .32);
    const mergePath = svg.append("path").attr("id", "multi-head-attention-merge-output").attr("d", "M435,286V310").attr("fill", "none").attr("stroke", palette.gold).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(mergePath, 1.2, .35);
  }
```
