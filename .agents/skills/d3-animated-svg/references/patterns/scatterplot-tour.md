# Scatterplot Tour

- **Pattern ID:** `d3-scatterplot-tour`
- **Gallery source ID:** `scatterplot-tour`
- **Family:** Projection
- **Use when:** Stable points move between two analytical projections.
- **Renderer:** `renderScatterplotTour`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderScatterplotTour() {
    const svg = prepareSvg("scatterplot-tour", "Scatterplot tour", "Points preserve identity while moving between two projected views.");
    const data = d3.range(34).map(i => ({
      id: i,
      a: 15 + (i * 19) % 84,
      b: 22 + (i * 37) % 72,
      c: 20 + ((i * 29 + 18) % 78),
      d: 18 + ((i * 17 + 45) % 74),
      group: i % 3
    }));
    const margin = { top: 42, right: 40, bottom: 52, left: 58 };
    const xA = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const yA = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const xB = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const yB = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, xA, height - margin.bottom, 4);
    axisLeft(svg, yA, margin.left, 4);
    const trails = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => xA(d.a)).attr("y1", d => yA(d.b))
      .attr("x2", d => xB(d.c)).attr("y2", d => yB(d.d))
      .attr("stroke", "#d5dce5").attr("stroke-width", 1.2);
    fadeIn(trails, .05, .5);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => xB(d.c))
      .attr("cy", d => yB(d.d))
      .attr("r", 6.2)
      .attr("fill", d => colors[d.group])
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    dots.append("animate").attr("attributeName", "cx").attr("from", d => xA(d.a)).attr("to", d => xB(d.c)).attr("dur", "1.15s").attr("fill", "freeze");
    dots.append("animate").attr("attributeName", "cy").attr("from", d => yA(d.b)).attr("to", d => yB(d.d)).attr("dur", "1.15s").attr("fill", "freeze");
    svg.append("text").attr("class", "label").attr("x", 74).attr("y", 34).text("view A -> view B");
  }
```
