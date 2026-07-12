# Lollipop

- **Pattern ID:** `d3-lollipop`
- **Gallery source ID:** `lollipop`
- **Family:** Ranking
- **Use when:** Ranked values with reduced bar ink.
- **Renderer:** `renderLollipop`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderLollipop() {
    const svg = prepareSvg("lollipop", "Lollipop chart", "Ranked values with stems and endpoints.");
    const data = ["API", "Search", "Jobs", "Billing", "Reports", "Auth"].map((name, i) => ({ name, value: [86, 74, 68, 59, 51, 45][i] }));
    const x = d3.scaleLinear().domain([0, 100]).range([100, width - 50]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([54, 330]).padding(.42);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("line").data(data).join("line").attr("x1", x(0)).attr("x2", d => x(d.value)).attr("y1", d => y(d.name) + y.bandwidth() / 2).attr("y2", d => y(d.name) + y.bandwidth() / 2).attr("stroke", palette.gray200).attr("stroke-width", 3);
    const circles = svg.append("g").selectAll("circle").data(data).join("circle").attr("cx", d => x(d.value)).attr("cy", d => y(d.name) + y.bandwidth() / 2).attr("fill", palette.blue);
    grow(circles, "r", 1, 9, .1, .65);
    svg.append("g").selectAll("text").data(data).join("text").attr("class", "mark-label").attr("x", 88).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.name);
  }
```
