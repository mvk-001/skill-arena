# Parabolic Arcs

- **Pattern ID:** `d3-parabolic-arcs`
- **Gallery source ID:** `parabolic-arcs`
- **Family:** Geometry
- **Use when:** Curved trajectories connect ordered endpoints with height encoding.
- **Renderer:** `renderParabolicArcs`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderParabolicArcs() {
    const svg = prepareSvg("parabolic-arcs", "Parabolic arcs", "Curved trajectories connect endpoints with arc height encoding.");
    const baseline = 326;
    const x = d3.scalePoint().domain(d3.range(8)).range([70, width - 70]);
    const arcs = [
      { a: 0, b: 5, v: 92, c: palette.blue },
      { a: 1, b: 7, v: 126, c: palette.red },
      { a: 2, b: 4, v: 66, c: palette.green },
      { a: 3, b: 6, v: 104, c: palette.orange },
      { a: 0, b: 2, v: 48, c: palette.purple },
      { a: 5, b: 7, v: 58, c: palette.gold }
    ];
    svg.append("line").attr("x1", 52).attr("x2", width - 52).attr("y1", baseline).attr("y2", baseline).attr("stroke", palette.gray300).attr("stroke-width", 2);
    const paths = svg.append("g").attr("fill", "none").selectAll("path").data(arcs).join("path")
      .attr("d", d => {
        const x0 = x(d.a), x1 = x(d.b), xm = (x0 + x1) / 2;
        return `M${x0},${baseline}Q${xm},${baseline - d.v} ${x1},${baseline}`;
      })
      .attr("stroke", d => d.c).attr("stroke-width", d => 1.8 + d.v / 45).attr("stroke-linecap", "round").attr("opacity", .9);
    drawPath(paths, .08, 1.05);
    const endpoints = d3.range(8).map(i => ({ i, x: x(i) }));
    const dots = svg.append("g").selectAll("circle").data(endpoints).join("circle")
      .attr("cx", d => d.x).attr("cy", baseline).attr("fill", palette.ink).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 2, 7, .1, .55);
  }
```
