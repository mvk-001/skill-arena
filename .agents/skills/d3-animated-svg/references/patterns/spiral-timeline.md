# Spiral Timeline

- **Pattern ID:** `d3-spiral-timeline`
- **Gallery source ID:** `spiral-timeline`
- **Family:** Temporal
- **Use when:** Long sequences wrapped into cyclic space.
- **Renderer:** `renderSpiralTimeline`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSpiralTimeline() {
    const svg = prepareSvg("spiral-timeline", "Spiral timeline", "D3 line geometry wraps a long sequence into cyclic space.");
    const center = [width / 2, height / 2 + 8];
    const data = d3.range(72).map(i => {
      const theta = i * .38;
      const r = 24 + i * 2.08;
      return {
        i,
        x: center[0] + Math.cos(theta) * r,
        y: center[1] + Math.sin(theta) * r,
        event: i % 9 === 0
      };
    });
    const line = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(.65));
    const path = svg.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", palette.cyan)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(path, .08, 1.25);
    const events = svg.append("g").selectAll("circle").data(data.filter(d => d.event)).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.orange)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    grow(events, "r", 1, 7, .2, .6);
    svg.append("text").attr("class", "mark-label").attr("x", center[0]).attr("y", center[1] + 5).attr("text-anchor", "middle").text("start");
    svg.append("text").attr("class", "mark-label").attr("x", data.at(-1).x + 10).attr("y", data.at(-1).y + 4).text("end");
  }
```
