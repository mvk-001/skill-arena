# AI Line Writing

- **Pattern ID:** `d3-ai-line-writing`
- **Gallery source ID:** `ai-line-writing`
- **Family:** Motion
- **Use when:** Monoline strokes write AI Generated one letter at a time.
- **Renderer:** `renderAiLineWriting`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAiLineWriting() {
    const svg = prepareSvg("ai-line-writing", "AI line writing", "Line paths progressively write the words AI Generated as monoline lettering.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const glyphs = {
      A: { w: 1.02, strokes: [[[.05, 1], [.5, 0], [.97, 1]], [[.25, .6], [.75, .6]]] },
      I: { w: .5, strokes: [[[.5, 0], [.5, 1]], [[.18, 0], [.82, 0]], [[.18, 1], [.82, 1]]] },
      G: { w: 1.08, strokes: [[[.92, .27], [.72, .08], [.34, .08], [.1, .29], [.1, .72], [.34, .94], [.74, .91], [.96, .7], [.96, .54], [.64, .54]]] },
      e: { w: .88, strokes: [[[.78, .5], [.22, .5], [.2, .3], [.42, .16], [.7, .23], [.82, .5], [.72, .78], [.44, .92], [.18, .75], [.2, .5]]] },
      n: { w: .92, strokes: [[[.14, 1], [.14, .34], [.18, .48], [.42, .26], [.7, .35], [.8, 1]]] },
      r: { w: .7, strokes: [[[.16, 1], [.16, .3], [.18, .48], [.4, .3], [.68, .34]]] },
      a: { w: .88, strokes: [[[.72, .98], [.72, .38], [.55, .18], [.28, .24], [.12, .52], [.18, .8], [.42, .94], [.7, .72]], [[.72, .4], [.84, .28]]] },
      t: { w: .62, strokes: [[[.45, .08], [.45, .88], [.56, 1]], [[.16, .34], [.76, .34]]] },
      d: { w: .92, strokes: [[[.78, .06], [.78, 1]], [[.78, .38], [.58, .2], [.28, .25], [.12, .54], [.18, .82], [.44, .94], [.78, .76]]] }
    };
    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(.72));
    const measure = (word, gap) => {
      let total = 0;
      [...word].forEach((letter, index) => {
        total += letter === " " ? .74 : glyphs[letter].w;
        if (index < word.length - 1) total += gap;
      });
      return total;
    };
    const makeWord = (word, y, scale, strokeWidth, gap) => {
      const totalWidth = measure(word, gap) * scale;
      let x = (width - totalWidth) / 2;
      const strokes = [];
      [...word].forEach(letter => {
        if (letter === " ") {
          x += (.74 + gap) * scale;
          return;
        }
        const glyph = glyphs[letter];
        glyph.strokes.forEach(points => {
          const absolutePoints = points.map(point => [x + point[0] * scale, y + point[1] * scale]);
          strokes.push({
            d: line(absolutePoints),
            points: absolutePoints,
            strokeWidth
          });
        });
        x += (glyph.w + gap) * scale;
      });
      return strokes;
    };

    let writeCursor = .08;
    const rawStrokes = [
      ...makeWord("AI", 54, 118, 7.6, .24),
      ...makeWord("Generated", 226, 54, 4.9, .14)
    ];
    const connectorDuration = .055;
    const strokes = rawStrokes.map((stroke, index) => {
      const duration = index < 5 ? .22 + (index % 2) * .025 : .13 + (index % 4) * .012;
      const delay = writeCursor;
      writeCursor += duration + (index < rawStrokes.length - 1 ? connectorDuration : 0);
      return {
        ...stroke,
        id: `ai-line-writing-stroke-${index}`,
        delay,
        duration
      };
    });
    const animateStroke = selection => {
      selection.each(function (d) {
        const length = this.getTotalLength ? this.getTotalLength() : 140;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${d.duration}s`)
          .attr("begin", `${d.delay}s`)
          .attr("fill", "freeze");
      });
    };

    const halo = svg.append("g").selectAll("path.ai-line-halo").data(strokes).join("path")
      .attr("class", "ai-line-halo")
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", d => d.strokeWidth + 5)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .82);
    const lettering = svg.append("g").selectAll("path.ai-line-letter").data(strokes).join("path")
      .attr("class", "ai-line-letter")
      .attr("id", d => d.id)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", d => d.strokeWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");
    animateStroke(halo);
    animateStroke(lettering);
    const approximateLength = points => d3.pairs(points).reduce((sum, pair) => sum + Math.hypot(pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]), 0);
    lettering.each(function (d) {
      d.pathLength = this.getTotalLength ? this.getTotalLength() : approximateLength(d.points);
    });

    let motionDistance = 0;
    const motionCommands = [];
    strokes.forEach((stroke, index) => {
      const start = stroke.points[0];
      if (index === 0) {
        motionCommands.push(`M${start[0]},${start[1]}`);
      } else {
        const previousEnd = strokes[index - 1].points.at(-1);
        motionDistance += Math.hypot(start[0] - previousEnd[0], start[1] - previousEnd[1]);
        motionCommands.push(`L${start[0]},${start[1]}`);
      }
      stroke.motionStart = motionDistance;
      motionCommands.push(stroke.d.replace(/^M[^A-Za-z]*/, ""));
      motionDistance += stroke.pathLength;
      stroke.motionEnd = motionDistance;
    });
    const motionPath = svg.append("path")
      .attr("id", "ai-line-writing-pen-path")
      .attr("d", motionCommands.join(""))
      .attr("fill", "none")
      .attr("stroke", "none");
    const motionLength = motionPath.node()?.getTotalLength?.() || motionDistance || 1;
    const totalDuration = writeCursor + .18;
    const keyTimes = [0];
    const keyPoints = [0];
    strokes.forEach(stroke => {
      keyTimes.push(stroke.delay / totalDuration, (stroke.delay + stroke.duration) / totalDuration);
      keyPoints.push(stroke.motionStart / motionLength, stroke.motionEnd / motionLength);
    });
    keyTimes.push(1);
    keyPoints.push(strokes.at(-1).motionEnd / motionLength);

    const pen = svg.append("g")
      .attr("class", "ai-line-writing-pen");
    pen.append("circle")
      .attr("r", 11.5)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    pen.append("animateMotion")
      .attr("dur", `${totalDuration}s`)
      .attr("begin", "0s")
      .attr("fill", "freeze")
      .attr("calcMode", "linear")
      .attr("keyTimes", keyTimes.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .attr("keyPoints", keyPoints.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .append("mpath")
      .attr("href", "#ai-line-writing-pen-path");

  }
```
