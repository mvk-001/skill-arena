# Facet Sparklines

- **Pattern ID:** `d3-facet-sparklines`
- **Gallery source ID:** `facet-sparklines`
- **Family:** Small multiples
- **Use when:** Repeated scales compare patterns across panels.
- **Renderer:** `renderFacets`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderFacets() {
    const svg = prepareSvg("facet-sparklines", "Facet sparklines", "Small multiples repeat scale and encoding across comparable panels.");
    const groups = ["North", "South", "East", "West", "Core", "Labs"];
    const data = groups.map((name, gi) => ({
      name,
      values: d3.range(18).map(i => ({ x: i, y: 42 + Math.sin(i / 2.5 + gi) * 18 + Math.cos(i / 4 + gi * .7) * 9 }))
    }));
    const panelW = 150, panelH = 92;
    const x = d3.scaleLinear().domain([0, 17]).range([18, panelW - 14]);
    const y = d3.scaleLinear().domain([15, 75]).range([panelH - 22, 16]);
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const panels = svg.append("g").selectAll("g").data(data).join("g")
      .attr("transform", (d, i) => `translate(${54 + (i % 3) * 162},${48 + Math.floor(i / 3) * 142})`);
    panels.append("rect").attr("width", panelW).attr("height", panelH).attr("rx", 6).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const paths = panels.append("path").attr("d", d => line(d.values)).attr("fill", "none").attr("stroke", (d, i) => colors[i % colors.length]).attr("stroke-width", 2.3);
    drawPath(paths, .08, .7);
    panels.append("text").attr("class", "mark-label").attr("x", 12).attr("y", 14).text(d => d.name);
  }
```
