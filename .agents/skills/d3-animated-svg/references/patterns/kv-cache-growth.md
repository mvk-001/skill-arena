# KV Cache Growth

- **Pattern ID:** `d3-kv-cache-growth`
- **Gallery source ID:** `kv-cache-growth`
- **Family:** LLM
- **Use when:** Generated tokens append reusable key-value columns while the active query advances.
- **Renderer:** `renderKvCacheGrowth`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderKvCacheGrowth() {
    const svg = prepareSvg("kv-cache-growth", "KV cache growth", "Autoregressive generation appends reusable key-value states while the active query moves forward.");
    const tokens = ["Prompt", "cat", "sat", "on", "mat", "."];
    const rows = [
      { name: "K", y: 136, color: palette.blue },
      { name: "V", y: 202, color: palette.green }
    ];
    const startX = 104;
    const colW = 58;
    const gap = 10;
    const cellH = 42;
    rows.forEach(row => {
      svg.append("text").attr("class", "mark-label").attr("x", 76).attr("y", row.y + 27).attr("text-anchor", "end").attr("font-weight", 800).text(row.name);
      tokens.forEach((token, i) => {
        const x = startX + i * (colW + gap);
        const rect = svg.append("rect")
          .attr("x", x)
          .attr("y", row.y)
          .attr("width", colW)
          .attr("height", cellH)
          .attr("rx", 7)
          .attr("fill", palette.gray100)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.4);
        rect.append("animate")
          .attr("attributeName", "fill")
          .attr("values", `${palette.gray100};${row.color}`)
          .attr("dur", ".22s")
          .attr("begin", `${.35 + i * .36}s`)
          .attr("fill", "freeze");
        rect.append("animate")
          .attr("attributeName", "fill-opacity")
          .attr("values", ".58;.82")
          .attr("dur", ".22s")
          .attr("begin", `${.35 + i * .36}s`)
          .attr("fill", "freeze");
      });
    });
    tokens.forEach((token, i) => {
      const x = startX + i * (colW + gap) + colW / 2;
      svg.append("text").attr("class", "caption").attr("x", x).attr("y", 116).attr("text-anchor", "middle").style("font-size", "11px").text(token);
      svg.append("text").attr("class", "caption").attr("x", x).attr("y", 276).attr("text-anchor", "middle").style("font-size", "10px").text(`t${i}`);
    });
    const queryY = 326;
    const queryPath = svg.append("path")
      .attr("id", "kv-cache-query-path")
      .attr("d", `M${startX + colW / 2},${queryY}H${startX + (tokens.length - 1) * (colW + gap) + colW / 2}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round");
    drawPath(queryPath, .25, 2.1);
    const query = svg.append("g");
    query.append("circle").attr("r", 9).attr("fill", palette.red);
    query.append("text").attr("class", "caption").attr("x", 0).attr("y", 28).attr("text-anchor", "middle").attr("font-weight", 800).text("Q");
    query.append("animateMotion")
      .attr("dur", "2.15s")
      .attr("begin", ".28s")
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#kv-cache-query-path");
    const reuse = svg.append("path")
      .attr("d", `M${startX},88H${startX + (tokens.length - 2) * (colW + gap) + colW}`)
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0);
    reuse.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", .82).attr("dur", ".25s").attr("begin", "2.3s").attr("fill", "freeze");
  }
```
