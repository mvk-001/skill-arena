# Word Cloud

- **Pattern ID:** `d3-word-cloud`
- **Gallery source ID:** `word-cloud`
- **Family:** Text
- **Use when:** Weighted terms occupy an animated text layout.
- **Renderer:** `renderWordCloud`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderWordCloud() {
    const svg = prepareSvg("word-cloud", "Word cloud", "Weighted text marks are placed around a compact semantic center.");
    const terms = [
      ["D3", 100], ["SVG", 82], ["layout", 68], ["scales", 58], ["joins", 54], ["force", 46],
      ["paths", 43], ["axis", 38], ["hierarchy", 36], ["voronoi", 34], ["motion", 31], ["shape", 29],
      ["data", 27], ["brush", 25], ["ticks", 23], ["ribbon", 21], ["cells", 19], ["labels", 18]
    ].map(([text, value], i) => ({ text, value, i }));
    const size = d3.scaleSqrt().domain(d3.extent(terms, d => d.value)).range([14, 54]);
    const color = d3.scaleOrdinal(terms.map(d => d.text), [palette.ink, palette.blue, palette.red, palette.orange, palette.green, palette.purple, palette.gray700]);
    const boxes = [];
    const placed = terms.map((d, i) => {
      const fontSize = size(d.value);
      const rotate = i === 0 ? 0 : i % 5 === 0 ? -24 : i % 4 === 0 ? 22 : 0;
      const textWidth = estimateSvgTextWidth(d.text, fontSize);
      const textHeight = fontSize * 1.08;
      const radians = Math.abs(rotate) * Math.PI / 180;
      const boxWidth = Math.abs(textWidth * Math.cos(radians)) + Math.abs(textHeight * Math.sin(radians));
      const boxHeight = Math.abs(textWidth * Math.sin(radians)) + Math.abs(textHeight * Math.cos(radians));
      let position = { x: width / 2, y: height / 2 };
      let accepted = false;
      for (let step = 0; step < 1200; step += 1) {
        const angle = i * 1.17 + step * 2.399963;
        const radius = i === 0 ? 0 : 8 + Math.sqrt(step) * 7.2;
        const x = width / 2 + Math.cos(angle) * radius * 1.18;
        const y = height / 2 + Math.sin(angle) * radius * .76;
        const candidate = {
          x0: x - boxWidth / 2,
          y0: y - boxHeight / 2,
          x1: x + boxWidth / 2,
          y1: y + boxHeight / 2
        };
        const inside = candidate.x0 >= 28 && candidate.x1 <= width - 28 && candidate.y0 >= 36 && candidate.y1 <= height - 36;
        const clear = !boxes.some(box => candidate.x0 < box.x1 + 5 && candidate.x1 + 5 > box.x0 && candidate.y0 < box.y1 + 4 && candidate.y1 + 4 > box.y0);
        if (inside && clear) {
          position = { x, y };
          boxes.push(candidate);
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        position = { x: 62 + (i % 6) * 86, y: 76 + Math.floor(i / 6) * 120 };
        boxes.push({ x0: position.x - boxWidth / 2, y0: position.y - boxHeight / 2, x1: position.x + boxWidth / 2, y1: position.y + boxHeight / 2 });
      }
      return { ...d, ...position, rotate, fontSize };
    });
    svg.attr("data-layout", "collision-aware-spiral").attr("data-word-count", terms.length);
    const words = svg.append("g").selectAll("text").data(placed).join("text")
      .attr("class", "word-mark")
      .attr("data-word", d => d.text)
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", d => d.fontSize)
      .attr("font-weight", d => d.value > 50 ? 750 : 600)
      .attr("fill", d => color(d.text))
      .attr("transform", d => `rotate(${d.rotate},${d.x},${d.y})`)
      .text(d => d.text);
    fadeIn(words, .04, .7);
    words.each(function (_, i) {
      d3.select(this).append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "scale")
        .attr("additive", "sum")
        .attr("from", ".82")
        .attr("to", "1")
        .attr("dur", ".65s")
        .attr("begin", `${i * .025}s`)
        .attr("fill", "freeze");
    });
  }
```
