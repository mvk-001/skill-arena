# Zoomable Bar

- **Pattern ID:** `d3-zoomable-bar`
- **Gallery source ID:** `zoomable-bar`
- **Family:** Focus
- **Use when:** A local categorical range expands while context remains visible.
- **Renderer:** `renderZoomableBar`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderZoomableBar() {
    const svg = prepareSvg("zoomable-bar", "Zoomable bar", "A local categorical range expands while context remains visible.");
    const data = d3.range(18).map(i => ({ name: `C${i + 1}`, value: 18 + ((i * 29) % 76), focus: i >= 6 && i <= 11 }));
    const overview = { x: 54, y: 292, w: 452, h: 42 };
    const detail = { x: 74, y: 64, w: 412, h: 182 };
    const xO = d3.scaleBand().domain(data.map(d => d.name)).range([overview.x, overview.x + overview.w]).padding(.18);
    const yO = d3.scaleLinear().domain([0, 100]).range([overview.y + overview.h, overview.y]);
    svg.append("g").selectAll("rect.overview").data(data).join("rect")
      .attr("class", "overview").attr("x", d => xO(d.name)).attr("y", d => yO(d.value)).attr("width", xO.bandwidth()).attr("height", d => yO(0) - yO(d.value))
      .attr("fill", d => d.focus ? palette.red : palette.gray300);
    const selected = data.filter(d => d.focus);
    const x = d3.scaleBand().domain(selected.map(d => d.name)).range([detail.x, detail.x + detail.w]).padding(.22);
    const y = d3.scaleLinear().domain([0, 100]).range([detail.y + detail.h, detail.y]);
    const bars = svg.append("g").selectAll("rect.detail").data(selected).join("rect")
      .attr("class", "detail").attr("x", d => x(d.name)).attr("width", x.bandwidth()).attr("y", d => y(d.value)).attr("height", d => y(0) - y(d.value)).attr("fill", palette.red);
    grow(bars, "height", 1, d => y(0) - y(d.value), .08, .65);
    bars.attr("y", d => y(d.value));
    svg.append("rect").attr("x", xO("C7") - 4).attr("y", overview.y - 7).attr("width", xO("C12") - xO("C7") + xO.bandwidth() + 8).attr("height", overview.h + 14).attr("fill", "none").attr("stroke", palette.redHover).attr("stroke-width", 2);
  }
```
