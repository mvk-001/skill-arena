# Bivariate Choropleth

- **Pattern ID:** `d3-bivariate-choropleth`
- **Gallery source ID:** `bivariate-choropleth`
- **Family:** Geospatial
- **Use when:** Two metrics combine into a 3-by-3 regional color key.
- **Renderer:** `renderBivariateChoropleth`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBivariateChoropleth() {
    const svg = prepareSvg("bivariate-choropleth", "Bivariate choropleth", "Two regional metrics combine into a compact color matrix.");
    svg.attr("data-map-context", "schematic-regions").attr("data-metric-a-domain", "0-2").attr("data-metric-b-domain", "0-2");
    const palette2 = ramps.bivariate;
    const regions = d3.range(18).map(i => ({
      x: 86 + (i % 6) * 56 + ((i % 2) * 8),
      y: 72 + Math.floor(i / 6) * 74,
      a: i % 3,
      b: Math.floor((i * 5) % 9 / 3),
      label: String.fromCharCode(65 + i)
    }));
    svg.append("path")
      .attr("d", "M68,70C128,48 222,52 286,68C360,86 430,70 470,112L454,286C382,326 292,314 224,328C154,340 92,308 72,248Z")
      .attr("fill", palette.gray50).attr("stroke", palette.gray300).attr("stroke-width", 1.4);
    const cells = svg.append("g").selectAll("path").data(regions).join("path")
      .attr("data-region", d => d.label)
      .attr("data-metric-a", d => d.a)
      .attr("data-metric-b", d => d.b)
      .attr("d", d => {
        const pts = [[d.x, d.y], [d.x + 44, d.y + 8], [d.x + 38, d.y + 48], [d.x - 8, d.y + 42]];
        return `${d3.line()(pts)}Z`;
      })
      .attr("fill", d => palette2[d.b][d.a])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(cells, .04, .55);
    svg.append("g").selectAll("text").data(regions).join("text")
      .attr("class", "mark-label").attr("x", d => d.x + 18).attr("y", d => d.y + 28).attr("text-anchor", "middle").text(d => d.label);
    const key = svg.append("g").attr("transform", "translate(410,246)");
    d3.range(9).forEach(i => {
      const a = i % 3, b = Math.floor(i / 3);
      key.append("rect").attr("x", a * 24).attr("y", (2 - b) * 24).attr("width", 22).attr("height", 22).attr("fill", palette2[b][a]).attr("stroke", "#fff");
    });
    key.append("text").attr("class", "label").attr("x", 36).attr("y", 88).attr("text-anchor", "middle").text("A low -> high");
    key.append("text").attr("class", "caption").attr("x", 36).attr("y", -8).attr("text-anchor", "middle").text("B high");
  }
```
