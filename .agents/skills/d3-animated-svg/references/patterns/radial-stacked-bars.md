# Radial Stacked Bars

- **Pattern ID:** `d3-radial-stacked-bars`
- **Gallery source ID:** `radial-stacked-bars`
- **Family:** Radial
- **Use when:** Stacked segments compare composition around a circular axis.
- **Renderer:** `renderRadialStackedBars`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRadialStackedBars() {
    const svg = prepareSvg("radial-stacked-bars", "Radial stacked bars", "Stacked values wrap around a circular categorical axis.");
    const categories = ["North", "East", "South", "West", "Core", "Labs"];
    const keys = ["A", "B", "C"];
    const data = categories.map((name, i) => ({ name, A: 12 + i * 2, B: 8 + (i * 5) % 14, C: 7 + (i * 7) % 13 }));
    const stack = d3.stack().keys(keys)(data);
    const angle = d3.scaleBand().domain(categories).range([0, Math.PI * 2]).padding(.16);
    const radius = d3.scaleLinear().domain([0, d3.max(data, d => d.A + d.B + d.C)]).range([58, 170]);
    const arc = d3.arc()
      .innerRadius(d => radius(d[0]))
      .outerRadius(d => radius(d[1]))
      .startAngle(d => angle(d.data.name))
      .endAngle(d => angle(d.data.name) + angle.bandwidth())
      .padAngle(.01)
      .padRadius(58);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 12})`);
    const arcs = center.append("g").selectAll("path").data(stack.flatMap((series, si) => series.map(d => ({ ...d, key: series.key, si })))).join("path")
      .attr("d", arc)
      .attr("fill", d => colors[d.si])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(arcs, .03, .55);
    categories.forEach(name => {
      const a = angle(name) + angle.bandwidth() / 2 - Math.PI / 2;
      center.append("text").attr("class", "mark-label").attr("x", Math.cos(a) * 188).attr("y", Math.sin(a) * 188).attr("text-anchor", "middle").attr("dy", 4).text(name);
    });
    const legend = svg.append("g").attr("transform", "translate(56,36)").selectAll("g").data(keys).join("g")
      .attr("transform", (d, i) => `translate(${i * 54},0)`);
    legend.append("rect").attr("x", 0).attr("y", -9).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "mark-label").attr("x", 17).attr("y", 2).text(d => d);
  }
```
