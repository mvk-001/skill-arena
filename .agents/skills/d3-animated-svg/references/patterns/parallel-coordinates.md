# Parallel Coordinates

- **Pattern ID:** `d3-parallel-coordinates`
- **Gallery source ID:** `parallel-coordinates`
- **Family:** Multivariate
- **Use when:** Many-dimensional profiles as polylines.
- **Renderer:** `renderParallelCoordinates`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderParallelCoordinates() {
    const svg = prepareSvg("parallel-coordinates", "Parallel coordinates", "Multiple numeric dimensions drawn as connected axes.");
    const dims = ["Speed", "Cost", "Quality", "Risk", "Reach"];
    const rows = [
      { name: "A", values: [82, 35, 76, 42, 66] }, { name: "B", values: [58, 62, 64, 38, 74] },
      { name: "C", values: [70, 47, 88, 58, 52] }, { name: "D", values: [45, 72, 55, 66, 86] }
    ];
    const x = d3.scalePoint().domain(dims).range([58, width - 44]);
    const y = d3.scaleLinear().domain([0, 100]).range([330, 62]);
    const line = d3.line().x((d, i) => x(dims[i])).y(d => y(d)).curve(d3.curveMonotoneX);
    dims.forEach(dim => {
      svg.append("g").attr("class", "axis").attr("transform", `translate(${x(dim)},0)`).call(d3.axisLeft(y).ticks(4));
      svg.append("text").attr("class", "mark-label").attr("x", x(dim)).attr("y", 42).attr("text-anchor", "middle").text(dim);
    });
    const paths = svg.append("g").attr("fill", "none").attr("stroke-width", 2.4).selectAll("path").data(rows).join("path")
      .attr("d", d => line(d.values)).attr("stroke", (d, i) => colors[i]).attr("stroke-opacity", .78);
    drawPath(paths, .15, .95);
  }
```
