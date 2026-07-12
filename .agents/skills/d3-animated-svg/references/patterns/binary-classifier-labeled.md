# Binary Classifier Labels

- **Pattern ID:** `d3-binary-classifier-labeled`
- **Gallery source ID:** `binary-classifier-labeled`
- **Family:** AI
- **Use when:** The same binary decision includes feature, probability, and class labels.
- **Renderer:** `renderBinaryClassifierLabeled`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBinaryClassifierLabeled() {
    const svg = prepareSvg("binary-classifier-labeled", "Binary classifier with labels", "A binary classifier labels features, probabilities, and the selected class.");
    const layout = mlpLayout([3, 4, 2], [78, 416], [118, 286]);
    const layerNames = ["features", "hidden", "probability"];
    const nodeLabels = [
      ["x1", "x2", "x3"],
      ["h1", "h2", "h3", "h4"],
      ["p1", "p0"]
    ];
    layout.nodes.forEach(d => {
      d.r = d.layer === 2 ? 18 : 16;
      d.label = nodeLabels[d.layer][d.index];
      d.active = true;
      d.pulseLayers = d.layer === 0 ? [0, 3] : d.layer === 1 ? [1, 4] : [d.index === 0 ? 2 : 5];
    });
    const delayForLayer = layer => .25 + layer * 1.28;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .34)
      .attr("stroke-linecap", "round");
    svg.append("g").selectAll("text.layer").data(layout.layers).join("text")
      .attr("class", "mark-label layer")
      .attr("text-anchor", "middle")
      .attr("x", layer => layer[0].x)
      .attr("y", 76)
      .text((_, i) => layerNames[i]);
    const groups = svg.append("g").selectAll("g.neuron").data(layout.nodes, d => d.id).join("g")
      .attr("class", "neuron")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", palette.gray200);
    pulseMlpNodes(circles.filter(d => d.active), delayForLayer);
    const labels = groups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.label);
    pulseMlpText(labels.filter(d => d.active), delayForLayer);

    const resultData = [
      { label: "class 1", probability: "p = 0.83", pulseLayer: 2, y: layout.layers[2][0].y },
      { label: "class 0", probability: "p = 0.71", pulseLayer: 5, y: layout.layers[2][1].y }
    ];
    const results = svg.append("g").selectAll("g.result").data(resultData).join("g")
      .attr("class", "result")
      .attr("transform", d => `translate(496,${d.y})`)
      .attr("opacity", 0);
    results.append("rect")
      .attr("x", -46)
      .attr("y", -26)
      .attr("width", 92)
      .attr("height", 52)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    results.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", -5)
      .text(d => d.label);
    results.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", 14)
      .text(d => d.probability);
    pulseMlpVisibility(results, delayForLayer);

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 84)
      .attr("y", 336)
      .text("binary threshold: p >= 0.5");
  }
```
