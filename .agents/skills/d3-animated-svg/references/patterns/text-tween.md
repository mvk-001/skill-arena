# Text Tween

- **Pattern ID:** `d3-text-tween`
- **Gallery source ID:** `text-tween`
- **Family:** Motion
- **Use when:** Counters and labels animate value changes directly.
- **Renderer:** `renderTextTween`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTextTween() {
    const svg = prepareSvg("text-tween", "Text tween", "Counters and labels animate value changes directly.");
    const metrics = [
      { label: "Reach", from: 42, to: 86, c: palette.blue, fill: palette.blueHighlight },
      { label: "Quality", from: 38, to: 74, c: palette.green, fill: palette.greenHighlight },
      { label: "Risk", from: 61, to: 29, c: palette.red, fill: palette.redHighlight }
    ];
    const group = svg.append("g").selectAll("g").data(metrics).join("g").attr("transform", (d, i) => `translate(${122 + i * 158},${height / 2})`);
    group.append("circle").attr("r", 56).attr("fill", d => d.fill).attr("fill-opacity", .78).attr("stroke", d => d.c).attr("stroke-width", 2.8);
    const text = group.append("text").attr("text-anchor", "middle").attr("dy", ".18em").attr("font-size", 32).attr("font-weight", 800).attr("fill", palette.ink).text(d => d.to);
    text.each(function (d, i) {
      const node = d3.select(this);
      node.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".25s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
      node.append("animate").attr("attributeName", "data-value").attr("from", d.from).attr("to", d.to).attr("dur", ".9s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
    });
    group.append("text").attr("class", "mark-label").attr("fill", d => d.c).attr("text-anchor", "middle").attr("dy", 82).text(d => d.label);
    group.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 101).text(d => `${d.from} -> ${d.to}`);
  }
```
