# Token Roulette Sampler

- **Pattern ID:** `d3-token-roulette`
- **Gallery source ID:** `token-roulette`
- **Family:** LLM
- **Use when:** A probability wheel spins, then reveals the selected token.
- **Renderer:** `renderTokenRouletteSampler`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTokenRouletteSampler() {
    const svg = prepareSvg("token-roulette", "Token roulette sampler", "A probability-weighted roulette wheel spins before landing on a sampled next token.");
    const tokens = [
      { text: "the", p: .34, color: palette.blue },
      { text: "code", p: .23, color: palette.red, selected: true },
      { text: "model", p: .17, color: palette.green },
      { text: "next", p: .11, color: palette.orange },
      { text: "blue", p: .08, color: palette.purple },
      { text: ".", p: .07, color: palette.gray500 }
    ];
    const selected = tokens.find(d => d.selected);
    const cx = 198;
    const cy = 214;
    const outerR = 112;
    const innerR = 0;
    const pie = d3.pie().sort(null).value(d => d.p);
    const arcs = pie(tokens);
    const selectedArc = arcs.find(d => d.data.selected);
    const selectedCenterDeg = ((selectedArc.startAngle + selectedArc.endAngle) / 2) * 180 / Math.PI;
    const finalRotation = 1440 - selectedCenterDeg;
    const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(4).padAngle(.012);

    svg.append("circle")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", outerR + 10)
      .attr("fill", palette.gray100)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);
    const wheel = svg.append("g").attr("transform", `translate(${cx},${cy})`).attr("class", "token-roulette-wheel");

    const wedgeGroups = wheel.selectAll("g.token-roulette-wedge").data(arcs).join("g")
      .attr("class", "token-roulette-wedge");
    wedgeGroups.append("path")
      .attr("d", arc)
      .attr("fill", d => d.data.color)
      .attr("fill-opacity", d => d.data.selected ? .94 : .72)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2);
    wedgeGroups.append("path")
      .filter(d => d.data.selected)
      .attr("d", d3.arc().innerRadius(innerR).outerRadius(outerR + 5).cornerRadius(5).padAngle(.012))
      .attr("fill", "none")
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 3.2)
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".25s")
      .attr("begin", "3.45s")
      .attr("fill", "freeze");
    wheel.append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "rotate")
      .attr("additive", "sum")
      .attr("values", `0;760;1180;${finalRotation}`)
      .attr("keyTimes", "0;.42;.72;1")
      .attr("keySplines", ".25 .7 .35 1;.18 .8 .32 1;.12 .9 .25 1")
      .attr("calcMode", "spline")
      .attr("dur", "3.1s")
      .attr("begin", ".25s")
      .attr("fill", "freeze");

    const legend = svg.append("g").attr("transform", "translate(352,104)");
    const legendRows = legend.selectAll("g").data(tokens).join("g")
      .attr("transform", (d, i) => `translate(0,${i * 24})`);
    legendRows.append("rect")
      .attr("width", 13)
      .attr("height", 13)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => d.selected ? .94 : .7);
    legendRows.append("text")
      .attr("class", "mark-label")
      .attr("x", 20)
      .attr("y", 11)
      .style("font-size", "11px")
      .attr("font-weight", d => d.selected ? 800 : 600)
      .text(d => `${d.text} ${Math.round(d.p * 100)}%`);

    const pointer = svg.append("g").attr("transform", `translate(${cx},${cy - outerR - 18})`);
    pointer.append("path")
      .attr("d", "M0,0L-13,-24H13Z")
      .attr("fill", palette.red)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round");
    pointer.append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 4)
      .attr("fill", palette.redHover);

    const tickLayer = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    d3.range(24).forEach(i => {
      const angle = i * 15 * Math.PI / 180;
      const r0 = outerR + 6;
      const r1 = outerR + (i % 3 === 0 ? 15 : 11);
      tickLayer.append("line")
        .attr("x1", Math.sin(angle) * r0)
        .attr("y1", -Math.cos(angle) * r0)
        .attr("x2", Math.sin(angle) * r1)
        .attr("y2", -Math.cos(angle) * r1)
        .attr("stroke", i % 3 === 0 ? palette.gray600 : palette.gray300)
        .attr("stroke-width", i % 3 === 0 ? 1.6 : 1);
    });

    const result = svg.append("g").attr("class", "token-roulette-result").attr("opacity", 0);
    result.append("rect").attr("x", 354).attr("y", 272).attr("width", 112).attr("height", 48).attr("rx", 10).attr("fill", palette.redHighlight).attr("stroke", palette.red);
    result.append("text").attr("class", "mark-label").attr("x", 410).attr("y", 303).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800).attr("fill", palette.redHover).text(selected.text);
    result.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".28s").attr("begin", "3.48s").attr("fill", "freeze");
  }
```
