# Smooth Zoom

- **Pattern ID:** `d3-smooth-zoom`
- **Gallery source ID:** `smooth-zoom`
- **Family:** Focus
- **Use when:** A viewport path eases into a magnified data region.
- **Renderer:** `renderSmoothZoom`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSmoothZoom() {
    const svg = prepareSvg("smooth-zoom", "Smooth zoom", "A focus window eases from overview bounds into a magnified region.");
    const plot = { x: 48, y: 48, w: 464, h: 296 };
    const target = { x: 202, y: 132, w: 104, h: 78 };
    const points = d3.range(64).map(i => ({
      x: plot.x + 18 + (i * 71) % (plot.w - 36) + Math.sin(i * .9) * 9,
      y: plot.y + 20 + (i * 43) % (plot.h - 40) + Math.cos(i * .8) * 10,
      group: i % 4
    }));
    points.forEach(d => {
      d.focus = d.x >= target.x && d.x <= target.x + target.w && d.y >= target.y && d.y <= target.y + target.h;
    });
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.focus ? palette.orange : colors[d.group]).attr("fill-opacity", d => d.focus ? .9 : .36).attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.focus ? 6 : 4, .04, .5);
    const view = svg.append("rect")
      .attr("x", 136).attr("y", 74).attr("width", 286).attr("height", 216).attr("rx", 8)
      .attr("fill", palette.orangeHighlight).attr("fill-opacity", .48).attr("stroke", palette.orange).attr("stroke-width", 2.6);
    view.append("animate").attr("attributeName", "x").attr("from", target.x).attr("to", 136).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "y").attr("from", target.y).attr("to", 74).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "width").attr("from", target.w).attr("to", 286).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "height").attr("from", target.h).attr("to", 216).attr("dur", "1s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", 278).attr("y", 322).attr("text-anchor", "middle").text("overview -> focus");
  }
```
