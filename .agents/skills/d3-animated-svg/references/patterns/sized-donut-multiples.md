# Sized Donut Multiples

- **Pattern ID:** `d3-sized-donut-multiples`
- **Gallery source ID:** `sized-donut-multiples`
- **Family:** Multiples
- **Use when:** Small radial pies compare share and total size together.
- **Renderer:** `renderSizedDonutMultiples`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSizedDonutMultiples() {
    const svg = prepareSvg("sized-donut-multiples", "Sized donut multiples", "Small radial pies compare share and total size together.");
    const data = [
      { name: "North", total: 72, parts: [34, 21, 17] },
      { name: "East", total: 54, parts: [18, 24, 12] },
      { name: "South", total: 82, parts: [31, 16, 35] },
      { name: "West", total: 47, parts: [13, 20, 14] },
      { name: "Core", total: 96, parts: [42, 26, 28] },
      { name: "Lab", total: 62, parts: [24, 12, 26] }
    ];
    const radius = d3.scaleSqrt().domain([40, 100]).range([38, 64]);
    const pie = d3.pie().sort(null).value(d => d.value);
    const arc = d3.arc().innerRadius(d => radius(d.data.parent.total) * .55).outerRadius(d => radius(d.data.parent.total));
    const group = svg.append("g").selectAll("g").data(data).join("g")
      .attr("class", "donut-multiple")
      .attr("data-region", d => d.name)
      .attr("data-total", d => d.total)
      .attr("transform", (d, i) => `translate(${110 + (i % 3) * 170},${128 + Math.floor(i / 3) * 160})`);
    group.each(function (d) {
      const slices = pie(d.parts.map((value, i) => ({ value, i, parent: d })));
      const paths = d3.select(this).selectAll("path").data(slices).join("path")
        .attr("d", arc).attr("fill", s => colors[s.data.i]).attr("stroke", "#fff").attr("stroke-width", 2);
      fadeIn(paths, .06, .55);
    });
    group.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", d => radius(d.total) + 20).text(d => d.name);
    group.append("text").attr("class", "label").attr("text-anchor", "middle").attr("dy", 4).text(d => d.total);
    const legend = svg.append("g").attr("transform", "translate(154,28)");
    const legendItems = legend.selectAll("g").data(["Acquire", "Retain", "Expand"]).join("g").attr("transform", (_, i) => `translate(${i * 100},0)`);
    legendItems.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", (_, i) => colors[i]);
    legendItems.append("text").attr("class", "caption").attr("x", 18).attr("y", 10).text(d => d);
  }
```
