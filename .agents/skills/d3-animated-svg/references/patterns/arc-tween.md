# Arc Tween

- **Pattern ID:** `d3-arc-tween`
- **Gallery source ID:** `arc-tween`
- **Family:** Morph
- **Use when:** Radial segments interpolate from one angle state to another.
- **Renderer:** `renderArcTween`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderArcTween() {
    const svg = prepareSvg("arc-tween", "Arc tween", "Radial segments interpolate from one angle state to another.");
    const cx = width / 2, cy = height / 2 + 8;
    const data = [
      { label: "Now", a0: .18, a1: .74, c: palette.red },
      { label: "Plan", a0: .1, a1: .52, c: palette.blue },
      { label: "Risk", a0: .06, a1: .34, c: palette.orange },
      { label: "Reach", a0: .24, a1: .88, c: palette.green }
    ];
    const arc = d3.arc().startAngle(-Math.PI * .75).cornerRadius(9);
    const group = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    data.forEach((d, i) => {
      const outer = 156 - i * 30, inner = outer - 18;
      group.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * .75 })).attr("fill", "#e7e7e7");
      const mark = group.append("path")
        .attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a1 }))
        .attr("fill", d.c);
      mark.append("animate").attr("attributeName", "d")
        .attr("from", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a0 }))
        .attr("to", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a1 }))
        .attr("dur", ".95s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
      group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -outer + 13).attr("text-anchor", "middle").text(d.label);
    });
  }
```
