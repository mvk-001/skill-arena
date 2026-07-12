# Geofenced Activity

- **Pattern ID:** `d3-geofence-join`
- **Gallery source ID:** `geofence-join`
- **Family:** Spatial join
- **Use when:** Points classify into regions and roll up totals.
- **Renderer:** `renderGeofenceJoin`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderGeofenceJoin() {
    const svg = prepareSvg("geofence-join", "Geofenced activity", "Point-in-polygon grouping rolls up local activity totals.");
    const regions = [
      { id: "North", points: [[96, 66], [236, 48], [258, 158], [132, 182], [96, 66]], color: "#d9e9f7" },
      { id: "Core", points: [[258, 72], [430, 90], [402, 210], [250, 178], [258, 72]], color: "#d9ebd7" },
      { id: "South", points: [[112, 198], [250, 182], [394, 224], [366, 334], [142, 324], [112, 198]], color: "#f7dfc6" }
    ];
    const points = d3.range(42).map(i => ({
      x: 104 + (i * 53) % 310 + Math.sin(i) * 18,
      y: 78 + (i * 37) % 236 + Math.cos(i * .7) * 14
    }));
    points.forEach(point => {
      point.region = regions.find(region => d3.polygonContains(region.points, [point.x, point.y]))?.id || "Outside";
    });
    const counts = d3.rollup(points.filter(d => d.region !== "Outside"), v => v.length, d => d.region);
    const path = d3.line().x(d => d[0]).y(d => d[1]);
    const shapes = svg.append("g").selectAll("path").data(regions).join("path")
      .attr("d", d => `${path(d.points)}Z`)
      .attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 2);
    fadeIn(shapes, .05, .7);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.region === "Outside" ? "#9aa7b5" : palette.blue)
      .attr("fill-opacity", d => d.region === "Outside" ? .35 : .82)
      .attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.region === "Outside" ? 3 : 5, .1, .55);
    svg.append("g").selectAll("text").data(regions).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d3.polygonCentroid(d.points)[0])
      .attr("y", d => d3.polygonCentroid(d.points)[1])
      .attr("text-anchor", "middle")
      .text(d => `${d.id} ${counts.get(d.id) || 0}`);
  }
```
