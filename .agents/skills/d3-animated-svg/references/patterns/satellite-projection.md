# Satellite Projection

- **Pattern ID:** `d3-satellite-projection`
- **Gallery source ID:** `satellite-projection`
- **Family:** Projection
- **Use when:** Perspective footprint and horizon rings explain a satellite view.
- **Renderer:** `renderSatelliteProjection`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSatelliteProjection() {
    const svg = prepareSvg("satellite-projection", "Satellite projection", "Perspective footprint and horizon rings explain a satellite view.");
    const cx = width / 2, cy = height / 2 + 8;
    const rings = [
      { r: 154, c: palette.blueHighlight, stroke: palette.blue, label: "horizon" },
      { r: 108, c: palette.orangeHighlight, stroke: palette.orange, label: "scan" },
      { r: 58, c: palette.greenHighlight, stroke: palette.green, label: "nadir" }
    ];
    rings.forEach((ring, i) => {
      const circle = svg.append("circle").attr("cx", cx).attr("cy", cy).attr("fill", ring.c).attr("fill-opacity", .34).attr("stroke", ring.stroke).attr("stroke-width", 2);
      grow(circle, "r", 4, ring.r, .08 + i * .08, .55);
      svg.append("text").attr("class", "mark-label").attr("x", cx + ring.r * .7).attr("y", cy - ring.r * .58).text(ring.label);
    });
    const beam = svg.append("path").attr("d", `M${cx},${cy - 186}L${cx - 58},${cy - 58}L${cx + 58},${cy - 58}Z`).attr("fill", palette.redHighlight).attr("fill-opacity", .36).attr("stroke", palette.red).attr("stroke-width", 2);
    fadeIn(beam, .2, .55);
    svg.append("circle").attr("cx", cx).attr("cy", cy - 186).attr("r", 8).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2);
  }
```
