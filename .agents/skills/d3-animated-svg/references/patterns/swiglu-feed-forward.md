# SwiGLU Feed Forward

- **Pattern ID:** `d3-swiglu-feed-forward`
- **Gallery source ID:** `swiglu-feed-forward`
- **Family:** Transformer
- **Use when:** Up and gate projections multiply before down projection returns to model width.
- **Renderer:** `renderSwigluFeedForward`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSwigluFeedForward() {
    const svg = prepareSvg("swiglu-feed-forward", "SwiGLU feed forward", "Transformer FFN expansion uses an up projection, gated activation, elementwise product, and down projection.");
    const lanes = [
      { label: "input", x: 56, color: palette.blue },
      { label: "up", x: 170, y: 118, color: palette.orange },
      { label: "gate", x: 170, y: 238, color: palette.purple },
      { label: "multiply", x: 322, color: palette.red },
      { label: "down", x: 452, color: palette.green }
    ];
    const drawVector = (x, y, label, color, values, delay) => {
      const group = svg.append("g").attr("transform", `translate(${x},${y})`);
      group.append("text").attr("class", "mark-label").attr("x", 28).attr("y", -18).attr("text-anchor", "middle").text(label);
      values.forEach((value, i) => {
        const bar = group.append("rect").attr("x", i * 14).attr("y", -value).attr("width", 10).attr("height", value).attr("rx", 3).attr("fill", color).attr("fill-opacity", .72).attr("stroke", palette.surface);
        bar.append("animate").attr("attributeName", "height").attr("from", 3).attr("to", value).attr("dur", ".34s").attr("begin", `${delay + i * .035}s`).attr("fill", "freeze");
      });
      return group;
    };
    drawVector(42, 210, "d_model", palette.blue, [30, 46, 26, 38], .08);
    drawVector(156, 172, "up proj", palette.orange, [22, 36, 52, 34, 44, 28], .36);
    drawVector(156, 292, "gate proj", palette.purple, [46, 20, 36, 54, 24, 42], .44);
    drawVector(306, 236, "SiLU gate x up", palette.red, [24, 16, 42, 45, 26, 30], .95);
    drawVector(450, 210, "down proj", palette.green, [36, 28, 42, 30], 1.25);
    [
      { d: "M100,198C128,168 130,150 154,150", color: palette.orange },
      { d: "M100,214C128,254 130,270 154,270", color: palette.purple },
      { d: "M240,150C270,166 288,196 306,214", color: palette.orange },
      { d: "M240,270C270,254 288,236 306,226", color: palette.purple },
      { d: "M390,222C414,214 424,210 448,210", color: palette.green }
    ].forEach((route, i) => {
      const path = svg.append("path").attr("d", route.d).attr("fill", "none").attr("stroke", route.color).attr("stroke-width", 2.6).attr("stroke-linecap", "round").attr("stroke-opacity", .68);
      drawPath(path, .42 + i * .12, .7);
    });
    const product = svg.append("g").attr("transform", "translate(286,196)");
    product.append("circle").attr("cx", 36).attr("cy", 32).attr("r", 20).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.3);
    product.append("text").attr("class", "mark-label").attr("x", 36).attr("y", 39).attr("text-anchor", "middle").attr("font-size", 20).text("*");
    fadeIn(product, .82, .28);
    svg.append("rect").attr("x", 132).attr("y", 92).attr("width", 334).attr("height", 232).attr("rx", 14).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-dasharray", "5 6");
    svg.append("text").attr("class", "caption").attr("x", 300).attr("y", 346).attr("text-anchor", "middle").text("expand, gate, contract back to model width");
  }
```
