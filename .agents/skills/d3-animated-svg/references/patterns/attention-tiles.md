# Attention Matrix Tiles

- **Pattern ID:** `d3-attention-tiles`
- **Gallery source ID:** `attention-tiles`
- **Family:** LLM
- **Use when:** Causal attention scores become tiled rows, query focus, and masked future tokens.
- **Renderer:** `renderAttentionMatrixTiles`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAttentionMatrixTiles() {
    const svg = prepareSvg("attention-tiles", "Attention matrix tiles", "Causal self-attention as a tiled score matrix with masked future tokens and an active query row.");
    const n = 9;
    const cell = 26;
    const gap = 4;
    const x0 = 96;
    const y0 = 88;
    const cells = [];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        const causal = col <= row;
        const diagonal = row === col;
        const weight = causal ? Math.max(.08, .86 - Math.abs(row - col) * .14 + ((row + col) % 3) * .035) : 0;
        cells.push({ row, col, causal, diagonal, weight });
      }
    }

    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 18).attr("width", n * (cell + gap) + 14).attr("height", n * (cell + gap) + 14).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);

    const tileColor = d => !d.causal ? palette.gray100 : d.diagonal ? palette.red : d.weight > .55 ? palette.orange : d.weight > .28 ? palette.green : palette.blueHighlight;
    const tiles = svg.append("g").selectAll("rect.attention-tile").data(cells).join("rect")
      .attr("class", "attention-tile")
      .attr("x", d => x0 + d.col * (cell + gap))
      .attr("y", d => y0 + d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 4)
      .attr("fill", tileColor)
      .attr("fill-opacity", d => d.causal ? .36 + d.weight * .58 : .36)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2);
    tiles.append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".35s")
      .attr("begin", d => `${.12 + (d.row * n + d.col) * .006}s`)
      .attr("fill", "freeze");

    const activeRow = 6;
    const rowBand = svg.append("rect")
      .attr("x", x0 - 8)
      .attr("y", y0 + activeRow * (cell + gap) - 8)
      .attr("width", n * (cell + gap) - gap + 16)
      .attr("height", cell + 16)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 3)
      .attr("opacity", 0);
    rowBand.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", .88).attr("dur", ".24s").attr("begin", "1.15s").attr("fill", "freeze");

    const labels = d3.range(n);
    svg.append("g").selectAll("text.query-label").data(labels).join("text")
      .attr("class", "caption")
      .attr("x", x0 - 14)
      .attr("y", d => y0 + d * (cell + gap) + cell / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => `q${d}`);
    svg.append("g").selectAll("text.key-label").data(labels).join("text")
      .attr("class", "caption")
      .attr("x", d => x0 + d * (cell + gap) + cell / 2)
      .attr("y", y0 - 24)
      .attr("text-anchor", "middle")
      .text(d => `k${d}`);

    const legend = svg.append("g").attr("transform", "translate(388,102)");
    [
      { name: "active row", color: palette.red },
      { name: "near context", color: palette.orange },
      { name: "far context", color: palette.blueHighlight },
      { name: "future mask", color: palette.gray100 }
    ].forEach((item, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 29})`);
      row.append("rect").attr("width", 18).attr("height", 18).attr("rx", 4).attr("fill", item.color).attr("fill-opacity", i === 3 ? .56 : .86).attr("stroke", palette.surface);
      row.append("text").attr("class", "mark-label").attr("x", 26).attr("y", 14).style("font-size", "11px").text(item.name);
    });

    const headY = 338;
    const heads = [
      { name: "head 1", color: palette.blue, offset: 0 },
      { name: "head 2", color: palette.green, offset: 1 },
      { name: "head 3", color: palette.purple, offset: 2 }
    ];
    heads.forEach((head, i) => {
      const group = svg.append("g").attr("transform", `translate(${96 + i * 132},${headY})`);
      group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -8).style("font-size", "10px").text(head.name);
      d3.range(7).forEach(j => {
        group.append("rect")
          .attr("x", j * 15)
          .attr("y", 0)
          .attr("width", 12)
          .attr("height", 14 + ((j + head.offset) % 4) * 5)
          .attr("rx", 3)
          .attr("fill", j === activeRow % 7 ? palette.red : head.color)
          .attr("fill-opacity", .74)
          .append("animate")
          .attr("attributeName", "height")
          .attr("values", `4;${14 + ((j + head.offset) % 4) * 5};${14 + ((j + head.offset) % 4) * 5}`)
          .attr("dur", "1.4s")
          .attr("begin", `${.35 + i * .12 + j * .03}s`)
          .attr("fill", "freeze");
      });
    });
  }
```
