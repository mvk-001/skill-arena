# ColorBrewer Splines

- **Pattern ID:** `d3-colorbrewer-splines`
- **Gallery source ID:** `colorbrewer-splines`
- **Family:** Color
- **Use when:** Interpolated spline ribbons show sequential palette movement.
- **Renderer:** `renderColorbrewerSplines`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderColorbrewerSplines() {
    const svg = prepareSvg("colorbrewer-splines", "ColorBrewer splines", "Interpolated spline ribbons show sequential palette movement.");
    const stops = [
      ["#cdf3ff", "#007298", "#004d66"],
      ["#dbffcc", "#45842a", "#294d19"],
      ["#ffe5cc", "#e77204", "#994a00"],
      ["#ffccd5", "#9e1b32", "#6d1222"],
      ["#f9ccff", "#652f6c", "#431f47"]
    ];
    const x = d3.scalePoint().domain(d3.range(7)).range([58, width - 58]);
    const line = d3.line().curve(d3.curveBasis);
    const paths = stops.map((paletteRow, i) => ({
      color: paletteRow[1],
      points: d3.range(7).map(j => [x(j), 74 + i * 58 + Math.sin(j * .9 + i) * 28])
    }));
    const splines = svg.append("g").selectAll("path").data(paths).join("path")
      .attr("d", d => line(d.points)).attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 11).attr("stroke-linecap", "round").attr("opacity", .9);
    drawPath(splines, .08, 1);
    paths.forEach((path, i) => {
      svg.append("g").selectAll("circle").data(path.points).join("circle")
        .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4.5).attr("fill", stops[i][0]).attr("stroke", path.color).attr("stroke-width", 1.4);
    });
  }
```
