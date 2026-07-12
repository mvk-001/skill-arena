# Focus Context

- **Pattern ID:** `d3-focus-context`
- **Gallery source ID:** `focus-context`
- **Family:** Interaction
- **Use when:** A selected window links overview and detail.
- **Renderer:** `renderFocusContext`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderFocusContext() {
    const svg = prepareSvg("focus-context", "Focus context", "A selected overview window drives a detailed D3 time-series view.");
    const data = d3.range(64).map(i => ({
      t: i,
      value: 48 + Math.sin(i / 4) * 18 + Math.cos(i / 9) * 12 + (i % 7)
    }));
    const focus = { top: 40, right: 34, bottom: 172, left: 54 };
    const context = { top: 292, right: 34, bottom: 52, left: 54 };
    const windowRange = [18, 44];
    const x = d3.scaleLinear().domain(windowRange).range([focus.left, width - focus.right]);
    const y = d3.scaleLinear().domain([25, 85]).range([height - focus.bottom, focus.top]);
    const x2 = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([context.left, width - context.right]);
    const y2 = d3.scaleLinear().domain([25, 85]).range([height - context.bottom, context.top]);
    const focusData = data.filter(d => d.t >= windowRange[0] && d.t <= windowRange[1]);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const line2 = d3.line().x(d => x2(d.t)).y(d => y2(d.value)).curve(d3.curveMonotoneX);
    const clipId = "focus-context-clip";
    svg.append("clipPath").attr("id", clipId).append("rect")
      .attr("x", focus.left).attr("y", focus.top)
      .attr("width", width - focus.left - focus.right)
      .attr("height", height - focus.top - focus.bottom);
    axisBottom(svg, x, height - focus.bottom, 5);
    axisLeft(svg, y, focus.left, 4);
    const focusPath = svg.append("path")
      .datum(focusData)
      .attr("clip-path", `url(#${clipId})`)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", palette.blue)
      .attr("stroke-width", 3);
    drawPath(focusPath, .08, .95);
    svg.append("path")
      .datum(data)
      .attr("d", line2)
      .attr("fill", "none")
      .attr("stroke", "#91a2b5")
      .attr("stroke-width", 2);
    const brush = svg.append("rect")
      .attr("x", x2(windowRange[0]))
      .attr("y", context.top - 12)
      .attr("width", x2(windowRange[1]) - x2(windowRange[0]))
      .attr("height", height - context.bottom - context.top + 24)
      .attr("fill", palette.orange)
      .attr("fill-opacity", .18)
      .attr("stroke", palette.orange)
      .attr("rx", 4);
    brush.append("animate")
      .attr("attributeName", "width")
      .attr("from", 24)
      .attr("to", x2(windowRange[1]) - x2(windowRange[0]))
      .attr("dur", ".75s")
      .attr("fill", "freeze");
    axisBottom(svg, x2, height - context.bottom, 5);
    svg.append("text").attr("class", "mark-label").attr("x", focus.left).attr("y", 26).text("Detail");
    svg.append("text").attr("class", "mark-label").attr("x", context.left + 8).attr("y", context.top + 16).text("Context window");
  }
```
