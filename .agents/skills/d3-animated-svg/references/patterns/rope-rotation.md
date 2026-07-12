# RoPE Position Rotation

- **Pattern ID:** `d3-rope-rotation`
- **Gallery source ID:** `rope-rotation`
- **Family:** Transformer
- **Use when:** Position-indexed query and key vectors rotate before relative attention scoring.
- **Renderer:** `renderRopePositionRotation`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderRopePositionRotation() {
    const svg = prepareSvg("rope-rotation", "RoPE position rotation", "Rotary position embedding rotates query and key vectors by token position before attention scores are compared.");
    const positions = d3.range(5).map(index => ({
      index,
      x: d3.scalePoint().domain(d3.range(5)).range([76, 484])(index),
      angleQ: 12 + index * 24,
      angleK: -8 + index * 24,
      color: colors[index % colors.length]
    }));
    const radius = 32;

    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 62).attr("text-anchor", "middle").text("position rotates each 2D pair");
    positions.forEach((position, i) => {
      const group = svg.append("g").attr("transform", `translate(${position.x},158)`);
      group.append("circle").attr("r", radius + 7).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      group.append("line").attr("x1", -radius).attr("x2", radius).attr("y1", 0).attr("y2", 0).attr("stroke", palette.gray200);
      group.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -radius).attr("y2", radius).attr("stroke", palette.gray200);
      const arc = d3.arc().innerRadius(radius + 11).outerRadius(radius + 14).startAngle(0).endAngle(position.angleQ * Math.PI / 180);
      group.append("path").attr("d", arc()).attr("fill", position.color).attr("fill-opacity", .46);
      const qVector = group.append("g").attr("transform", `rotate(${position.angleQ})`);
      qVector.append("line").attr("x1", 0).attr("y1", 0).attr("x2", radius).attr("y2", 0).attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
      qVector.append("circle").attr("cx", radius).attr("cy", 0).attr("r", 4.5).attr("fill", palette.red);
      qVector.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", 0)
        .attr("to", position.angleQ)
        .attr("dur", ".8s")
        .attr("begin", `${.18 + i * .12}s`)
        .attr("fill", "freeze");
      const kVector = group.append("g").attr("transform", `rotate(${position.angleK})`);
      kVector.append("line").attr("x1", 0).attr("y1", 0).attr("x2", radius - 6).attr("y2", 0).attr("stroke", palette.blue).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
      kVector.append("circle").attr("cx", radius - 6).attr("cy", 0).attr("r", 3.8).attr("fill", palette.blue);
      kVector.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", 0)
        .attr("to", position.angleK)
        .attr("dur", ".8s")
        .attr("begin", `${.3 + i * .12}s`)
        .attr("fill", "freeze");
      group.append("text").attr("class", "caption").attr("x", 0).attr("y", 62).attr("text-anchor", "middle").text(`pos ${position.index}`);
      fadeIn(group, .08 + i * .06, .3);
    });

    const chart = svg.append("g").attr("transform", "translate(78,278)");
    const distances = d3.range(6).map(distance => ({ distance, score: .86 * Math.exp(-distance / 3.2) * Math.cos(distance * .42) + .08 }));
    const x = d3.scaleLinear().domain([0, 5]).range([0, 404]);
    const y = d3.scaleLinear().domain([-.35, 1]).range([74, 0]);
    chart.append("rect").attr("x", -12).attr("y", -16).attr("width", 432).attr("height", 112).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    chart.append("line").attr("x1", 0).attr("x2", 404).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", palette.gray300);
    chart.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -24).text("relative phase score by distance");
    chart.append("text").attr("class", "caption").attr("x", 404).attr("y", 94).attr("text-anchor", "end").text("token distance");
    const phaseLine = d3.line().x(d => x(d.distance)).y(d => y(d.score)).curve(d3.curveCatmullRom.alpha(.5));
    const path = chart.append("path").attr("d", phaseLine(distances)).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(path, 1.0, .8);
    chart.selectAll("circle.phase-point").data(distances).join("circle")
      .attr("class", "phase-point")
      .attr("cx", d => x(d.distance))
      .attr("cy", d => y(d.score))
      .attr("r", 4.8)
      .attr("fill", d => d.distance < 3 ? palette.green : palette.orange)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.4)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".24s")
      .attr("begin", d => `${1.15 + d.distance * .08}s`)
      .attr("fill", "freeze");
    const legend = svg.append("g").attr("transform", "translate(432,238)");
    [
      { label: "Q", color: palette.red },
      { label: "K", color: palette.blue }
    ].forEach((item, i) => {
      legend.append("line").attr("x1", 0).attr("x2", 22).attr("y1", i * 20).attr("y2", i * 20).attr("stroke", item.color).attr("stroke-width", 3);
      legend.append("text").attr("class", "mark-label").attr("x", 30).attr("y", i * 20 + 4).text(item.label);
    });
  }
```
