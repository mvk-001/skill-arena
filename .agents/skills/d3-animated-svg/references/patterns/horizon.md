# Horizon Chart

- **Pattern ID:** `d3-horizon`
- **Gallery source ID:** `horizon`
- **Family:** Temporal
- **Use when:** Compressed time-series bands with color.
- **Renderer:** `renderHorizon`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHorizon() {
    const svg = prepareSvg("horizon", "Horizon chart", "Compressed time-series bands with layered color.");
    const data = d3.range(48).map(i => ({ x: i, y: Math.sin(i / 4) * 28 + Math.cos(i / 9) * 18 + 42 }));
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.x)).range([42, width - 34]);
    const y = d3.scaleLinear().domain([0, 90]).range([116, 0]);
    const baseY = 300;
    const bandHeight = 108;
    const bandColors = [palette.blueHighlight, palette.cyan, palette.blue];
    const area = d3.area().x(d => x(d.x)).y0(baseY).y1(d => baseY - Math.min(bandHeight, y(0) - y(d.y))).curve(d3.curveBasis);
    svg.append("rect").attr("x", 42).attr("y", baseY - bandHeight).attr("width", width - 76).attr("height", bandHeight)
      .attr("fill", palette.gray50).attr("stroke", palette.gray100);
    [0, 1, 2].forEach(i => {
      const shifted = data.map(d => ({ x: d.x, y: Math.max(0, d.y - i * 22) }));
      const path = svg.append("path").datum(shifted).attr("d", area).attr("fill", bandColors[i]).attr("fill-opacity", .78);
      fadeIn(path, .08 + i * .08, .75);
    });
    svg.append("line").attr("x1", 42).attr("x2", width - 34).attr("y1", baseY).attr("y2", baseY).attr("stroke", "#9ba6b3");
    d3.range(0, 49, 8).forEach(tick => {
      svg.append("line").attr("x1", x(tick)).attr("x2", x(tick)).attr("y1", baseY).attr("y2", baseY + 6).attr("stroke", "#9ba6b3");
      svg.append("text").attr("class", "label").attr("x", x(tick)).attr("y", baseY + 22).attr("text-anchor", "middle").text(`T${tick}`);
    });
    ["low", "mid", "high"].forEach((label, i) => {
      svg.append("rect").attr("x", 54 + i * 60).attr("y", 48).attr("width", 14).attr("height", 14).attr("fill", bandColors[i]);
      svg.append("text").attr("class", "label").attr("x", 74 + i * 60).attr("y", 60).text(label);
    });
  }
```
