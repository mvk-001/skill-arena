# World Tour

- **Pattern ID:** `d3-world-tour`
- **Gallery source ID:** `world-tour`
- **Family:** Geospatial
- **Use when:** Great-circle hops trace a route across a rotating globe.
- **Renderer:** `renderWorldTour`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderWorldTour() {
    const svg = prepareSvg("world-tour", "World tour", "Great-circle route segments move through a projected globe.");
    const projection = d3.geoOrthographic().rotate([78, -16]).scale(156).translate([width / 2, height / 2 + 8]);
    const path = d3.geoPath(projection);
    const cities = [
      { name: "SF", coord: [-122, 38] }, { name: "NY", coord: [-74, 41] }, { name: "LDN", coord: [0, 51] },
      { name: "CAI", coord: [31, 30] }, { name: "DEL", coord: [77, 29] }, { name: "TKY", coord: [139, 36] }
    ];
    const route = d3.pairs(cities).flatMap(([a, b]) => d3.range(24).map(i => d3.geoInterpolate(a.coord, b.coord)(i / 24)));
    route.push(cities.at(-1).coord);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .26).attr("stroke", palette.gray200);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const routePath = svg.append("path").datum({ type: "LineString", coordinates: route })
      .attr("id", "world-tour-route")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(routePath, .12, 1.35);
    const stops = svg.append("g").selectAll("g").data(cities).join("g").attr("transform", d => `translate(${projection(d.coord) || [width / 2, height / 2 + 8]})`);
    stops.append("circle").attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(stops.selectAll("circle"), "r", 2, 6, .2, .5);
    stops.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", -10).text(d => d.name);
    const token = svg.append("circle").attr("r", 6).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    token.append("animateMotion").attr("dur", "3s").attr("repeatCount", "indefinite").attr("rotate", "auto").append("mpath").attr("href", "#world-tour-route");
  }
```
