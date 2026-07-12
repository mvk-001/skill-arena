# Tile Choropleth

- **Pattern ID:** `d3-tile-choropleth`
- **Gallery source ID:** `tile-choropleth`
- **Family:** Geospatial
- **Use when:** Region shapes colored by local intensity.
- **Renderer:** `renderTileChoropleth`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTileChoropleth() {
    const svg = prepareSvg("tile-choropleth", "Tile choropleth", "D3 geoPath renders local region polygons colored by intensity.");
    const color = d3.scaleQuantize().domain([18, 88]).range(["#d7e8f4", "#9ecae1", "#6baed6", "#3182bd", "#08519c"]);
    const features = d3.range(12).map(i => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 86 + col * 92 + (row % 2) * 16;
      const y = 62 + row * 86;
      const points = [[x, y + 10], [x + 76, y], [x + 88, y + 58], [x + 16, y + 70], [x, y + 10]];
      return {
        type: "Feature",
        properties: { name: `R${i + 1}`, value: 20 + (i * 19) % 68 },
        geometry: { type: "Polygon", coordinates: [points] }
      };
    });
    const path = d3.geoPath();
    const regions = svg.append("g").selectAll("path").data(features).join("path")
      .attr("d", path)
      .attr("fill", d => color(d.properties.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(regions, .05, .7);
    svg.append("g").selectAll("text").data(features).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d3.geoPath().centroid(d)[0])
      .attr("y", d => d3.geoPath().centroid(d)[1] + 4)
      .attr("text-anchor", "middle")
      .text(d => d.properties.name);
    color.range().forEach((swatch, i) => {
      svg.append("rect").attr("x", 122 + i * 46).attr("y", 344).attr("width", 42).attr("height", 12).attr("fill", swatch);
    });
    svg.append("text").attr("class", "label").attr("x", 122).attr("y", 374).text("low");
    svg.append("text").attr("class", "label").attr("x", 346).attr("y", 374).attr("text-anchor", "end").text("high");
  }
```
