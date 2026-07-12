# Slope Chart

- **Pattern ID:** `d3-slope`
- **Gallery source ID:** `slope`
- **Family:** Temporal
- **Use when:** Before-after movement with labels.
- **Renderer:** `renderSlope`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSlope() {
    const svg = prepareSvg("slope", "Slope chart", "Before-after comparison with connected labels.");
    const data = [
      { name: "API", a: 42, b: 75 }, { name: "Search", a: 61, b: 68 }, { name: "Jobs", a: 74, b: 52 },
      { name: "Billing", a: 38, b: 59 }, { name: "Reports", a: 52, b: 82 }
    ];
    const y = d3.scaleLinear().domain([30, 90]).range([330, 54]);
    const x1 = 130, x2 = 410;
    axisLeft(svg, y, 70, 5);
    svg.append("text").attr("class", "mark-label").attr("x", x1).attr("y", 36).attr("text-anchor", "middle").text("Before");
    svg.append("text").attr("class", "mark-label").attr("x", x2).attr("y", 36).attr("text-anchor", "middle").text("After");
    const lines = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", x1).attr("x2", x2).attr("y1", d => y(d.a)).attr("y2", d => y(d.b)).attr("stroke", (d, i) => colors[i]).attr("stroke-width", 2.5);
    fadeIn(lines, .1, .7);
    svg.append("g").selectAll("text").data(data).join("text").attr("class", "label")
      .attr("x", x2 + 12).attr("y", d => y(d.b) + 4).text(d => d.name);
  }
```
