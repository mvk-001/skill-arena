# QKV Projection Flow

- **Pattern ID:** `d3-qkv-projection-flow`
- **Gallery source ID:** `qkv-projection-flow`
- **Family:** Transformer
- **Use when:** Token embeddings split into query, key, and value matrices before attention.
- **Renderer:** `renderQkvProjectionFlow`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderQkvProjectionFlow() {
    const svg = prepareSvg("qkv-projection-flow", "QKV projection flow", "Token embeddings split into query, key, and value projections before attention.");
    const tokens = ["The", "model", "routes", "tokens"];
    const inputX = 58;
    const inputY = 104;
    const tokenH = 42;
    const tokenW = 76;
    const rows = tokens.map((token, i) => ({ token, x: inputX, y: inputY + i * 58, color: colors[i % colors.length] }));
    const planes = [
      { name: "Q", x: 198, y: 84, color: palette.red },
      { name: "K", x: 300, y: 84, color: palette.blue },
      { name: "V", x: 402, y: 84, color: palette.green }
    ];

    rows.forEach((row, i) => {
      const g = svg.append("g").attr("transform", `translate(${row.x},${row.y})`);
      g.append("rect").attr("width", tokenW).attr("height", tokenH).attr("rx", 8).attr("fill", row.color).attr("fill-opacity", .82).attr("stroke", palette.surface);
      g.append("text").attr("class", "reverse-label").attr("x", tokenW / 2).attr("y", 26).attr("text-anchor", "middle").attr("font-weight", 800).text(row.token);
      fadeIn(g, .08 + i * .05, .34);
    });

    planes.forEach((plane, planeIndex) => {
      const g = svg.append("g").attr("transform", `translate(${plane.x},${plane.y})`);
      g.append("rect").attr("width", 64).attr("height", 232).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", plane.color).attr("stroke-width", 2);
      g.append("text").attr("class", "mark-label").attr("x", 32).attr("y", -12).attr("text-anchor", "middle").attr("font-weight", 800).attr("fill", plane.color).text(plane.name);
      rows.forEach((row, i) => {
        g.append("rect")
          .attr("x", 12)
          .attr("y", 18 + i * 50)
          .attr("width", 40)
          .attr("height", 32)
          .attr("rx", 6)
          .attr("fill", plane.color)
          .attr("fill-opacity", .28 + i * .09)
          .append("animate")
          .attr("attributeName", "fill-opacity")
          .attr("values", `.16;${.72 - planeIndex * .08};${.28 + i * .09}`)
          .attr("dur", "1.2s")
          .attr("begin", `${.6 + planeIndex * .16 + i * .04}s`)
          .attr("fill", "freeze");
      });
    });

    rows.forEach((row, rowIndex) => {
      planes.forEach((plane, planeIndex) => {
        const path = svg.append("path")
          .attr("id", `qkv-projection-flow-${rowIndex}-${planeIndex}`)
          .attr("d", `M${row.x + tokenW},${row.y + tokenH / 2}C${row.x + 118},${row.y + tokenH / 2} ${plane.x - 42},${plane.y + 34 + rowIndex * 50} ${plane.x + 12},${plane.y + 34 + rowIndex * 50}`)
          .attr("fill", "none")
          .attr("stroke", plane.color)
          .attr("stroke-opacity", .34)
          .attr("stroke-width", 2)
          .attr("stroke-linecap", "round");
        drawPath(path, .28 + rowIndex * .04 + planeIndex * .05, .9);
        const dot = svg.append("circle").attr("r", 4.5).attr("fill", plane.color);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${.34 + rowIndex * .05 + planeIndex * .08}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#qkv-projection-flow-${rowIndex}-${planeIndex}`);
      });
    });

    const attention = svg.append("g").attr("transform", "translate(196,348)");
    attention.append("rect").attr("width", 272).attr("height", 34).attr("rx", 9).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    attention.append("text").attr("class", "mark-label").attr("x", 136).attr("y", 22).attr("text-anchor", "middle").attr("font-weight", 800).text("scaled dot-product attention");
    fadeIn(attention, 1.25, .35);
  }
```
