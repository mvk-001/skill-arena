# Cluster Hulls

- **Pattern ID:** `d3-cluster-hulls`
- **Gallery source ID:** `cluster-hulls`
- **Family:** Proximity
- **Use when:** Convex envelopes around related observations.
- **Renderer:** `renderClusterHulls`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderClusterHulls() {
    const svg = prepareSvg("cluster-hulls", "Cluster hulls", "D3 polygon hulls wrap clustered point neighborhoods.");
    const clusters = [
      { name: "North", center: [160, 140], color: palette.blue },
      { name: "South", center: [304, 245], color: palette.orange },
      { name: "West", center: [390, 132], color: palette.green }
    ];
    const points = clusters.flatMap((cluster, ci) => d3.range(14).map(i => ({
      cluster: cluster.name,
      color: cluster.color,
      x: cluster.center[0] + Math.cos(i * 1.7 + ci) * (28 + (i % 4) * 7),
      y: cluster.center[1] + Math.sin(i * 1.35 + ci) * (22 + (i % 5) * 6)
    })));
    clusters.forEach(cluster => {
      const hull = d3.polygonHull(points.filter(d => d.cluster === cluster.name).map(d => [d.x, d.y]));
      svg.append("path")
        .attr("d", hull ? `M${hull.join("L")}Z` : "")
        .attr("fill", cluster.color)
        .attr("fill-opacity", .16)
        .attr("stroke", cluster.color)
        .attr("stroke-width", 2);
    });
    fadeIn(svg.selectAll("path"), .06, .65);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1, 5.5, .12, .6);
    svg.append("g").selectAll("text").data(clusters).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d.center[0])
      .attr("y", d => d.center[1] - 54)
      .attr("text-anchor", "middle")
      .text(d => d.name);
  }
```
