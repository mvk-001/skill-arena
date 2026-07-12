# Projection Switch

- **Pattern ID:** `d3-projection-switch`
- **Gallery source ID:** `projection-switch`
- **Family:** Projection
- **Use when:** Geographic points shift between globe and flat views.
- **Renderer:** `renderProjectionSwitch`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderProjectionSwitch() {
    const svg = prepareSvg("projection-switch", "Projection switch", "The same coordinates shift from orthographic globe to flat projection.");
    const points = [
      ["SEA", -122, 47], ["SFO", -122, 38], ["MEX", -99, 19], ["NYC", -74, 41],
      ["RIO", -43, -23], ["LON", 0, 51], ["CAI", 31, 30], ["DEL", 77, 29], ["TKY", 139, 36]
    ].map(([id, lon, lat], i) => ({ id, lon, lat, i }));
    const globe = d3.geoOrthographic().rotate([35, -10]).scale(105).translate([165, 179]);
    const flat = d3.geoEquirectangular().fitExtent([[320, 82], [522, 282]], { type: "Sphere" });
    const globePoint = d => globe([d.lon, d.lat]) || [165, 179];
    svg.append("circle").attr("cx", 165).attr("cy", 179).attr("r", 105).attr("fill", palette.blueHighlight).attr("fill-opacity", .28).attr("stroke", palette.gray200);
    svg.append("rect").attr("x", 320).attr("y", 82).attr("width", 202).attr("height", 200).attr("rx", 5).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const lines = d3.geoGraticule().step([45, 30]).lines();
    const globePath = d3.geoPath(globe);
    const flatPath = d3.geoPath(flat);
    svg.append("g").selectAll("path").data(lines).join("path").attr("d", globePath).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    svg.append("g").selectAll("path").data(lines).join("path").attr("d", flatPath).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => flat([d.lon, d.lat])[0]).attr("cy", d => flat([d.lon, d.lat])[1])
      .attr("r", 5.5).attr("fill", d => colors[d.i % colors.length]).attr("stroke", "#fff").attr("stroke-width", 1.2);
    dots.append("animate").attr("attributeName", "cx").attr("from", d => globePoint(d)[0]).attr("to", d => flat([d.lon, d.lat])[0]).attr("dur", "1.1s").attr("fill", "freeze");
    dots.append("animate").attr("attributeName", "cy").attr("from", d => globePoint(d)[1]).attr("to", d => flat([d.lon, d.lat])[1]).attr("dur", "1.1s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", 165).attr("y", 322).attr("text-anchor", "middle").text("orthographic");
    svg.append("text").attr("class", "mark-label").attr("x", 421).attr("y", 322).attr("text-anchor", "middle").text("equirectangular");
  }
```
