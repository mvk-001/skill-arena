# Sketchy Histogram

- **Pattern ID:** `d3-sketchy-histogram`
- **Gallery source ID:** `sketchy-histogram`
- **Family:** Sketchy
- **Use when:** Histogram bins use rough rectangular marks and light hachure fills.
- **Renderer:** `renderSketchyHistogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyHistogram() {
    const svg = prepareSvg("sketchy-histogram", "Sketchy histogram", "Continuous values are binned into rough marker-like rectangles.");
    const values = d3.range(90).map(i => 42 + Math.sin(i * .31) * 18 + Math.cos(i * .17) * 13 + (i % 7));
    const margin = { top: 38, right: 30, bottom: 52, left: 52 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(12)(values);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);

    y.ticks(4).forEach((tick, i) => {
      appendSketchStroke(svg, [[margin.left, y(tick)], [width - margin.right, y(tick)]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .6,
        seed: 760 + i,
        roughness: .65,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 5, 780);
    appendSketchVerticalAxis(svg, y, margin.left, 4, 800);

    bins.forEach((bin, i) => {
      const barX = x(bin.x0) + 2;
      const barY = y(bin.length);
      const barW = Math.max(2, x(bin.x1) - x(bin.x0) - 4);
      const barH = y(0) - y(bin.length);
      appendSketchRect(svg, barX, barY, barW, barH, {
        fill: palette.blueHighlight,
        fillOpacity: .64,
        stroke: palette.blue,
        strokeWidth: 1.8,
        seed: 830 + i * 13,
        roughness: 1.35,
        delay: .1 + i * .025,
        dur: .58,
        hachureStroke: palette.blueHover,
        hachureOpacity: .22,
        hachureSpacing: 10
      });
    });
  }
```
