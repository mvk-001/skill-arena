# Nucleus Sampling

- **Pattern ID:** `d3-nucleus-sampling`
- **Gallery source ID:** `nucleus-sampling`
- **Family:** LLM
- **Use when:** Top-p keeps the smallest token set whose cumulative probability crosses a threshold.
- **Renderer:** `renderNucleusSampling`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderNucleusSampling() {
    const svg = prepareSvg("nucleus-sampling", "Nucleus sampling", "Top-p keeps the smallest ordered set whose cumulative probability exceeds the threshold.");
    const p = .86;
    const tokens = [
      { token: "answer", prob: .39, color: palette.blue },
      { token: "explain", prob: .22, color: palette.green },
      { token: "show", prob: .15, color: palette.orange },
      { token: "derive", prob: .10, color: palette.red },
      { token: "maybe", prob: .06, color: palette.gray400 },
      { token: "wildcard", prob: .04, color: palette.gray300 },
      { token: "noise", prob: .03, color: palette.gray300 },
      { token: "other", prob: .01, color: palette.gray300 }
    ];
    let cumulative = 0;
    tokens.forEach(token => {
      token.x0 = cumulative;
      cumulative += token.prob;
      token.x1 = cumulative;
      token.included = token.x0 < p;
    });
    const strip = { x: 54, y: 126, w: 452, h: 52 };
    svg.append("rect").attr("x", strip.x).attr("y", strip.y).attr("width", strip.w).attr("height", strip.h).attr("rx", 8).attr("fill", palette.gray100);
    const rects = svg.append("g").selectAll("rect.nucleus-segment").data(tokens).join("rect")
      .attr("class", "nucleus-segment")
      .attr("x", d => strip.x + d.x0 * strip.w)
      .attr("y", strip.y)
      .attr("width", d => d.prob * strip.w)
      .attr("height", strip.h)
      .attr("rx", 6)
      .attr("fill", d => d.included ? d.color : palette.gray300)
      .attr("fill-opacity", d => d.included ? .86 : .34)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.5);
    fadeIn(rects, .12, .45);
    svg.append("line")
      .attr("x1", strip.x + p * strip.w)
      .attr("x2", strip.x + p * strip.w)
      .attr("y1", strip.y - 22)
      .attr("y2", strip.y + strip.h + 28)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2.6)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".22s")
      .attr("begin", "1.05s")
      .attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", strip.x + p * strip.w - 6).attr("y", strip.y - 30).attr("text-anchor", "end").attr("font-weight", 800).text("p = 0.86");
    const pills = svg.append("g").selectAll("g.nucleus-pill").data(tokens).join("g")
      .attr("class", "nucleus-pill")
      .attr("transform", (d, i) => `translate(${64 + (i % 4) * 122},${236 + Math.floor(i / 4) * 58})`)
      .attr("opacity", 0);
    pills.append("rect").attr("width", 104).attr("height", 34).attr("rx", 8).attr("fill", d => d.included ? palette.surface : palette.gray100).attr("stroke", d => d.included ? d.color : palette.gray300).attr("stroke-width", d => d.included ? 2 : 1.2);
    pills.append("text").attr("class", "mark-label").attr("x", 52).attr("y", 22).attr("text-anchor", "middle").style("font-size", "12px").text(d => d.token);
    pills.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", d => d.included ? 1 : .38).attr("dur", ".24s").attr("begin", (d, i) => `${.55 + i * .06}s`).attr("fill", "freeze");
  }
```
