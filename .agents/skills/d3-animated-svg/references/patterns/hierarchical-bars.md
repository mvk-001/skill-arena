# Hierarchical Bars

- **Pattern ID:** `d3-hierarchical-bars`
- **Gallery source ID:** `hierarchical-bars`
- **Family:** Hierarchy
- **Use when:** Indented bars show parent and child magnitude together.
- **Renderer:** `renderHierarchicalBars`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHierarchicalBars() {
    const svg = prepareSvg("hierarchical-bars", "Hierarchical bars", "A hierarchy is shown as indented bars with parent totals and child shares.");
    const root = d3.hierarchy({
      name: "Portfolio",
      children: [
        { name: "Core", children: [{ name: "API", value: 34 }, { name: "Auth", value: 22 }, { name: "Search", value: 29 }] },
        { name: "Growth", children: [{ name: "Assist", value: 27 }, { name: "Agents", value: 31 }, { name: "Eval", value: 18 }] },
        { name: "Ops", children: [{ name: "Billing", value: 19 }, { name: "Support", value: 24 }] }
      ]
    }).sum(d => d.value || 0);
    const rows = root.descendants().slice(1);
    const x = d3.scaleLinear().domain([0, d3.max(rows, d => d.value)]).range([0, 332]);
    const y = d3.scaleBand().domain(rows.map((d, i) => `${d.depth}-${d.data.name}-${i}`)).range([58, 344]).padding(.18);
    const row = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("transform", (d, i) => `translate(${74 + (d.depth - 1) * 34},${y(`${d.depth}-${d.data.name}-${i}`)})`);
    row.append("text")
      .attr("class", d => d.children ? "mark-label" : "label")
      .attr("x", -12)
      .attr("y", y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.data.name);
    const bars = row.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value))
      .attr("rx", 5)
      .attr("fill", d => d.children ? palette.blue : palette.cyan)
      .attr("fill-opacity", d => d.children ? .82 : .58);
    bars.each(function (d, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", x(d.value))
        .attr("dur", ".7s")
        .attr("begin", `${i * .05}s`)
        .attr("fill", "freeze");
    });
    row.append("text")
      .attr("class", "mark-label")
      .attr("x", d => x(d.value) + 8)
      .attr("y", y.bandwidth() / 2 + 4)
      .text(d => d.value);
  }
```
