# MLP Internals

- **Pattern ID:** `d3-mlp-internals`
- **Gallery source ID:** `mlp-internals`
- **Family:** AI
- **Use when:** A forward pass pulses neurons while x, z, a, W, b, and y_hat stay visible.
- **Renderer:** `renderMlpInternals`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMlpInternals() {
    const svg = prepareSvg("mlp-internals", "MLP internal variables", "A multilayer perceptron reveals internal variables during layer activation.");
    const layout = mlpLayout([3, 4, 3, 2], [78, width - 68], [120, 294]);
    const layerNames = ["input x", "z1 / a1", "z2 / a2", "output y_hat"];
    const nodeLabels = [
      ["x1", "x2", "x3"],
      ["a1", "a2", "a3", "a4"],
      ["a1", "a2", "a3"],
      ["y1", "y2"]
    ];
    layout.nodes.forEach(d => {
      d.r = d.layer === 0 || d.layer === layout.layers.length - 1 ? 17 : 18;
      d.label = nodeLabels[d.layer][d.index];
    });
    const delayForLayer = layer => .25 + layer * 1.55;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .32)
      .attr("stroke-linecap", "round");

    const layerLabel = svg.append("g").selectAll("text").data(layout.layers, (_, i) => i).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("x", layer => layer[0].x)
      .attr("y", 62)
      .text((_, i) => layerNames[i]);

    const groups = svg.append("g").selectAll("g.neuron").data(layout.nodes, d => d.id).join("g")
      .attr("class", "neuron")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", palette.gray200);
    pulseMlpNodes(circles, delayForLayer);
    const labels = groups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.label);
    pulseMlpText(labels, delayForLayer);

    const bias = layout.layers.slice(1).map((layer, i) => ({
      id: `b${i + 1}`,
      x: layer[0].x,
      y: 88,
      layer: i + 1,
      index: 0,
      r: 9
    }));
    const biasGroups = svg.append("g").selectAll("g.bias").data(bias).join("g")
      .attr("class", "bias")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    biasGroups.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 9)
      .attr("y2", 13)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.4);
    const biasDots = biasGroups.append("circle")
      .attr("r", 9)
      .attr("fill", palette.gray200);
    pulseMlpNodes(biasDots, delayForLayer);
    const biasLabels = biasGroups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 3.5)
      .attr("font-size", 9)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.id);
    pulseMlpText(biasLabels, delayForLayer);

    const weightLabels = [
      { label: "W1", x: 156, y: 116, layer: 1 },
      { label: "W2", x: 292, y: 296, layer: 2 },
      { label: "W3", x: 432, y: 116, layer: 3 }
    ];
    const weights = svg.append("g").selectAll("text.weight").data(weightLabels).join("text")
      .attr("class", "mark-label weight")
      .attr("text-anchor", "middle")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .text(d => d.label);

    const formulas = [
      { text: "z = W*a + b", x: 122, layer: 1 },
      { text: "a = relu(z)", x: 286, layer: 2 },
      { text: "y_hat = softmax(z)", x: 450, layer: 3 }
    ];
    const formulaGroups = svg.append("g").selectAll("g.formula").data(formulas).join("g")
      .attr("class", "formula")
      .attr("transform", d => `translate(${d.x},340)`);
    formulaGroups.append("rect")
      .attr("x", -68)
      .attr("y", -17)
      .attr("width", 136)
      .attr("height", 30)
      .attr("rx", 5)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    formulaGroups.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", 3)
      .text(d => d.text);
  }
```
