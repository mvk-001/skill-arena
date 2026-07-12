# Point Cloud

- **Pattern ID:** `d3-point-cloud`
- **Gallery source ID:** `point-cloud`
- **Family:** Distribution
- **Use when:** Small gray circles float around an invisible horizontal line.
- **Renderer:** `renderPointCloud`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPointCloud() {
    const svg = prepareSvg("point-cloud", "Point cloud", "A deterministic gray point cloud densest along a horizontal line near the top.");
    const rng = d3.randomLcg(0.84);
    const normal = d3.randomNormal.source(rng)(0, 1);
    const density = {
      count: 86,
      coreShare: .7,
      midShare: .22,
      coreSpread: 8,
      midSpread: 22,
      outerSpread: 42,
      collisionRatio: .62
    };
    const lineY = height * .3;
    const lineStart = [72, lineY];
    const lineEnd = [width - 72, lineY];
    const lineDx = lineEnd[0] - lineStart[0];
    const lineDy = lineEnd[1] - lineStart[1];
    const lineLength = Math.hypot(lineDx, lineDy);
    const ux = lineDx / lineLength;
    const uy = lineDy / lineLength;
    const px = -uy;
    const py = ux;
    const points = d3.range(density.count).map(i => {
      const roll = rng();
      const spread = roll < density.coreShare
        ? density.coreSpread
        : roll < density.coreShare + density.midShare
          ? density.midSpread
          : density.outerSpread;
      const t = .04 + rng() * .92;
      const along = normal() * 10;
      const away = normal() * spread;
      const baseX = lineStart[0] + lineDx * t;
      const baseY = lineStart[1] + lineDy * t;
      const targetX = baseX + ux * along + px * away;
      const targetY = baseY + uy * along + py * away;
      return {
        id: i,
        targetX,
        targetY,
        x: targetX + normal() * 16,
        y: targetY + normal() * 10,
        r: 3.6 + rng() * 4.6
      };
    });
    const simulation = d3.forceSimulation(points)
      .randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => d.targetX).strength(.42))
      .force("y", d3.forceY(d => d.targetY).strength(.42))
      .force("collide", d3.forceCollide(d => d.r * density.collisionRatio).strength(.38).iterations(1))
      .stop();
    for (let i = 0; i < 90; i += 1) simulation.tick();
    points.forEach(d => {
      d.x = Math.max(52 + d.r, Math.min(width - 52 - d.r, d.x));
      d.y = Math.max(52 + d.r, Math.min(height - 52 - d.r, d.y));
    });
    const floatRng = d3.randomLcg(0.27);
    points.forEach(d => {
      d.floatDx = (floatRng() < .5 ? -1 : 1) * (2.4 + floatRng() * 4.2);
      d.floatDy = (floatRng() < .5 ? -1 : 1) * (2 + floatRng() * 3.8);
      d.floatDur = 4.6 + floatRng() * 4.4;
      d.floatBegin = -floatRng() * d.floatDur;
    });
    const dots = svg.append("g").selectAll("circle").data(points, d => d.id).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r)
      .attr("fill", palette.gray200)
      .attr("fill-opacity", .9);
    dots.each(function (d) {
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "cx")
        .attr("values", `${d.x};${d.x + d.floatDx};${d.x - d.floatDx * .55};${d.x}`)
        .attr("dur", `${d.floatDur}s`)
        .attr("begin", `${d.floatBegin}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".42 0 .58 1;.42 0 .58 1;.42 0 .58 1")
        .attr("repeatCount", "indefinite");
      dot.append("animate")
        .attr("attributeName", "cy")
        .attr("values", `${d.y};${d.y + d.floatDy};${d.y - d.floatDy * .6};${d.y}`)
        .attr("dur", `${d.floatDur * (1.08 + (d.id % 5) * .025)}s`)
        .attr("begin", `${d.floatBegin - (d.id % 7) * .19}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".42 0 .58 1;.42 0 .58 1;.42 0 .58 1")
        .attr("repeatCount", "indefinite");
    });
  }
```
