# Bullet Chart

- **Pattern ID:** `d3-bullet`
- **Gallery source ID:** `bullet`
- **Family:** Performance
- **Use when:** Target, ranges, and current value in compact form.
- **Renderer:** `renderBullet`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBullet() {
    const svg = prepareSvg("bullet", "Bullet chart", "Compact performance bands compare current value against a target.");
    const data = [
      { name: "Latency", value: 72, target: 64, ranges: [45, 68, 90] },
      { name: "Quality", value: 83, target: 78, ranges: [55, 75, 95] },
      { name: "Reach", value: 58, target: 70, ranges: [40, 62, 88] }
    ];
    const x = d3.scaleLinear().domain([0, 100]).range([122, width - 44]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([78, 310]).padding(.42);
    data.forEach(row => {
      const g = svg.append("g").attr("transform", `translate(0,${y(row.name)})`);
      row.ranges.slice().reverse().forEach((range, i) => {
        g.append("rect").attr("x", x(0)).attr("y", 0).attr("width", x(range) - x(0)).attr("height", y.bandwidth())
          .attr("fill", ["#dfe6ee", "#c4ceda", "#aab8c7"][i]).attr("rx", 4);
      });
      const value = g.append("rect").attr("x", x(0)).attr("y", y.bandwidth() * .28)
        .attr("width", x(row.value) - x(0)).attr("height", y.bandwidth() * .44)
        .attr("fill", palette.blue).attr("rx", 3);
      value.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", x(row.value) - x(0)).attr("dur", ".8s").attr("fill", "freeze");
      g.append("line").attr("x1", x(row.target)).attr("x2", x(row.target)).attr("y1", -4).attr("y2", y.bandwidth() + 4)
        .attr("stroke", palette.ink).attr("stroke-width", 2.2);
      g.append("text").attr("class", "mark-label").attr("x", 108).attr("y", y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(row.name);
    });
    axisBottom(svg, x, 342, 5);
  }
```
