# Path Tween

- **Pattern ID:** `d3-path-tween`
- **Gallery source ID:** `path-tween`
- **Family:** Morph
- **Use when:** A path interpolates between two line geometries.
- **Renderer:** `renderPathTween`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPathTween() {
    const svg = prepareSvg("path-tween", "Path tween", "A path interpolates between two line geometries.");
    const x = d3.scaleLinear().domain([0, 11]).range([60, width - 56]);
    const y = d3.scaleLinear().domain([10, 90]).range([330, 58]);
    const a = d3.range(12).map(i => [x(i), y(36 + Math.sin(i / 1.4) * 18 + i * 1.6)]);
    const b = d3.range(12).map(i => [x(i), y(72 - Math.cos(i / 1.7) * 16 - i * 1.2)]);
    const line = d3.line().curve(d3.curveCatmullRom);
    axisBottom(svg, x, 340, 6);
    const before = svg.append("path").attr("d", line(a)).attr("fill", "none").attr("stroke", palette.line).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(before, .05, .4);
    const path = svg.append("path").attr("d", line(b)).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 4).attr("stroke-linecap", "round");
    path.append("animate").attr("attributeName", "d").attr("from", line(a)).attr("to", line(b)).attr("dur", "1.25s").attr("begin", ".1s").attr("fill", "freeze");
    drawPath(path, .1, 1.25);
  }
```
