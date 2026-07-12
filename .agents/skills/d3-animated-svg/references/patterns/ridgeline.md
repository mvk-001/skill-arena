# Ridgeline

- **Pattern ID:** `d3-ridgeline`
- **Gallery source ID:** `ridgeline`
- **Family:** Distribution
- **Use when:** Stacked density curves for group comparison.
- **Renderer:** `renderRidgeline`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRidgeline() {
    const svg = prepareSvg("ridgeline", "Ridgeline", "Stacked density curves reveal group shape differences.");
    const groups = ["North", "South", "East", "West"];
    const x = d3.scaleLinear().domain([0, 100]).range([54, width - 34]);
    const yBase = d3.scalePoint().domain(groups).range([82, 314]);
    const line = d3.area().x(d => x(d.x)).y0(0).y1(d => -d.y).curve(d3.curveBasis);
    groups.forEach((group, gi) => {
      const data = d3.range(28).map(i => ({ x: i * 3.7, y: 12 + Math.exp(-Math.pow((i - (9 + gi * 4)) / 5, 2)) * 62 }));
      const g = svg.append("g").attr("transform", `translate(0,${yBase(group)})`);
      g.append("path").datum(data).attr("d", line).attr("fill", colors[gi]).attr("fill-opacity", .72).attr("stroke", d3.color(colors[gi]).darker(.45));
      g.append("text").attr("class", "mark-label").attr("x", 42).attr("y", -8).text(group);
      fadeIn(g, .08 + gi * .08, .6);
    });
  }
```
