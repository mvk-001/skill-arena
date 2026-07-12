# Radar Profile

- **Pattern ID:** `d3-radar`
- **Gallery source ID:** `radar`
- **Family:** Multivariate
- **Use when:** Compact radial comparison across metrics.
- **Renderer:** `renderRadar`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRadar() {
    const svg = prepareSvg("radar", "Radar profile", "Radial profile comparison across multiple metrics.");
    const metrics = ["Speed", "Cost", "Reach", "Risk", "Quality", "Fit"];
    const profiles = [
      { name: "Pilot", values: [82, 58, 72, 44, 68, 76], color: palette.blue },
      { name: "Scale", values: [66, 72, 88, 52, 74, 64], color: palette.orange }
    ];
    const center = [width / 2, height / 2 + 12];
    const r = d3.scaleLinear().domain([0, 100]).range([0, 138]);
    const angle = i => i / metrics.length * 2 * Math.PI - Math.PI / 2;
    const line = d3.lineRadial().radius((d, i) => r(d)).angle((d, i) => angle(i)).curve(d3.curveLinearClosed);
    const g = svg.append("g").attr("transform", `translate(${center[0]},${center[1]})`);
    [40, 70, 100].forEach(v => g.append("circle").attr("r", r(v)).attr("fill", "none").attr("stroke", "#d8dee6"));
    metrics.forEach((m, i) => {
      const a = angle(i);
      g.append("line").attr("x2", Math.cos(a) * r(100)).attr("y2", Math.sin(a) * r(100)).attr("stroke", "#d8dee6");
      g.append("text").attr("class", "label").attr("x", Math.cos(a) * 160).attr("y", Math.sin(a) * 160).attr("text-anchor", "middle").text(m);
    });
    const areas = g.selectAll(".profile").data(profiles).join("path").attr("d", d => line(d.values)).attr("fill", d => d.color).attr("fill-opacity", .24).attr("stroke", d => d.color).attr("stroke-width", 2.2);
    drawPath(areas, .12, .9);
  }
```
