# Bollinger Bands

- **Pattern ID:** `d3-bollinger-bands`
- **Gallery source ID:** `bollinger-bands`
- **Family:** Financial
- **Use when:** Rolling volatility wraps price with dynamic bands.
- **Renderer:** `renderBollingerBands`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBollingerBands() {
    const svg = prepareSvg("bollinger-bands", "Bollinger bands", "Rolling volatility wraps a price series in upper and lower bands.");
    const data = d3.range(34).map(i => ({ t: i, price: 58 + Math.sin(i / 3) * 8 + Math.cos(i * .7) * 5 + i * .6 }));
    const bands = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 4), i + 1);
      const mean = d3.mean(window, item => item.price);
      const dev = Math.sqrt(d3.mean(window, item => (item.price - mean) ** 2)) || 3;
      return { t: d.t, price: d.price, mid: mean, hi: mean + dev * 1.8, lo: mean - dev * 1.8 };
    });
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(bands, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([40, 92]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = d3.area().x(d => x(d.t)).y0(d => y(d.lo)).y1(d => y(d.hi)).curve(d3.curveMonotoneX);
    const band = svg.append("path").datum(bands).attr("d", area).attr("fill", palette.blueHighlight).attr("fill-opacity", .72);
    fadeIn(band, .12, .6);
    const line = key => d3.line().x(d => x(d.t)).y(d => y(d[key])).curve(d3.curveMonotoneX);
    const price = svg.append("path").datum(bands).attr("d", line("price")).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2.7);
    const mid = svg.append("path").datum(bands).attr("d", line("mid")).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2).attr("stroke-dasharray", "5 4");
    drawPath(price, .1, .9);
    drawPath(mid, .25, .8);
  }
```
