# Token Probability Sampler

- **Pattern ID:** `d3-token-sampler`
- **Gallery source ID:** `token-sampler`
- **Family:** LLM
- **Use when:** Candidate next tokens compete by probability before one token is sampled.
- **Renderer:** `renderTokenProbabilitySampler`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTokenProbabilitySampler() {
    const svg = prepareSvg("token-sampler", "Token probability sampler", "A next-token distribution is sampled by cumulative probability.");
    const tokens = [
      { text: "the", p: .34, color: palette.blue },
      { text: "code", p: .23, color: palette.red, selected: true },
      { text: "model", p: .17, color: palette.green },
      { text: "next", p: .11, color: palette.orange },
      { text: "blue", p: .08, color: palette.purple },
      { text: ".", p: .07, color: palette.gray500 }
    ];
    let cumulative = 0;
    tokens.forEach(token => {
      token.x0 = cumulative;
      cumulative += token.p;
      token.x1 = cumulative;
    });
    const sampleU = .47;
    const selected = tokens.find(token => sampleU >= token.x0 && sampleU < token.x1);
    const x = d3.scaleLinear().domain([0, .38]).range([134, 476]);
    const y = d3.scaleBand().domain(tokens.map(d => d.text)).range([72, 246]).padding(.28);

    svg.append("g").selectAll("text.token-label").data(tokens).join("text")
      .attr("class", "mark-label token-label")
      .attr("x", 68)
      .attr("y", d => y(d.text) + y.bandwidth() / 2 + 5)
      .attr("text-anchor", "end")
      .text(d => d.text);
    const bars = svg.append("g").selectAll("rect.probability-bar").data(tokens).join("rect")
      .attr("class", "probability-bar")
      .attr("x", x(0))
      .attr("y", d => y(d.text))
      .attr("width", d => x(d.p) - x(0))
      .attr("height", y.bandwidth())
      .attr("rx", 5)
      .attr("fill", d => d.selected ? palette.red : d.color)
      .attr("fill-opacity", d => d.selected ? .92 : .68);
    bars.append("animate")
      .attr("attributeName", "width")
      .attr("from", 0)
      .attr("to", d => x(d.p) - x(0))
      .attr("dur", ".72s")
      .attr("begin", (d, i) => `${.1 + i * .06}s`)
      .attr("fill", "freeze");

    svg.append("g").selectAll("text.probability-value").data(tokens).join("text")
      .attr("class", "caption")
      .attr("x", d => x(d.p) + 8)
      .attr("y", d => y(d.text) + y.bandwidth() / 2 + 4)
      .text(d => `${Math.round(d.p * 100)}%`);

    const strip = { x: 66, y: 304, w: 428, h: 30 };
    const segments = svg.append("g").selectAll("rect.cumulative-token").data(tokens).join("rect")
      .attr("class", "cumulative-token")
      .attr("x", d => strip.x + d.x0 * strip.w)
      .attr("y", strip.y)
      .attr("width", d => d.p * strip.w)
      .attr("height", strip.h)
      .attr("rx", 4)
      .attr("fill", d => d.selected ? palette.red : d.color)
      .attr("fill-opacity", d => d.selected ? .92 : .62)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.4);
    fadeIn(segments, .55, .5);

    const selectedX = strip.x + sampleU * strip.w;
    const selectionLine = svg.append("line")
      .attr("x1", selectedX).attr("x2", selectedX)
      .attr("y1", strip.y - 12).attr("y2", strip.y + strip.h + 16)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0);
    selectionLine.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".2s").attr("begin", "1.85s").attr("fill", "freeze");

    const path = svg.append("path")
      .attr("id", "token-sampler-path")
      .attr("d", `M${strip.x},${strip.y - 24}C${strip.x + 120},${strip.y - 64} ${selectedX - 100},${strip.y - 58} ${selectedX},${strip.y - 24}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);
    drawPath(path, .85, 1);
    const sampler = svg.append("circle")
      .attr("r", 8)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    sampler.append("animateMotion")
      .attr("dur", "1.65s")
      .attr("begin", ".45s")
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#token-sampler-path");

    const result = svg.append("g").attr("opacity", 0);
    result.append("rect").attr("x", 186).attr("y", 356).attr("width", 188).attr("height", 36).attr("rx", 8).attr("fill", palette.redHighlight).attr("stroke", palette.red);
    result.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 379).attr("text-anchor", "middle").attr("font-weight", 800).text(`sampled: ${selected.text}`);
    result.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".25s").attr("begin", "2.15s").attr("fill", "freeze");
  }
```
