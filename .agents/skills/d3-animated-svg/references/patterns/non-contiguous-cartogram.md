# Non-contiguous Cartogram

- **Pattern ID:** `d3-non-contiguous-cartogram`
- **Gallery source ID:** `non-contiguous-cartogram`
- **Family:** Geospatial
- **Use when:** Region shapes scale around fixed centroids by value.
- **Renderer:** `renderNonContiguousCartogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderNonContiguousCartogram() {
    const svg = prepareSvg("non-contiguous-cartogram", "Non-contiguous cartogram", "Region shapes scale around fixed centroids by value.");
    const regions = [
      { id: "A", points: [[80, 90], [190, 76], [204, 166], [98, 184]], v: 1.18, c: palette.blue },
      { id: "B", points: [[218, 82], [344, 96], [330, 198], [214, 176]], v: .84, c: palette.green },
      { id: "C", points: [[362, 104], [486, 122], [464, 222], [346, 204]], v: 1.34, c: palette.orange },
      { id: "D", points: [[112, 206], [236, 190], [254, 318], [134, 330]], v: .72, c: palette.purple },
      { id: "E", points: [[266, 214], [442, 232], [418, 342], [278, 326]], v: 1.08, c: palette.red }
    ];
    const line = d3.line().curve(d3.curveLinearClosed);
    regions.forEach(region => {
      const cx = d3.mean(region.points, d => d[0]), cy = d3.mean(region.points, d => d[1]);
      const path = svg.append("path").attr("d", line(region.points)).attr("fill", region.c).attr("fill-opacity", .32 + region.v * .18).attr("stroke", region.c).attr("stroke-width", 2)
        .attr("transform-origin", `${cx}px ${cy}px`).attr("transform", `scale(${region.v})`);
      path.append("animateTransform").attr("attributeName", "transform").attr("type", "scale").attr("from", "1").attr("to", region.v).attr("dur", ".9s").attr("begin", ".08s").attr("fill", "freeze");
      svg.append("text").attr("class", "mark-label").attr("x", cx).attr("y", cy).attr("text-anchor", "middle").text(region.id);
    });
  }
```
