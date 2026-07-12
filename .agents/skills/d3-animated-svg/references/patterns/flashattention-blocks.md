# FlashAttention Blocks

- **Pattern ID:** `d3-flashattention-blocks`
- **Gallery source ID:** `flashattention-blocks`
- **Family:** Attention
- **Use when:** Block tiles move between HBM and SRAM to reduce attention memory traffic.
- **Renderer:** `renderFlashAttentionBlocks`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderFlashAttentionBlocks() {
    const svg = prepareSvg("flashattention-blocks", "FlashAttention blocks", "Tiled attention blocks reuse SRAM to reduce memory traffic.");

    const grid = { x: 68, y: 96, n: 8, cell: 24, gap: 3 };
    const blocks = [];
    for (let br = 0; br < 4; br += 1) {
      for (let bc = 0; bc < 4; bc += 1) blocks.push({ br, bc, active: br === 2 && bc <= 2 });
    }
    const cells = d3.range(grid.n * grid.n).map(index => {
      const row = Math.floor(index / grid.n);
      const col = index % grid.n;
      return { row, col, future: col > row, block: `${Math.floor(row / 2)}-${Math.floor(col / 2)}` };
    });

    svg.append("rect").attr("x", grid.x - 14).attr("y", grid.y - 14).attr("width", 234).attr("height", 234).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("rect.flash-cell").data(cells).join("rect")
      .attr("class", "flash-cell")
      .attr("x", d => grid.x + d.col * (grid.cell + grid.gap))
      .attr("y", d => grid.y + d.row * (grid.cell + grid.gap))
      .attr("width", grid.cell)
      .attr("height", grid.cell)
      .attr("rx", 3)
      .attr("fill", d => d.future ? palette.gray100 : ((d.row + d.col) % 3 ? palette.blueHighlight : palette.greenHighlight))
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".3s")
      .attr("begin", d => `${.08 + (d.row * grid.n + d.col) * .004}s`)
      .attr("fill", "freeze");

    blocks.forEach((block, i) => {
      const rect = svg.append("rect")
        .attr("x", grid.x + block.bc * 2 * (grid.cell + grid.gap) - 4)
        .attr("y", grid.y + block.br * 2 * (grid.cell + grid.gap) - 4)
        .attr("width", 2 * grid.cell + grid.gap + 8)
        .attr("height", 2 * grid.cell + grid.gap + 8)
        .attr("rx", 7)
        .attr("fill", "none")
        .attr("stroke", block.active ? palette.red : palette.gray300)
        .attr("stroke-width", block.active ? 3 : 1.2)
        .attr("opacity", block.active ? 0 : .44);
      if (block.active) {
        rect.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.48;1").attr("dur", "1.4s").attr("begin", `${.9 + i * .04}s`).attr("fill", "freeze");
      }
    });

    const hbm = svg.append("g").attr("transform", "translate(340,96)");
    hbm.append("rect").attr("width", 150).attr("height", 74).attr("rx", 10).attr("fill", palette.gray100).attr("stroke", palette.gray300);
    hbm.append("text").attr("class", "mark-label").attr("x", 75).attr("y", 28).attr("text-anchor", "middle").attr("font-weight", 800).text("HBM");
    hbm.append("text").attr("class", "caption").attr("x", 75).attr("y", 51).attr("text-anchor", "middle").text("Q K V blocks");
    const sram = svg.append("g").attr("transform", "translate(340,224)");
    sram.append("rect").attr("width", 150).attr("height", 82).attr("rx", 10).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    sram.append("text").attr("class", "mark-label").attr("x", 75).attr("y", 30).attr("text-anchor", "middle").attr("font-weight", 800).text("SRAM tile");
    sram.append("text").attr("class", "caption").attr("x", 75).attr("y", 54).attr("text-anchor", "middle").text("softmax + output");

    const route = svg.append("path")
      .attr("id", "flashattention-blocks-route")
      .attr("d", "M334,134C298,134 292,188 334,240")
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(route, .55, 1.2);
    d3.range(4).forEach(i => {
      const dot = svg.append("circle").attr("r", 6).attr("fill", [palette.blue, palette.green, palette.orange, palette.red][i]);
      dot.append("animateMotion")
        .attr("dur", "1.25s")
        .attr("begin", `${.65 + i * .16}s`)
        .attr("fill", "freeze")
        .append("mpath")
        .attr("href", "#flashattention-blocks-route");
    });

  }
```
