# Bar Race

- **Pattern ID:** `d3-bar-race`
- **Gallery source ID:** `bar-race`
- **Family:** Ranking
- **Use when:** Ranks and magnitudes animate between states.
- **Renderer:** `renderBarRace`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBarRace() {
    const svg = prepareSvg("bar-race", "Bar race", "Keyed ranked bars animate from one state to another.");
    const data = [
      { name: "Search", before: 48, after: 82 },
      { name: "API", before: 72, after: 74 },
      { name: "Jobs", before: 61, after: 58 },
      { name: "Assist", before: 36, after: 69 },
      { name: "Data", before: 54, after: 45 },
      { name: "Review", before: 28, after: 63 }
    ];
    const beforeOrder = data.slice().sort((a, b) => d3.descending(a.before, b.before)).map(d => d.name);
    const afterOrder = data.slice().sort((a, b) => d3.descending(a.after, b.after)).map(d => d.name);
    const margin = { top: 40, right: 52, bottom: 46, left: 92 };
    const x = d3.scaleLinear().domain([0, 90]).range([margin.left, width - margin.right]);
    const yBefore = d3.scaleBand().domain(beforeOrder).range([margin.top, height - margin.bottom]).padding(.28);
    const yAfter = d3.scaleBand().domain(afterOrder).range([margin.top, height - margin.bottom]).padding(.28);
    axisBottom(svg, x, height - margin.bottom, 5);
    const rows = svg.append("g").selectAll("g").data(data, d => d.name).join("g");
    const bars = rows.append("rect")
      .attr("x", x(0))
      .attr("y", d => yAfter(d.name))
      .attr("width", d => x(d.after) - x(0))
      .attr("height", yAfter.bandwidth())
      .attr("rx", 4)
      .attr("fill", (d, i) => colors[i]);
    bars.append("animate")
      .attr("attributeName", "width")
      .attr("from", d => x(d.before) - x(0))
      .attr("to", d => x(d.after) - x(0))
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    bars.append("animate")
      .attr("attributeName", "y")
      .attr("from", d => yBefore(d.name))
      .attr("to", d => yAfter(d.name))
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    rows.append("text").attr("class", "mark-label")
      .attr("x", 80)
      .attr("y", d => yAfter(d.name) + yAfter.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.name);
    rows.append("text").attr("class", "label")
      .attr("x", d => x(d.after) + 8)
      .attr("y", d => yAfter(d.name) + yAfter.bandwidth() / 2 + 4)
      .text(d => d.after);
    svg.append("text").attr("class", "mark-label").attr("x", margin.left).attr("y", 28).text("State B rank");
  }
```
