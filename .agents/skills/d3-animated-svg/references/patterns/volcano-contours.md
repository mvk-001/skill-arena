# Volcano Contours

- **Pattern ID:** `d3-volcano-contours`
- **Gallery source ID:** `volcano-contours`
- **Family:** Surface
- **Use when:** A synthetic height field becomes nested contour bands.
- **Renderer:** `renderVolcanoContours`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVolcanoContours() {
    const svg = prepareSvg("volcano-contours", "Volcano contours", "A synthetic height field becomes nested contour bands.");
    const nx = 46, ny = 32;
    const values = [];
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const dx = (x - 21) / 11, dy = (y - 15) / 8;
        const peak = Math.exp(-(dx * dx + dy * dy)) * 98;
        const ridge = Math.exp(-(((x - 31) / 8) ** 2 + ((y - 9) / 5) ** 2)) * 48;
        values.push(18 + peak + ridge + Math.sin(x / 3) * 4);
      }
    }
    const contours = d3.contours().size([nx, ny]).thresholds(d3.range(25, 126, 14))(values);
    const projection = d3.geoIdentity().scale(10.2).translate([46, 50]);
    const path = d3.geoPath(projection);
    const fill = d3.scaleQuantize().domain([25, 125]).range(["#cdf3ff", "#dbffcc", "#fff4cc", "#ffe5cc", "#ffccd5", "#f9ccff"]);
    const bands = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path).attr("fill", d => fill(d.value)).attr("stroke", "#fff").attr("stroke-width", 1.1);
    fadeIn(bands, .08, .65);
  }
```
