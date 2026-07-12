# Binary Classifier

- **Pattern ID:** `d3-binary-classifier`
- **Gallery source ID:** `binary-classifier`
- **Family:** AI
- **Use when:** A forward pass routes one sample into one of two outcomes.
- **Renderer:** `renderBinaryClassifier`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBinaryClassifier() {
    const svg = prepareSvg("binary-classifier", "Binary classifier", "A binary classifier activates a winning output without visible labels.");
    const layout = mlpLayout([3, 4, 2], [82, 430], [112, 286]);
    layout.nodes.forEach(d => {
      d.r = d.layer === 2 ? 19 : 15;
      d.active = true;
      d.pulseLayers = d.layer === 0 ? [0, 3] : d.layer === 1 ? [1, 4] : [d.index === 0 ? 2 : 5];
    });
    const delayForLayer = layer => .24 + layer * 1.28;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", .62)
      .attr("stroke-linecap", "round");
    const decisionRegion = svg.append("g");
    decisionRegion.selectAll("circle.base").data([
      { cx: 504, cy: 162 },
      { cx: 504, cy: 270 }
    ]).join("circle")
      .attr("class", "base")
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("r", 26)
      .attr("fill", (d, i) => i === 0 ? palette.greenHighlight : palette.purpleHighlight)
      .attr("stroke", (d, i) => i === 0 ? palette.green : palette.purple)
      .attr("stroke-width", 1.6);
    const classPulse = decisionRegion.selectAll("circle.pulse").data([
      { layer: 2, pulseLayer: 2, r: 26, cx: 504, cy: 162 },
      { layer: 2, pulseLayer: 5, r: 26, cx: 504, cy: 270 }
    ]).join("circle")
      .attr("class", "pulse")
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("r", 26)
      .attr("fill", (_, i) => i === 0 ? palette.greenHighlight : palette.purpleHighlight)
      .attr("stroke", (_, i) => i === 0 ? palette.green : palette.purple)
      .attr("stroke-width", 1.6);
    pulseMlpNodes(classPulse, delayForLayer);
    const groups = svg.append("g").selectAll("g").data(layout.nodes, d => d.id).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => [palette.blueHighlight, palette.orangeHighlight, palette.greenHighlight][d.layer])
      .attr("stroke", d => [palette.blue, palette.orange, palette.green][d.layer])
      .attr("stroke-width", 1.4);
    pulseMlpNodes(circles.filter(d => d.active), delayForLayer);
  }
```
