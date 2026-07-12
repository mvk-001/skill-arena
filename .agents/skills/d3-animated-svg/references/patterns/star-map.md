# Star Map

- **Pattern ID:** `d3-star-map`
- **Gallery source ID:** `star-map`
- **Family:** Astronomy
- **Use when:** Spherical coordinates become a radial sky chart.
- **Renderer:** `renderStarMap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderStarMap() {
    const svg = prepareSvg("star-map", "Star map", "Spherical sky coordinates become a radial chart of visible stars.");
    const center = [width / 2, height / 2 + 10];
    const radius = 158;
    svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", radius).attr("fill", palette.gray900).attr("stroke", palette.gray700).attr("stroke-width", 2);
    d3.range(1, 4).forEach(i => svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", radius * i / 4).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-opacity", .8));
    const stars = d3.range(58).map(i => {
      const angle = i * 2.399;
      const r = 18 + ((i * 37) % 134);
      return { x: center[0] + Math.cos(angle) * r, y: center[1] + Math.sin(angle) * r, mag: .35 + ((i * 17) % 65) / 100 };
    });
    const dots = svg.append("g").selectAll("circle").data(stars).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.mag > .8 ? palette.yellowHighlight : palette.surface);
    grow(dots, "r", .7, d => 1.4 + d.mag * 3.6, .03, .55);
    const constellation = [stars[4], stars[11], stars[18], stars[31], stars[44]];
    const path = svg.append("path").datum(constellation).attr("d", d3.line().x(d => d.x).y(d => d.y)).attr("fill", "none").attr("stroke", palette.gold).attr("stroke-width", 2.4).attr("stroke-opacity", .9);
    drawPath(path, .35, .8);
  }
```
