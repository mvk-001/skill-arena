# Orthographic Shading

- **Pattern ID:** `d3-orthographic-shading`
- **Gallery source ID:** `orthographic-shading`
- **Family:** Projection
- **Use when:** A globe projection uses radial light to suggest curvature.
- **Renderer:** `renderOrthographicShading`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderOrthographicShading() {
    const svg = prepareSvg("orthographic-shading", "Orthographic shading", "A globe projection uses radial light to suggest curvature.");
    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "orthographic-shading-light").attr("cx", "36%").attr("cy", "28%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
    grad.append("stop").attr("offset", "52%").attr("stop-color", "#cdf3ff");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#007298");
    const projection = d3.geoOrthographic().rotate([-28, -18]).fitExtent([[98, 48], [462, 356]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "url(#orthographic-shading-light)").attr("stroke", palette.ink).attr("stroke-width", 2);
    const graticule = svg.append("g").selectAll("path").data(d3.geoGraticule().step([20, 20]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .22).attr("stroke-width", .8);
    drawPath(graticule, .08, .9);
    const points = [[-74, 41], [2, 49], [31, 30], [77, 28]].map(d => projection(d)).filter(Boolean);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.orange).attr("stroke", palette.ink).attr("stroke-width", 1.2);
    grow(dots, "r", 2, 5, .25, .45);
  }
```
