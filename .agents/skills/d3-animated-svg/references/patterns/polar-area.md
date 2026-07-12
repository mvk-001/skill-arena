# Polar Area

- **Pattern ID:** `d3-polar-area`
- **Gallery source ID:** `polar-area`
- **Family:** Radial
- **Use when:** Seasonal magnitude as radial arc segments.
- **Renderer:** `renderPolarArea`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPolarArea() {
    const svg = prepareSvg("polar-area", "Polar area", "D3 pie and arc generators create radial seasonal segments.");
    const data = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, i) => ({
      month,
      value: 36 + Math.sin(i / 1.7) * 22 + (i % 4) * 8
    }));
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 12})`);
    const radius = d3.scaleRadial().domain([0, 86]).range([44, 164]);
    const angle = d3.scaleBand().domain(data.map(d => d.month)).range([0, 2 * Math.PI]).padding(.025);
    const arc = d3.arc()
      .innerRadius(42)
      .outerRadius(d => radius(d.value))
      .startAngle(d => angle(d.month))
      .endAngle(d => angle(d.month) + angle.bandwidth())
      .padAngle(.012)
      .padRadius(44);
    [40, 60, 80].forEach(v => center.append("circle").attr("r", radius(v)).attr("fill", "none").attr("stroke", palette.gray200));
    const wedges = center.selectAll("path").data(data).join("path")
      .attr("d", arc)
      .attr("fill", (d, i) => colors[i % colors.length])
      .attr("fill-opacity", .82)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    fadeIn(wedges, .06, .75);
    center.selectAll("text").data(data.filter((d, i) => i % 2 === 0)).join("text")
      .attr("class", "label")
      .attr("x", d => Math.cos(angle(d.month) + angle.bandwidth() / 2 - Math.PI / 2) * 184)
      .attr("y", d => Math.sin(angle(d.month) + angle.bandwidth() / 2 - Math.PI / 2) * 184 + 4)
      .attr("text-anchor", "middle")
      .text(d => d.month);
  }
```
