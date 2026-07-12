# Hexbin Field

- **Pattern ID:** `d3-hexbin`
- **Gallery source ID:** `hexbin`
- **Family:** Density
- **Use when:** Binned point density in hexagonal cells.
- **Renderer:** `renderHexbin`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHexbin() {
    const svg = prepareSvg("hexbin", "Hexbin field", "Point density aggregated into hand-built hexagonal cells.");
    const pts = d3.range(180).map(i => [80 + (i * 37 % 390) + Math.sin(i) * 18, 62 + (i * 53 % 280) + Math.cos(i * .7) * 18]);
    const r = 16;
    const bins = new Map();
    pts.forEach(([px, py]) => {
      const q = Math.round(px / (r * 1.5));
      const row = Math.round((py - (q % 2) * r * .86) / (r * 1.72));
      const key = `${q}|${row}`;
      const cx = q * r * 1.5;
      const cy = row * r * 1.72 + (q % 2) * r * .86;
      const item = bins.get(key) || { x: cx, y: cy, count: 0 };
      item.count += 1;
      bins.set(key, item);
    });
    const cells = Array.from(bins.values()).filter(d => d.x > 45 && d.x < width - 35 && d.y > 35 && d.y < height - 35);
    const color = quantizedRamp([0, d3.max(cells, d => d.count)], ramps.heat);
    const hex = d3.range(6).map(i => [Math.cos(Math.PI / 3 * i) * r, Math.sin(Math.PI / 3 * i) * r]).map(d => d.join(",")).join(" ");
    const polygons = svg.append("g").selectAll("polygon").data(cells).join("polygon")
      .attr("points", hex).attr("transform", d => `translate(${d.x},${d.y})`).attr("fill", d => color(d.count)).attr("stroke", "#fff");
    fadeIn(polygons, .05, .65);
  }
```
