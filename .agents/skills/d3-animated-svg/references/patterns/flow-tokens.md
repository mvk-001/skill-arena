# Flow Tokens

- **Pattern ID:** `d3-flow-tokens`
- **Gallery source ID:** `flow-tokens`
- **Family:** Flow
- **Use when:** Moving particles reveal direction and cadence.
- **Renderer:** `renderFlowTokens`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderFlowTokens() {
    const svg = prepareSvg("flow-tokens", "Flow tokens", "SVG animateMotion tokens move along D3-generated flow paths.");
    const routes = [
      { name: "Ingest", color: palette.blue, points: [[72, 260], [164, 132], [278, 184], [480, 92]] },
      { name: "Score", color: palette.orange, points: [[70, 160], [190, 236], [320, 118], [486, 214]] },
      { name: "Route", color: palette.green, points: [[82, 316], [220, 276], [336, 314], [486, 276]] }
    ];
    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveBasis);
    const paths = svg.append("g").selectAll("path").data(routes).join("path")
      .attr("id", (d, i) => `flow-tokens-route-${i}`)
      .attr("d", d => line(d.points))
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", 4)
      .attr("stroke-opacity", .62)
      .attr("stroke-linecap", "round");
    drawPath(paths, .08, 1);
    routes.forEach((route, i) => {
      const token = svg.append("circle")
        .attr("r", 6)
        .attr("fill", route.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.6);
      const motion = token.append("animateMotion")
        .attr("dur", `${2.6 + i * .25}s`)
        .attr("begin", `${i * .28}s`)
        .attr("repeatCount", "indefinite")
        .attr("rotate", "auto");
      motion.append("mpath").attr("href", `#flow-tokens-route-${i}`);
      svg.append("text").attr("class", "mark-label").attr("x", 38).attr("y", route.points[0][1] + 5).text(route.name);
    });
    ["Collect", "Transform", "Deliver"].forEach((label, i) => {
      svg.append("text").attr("class", "label").attr("x", 88 + i * 184).attr("y", 44).attr("text-anchor", "middle").text(label);
    });
  }
```
