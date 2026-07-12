# Correlogram + Histograms

- **Pattern ID:** `d3-correlogram`
- **Gallery source ID:** `correlogram`
- **Family:** Matrix
- **Use when:** Pairwise panels combine correlations, scatters, and diagonals.
- **Renderer:** `renderCorrelogramHistogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCorrelogramHistogram() {
    const svg = prepareSvg("correlogram", "Correlogram with histograms", "Pairwise panels combine correlations, scatters, and diagonal distributions.");
    const vars = ["A", "B", "C", "D"];
    const data = d3.range(42).map(i => ({
      A: 18 + ((i * 17) % 76),
      B: 22 + ((i * 23 + i * 2) % 72),
      C: 20 + Math.sin(i / 5) * 26 + ((i * 11) % 34),
      D: 84 - ((i * 19) % 68)
    }));
    const size = 74, gap = 8, origin = { x: 88, y: 58 };
    const extent = v => d3.extent(data, d => d[v]);
    const pearson = (a, b) => {
      const meanA = d3.mean(data, d => d[a]);
      const meanB = d3.mean(data, d => d[b]);
      const numerator = d3.sum(data, d => (d[a] - meanA) * (d[b] - meanB));
      const sumSquaresA = d3.sum(data, d => (d[a] - meanA) ** 2);
      const sumSquaresB = d3.sum(data, d => (d[b] - meanB) ** 2);
      const denominator = Math.sqrt(sumSquaresA * sumSquaresB);
      return denominator > 0 ? numerator / denominator : 0;
    };
    const scales = new Map(vars.map(v => [v, d3.scaleLinear().domain(extent(v)).range([8, size - 8])]));
    vars.forEach((row, r) => vars.forEach((col, c) => {
      const x0 = origin.x + c * (size + gap), y0 = origin.y + r * (size + gap);
      svg.append("rect").attr("x", x0).attr("y", y0).attr("width", size).attr("height", size).attr("fill", "#ffffff").attr("stroke", "#e7e7e7");
      if (r === c) {
        const bins = d3.bin().domain(extent(col)).thresholds(6)(data.map(d => d[col]));
        const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([size - 10, 12]);
        const x = d3.scaleLinear().domain(extent(col)).range([10, size - 10]);
        const bars = svg.append("g").selectAll("rect").data(bins).join("rect")
          .attr("x", d => x0 + x(d.x0)).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 1))
          .attr("y", d => y0 + y(d.length)).attr("height", d => size - 10 - y(d.length)).attr("fill", palette.blue).attr("fill-opacity", .58);
        fadeIn(bars, .05, .35);
      } else if (r > c) {
        const xs = scales.get(col), ys = scales.get(row);
        const dots = svg.append("g").selectAll("circle").data(data.filter((_, i) => i % 3 === 0)).join("circle")
          .attr("cx", d => x0 + xs(d[col])).attr("cy", d => y0 + size - ys(d[row]))
          .attr("fill", palette.purple).attr("fill-opacity", .75);
        grow(dots, "r", 1.2, 2.5, .03, .35);
      } else {
        const corr = pearson(col, row);
        svg.append("rect")
          .attr("data-correlation", corr.toFixed(4))
          .attr("data-x-variable", col)
          .attr("data-y-variable", row)
          .attr("x", x0 + 10).attr("y", y0 + 10).attr("width", size - 20).attr("height", size - 20)
          .attr("fill", corr >= 0 ? palette.blueHighlight : palette.redHighlight)
          .attr("fill-opacity", .35 + Math.abs(corr) * .55)
          .attr("stroke", corr >= 0 ? palette.blue : palette.red);
        svg.append("text").attr("class", "mark-label").attr("x", x0 + size / 2).attr("y", y0 + size / 2 + 4).attr("text-anchor", "middle")
          .text(`r=${d3.format("+.2f")(corr)}`);
      }
    }));
    vars.forEach((v, i) => svg.append("text").attr("class", "mark-label").attr("x", origin.x + i * (size + gap) + size / 2).attr("y", 44).attr("text-anchor", "middle").text(v));
  }
```
