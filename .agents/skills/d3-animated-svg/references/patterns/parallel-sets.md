# Parallel Sets

- **Pattern ID:** `d3-parallel-sets`
- **Gallery source ID:** `parallel-sets`
- **Family:** Flow
- **Use when:** Categorical ribbons connect counts across multiple dimensions.
- **Renderer:** `renderParallelSets`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderParallelSets() {
    const svg = prepareSvg("parallel-sets", "Parallel sets", "Categorical ribbons connect counts across multiple dimensions.");
    const stages = [
      { name: "Source", values: ["Organic", "Paid", "Partner"] },
      { name: "Intent", values: ["Learn", "Build", "Buy"] },
      { name: "Outcome", values: ["Retain", "Expand", "Churn"] }
    ];
    const flows = [
      ["Organic", "Learn", "Retain", 22], ["Organic", "Build", "Expand", 18], ["Organic", "Buy", "Churn", 8],
      ["Paid", "Learn", "Churn", 10], ["Paid", "Build", "Retain", 14], ["Paid", "Buy", "Expand", 24],
      ["Partner", "Learn", "Retain", 12], ["Partner", "Build", "Expand", 16], ["Partner", "Buy", "Retain", 20]
    ].map(d => ({ a: d[0], b: d[1], c: d[2], value: d[3] }));
    const xs = [90, width / 2, width - 90];
    const scales = stages.map((stage, i) => d3.scalePoint().domain(stage.values).range([94, 316]).padding(.42));
    stages.forEach((stage, i) => {
      svg.append("line").attr("x1", xs[i]).attr("x2", xs[i]).attr("y1", 76).attr("y2", 334).attr("stroke", palette.line).attr("stroke-width", 2);
      svg.append("text").attr("class", "mark-label").attr("x", xs[i]).attr("y", 52).attr("text-anchor", "middle").text(stage.name);
      svg.selectAll(`.parallel-set-label-${i}`).data(stage.values).join("text").attr("class", "mark-label")
        .attr("x", xs[i]).attr("y", d => scales[i](d)).attr("text-anchor", "middle").attr("dy", -10).text(d => d);
    });
    const link = (x0, y0, x1, y1) => `M${x0},${y0}C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
    const left = svg.append("g").selectAll("path").data(flows).join("path")
      .attr("d", d => link(xs[0], scales[0](d.a), xs[1], scales[1](d.b)))
      .attr("fill", "none").attr("stroke", d => d.a === "Organic" ? palette.blue : d.a === "Paid" ? palette.orange : palette.green)
      .attr("stroke-width", d => Math.max(3, d.value / 2.4)).attr("stroke-opacity", .5).attr("stroke-linecap", "round");
    const right = svg.append("g").selectAll("path").data(flows).join("path")
      .attr("d", d => link(xs[1], scales[1](d.b), xs[2], scales[2](d.c)))
      .attr("fill", "none").attr("stroke", d => d.c === "Retain" ? palette.blue : d.c === "Expand" ? palette.green : palette.red)
      .attr("stroke-width", d => Math.max(3, d.value / 2.4)).attr("stroke-opacity", .5).attr("stroke-linecap", "round");
    drawPath(left, .08, .85);
    drawPath(right, .16, .85);
  }
```
