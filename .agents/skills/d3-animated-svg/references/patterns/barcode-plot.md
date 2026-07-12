# Barcode Plot

- **Pattern ID:** `d3-barcode-plot`
- **Gallery source ID:** `barcode-plot`
- **Family:** Events
- **Use when:** Dense event timing as ordered tick marks.
- **Renderer:** `renderBarcode`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBarcode() {
    const svg = prepareSvg("barcode-plot", "Barcode plot", "Dense event times are encoded as ordered ticks on multiple lanes.");
    const lanes = ["API", "Jobs", "Search", "Billing"];
    const data = lanes.flatMap((lane, li) => d3.range(24).map(i => ({
      lane,
      time: (i * (7 + li * 2) + li * 9) % 96,
      severity: (i + li) % 4
    }))).sort((a, b) => d3.ascending(a.time, b.time));
    const x = d3.scaleLinear().domain([0, 100]).range([82, width - 36]);
    const y = d3.scaleBand().domain(lanes).range([72, 314]).padding(.34);
    axisBottom(svg, x, 346, 5);
    svg.append("g").selectAll("text").data(lanes).join("text")
      .attr("class", "mark-label").attr("x", 68).attr("y", d => y(d) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d);
    const ticks = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.time)).attr("x2", d => x(d.time))
      .attr("y1", d => y(d.lane)).attr("y2", d => y(d.lane) + y.bandwidth())
      .attr("stroke", d => colors[d.severity]).attr("stroke-width", 2.1).attr("stroke-linecap", "round");
    fadeIn(ticks, .035, .55);
    lanes.forEach(lane => {
      svg.append("line").attr("x1", x(0)).attr("x2", x(100)).attr("y1", y(lane) + y.bandwidth() + 7).attr("y2", y(lane) + y.bandwidth() + 7)
        .attr("stroke", "#e3e8ee");
    });
  }
```
