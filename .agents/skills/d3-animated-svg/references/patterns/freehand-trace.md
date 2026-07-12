# Freehand Trace

- **Pattern ID:** `d3-freehand-trace`
- **Gallery source ID:** `freehand-trace`
- **Family:** Motion
- **Use when:** A red point draws a loose hand stroke and leaves ink behind.
- **Renderer:** `renderFreehandTrace`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderFreehandTrace() {
    const svg = prepareSvg("freehand-trace", "Freehand trace", "A red point simulates hand drawing by leaving a progressive red ink trail on a white field.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const points = [
      [70, 236], [100, 206], [137, 219], [153, 272], [116, 302], [86, 274],
      [96, 228], [154, 182], [229, 168], [289, 196], [274, 254], [214, 263],
      [190, 226], [229, 182], [320, 156], [409, 166], [470, 218], [443, 278],
      [367, 298], [315, 264], [335, 213], [409, 190], [481, 224]
    ].map(([x, y], i) => ({
      x,
      y: y + Math.sin(i * 1.9) * 5,
      pressure: .7 + ((i * 13) % 7) / 18
    }));
    const line = d3.line()
      .x(d => d.x)
      .y(d => d.y)
      .curve(d3.curveCatmullRom.alpha(.72));
    const pathData = line(points);
    const drawDuration = 3.45;
    const drawBegin = .12;

    const guide = svg.append("path")
      .attr("id", "freehand-trace-motion-path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", "none");

    const revealStroke = (selection, delay, duration) => {
      selection.each(function () {
        const length = this.getTotalLength ? this.getTotalLength() : 760;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${duration}s`)
          .attr("begin", `${delay}s`)
          .attr("fill", "freeze");
      });
    };

    const underlay = svg.append("path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", 12)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .7);
    const trace = svg.append("path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 5.6)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .95);
    revealStroke(underlay, drawBegin, drawDuration);
    revealStroke(trace, drawBegin, drawDuration);

    const guideNode = guide.node();
    const totalLength = guideNode && guideNode.getTotalLength ? guideNode.getTotalLength() : 760;
    const deposits = d3.range(38).map(i => {
      const t = (i + .35) / 38;
      const point = guideNode && guideNode.getPointAtLength ? guideNode.getPointAtLength(totalLength * t) : { x: points[0].x, y: points[0].y };
      return {
        x: point.x + Math.sin(i * 2.3) * 2.8,
        y: point.y + Math.cos(i * 1.7) * 2.1,
        r: 1.2 + ((i * 11) % 8) * .18,
        opacity: .1 + ((i * 5) % 7) * .022,
        delay: drawBegin + t * drawDuration
      };
    });
    const inkDots = svg.append("g").selectAll("circle.ink-dot").data(deposits).join("circle")
      .attr("class", "ink-dot")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 0)
      .attr("fill", palette.red)
      .attr("opacity", 0);
    inkDots.each(function (d) {
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "r")
        .attr("from", 0)
        .attr("to", d.r)
        .attr("dur", ".16s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", d.opacity)
        .attr("dur", ".18s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const point = svg.append("g").attr("class", "drawing-point");
    point.append("circle")
      .attr("r", 13)
      .attr("fill", palette.redHighlight)
      .attr("fill-opacity", .78);
    point.append("circle")
      .attr("r", 6.6)
      .attr("fill", palette.red)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2.4);
    point.append("animateMotion")
      .attr("dur", `${drawDuration}s`)
      .attr("begin", `${drawBegin}s`)
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#freehand-trace-motion-path");
  }
```
