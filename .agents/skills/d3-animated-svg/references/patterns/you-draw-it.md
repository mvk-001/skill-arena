# You Draw It

- **Pattern ID:** `d3-you-draw-it`
- **Gallery source ID:** `you-draw-it`
- **Family:** Prediction
- **Use when:** A guessed trajectory reveals against the observed series.
- **Renderer:** `renderYouDrawIt`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderYouDrawIt() {
    const svg = prepareSvg("you-draw-it", "You draw it", "A guessed trajectory reveals against the observed series.");
    const margin = { top: 46, right: 42, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([0, 10]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const observed = d3.range(11).map(i => ({ t: i, v: 26 + i * 5.8 + Math.sin(i / 1.2) * 11 }));
    const guess = d3.range(11).map(i => ({ t: i, v: 30 + i * 3.4 + Math.cos(i / 1.9) * 8 }));
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const guessPath = svg.append("path").datum(guess).attr("d", line).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-width", 3).attr("stroke-dasharray", "7 5");
    drawPath(guessPath, .05, .85);
    const obsPath = svg.append("path").datum(observed).attr("d", line).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3.4);
    drawPath(obsPath, .55, .95);
    svg.append("text").attr("class", "mark-label").attr("x", x(2)).attr("y", y(42)).text("drawn guess");
    svg.append("text").attr("class", "mark-label").attr("x", x(7.8)).attr("y", y(76)).text("revealed actual");
  }
```
