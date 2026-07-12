# Epicyclic Gearing

- **Pattern ID:** `d3-epicyclic-gearing`
- **Gallery source ID:** `epicyclic-gearing`
- **Family:** Geometry
- **Use when:** Nested circular motion traces gear-like paths.
- **Renderer:** `renderEpicyclicGearing`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderEpicyclicGearing() {
    const svg = prepareSvg("epicyclic-gearing", "Epicyclic gearing", "Nested circular motion traces a gear-like parametric path.");
    const cx = width / 2, cy = height / 2 + 4;
    const R = 100, r = 34, d = 58;
    svg.attr("data-curve-family", "epitrochoid").attr("data-safe-frame", "true");
    const points = d3.range(0, Math.PI * 2.01, .045).map(t => [
      cx + (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t),
      cy + (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)
    ]);
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", R).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 2);
    svg.append("circle").attr("cx", cx + R + r).attr("cy", cy).attr("r", r).attr("fill", palette.gray50).attr("stroke", palette.blue).attr("stroke-width", 2);
    const line = d3.line().curve(d3.curveCatmullRomClosed);
    const path = svg.append("path").attr("id", "epicyclic-gearing-path").attr("d", line(points)).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.6).attr("stroke-opacity", .86);
    drawPath(path, .1, 1.2);
    const dot = svg.append("circle").attr("r", 6).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2.2);
    dot.append("animateMotion").attr("dur", "3.4s").attr("repeatCount", "indefinite").append("mpath").attr("href", "#epicyclic-gearing-path");
    svg.append("text").attr("class", "mark-label").attr("x", cx).attr("y", 30).attr("text-anchor", "middle").text("epitrochoid path");
  }
```
