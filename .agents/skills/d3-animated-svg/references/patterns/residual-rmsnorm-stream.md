# Residual RMSNorm Stream

- **Pattern ID:** `d3-residual-rmsnorm-stream`
- **Gallery source ID:** `residual-rmsnorm-stream`
- **Family:** Transformer
- **Use when:** The residual stream branches through attention, adds back, then normalizes.
- **Renderer:** `renderResidualRmsnormStream`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderResidualRmsnormStream() {
    const svg = prepareSvg("residual-rmsnorm-stream", "Residual RMSNorm stream", "The residual stream branches through attention, adds back, and is normalized before the next block.");
    const streamY = 212;
    const stages = [
      { label: "x", x: 58, color: palette.blue },
      { label: "attention", x: 188, color: palette.orange },
      { label: "add", x: 312, color: palette.red },
      { label: "RMSNorm", x: 420, color: palette.green },
      { label: "next", x: 514, color: palette.purple }
    ];
    const streamPath = svg.append("path")
      .attr("id", "residual-rmsnorm-stream-main")
      .attr("d", `M${stages[0].x},${streamY}H${stages.at(-1).x}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round");
    drawPath(streamPath, .1, 1.35);
    const branchPath = svg.append("path")
      .attr("id", "residual-rmsnorm-stream-branch")
      .attr("d", `M${stages[0].x + 34},${streamY}C128,118 220,118 ${stages[2].x - 10},${streamY - 6}`)
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .72);
    drawPath(branchPath, .35, .95);
    stages.forEach((stage, i) => {
      const group = svg.append("g").attr("transform", `translate(${stage.x},${streamY})`);
      if (stage.label === "add") {
        group.append("circle").attr("r", 18).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.2);
        group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", 6).attr("text-anchor", "middle").attr("font-size", 20).text("+");
      } else {
        group.append("rect").attr("x", -35).attr("y", -18).attr("width", 70).attr("height", 36).attr("rx", 8).attr("fill", stage.color).attr("fill-opacity", .8).attr("stroke", palette.surface);
        group.append("text").attr("class", "reverse-label").attr("x", 0).attr("y", 5).attr("text-anchor", "middle").attr("font-weight", 800).style("font-size", stage.label === "attention" || stage.label === "RMSNorm" ? "9px" : "11px").text(stage.label);
      }
      fadeIn(group, .12 + i * .1, .28);
    });
    d3.range(5).forEach(i => {
      const dot = svg.append("circle").attr("r", 5).attr("fill", colors[i % colors.length]).attr("stroke", palette.surface).attr("stroke-width", 1.3);
      dot.append("animateMotion")
        .attr("dur", "1.4s")
        .attr("begin", `${.26 + i * .12}s`)
        .attr("fill", "freeze")
        .append("mpath")
        .attr("href", "#residual-rmsnorm-stream-main");
    });
    const dot = svg.append("circle").attr("r", 5.5).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 1.4);
    dot.append("animateMotion").attr("dur", "1s").attr("begin", ".5s").attr("fill", "freeze").append("mpath").attr("href", "#residual-rmsnorm-stream-branch");

    const vectors = [
      { x: 92, before: [44, 22, 35, 14], after: [28, 27, 29, 26], color: palette.blue },
      { x: 420, before: [48, 18, 39, 12], after: [29, 28, 27, 27], color: palette.green }
    ];
    vectors.forEach((block, blockIndex) => {
      const group = svg.append("g").attr("transform", `translate(${block.x},300)`);
      group.append("text").attr("class", "caption").attr("x", 34).attr("y", -18).attr("text-anchor", "middle").text(blockIndex ? "after norm" : "raw stream");
      block.before.forEach((h, i) => {
        group.append("rect").attr("x", i * 17).attr("y", -h).attr("width", 12).attr("height", h).attr("rx", 3).attr("fill", block.color).attr("fill-opacity", blockIndex ? .3 : .62);
      });
      block.after.forEach((h, i) => {
        const bar = group.append("rect").attr("x", i * 17).attr("y", -h).attr("width", 12).attr("height", h).attr("rx", 3).attr("fill", block.color).attr("fill-opacity", .76);
        if (blockIndex) bar.append("animate").attr("attributeName", "height").attr("values", `${block.before[i]};${h}`).attr("dur", ".45s").attr("begin", `${1.15 + i * .06}s`).attr("fill", "freeze");
      });
    });
  }
```
