# Brush Snapping

- **Pattern ID:** `d3-brush-snapping`
- **Gallery source ID:** `brush-snapping`
- **Family:** Interaction
- **Use when:** A loose brush snaps to calendar-like interval boundaries.
- **Renderer:** `renderBrushSnapping`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBrushSnapping() {
    const svg = prepareSvg("brush-snapping", "Brush snapping", "A loose brush snaps to calendar-like interval boundaries.");
    const x = d3.scaleBand().domain(d3.range(12).map(String)).range([62, width - 54]).padding(.16);
    const y = d3.scaleLinear().domain([0, 100]).range([302, 72]);
    const data = d3.range(12).map(i => ({ i, value: 28 + ((i * 19) % 62) }));
    svg.append("g").selectAll("rect.bar").data(data).join("rect")
      .attr("class", "bar").attr("x", d => x(String(d.i))).attr("y", d => y(d.value)).attr("width", x.bandwidth()).attr("height", d => y(0) - y(d.value)).attr("fill", palette.green).attr("fill-opacity", .68);
    axisBottom(svg, d3.scaleLinear().domain([0, 11]).range([62, width - 54]), 322, 6);
    const loose = { x: x("2") - 13, w: x("7") - x("2") + x.bandwidth() + 26 };
    const snapped = { x: x("2"), w: x("7") - x("2") + x.bandwidth() };
    const selection = svg.append("rect").attr("x", snapped.x).attr("y", 62).attr("width", snapped.w).attr("height", 242).attr("fill", palette.yellowHighlight).attr("fill-opacity", .65).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    selection.append("animate").attr("attributeName", "x").attr("from", loose.x).attr("to", snapped.x).attr("dur", ".8s").attr("begin", ".12s").attr("fill", "freeze");
    selection.append("animate").attr("attributeName", "width").attr("from", loose.w).attr("to", snapped.w).attr("dur", ".8s").attr("begin", ".12s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", snapped.x + snapped.w / 2).attr("y", 52).attr("text-anchor", "middle").text("snaps to bins 2-7");
  }
```
