# Shape Tween

- **Pattern ID:** `d3-shape-tween`
- **Gallery source ID:** `shape-tween`
- **Family:** Morph
- **Use when:** A polygon morphs between two compatible point sets.
- **Renderer:** `renderShapeTween`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderShapeTween() {
    const svg = prepareSvg("shape-tween", "Shape tween", "A polygon morphs between two compatible point sets.");
    const cx = width / 2, cy = height / 2 + 10;
    const start = d3.range(10).map(i => {
      const a = i / 10 * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 66 : 124;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
    const end = d3.range(10).map(i => {
      const a = i / 10 * Math.PI * 2 - Math.PI / 2;
      const r = 78 + Math.sin(i * 1.7) * 26;
      return [cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * .78];
    });
    const line = d3.line().curve(d3.curveLinearClosed);
    const path = svg.append("path").attr("d", line(end)).attr("fill", palette.blue).attr("fill-opacity", .26).attr("stroke", palette.blue).attr("stroke-width", 3);
    path.append("animate").attr("attributeName", "d").attr("from", line(start)).attr("to", line(end)).attr("dur", "1.35s").attr("begin", ".08s").attr("fill", "freeze");
    const dots = svg.append("g").selectAll("circle").data(end).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red);
    grow(dots, "r", 2, 5.5, .25, .5);
  }
```
