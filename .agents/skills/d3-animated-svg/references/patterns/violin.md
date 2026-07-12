# Violin Plot

- **Pattern ID:** `d3-violin`
- **Gallery source ID:** `violin`
- **Family:** Distribution
- **Use when:** Mirrored density shape for each group.
- **Renderer:** `renderViolin`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderViolin() {
    const svg = prepareSvg("violin", "Violin plot", "Mirrored density shapes derived from deterministic samples.");
    const groups = ["A", "B", "C"];
    const x = d3.scalePoint().domain(groups).range([105, width - 85]);
    const y = d3.scaleLinear().domain([15, 95]).range([height - 54, 42]);
    axisLeft(svg, y, 56, 5);
    const area = d3.area().x0(d => -d.w).x1(d => d.w).y(d => y(d.v)).curve(d3.curveBasis);
    groups.forEach((g, gi) => {
      const density = d3.range(28).map(i => {
        const v = 18 + i * 2.8;
        const w = 8 + Math.exp(-Math.pow((v - (42 + gi * 12)) / 18, 2)) * 35 + Math.sin(i * .5 + gi) * 3;
        return { v, w };
      });
      const grp = svg.append("g").attr("transform", `translate(${x(g)},0)`);
      grp.append("path").datum(density).attr("d", area).attr("fill", colors[gi]).attr("fill-opacity", .75).attr("stroke", "#fff");
      grp.append("text").attr("class", "mark-label").attr("x", 0).attr("y", height - 28).attr("text-anchor", "middle").text(g);
      fadeIn(grp, .1 + gi * .08, .7);
    });
  }
```
