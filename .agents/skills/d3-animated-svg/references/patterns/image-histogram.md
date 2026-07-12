# Image Histogram

- **Pattern ID:** `d3-image-histogram`
- **Gallery source ID:** `image-histogram`
- **Family:** Raster
- **Use when:** A brushed image region links to a pixel-value distribution.
- **Renderer:** `renderMonaHistogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMonaHistogram() {
    const svg = prepareSvg("image-histogram", "Image histogram", "A brushed image region links to a pixel-value distribution.");
    const image = { x: 64, y: 64, size: 188, cells: 12 };
    const values = d3.range(image.cells * image.cells).map(i => {
      const x = i % image.cells, y = Math.floor(i / image.cells);
      return Math.round(34 + x * 12 + y * 7 + Math.sin((x + y) / 2) * 22);
    });
    const color = quantizedRamp([20, 250], ramps.gray.slice().reverse());
    svg.append("g").selectAll("rect.pixel").data(values).join("rect")
      .attr("class", "pixel").attr("x", (d, i) => image.x + (i % image.cells) * image.size / image.cells)
      .attr("y", (d, i) => image.y + Math.floor(i / image.cells) * image.size / image.cells)
      .attr("width", image.size / image.cells + .5).attr("height", image.size / image.cells + .5).attr("fill", d => color(d));
    const brush = svg.append("rect").attr("x", image.x + 48).attr("y", image.y + 42).attr("width", 78).attr("height", 82).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3);
    fadeIn(brush, .12, .45);
    const bins = d3.bin().domain([0, 240]).thresholds(10)(values.filter((_, i) => (i % image.cells) >= 3 && (i % image.cells) <= 8 && Math.floor(i / image.cells) >= 3 && Math.floor(i / image.cells) <= 8));
    const x = d3.scaleLinear().domain([0, 240]).range([306, 506]);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([306, 86]);
    const bars = svg.append("g").selectAll("rect.hist").data(bins).join("rect")
      .attr("class", "hist").attr("x", d => x(d.x0) + 1).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("y", d => y(d.length)).attr("height", d => y(0) - y(d.length)).attr("fill", palette.blue);
    grow(bars, "height", 1, d => y(0) - y(d.length), .16, .65);
  }
```
