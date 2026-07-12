# Bump Chart

- **Pattern ID:** `d3-bump`
- **Gallery source ID:** `bump`
- **Family:** Temporal
- **Use when:** Rank changes across time periods.
- **Renderer:** `renderBump`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBump() {
    const svg = prepareSvg("bump", "Bump chart", "Rank movement across ordered periods.");
    const names = ["Alpha", "Beta", "Gamma", "Delta"];
    const periods = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const ranks = { Alpha: [1, 2, 2, 1, 1], Beta: [2, 1, 3, 3, 2], Gamma: [3, 4, 1, 2, 3], Delta: [4, 3, 4, 4, 4] };
    const x = d3.scalePoint().domain(periods).range([70, width - 50]);
    const y = d3.scalePoint().domain([1, 2, 3, 4]).range([70, 320]);
    periods.forEach(p => svg.append("text").attr("class", "label").attr("x", x(p)).attr("y", 350).attr("text-anchor", "middle").text(p));
    [1, 2, 3, 4].forEach(r => svg.append("text").attr("class", "label").attr("x", 48).attr("y", y(r) + 4).attr("text-anchor", "end").text(`#${r}`));
    const line = d3.line().x((d, i) => x(periods[i])).y(d => y(d)).curve(d3.curveMonotoneX);
    names.forEach((name, i) => {
      const path = svg.append("path").datum(ranks[name]).attr("d", line).attr("fill", "none").attr("stroke", colors[i]).attr("stroke-width", 3);
      drawPath(path, .12 + i * .05, .9);
      svg.append("text").attr("class", "mark-label").attr("x", width - 46).attr("y", y(ranks[name].at(-1)) + 4).attr("text-anchor", "end").text(name);
    });
  }
```
