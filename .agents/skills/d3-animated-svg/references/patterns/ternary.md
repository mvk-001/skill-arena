# Ternary Plot

- **Pattern ID:** `d3-ternary`
- **Gallery source ID:** `ternary`
- **Family:** Composition
- **Use when:** Three-part mixtures mapped into simplex space.
- **Renderer:** `renderTernary`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTernary() {
    const svg = prepareSvg("ternary", "Ternary plot", "Three-component compositions are projected into triangular simplex coordinates.");
    const triangle = [[280, 58], [92, 330], [468, 330]];
    const toPoint = d => [
      triangle[0][0] * d.a + triangle[1][0] * d.b + triangle[2][0] * d.c,
      triangle[0][1] * d.a + triangle[1][1] * d.b + triangle[2][1] * d.c
    ];
    const data = d3.range(28).map(i => {
      const a = 0.18 + (i % 7) * .07;
      const b = 0.12 + ((i * 3) % 8) * .06;
      const sum = Math.min(.92, a + b);
      return { a: a / sum * .78, b: b / sum * .78, c: .22, group: i % 3 };
    }).map(d => {
      const total = d.a + d.b + d.c;
      return { ...d, a: d.a / total, b: d.b / total, c: d.c / total };
    });
    const outline = svg.append("path")
      .attr("d", `M${triangle[0]}L${triangle[1]}L${triangle[2]}Z`)
      .attr("fill", palette.gray50).attr("stroke", palette.gray300).attr("stroke-width", 1.5);
    fadeIn(outline, .04, .5);
    d3.range(.2, 1, .2).forEach(t => {
      const ab = toPoint({ a: t, b: 1 - t, c: 0 });
      const ac = toPoint({ a: t, b: 0, c: 1 - t });
      const ba = toPoint({ a: 1 - t, b: t, c: 0 });
      const bc = toPoint({ a: 0, b: t, c: 1 - t });
      const ca = toPoint({ a: 1 - t, b: 0, c: t });
      const cb = toPoint({ a: 0, b: 1 - t, c: t });
      [[ab, ac], [ba, bc], [ca, cb]].forEach(pair => svg.append("line")
        .attr("x1", pair[0][0]).attr("y1", pair[0][1]).attr("x2", pair[1][0]).attr("y2", pair[1][1])
        .attr("stroke", "#dbe2ea").attr("stroke-width", .8));
    });
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => toPoint(d)[0]).attr("cy", d => toPoint(d)[1])
      .attr("fill", d => colors[d.group]).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1, 6, .08, .62);
    [["A", triangle[0][0], triangle[0][1] - 16], ["B", triangle[1][0] - 16, triangle[1][1] + 18], ["C", triangle[2][0] + 16, triangle[2][1] + 18]].forEach(([label, x, y]) => {
      svg.append("text").attr("class", "mark-label").attr("x", x).attr("y", y).attr("text-anchor", "middle").text(label);
    });
  }
```
