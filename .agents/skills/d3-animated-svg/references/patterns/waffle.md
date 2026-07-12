# Waffle Matrix

- **Pattern ID:** `d3-waffle`
- **Gallery source ID:** `waffle`
- **Family:** Part-to-whole
- **Use when:** Individual units grouped into exact shares.
- **Renderer:** `renderWaffle`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderWaffle() {
    const svg = prepareSvg("waffle", "Waffle matrix", "D3 unit grid shows exact part-to-whole composition.");
    const shares = [
      { name: "Build", count: 36, color: palette.blue },
      { name: "Review", count: 24, color: palette.orange },
      { name: "Ship", count: 22, color: palette.green },
      { name: "Learn", count: 18, color: palette.purple }
    ];
    const units = shares.flatMap(group => d3.range(group.count).map(() => group));
    const cell = 25;
    const origin = [118, 70];
    const marks = svg.append("g").selectAll("rect").data(units).join("rect")
      .attr("x", (d, i) => origin[0] + (i % 10) * cell)
      .attr("y", (d, i) => origin[1] + Math.floor(i / 10) * cell)
      .attr("width", cell - 4)
      .attr("height", cell - 4)
      .attr("rx", 5)
      .attr("fill", d => d.color)
      .attr("stroke", "#fff");
    fadeIn(marks, .04, .55);
    let y = 92;
    shares.forEach(group => {
      svg.append("rect").attr("x", 392).attr("y", y - 12).attr("width", 14).attr("height", 14).attr("fill", group.color).attr("rx", 3);
      svg.append("text").attr("class", "mark-label").attr("x", 414).attr("y", y).text(`${group.name} ${group.count}%`);
      y += 30;
    });
  }
```
