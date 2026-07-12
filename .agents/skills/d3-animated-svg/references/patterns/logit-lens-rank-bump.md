# Logit Lens Rank Bump

- **Pattern ID:** `d3-logit-lens-rank-bump`
- **Gallery source ID:** `logit-lens-rank-bump`
- **Family:** Diagnostics
- **Use when:** Candidate token ranks move across layers until the final answer separates.
- **Renderer:** `renderLogitLensRankBump`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLogitLensRankBump() {
    const svg = prepareSvg("logit-lens-rank-bump", "Logit lens rank bump", "Candidate next-token ranks are decoded from intermediate layers and compared as a bump chart.");
    const layers = ["L0", "L4", "L8", "L12", "L16"];
    const tokens = [
      { token: "matrix", color: palette.blue, ranks: [4, 3, 2, 1, 1] },
      { token: "vector", color: palette.green, ranks: [2, 2, 3, 3, 4] },
      { token: "cache", color: palette.orange, ranks: [5, 4, 4, 4, 3] },
      { token: "route", color: palette.purple, ranks: [1, 1, 1, 2, 2] },
      { token: "mask", color: palette.red, ranks: [3, 5, 5, 5, 5] }
    ];
    const x = d3.scalePoint().domain(layers).range([78, 464]);
    const y = d3.scalePoint().domain([1, 2, 3, 4, 5]).range([96, 304]);
    svg.append("rect").attr("x", 54).attr("y", 72).attr("width", 444).attr("height", 258).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    layers.forEach(layer => {
      svg.append("line").attr("x1", x(layer)).attr("x2", x(layer)).attr("y1", 88).attr("y2", 312).attr("stroke", palette.gray200);
      svg.append("text").attr("class", "caption").attr("x", x(layer)).attr("y", 334).attr("text-anchor", "middle").text(layer);
    });
    [1, 2, 3, 4, 5].forEach(rank => {
      svg.append("text").attr("class", "caption").attr("x", 40).attr("y", y(rank) + 4).attr("text-anchor", "end").text(`#${rank}`);
    });
    const line = d3.line()
      .x((d, i) => x(layers[i]))
      .y(d => y(d))
      .curve(d3.curveMonotoneX);
    tokens.forEach((series, seriesIndex) => {
      const path = svg.append("path")
        .attr("d", line(series.ranks))
        .attr("fill", "none")
        .attr("stroke", series.color)
        .attr("stroke-width", series.token === "matrix" ? 4 : 2.3)
        .attr("stroke-opacity", series.token === "matrix" ? .9 : .55)
        .attr("stroke-linecap", "round");
      drawPath(path, .18 + seriesIndex * .08, .95);
      series.ranks.forEach((rank, i) => {
        const dot = svg.append("circle")
          .attr("cx", x(layers[i]))
          .attr("cy", y(rank))
          .attr("r", series.token === "matrix" && i === layers.length - 1 ? 6.8 : 4.6)
          .attr("fill", series.color)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.4);
        dot.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".22s").attr("begin", `${.62 + i * .07 + seriesIndex * .04}s`).attr("fill", "freeze");
      });
      svg.append("text").attr("class", "mark-label").attr("x", 478).attr("y", y(series.ranks.at(-1)) + 4).style("font-size", "10px").attr("fill", series.color).text(series.token);
    });
    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 48).attr("text-anchor", "middle").text("rank decoded at each layer");
    svg.append("path").attr("d", `M${x("L12") - 24},${y(1) - 16}h48`).attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    svg.append("text").attr("class", "caption").attr("x", x("L12")).attr("y", y(1) - 24).attr("text-anchor", "middle").text("winner separates");
  }
```
