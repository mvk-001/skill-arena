# Isoline Terrain

- **Pattern ID:** `d3-isoline-terrain`
- **Gallery source ID:** `isoline-terrain`
- **Family:** Surface
- **Use when:** A scalar grid becomes nested elevation bands.
- **Renderer:** `renderIsolineTerrain`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderIsolineTerrain() {
    const svg = prepareSvg("isoline-terrain", "Isoline terrain", "D3 contours turn a scalar grid into nested elevation bands.");
    const cols = 36, rows = 24;
    const values = d3.range(cols * rows).map(i => {
      const x = i % cols, y = Math.floor(i / cols);
      const ridge = Math.exp(-((x - 14) ** 2 + (y - 10) ** 2) / 90) * 1.3;
      const peak = Math.exp(-((x - 25) ** 2 + (y - 15) ** 2) / 34) * 1.6;
      return ridge + peak + Math.sin(x / 4) * .12 + Math.cos(y / 3) * .1;
    });
    const thresholds = d3.range(.25, 1.9, .22);
    const contours = d3.contours().size([cols, rows]).thresholds(thresholds)(values);
    const projection = d3.geoIdentity().scale(12.8).translate([48, 48]);
    const path = d3.geoPath(projection);
    const color = quantizedRamp([0, thresholds.at(-1)], ramps.terrain);
    const bands = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path)
      .attr("fill", d => color(d.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", .8);
    fadeIn(bands, .05, .7);
    const ridge = svg.append("path").datum(contours.at(-1)).attr("d", path).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.2);
    drawPath(ridge, .35, .9);
  }
```
