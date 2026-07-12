# Airports Voronoi

- **Pattern ID:** `d3-airport-voronoi`
- **Gallery source ID:** `airport-voronoi`
- **Family:** Geospatial
- **Use when:** Nearest-airport service areas partition a projected region.
- **Renderer:** `renderAirportsVoronoi`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAirportsVoronoi() {
    const svg = prepareSvg("airport-voronoi", "Airports Voronoi", "Nearest-airport service areas partition a projected region.");
    const airports = [
      [92, 112, "SEA"], [158, 230, "SFO"], [250, 174, "DEN"], [348, 128, "ORD"], [414, 232, "ATL"], [478, 172, "JFK"], [302, 286, "DFW"]
    ];
    const delaunay = d3.Delaunay.from(airports, d => d[0], d => d[1]);
    const voronoi = delaunay.voronoi([48, 58, width - 48, 336]);
    const cells = svg.append("g").selectAll("path").data(airports).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i)).attr("fill", (d, i) => ["#cdf3ff", "#dbffcc", "#ffe5cc", "#fff4cc", "#ffccd5", "#f9ccff", "#e7e7e7"][i])
      .attr("stroke", "#fff").attr("stroke-width", 2);
    fadeIn(cells, .08, .6);
    svg.append("path").attr("d", "M64,96 C140,54 218,72 280,86 C364,100 456,82 506,142 L480,312 C386,348 248,338 108,318 L64,96Z")
      .attr("fill", "none").attr("stroke", palette.ink).attr("stroke-opacity", .62).attr("stroke-width", 1.6).attr("stroke-linejoin", "round");
    const dots = svg.append("g").selectAll("g").data(airports).join("g").attr("transform", d => `translate(${d[0]},${d[1]})`);
    dots.append("circle").attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots.selectAll("circle"), "r", 2, 6, .16, .45);
    dots.append("text").attr("class", "mark-label").attr("dy", -10).attr("text-anchor", "middle").text(d => d[2]);
  }
```
