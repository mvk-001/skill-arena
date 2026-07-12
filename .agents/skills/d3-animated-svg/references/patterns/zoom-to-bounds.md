# Zoom to Bounds

- **Pattern ID:** `d3-zoom-to-bounds`
- **Gallery source ID:** `zoom-to-bounds`
- **Family:** Focus
- **Use when:** A selected region expands into a linked detail panel.
- **Renderer:** `renderZoomToBounds`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderZoomToBounds() {
    const svg = prepareSvg("zoom-to-bounds", "Zoom to bounds", "A bounded selection is magnified into a linked detail pane.");
    const plot = { x: 56, y: 54, w: 292, h: 296 };
    const focus = { x0: 145, y0: 125, x1: 244, y1: 225 };
    const detail = { x: 386, y: 72, w: 132, h: 190 };
    const points = d3.range(48).map(i => ({
      x: plot.x + 18 + (i * 53) % (plot.w - 36) + Math.sin(i) * 8,
      y: plot.y + 18 + (i * 41) % (plot.h - 36) + Math.cos(i * .6) * 8,
      group: i % 4
    }));
    points.forEach(d => {
      d.selected = d.x >= focus.x0 && d.x <= focus.x1 && d.y >= focus.y0 && d.y <= focus.y1;
    });
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.selected ? palette.orange : colors[d.group])
      .attr("fill-opacity", d => d.selected ? .9 : .42)
      .attr("stroke", "#fff");
    grow(dots, "r", 1.5, d => d.selected ? 5.8 : 4.2, .05, .5);
    const focusRect = svg.append("rect")
      .attr("x", focus.x0).attr("y", focus.y0).attr("width", focus.x1 - focus.x0).attr("height", focus.y1 - focus.y0)
      .attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.4);
    drawPath(focusRect, .18, .8);
    svg.append("rect").attr("x", detail.x).attr("y", detail.y).attr("width", detail.w).attr("height", detail.h).attr("rx", 6).attr("fill", "#fff").attr("stroke", palette.orange).attr("stroke-width", 2);
    const zx = d3.scaleLinear().domain([focus.x0, focus.x1]).range([detail.x + 16, detail.x + detail.w - 16]);
    const zy = d3.scaleLinear().domain([focus.y0, focus.y1]).range([detail.y + 18, detail.y + detail.h - 18]);
    const detailDots = svg.append("g").selectAll("circle").data(points.filter(d => d.selected)).join("circle")
      .attr("cx", d => zx(d.x)).attr("cy", d => zy(d.y)).attr("fill", palette.orange).attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(detailDots, "r", 1, 7, .3, .55);
    const connectors = [
      [[focus.x1, focus.y0], [detail.x, detail.y]],
      [[focus.x1, focus.y1], [detail.x, detail.y + detail.h]]
    ];
    const lines = svg.append("g").selectAll("line").data(connectors).join("line")
      .attr("x1", d => d[0][0]).attr("y1", d => d[0][1]).attr("x2", d => d[1][0]).attr("y2", d => d[1][1])
      .attr("stroke", palette.orange).attr("stroke-width", 1.6).attr("stroke-dasharray", "4 5");
    fadeIn(lines, .35, .45);
    svg.append("text").attr("class", "mark-label").attr("x", detail.x + detail.w / 2).attr("y", detail.y + detail.h + 24).attr("text-anchor", "middle").text("magnified");
  }
```
