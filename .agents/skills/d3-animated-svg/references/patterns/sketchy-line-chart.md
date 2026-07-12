# Sketchy Line Chart

- **Pattern ID:** `d3-sketchy-line-chart`
- **Gallery source ID:** `sketchy-line-chart`
- **Family:** Sketchy
- **Use when:** A connected scatter path is rendered as a seeded double-stroke hand sketch.
- **Renderer:** `renderSketchyLineChart`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyLineChart() {
    const svg = prepareSvg("sketchy-line-chart", "Sketchy line chart", "A connected scatter path is drawn with deterministic rough strokes.");
    const data = d3.range(10).map(i => ({ t: i, x: 20 + i * 8 + Math.sin(i) * 5, y: 25 + i * 6 + Math.cos(i * .8) * 16 }));
    const margin = { top: 36, right: 36, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([15, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([10, 100]).range([height - margin.bottom, margin.top]);

    x.ticks(5).forEach((tick, i) => {
      appendSketchStroke(svg, [[x(tick), margin.top], [x(tick), height - margin.bottom]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 620 + i,
        roughness: .75,
        delay: .02,
        dur: .45
      });
    });
    y.ticks(4).forEach((tick, i) => {
      appendSketchStroke(svg, [[margin.left, y(tick)], [width - margin.right, y(tick)]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 640 + i,
        roughness: .75,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 5, 660);
    appendSketchVerticalAxis(svg, y, margin.left, 4, 680);

    const points = data.map(d => [x(d.x), y(d.y)]);
    appendSketchStroke(svg, points, {
      stroke: palette.purple,
      strokeWidth: 3.4,
      opacity: .94,
      seed: 700,
      roughness: 2.2,
      curve: d3.curveCatmullRom.alpha(.55),
      delay: .18,
      dur: 1.25
    });
    data.forEach((d, i) => {
      appendSketchBlob(svg, x(d.x), y(d.y), 6.4, {
        fill: palette.orange,
        fillOpacity: .78,
        stroke: palette.surface,
        strokeWidth: 1.3,
        seed: 730 + i * 11,
        delay: .34 + i * .035,
        dur: .5
      });
    });
  }
```
