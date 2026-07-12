# Attention Routing

- **Pattern ID:** `d3-attention-routing`
- **Gallery source ID:** `attention-routing`
- **Family:** LLM
- **Use when:** A query token distributes attention across earlier context tokens.
- **Renderer:** `renderAttentionRouting`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAttentionRouting() {
    const svg = prepareSvg("attention-routing", "Attention routing", "A query token weights earlier tokens before producing the next representation.");
    const tokens = [
      { text: "The", x: 72, w: 54, weight: .10 },
      { text: "key", x: 142, w: 54, weight: .38 },
      { text: "opens", x: 212, w: 78, weight: .14 },
      { text: "the", x: 306, w: 54, weight: .26 },
      { text: "door", x: 376, w: 62, weight: .12 }
    ];
    const query = { text: "it", x: 468, y: 270, w: 52, h: 38 };
    const tokenGroups = svg.append("g").selectAll("g.attention-token").data(tokens).join("g")
      .attr("class", "attention-token")
      .attr("transform", d => `translate(${d.x},112)`);
    tokenGroups.append("rect").attr("width", d => d.w).attr("height", 36).attr("rx", 8).attr("fill", palette.surface).attr("stroke", palette.gray300).attr("stroke-width", 1.6);
    tokenGroups.append("text").attr("class", "mark-label").attr("x", d => d.w / 2).attr("y", 23).attr("text-anchor", "middle").text(d => d.text);

    const queryGroup = svg.append("g").attr("transform", `translate(${query.x},${query.y})`);
    queryGroup.append("rect").attr("width", query.w).attr("height", query.h).attr("rx", 9).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.2);
    queryGroup.append("text").attr("class", "mark-label").attr("x", query.w / 2).attr("y", 24).attr("text-anchor", "middle").attr("font-weight", 800).text(query.text);
    queryGroup.append("text").attr("class", "caption").attr("x", query.w / 2).attr("y", 56).attr("text-anchor", "middle").text("query");

    const paths = svg.append("g").selectAll("path.attention-link").data(tokens).join("path")
      .attr("class", "attention-link")
      .attr("d", d => {
        const sx = query.x + query.w / 2;
        const sy = query.y;
        const tx = d.x + d.w / 2;
        const ty = 150;
        return `M${sx},${sy}C${sx - 54},${sy - 78} ${tx + 38},${ty + 74} ${tx},${ty}`;
      })
      .attr("fill", "none")
      .attr("stroke", d => d.weight > .25 ? palette.red : palette.blue)
      .attr("stroke-width", d => 1.4 + d.weight * 14)
      .attr("stroke-opacity", d => .22 + d.weight * 1.05)
      .attr("stroke-linecap", "round");
    drawPath(paths, .18, .95);

    const heatX = 74;
    const heatY = 338;
    const heatW = 76;
    tokens.forEach((token, i) => {
      const fill = token.weight > .25 ? palette.red : token.weight > .12 ? palette.orange : palette.blueHighlight;
      svg.append("rect")
        .attr("x", heatX + i * heatW)
        .attr("y", heatY)
        .attr("width", heatW - 8)
        .attr("height", 28)
        .attr("rx", 6)
        .attr("fill", fill)
        .attr("fill-opacity", token.weight > .25 ? .86 : .48)
        .attr("stroke", palette.surface)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".3s")
        .attr("begin", `${.72 + i * .08}s`)
        .attr("fill", "freeze");
      svg.append("text")
        .attr("class", token.weight > .25 ? "reverse-label" : "caption")
        .attr("x", heatX + i * heatW + (heatW - 8) / 2)
        .attr("y", heatY + 19)
        .attr("text-anchor", "middle")
        .text(`${Math.round(token.weight * 100)}%`);
    });
  }
```
