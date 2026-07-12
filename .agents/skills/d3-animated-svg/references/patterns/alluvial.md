# Alluvial Bands

- **Pattern ID:** `d3-alluvial`
- **Gallery source ID:** `alluvial`
- **Family:** Flow
- **Use when:** Category handoffs as layered flowing ribbons.
- **Renderer:** `renderAlluvial`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAlluvial() {
    const svg = prepareSvg("alluvial", "Alluvial bands", "Layered D3 path ribbons show categorical handoffs.");
    const left = ["Acquire", "Engage", "Support"];
    const right = ["Retain", "Expand", "Churn"];
    const flows = [
      ["Acquire", "Retain", 18], ["Acquire", "Expand", 8], ["Acquire", "Churn", 5],
      ["Engage", "Retain", 14], ["Engage", "Expand", 18], ["Engage", "Churn", 4],
      ["Support", "Retain", 9], ["Support", "Expand", 7], ["Support", "Churn", 12]
    ].map(([source, target, value]) => ({ source, target, value }));
    const leftTotals = new Map(left.map(name => [name, d3.sum(flows.filter(d => d.source === name), d => d.value)]));
    const rightTotals = new Map(right.map(name => [name, d3.sum(flows.filter(d => d.target === name), d => d.value)]));
    const scale = d3.scaleLinear().domain([0, d3.max([...leftTotals.values(), ...rightTotals.values()])]).range([0, 86]);
    const x0 = 94, x1 = width - 94, top = 76, gap = 30;
    const stackedPositions = (names, totals) => {
      const positions = new Map();
      let y = top;
      names.forEach(name => {
        positions.set(name, y);
        y += Math.max(8, scale(totals.get(name))) + gap;
      });
      return positions;
    };
    const leftY = stackedPositions(left, leftTotals);
    const rightY = stackedPositions(right, rightTotals);
    const leftOffset = new Map(left.map(name => [name, 0]));
    const rightOffset = new Map(right.map(name => [name, 0]));
    const band = d => {
      const h = Math.max(7, scale(d.value));
      const sy0 = leftY.get(d.source) + leftOffset.get(d.source);
      const ty0 = rightY.get(d.target) + rightOffset.get(d.target);
      leftOffset.set(d.source, leftOffset.get(d.source) + h);
      rightOffset.set(d.target, rightOffset.get(d.target) + h);
      const sy1 = sy0 + h, ty1 = ty0 + h, cx = (x0 + x1) / 2;
      return { ...d, h, path: `M${x0},${sy0} C${cx},${sy0} ${cx},${ty0} ${x1},${ty0} L${x1},${ty1} C${cx},${ty1} ${cx},${sy1} ${x0},${sy1} Z` };
    };
    const ribbons = svg.append("g").selectAll("path").data(flows.map(band)).join("path")
      .attr("d", d => d.path)
      .attr("fill", d => colors[left.indexOf(d.source)])
      .attr("fill-opacity", .32)
      .attr("stroke", d => colors[left.indexOf(d.source)])
      .attr("stroke-width", .8);
    fadeIn(ribbons, .08, .85);
    [left, right].forEach((side, si) => {
      const x = si === 0 ? x0 - 20 : x1 + 20;
      const totals = si === 0 ? leftTotals : rightTotals;
      const yMap = si === 0 ? leftY : rightY;
      svg.append("g").selectAll("rect").data(side).join("rect")
        .attr("x", si === 0 ? x0 - 32 : x1 + 14)
        .attr("y", d => yMap.get(d))
        .attr("width", 18)
        .attr("height", d => Math.max(8, scale(totals.get(d))))
        .attr("fill", (d, i) => si === 0 ? colors[i] : "#6f7b8a");
      svg.append("g").selectAll("text").data(side).join("text")
        .attr("class", "mark-label")
        .attr("x", x)
        .attr("y", d => yMap.get(d) + scale(totals.get(d)) / 2 + 4)
        .attr("text-anchor", si === 0 ? "end" : "start")
        .text(d => d);
    });
  }
```
