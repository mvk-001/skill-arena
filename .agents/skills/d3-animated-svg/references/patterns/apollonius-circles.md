# Apollonius Circles

- **Pattern ID:** `d3-apollonius-circles`
- **Gallery source ID:** `apollonius-circles`
- **Family:** Geometry
- **Use when:** Circle solutions reveal tangent constraints between anchors.
- **Renderer:** `renderApolloniusCircles`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderApolloniusCircles() {
    const svg = prepareSvg("apollonius-circles", "Apollonius circles", "Circle solutions reveal tangent constraints between anchors.");
    const anchors = [
      { x: 188, y: 166, r: 42, c: palette.blue },
      { x: 322, y: 164, r: 34, c: palette.orange },
      { x: 260, y: 276, r: 38, c: palette.green }
    ];
    const solutions = [
      { x: 260, y: 198, r: 98, c: palette.purple },
      { x: 242, y: 211, r: 63, c: palette.red },
      { x: 300, y: 226, r: 54, c: palette.cyan }
    ];
    svg.append("g").selectAll("circle").data(anchors).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.r)
      .attr("fill", d => d.c).attr("fill-opacity", .14).attr("stroke", d => d.c).attr("stroke-width", 2.2);
    const solution = svg.append("g").selectAll("circle").data(solutions).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", "none").attr("stroke", d => d.c).attr("stroke-width", 2.4).attr("stroke-dasharray", "7 5");
    grow(solution, "r", 5, d => d.r, .1, .9);
    const points = svg.append("g").selectAll("circle.point").data(anchors).join("circle")
      .attr("class", "point").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.c).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(points, "r", 2, 7, .14, .45);
  }
```
