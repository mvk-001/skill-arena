# Tissot Indicatrix

- **Pattern ID:** `d3-tissot-indicatrix`
- **Gallery source ID:** `tissot-indicatrix`
- **Family:** Projection
- **Use when:** Equal angular circles reveal distortion across a map.
- **Renderer:** `renderTissotIndicatrix`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTissotIndicatrix() {
    const svg = prepareSvg("tissot-indicatrix", "Tissot indicatrix", "Equal angular circles reveal projection distortion across the map.");
    const projection = d3.geoNaturalEarth1().fitExtent([[44, 48], [516, 340]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path").attr("d", path).attr("fill", "none").attr("stroke", palette.gray100).attr("stroke-width", .8);
    const circles = [];
    [-120, -60, 0, 60, 120].forEach(lon => [-50, 0, 50].forEach(lat => circles.push(d3.geoCircle().center([lon, lat]).radius(8)())));
    const marks = svg.append("g").selectAll("path").data(circles).join("path")
      .attr("d", path).attr("fill", palette.orangeHighlight).attr("fill-opacity", .45).attr("stroke", palette.orange).attr("stroke-width", 2);
    fadeIn(marks, .06, .55);
  }
```
