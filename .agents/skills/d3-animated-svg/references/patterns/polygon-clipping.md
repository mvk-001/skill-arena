# Polygon Clipping

- **Pattern ID:** `d3-polygon-clipping`
- **Gallery source ID:** `polygon-clipping`
- **Family:** Geometry
- **Use when:** An input polygon is intersected with a clipping window.
- **Renderer:** `renderPolygonClipping`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPolygonClipping() {
    const svg = prepareSvg("polygon-clipping", "Polygon clipping", "An input polygon is intersected with a clipping window.");
    const subject = [[92, 118], [236, 70], [468, 126], [418, 300], [246, 342], [132, 258]];
    const clip = { x0: 156, y0: 108, x1: 420, y1: 294 };
    function clipPolygon(points) {
      const edges = [
        p => p[0] >= clip.x0, p => p[0] <= clip.x1, p => p[1] >= clip.y0, p => p[1] <= clip.y1
      ];
      const intersections = [
        (a, b) => [clip.x0, a[1] + (b[1] - a[1]) * (clip.x0 - a[0]) / (b[0] - a[0])],
        (a, b) => [clip.x1, a[1] + (b[1] - a[1]) * (clip.x1 - a[0]) / (b[0] - a[0])],
        (a, b) => [a[0] + (b[0] - a[0]) * (clip.y0 - a[1]) / (b[1] - a[1]), clip.y0],
        (a, b) => [a[0] + (b[0] - a[0]) * (clip.y1 - a[1]) / (b[1] - a[1]), clip.y1]
      ];
      return edges.reduce((poly, inside, ei) => {
        const out = [];
        poly.forEach((point, i) => {
          const prev = poly[(i + poly.length - 1) % poly.length];
          if (inside(point)) {
            if (!inside(prev)) out.push(intersections[ei](prev, point));
            out.push(point);
          } else if (inside(prev)) {
            out.push(intersections[ei](prev, point));
          }
        });
        return out;
      }, points);
    }
    const line = d3.line().curve(d3.curveLinearClosed);
    svg.append("path").attr("d", line(subject)).attr("fill", palette.blueHighlight).attr("fill-opacity", .64).attr("stroke", palette.blue).attr("stroke-width", 2).attr("stroke-dasharray", "6 5");
    svg.append("rect").attr("x", clip.x0).attr("y", clip.y0).attr("width", clip.x1 - clip.x0).attr("height", clip.y1 - clip.y0).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2);
    const clipped = svg.append("path").attr("d", line(clipPolygon(subject))).attr("fill", palette.redHighlight).attr("fill-opacity", .84).attr("stroke", palette.red).attr("stroke-width", 3);
    fadeIn(clipped, .18, .65);
    const subjectDots = svg.append("g").selectAll("circle.subject-point").data(subject).join("circle")
      .attr("class", "subject-point").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(subjectDots, "r", 2, 5, .08, .45);
    const clippedDots = svg.append("g").selectAll("circle.clipped-point").data(clipPolygon(subject)).join("circle")
      .attr("class", "clipped-point").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(clippedDots, "r", 2, 5, .22, .45);
    svg.append("text").attr("class", "mark-label").attr("x", 92).attr("y", 84).text("source polygon");
    svg.append("text").attr("class", "mark-label").attr("x", clip.x1 - 8).attr("y", clip.y1 + 24).attr("text-anchor", "end").text("clipped output");
  }
```
