# Matmul Tile Accumulation

- **Pattern ID:** `d3-tiled-matmul`
- **Gallery source ID:** `tiled-matmul`
- **Family:** Matrix
- **Use when:** A and B tiles sweep into C while partial products accumulate.
- **Renderer:** `renderMatmulTileAccumulation`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMatmulTileAccumulation() {
    const svg = prepareSvg("tiled-matmul", "Matmul tile accumulation", "Matrix multiplication as tiled A and B blocks accumulating partial sums into an output tile.");
    const n = 4;
    const cell = 24;
    const band = d3.scaleBand().domain(d3.range(n)).range([0, 112]).paddingInner(.12);
    const bw = band.bandwidth();
    const matrices = {
      A: { x: 62, y: 142, color: palette.blue, active: d => d.row >= 2 && d.col <= 1 },
      B: { x: 226, y: 80, color: palette.orange, active: d => d.row <= 1 && d.col >= 2 },
      C: { x: 376, y: 158, color: palette.green, active: d => d.row >= 2 && d.col >= 2 }
    };
    const cells = d3.range(n * n).map(index => ({ row: Math.floor(index / n), col: index % n, index }));

    const drawMatrix = (name, matrix, label) => {
      const group = svg.append("g").attr("transform", `translate(${matrix.x},${matrix.y})`);
      group.append("text").attr("class", "mark-label").attr("x", 56).attr("y", -20).attr("text-anchor", "middle").attr("font-weight", 800).text(label);
      group.append("rect").attr("x", -10).attr("y", -10).attr("width", 132).attr("height", 132).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      const rects = group.selectAll(`rect.${name}-cell`).data(cells).join("rect")
        .attr("class", `${name}-cell`)
        .attr("x", d => band(d.col))
        .attr("y", d => band(d.row))
        .attr("width", bw)
        .attr("height", bw)
        .attr("rx", 4)
        .attr("fill", d => matrix.active(d) ? matrix.color : palette.gray100)
        .attr("fill-opacity", d => matrix.active(d) ? .62 : .48)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.2);
      rects.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".28s")
        .attr("begin", d => `${.08 + d.index * .008}s`)
        .attr("fill", "freeze");
      const activeCol = name === "B" || name === "C" ? 2 : 0;
      const activeRow = name === "A" || name === "C" ? 2 : 0;
      const outline = group.append("rect")
        .attr("x", band(activeCol) - 5)
        .attr("y", band(activeRow) - 5)
        .attr("width", band.step() * 2 - 3)
        .attr("height", band.step() * 2 - 3)
        .attr("rx", 7)
        .attr("fill", "none")
        .attr("stroke", matrix.color)
        .attr("stroke-width", 3)
        .attr("opacity", 0);
      outline.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.55;1").attr("dur", "1.1s").attr("begin", name === "C" ? "1.15s" : ".55s").attr("fill", "freeze");
      return group;
    };

    drawMatrix("A", matrices.A, "A tile");
    drawMatrix("B", matrices.B, "B tile");
    drawMatrix("C", matrices.C, "C output");

    const tileCenter = (matrix, col, row) => ({
      x: matrix.x + band(col) + (band.step() * 2 - 3) / 2,
      y: matrix.y + band(row) + (band.step() * 2 - 3) / 2
    });
    const aCenter = tileCenter(matrices.A, 0, 2);
    const bCenter = tileCenter(matrices.B, 2, 0);
    const cCenter = tileCenter(matrices.C, 2, 2);
    [
      { id: "a", from: aCenter, mid: { x: 250, y: 250 }, stroke: palette.blue, begin: .7 },
      { id: "b", from: bCenter, mid: { x: 306, y: 106 }, stroke: palette.orange, begin: .82 }
    ].forEach(route => {
      const path = svg.append("path")
        .attr("id", `tiled-matmul-${route.id}-route`)
        .attr("d", `M${route.from.x},${route.from.y}C${route.mid.x},${route.mid.y} ${cCenter.x - 70},${cCenter.y} ${cCenter.x},${cCenter.y}`)
        .attr("fill", "none")
        .attr("stroke", route.stroke)
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("stroke-opacity", .66);
      drawPath(path, route.begin, .86);
      d3.range(3).forEach(i => {
        const dot = svg.append("circle").attr("r", 4.8).attr("fill", route.stroke).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${route.begin + .1 + i * .18}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#tiled-matmul-${route.id}-route`);
      });
    });

    const kSteps = d3.range(4).map(k => ({ k, x: 102 + k * 92, value: 18 + k * 11 }));
    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 324).attr("text-anchor", "middle").text("partial sums across k");
    svg.append("g").selectAll("g.matmul-k").data(kSteps).join("g")
      .attr("class", "matmul-k")
      .attr("transform", d => `translate(${d.x},342)`)
      .each(function (d) {
        const group = d3.select(this);
        group.append("rect").attr("x", -24).attr("y", 0).attr("width", 48).attr("height", 26).attr("rx", 7).attr("fill", palette.gray100).attr("stroke", palette.gray300);
        const fill = group.append("rect").attr("x", -24).attr("y", 0).attr("width", 48).attr("height", 26).attr("rx", 7).attr("fill", d.k % 2 ? palette.orange : palette.blue).attr("fill-opacity", .58);
        fill.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", 48).attr("dur", ".28s").attr("begin", `${1.1 + d.k * .18}s`).attr("fill", "freeze");
        group.append("text").attr("class", "reverse-label").attr("x", 0).attr("y", 17).attr("text-anchor", "middle").attr("font-weight", 800).style("font-size", "10px").text(`k${d.k}`);
      });

    const cPulse = svg.append("rect")
      .attr("x", matrices.C.x + band(2) - 6)
      .attr("y", matrices.C.y + band(2) - 6)
      .attr("width", band.step() * 2 - 2)
      .attr("height", band.step() * 2 - 2)
      .attr("rx", 8)
      .attr("fill", palette.green)
      .attr("fill-opacity", .08)
      .attr("stroke", palette.red)
      .attr("stroke-width", 3)
      .attr("opacity", 0);
    cPulse.append("animate").attr("attributeName", "opacity").attr("values", "0;.9;.25;.8").attr("dur", "1.1s").attr("begin", "1.25s").attr("fill", "freeze");
    svg.append("text").attr("class", "caption").attr("x", cCenter.x).attr("y", cCenter.y + 70).attr("text-anchor", "middle").text("C block keeps accumulating");
  }
```
