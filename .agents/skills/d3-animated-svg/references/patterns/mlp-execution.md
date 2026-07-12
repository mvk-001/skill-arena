# Deep Learning Model Execution

- **Pattern ID:** `d3-mlp-execution`
- **Gallery source ID:** `mlp-execution`
- **Family:** AI
- **Use when:** A square model frame contains only an internal MLP pulsing through execution.
- **Renderer:** `renderDeepLearningModelExecution`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDeepLearningModelExecution() {
    const svg = prepareSvg("mlp-execution", "Deep learning model execution", "A square model frame contains only an internal multilayer network pulsing through execution.");
    const model = { x: 150, y: 80, size: 260 };
    const network = {
      x0: model.x + 52,
      x1: model.x + model.size - 52,
      y0: model.y + 58,
      y1: model.y + model.size - 58,
      layers: [4, 5, 5, 3]
    };

    const modelGroup = svg.append("g").attr("class", "model-execution-square");
    modelGroup.append("rect")
      .attr("x", model.x)
      .attr("y", model.y)
      .attr("width", model.size)
      .attr("height", model.size)
      .attr("rx", 0)
      .attr("fill", palette.surface)
      .attr("stroke", palette.red)
      .attr("stroke-width", 4);

    const xScale = d3.scalePoint().domain(d3.range(network.layers.length)).range([network.x0, network.x1]);
    const nodes = network.layers.flatMap((count, layer) => {
      const yScale = d3.scalePoint().domain(d3.range(count)).range([network.y0, network.y1]);
      return d3.range(count).map(index => ({
        id: `${layer}-${index}`,
        layer,
        index,
        x: xScale(layer),
        y: yScale(index)
      }));
    });
    const byLayer = d3.group(nodes, d => d.layer);
    const links = [];
    for (let layer = 0; layer < network.layers.length - 1; layer += 1) {
      byLayer.get(layer).forEach(source => {
        byLayer.get(layer + 1).forEach(target => links.push({ source, target, layer: layer + 1 }));
      });
    }
    const networkGroup = modelGroup.append("g").attr("class", "model-execution-network");
    networkGroup.selectAll("line")
      .data(links)
      .join("line")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .72)
      .attr("stroke-linecap", "round");
    networkGroup.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 9.2)
      .attr("fill", palette.gray200)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2);

    const activeNodes = modelGroup.append("g").selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 9.2)
      .attr("fill", palette.red)
      .attr("stroke", palette.red)
      .attr("stroke-width", 2)
      .attr("opacity", 0);
    activeNodes.each(function (d) {
      const node = d3.select(this);
      node.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1;0")
        .attr("keyTimes", "0;.18;.62;1")
        .attr("dur", "1.05s")
        .attr("begin", `${.35 + d.layer * .5}s`)
        .attr("repeatCount", "indefinite");
      node.append("animate")
        .attr("attributeName", "r")
        .attr("values", "9.2;14.8;11;9.2")
        .attr("keyTimes", "0;.18;.62;1")
        .attr("dur", "1.05s")
        .attr("begin", `${.35 + d.layer * .5}s`)
        .attr("repeatCount", "indefinite");
    });
  }
```
