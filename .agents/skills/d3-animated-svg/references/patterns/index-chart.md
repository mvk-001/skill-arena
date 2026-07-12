# Index Chart

- **Pattern ID:** `d3-index-chart`
- **Gallery source ID:** `index-chart`
- **Family:** Temporal
- **Use when:** Multiple series rebase to a common starting value.
- **Renderer:** `renderIndexChart`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderIndexChart() {
    const svg = prepareSvg("index-chart", "Index chart", "Multiple series rebase to a common starting value.");
    const names = ["Alpha", "Beta", "Gamma"];
    const series = names.map((name, si) => ({
      name,
      values: d3.range(12).map(i => ({ t: i, value: 100 + Math.sin(i / (1.8 + si * .3) + si) * 8 + i * (si === 1 ? 4.2 : si === 2 ? 1.6 : 2.7) }))
    }));
    series.forEach(s => {
      const first = s.values[0].value;
      s.values.forEach(d => { d.index = d.value / first * 100; });
    });
    const margin = { top: 46, right: 78, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([0, 11]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([88, 152]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.index)).curve(d3.curveMonotoneX);
    const paths = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", d => line(d.values)).attr("fill", "none").attr("stroke", (d, i) => colors[i]).attr("stroke-width", 2.8);
    drawPath(paths, .08, .95);
    svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", palette.gray400).attr("stroke-dasharray", "5 5");
    svg.selectAll(".index-label").data(series).join("text").attr("class", "mark-label")
      .attr("x", width - margin.right + 8).attr("y", d => y(d.values.at(-1).index)).text(d => d.name);
    svg.append("text").attr("class", "label").attr("x", margin.left).attr("y", 32).text("rebased to 100");
  }
```
