# Calendar Heatmap

- **Pattern ID:** `d3-calendar`
- **Gallery source ID:** `calendar`
- **Family:** Heatmap
- **Use when:** Repeated temporal cells with intensity.
- **Renderer:** `renderCalendar`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCalendar() {
    const svg = prepareSvg("calendar", "Calendar heatmap", "Repeated temporal cells showing intensity by day.");
    const days = d3.range(35).map(i => ({ i, value: 1 + (i * 7) % 13 }));
    const cell = 34;
    const color = quantizedRamp([1, 13], ramps.blue);
    const g = svg.append("g").attr("transform", "translate(80,58)");
    const cells = g.selectAll("rect").data(days).join("rect")
      .attr("x", d => (d.i % 7) * cell).attr("y", d => Math.floor(d.i / 7) * cell)
      .attr("width", cell - 3).attr("height", cell - 3).attr("rx", 4)
      .attr("fill", d => color(d.value));
    fadeIn(cells, .05, .6);
    ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((d, i) => g.append("text").attr("class", "label").attr("x", -12).attr("y", i * cell + 20).attr("text-anchor", "end").text(d));
    d3.range(7).forEach(i => g.append("text").attr("class", "label").attr("x", i * cell + 15).attr("y", -12).attr("text-anchor", "middle").text(`D${i + 1}`));
  }
```
