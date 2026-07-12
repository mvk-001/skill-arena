# Versor Dragging

- **Pattern ID:** `d3-versor-dragging`
- **Gallery source ID:** `versor-dragging`
- **Family:** Projection
- **Use when:** A globe rotates along a drag arc using spherical interpolation.
- **Renderer:** `renderVersorDragging`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVersorDragging() {
    const svg = prepareSvg("versor-dragging", "Versor dragging", "A globe rotates along a drag arc using spherical interpolation.");
    const projection = d3.geoOrthographic().rotate([-22, -16]).fitExtent([[94, 48], [466, 356]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    const globe = svg.append("g");
    globe.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#cdf3ff").attr("stroke", palette.ink).attr("stroke-width", 2);
    globe.append("g").selectAll("path").data(d3.geoGraticule().step([20, 20]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .18).attr("stroke-width", .8);
    globe.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate").attr("from", `0 ${width / 2} ${height / 2}`).attr("to", `18 ${width / 2} ${height / 2}`).attr("dur", "1.3s").attr("begin", ".08s").attr("fill", "freeze");
    const dragArc = [[154, 300], [224, 182], [338, 112], [420, 144]];
    const line = svg.append("path").datum(dragArc).attr("d", d3.line().curve(d3.curveBasis)).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(line, .12, .95);
    svg.append("circle").attr("cx", 420).attr("cy", 144).attr("r", 8).attr("fill", palette.red).attr("stroke", palette.redHighlight).attr("stroke-width", 4);
  }
```
