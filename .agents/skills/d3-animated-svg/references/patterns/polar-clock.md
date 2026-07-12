# Polar Clock

- **Pattern ID:** `d3-polar-clock`
- **Gallery source ID:** `polar-clock`
- **Family:** Radial
- **Use when:** Nested arcs encode cyclic units of time.
- **Renderer:** `renderPolarClock`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPolarClock() {
    const svg = prepareSvg("polar-clock", "Polar clock", "Nested arcs encode cyclic units as radial progress.");
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const units = [
      { label: "month", value: .83, color: palette.blue },
      { label: "week", value: .64, color: palette.green },
      { label: "day", value: .42, color: palette.orange },
      { label: "hour", value: .76, color: palette.purple }
    ];
    const arc = d3.arc().startAngle(0).cornerRadius(8);
    units.forEach((unit, i) => {
      const outer = 160 - i * 30;
      const inner = outer - 18;
      center.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * 2 })).attr("fill", palette.gray100);
      const mark = center.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * 2 * unit.value })).attr("fill", unit.color);
      fadeIn(mark, .12 + i * .08, .55);
      center.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -outer + 13).attr("text-anchor", "middle").text(unit.label);
    });
  }
```
