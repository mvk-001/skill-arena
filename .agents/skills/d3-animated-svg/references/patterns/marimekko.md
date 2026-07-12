# Marimekko

- **Pattern ID:** `d3-marimekko`
- **Gallery source ID:** `marimekko`
- **Family:** Mosaic
- **Use when:** Variable-width stacked composition by segment.
- **Renderer:** `renderMarimekko`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMarimekko() {
    const svg = prepareSvg("marimekko", "Marimekko", "Variable-width stacked rectangles show two proportional dimensions.");
    const keys = ["Retain", "Expand", "New"];
    const data = [
      { name: "Core", width: 34, Retain: 46, Expand: 28, New: 12 },
      { name: "Growth", width: 26, Retain: 18, Expand: 36, New: 24 },
      { name: "Labs", width: 18, Retain: 10, Expand: 22, New: 34 },
      { name: "Field", width: 22, Retain: 24, Expand: 18, New: 20 }
    ];
    const margin = { top: 42, right: 28, bottom: 54, left: 44 };
    const totalWidth = d3.sum(data, d => d.width);
    let offset = 0;
    const cells = [];
    data.forEach(group => {
      const x0 = offset / totalWidth;
      offset += group.width;
      const x1 = offset / totalWidth;
      const total = d3.sum(keys, key => group[key]);
      let y0 = 0;
      keys.forEach((key, ki) => {
        const y1 = y0 + group[key] / total;
        cells.push({ group: group.name, key, ki, x0, x1, y0, y1 });
        y0 = y1;
      });
    });
    const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    const rects = svg.append("g").selectAll("rect").data(cells).join("rect")
      .attr("x", d => x(d.x0) + 1)
      .attr("y", d => y(d.y1))
      .attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => Math.max(1, y(d.y0) - y(d.y1)))
      .attr("fill", d => colors[d.ki])
      .attr("fill-opacity", .84)
      .attr("stroke", "#fff");
    fadeIn(rects, .05, .7);
    const labels = svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label")
      .attr("x", d => x((cells.find(c => c.group === d.name).x0 + cells.filter(c => c.group === d.name).at(-1).x1) / 2))
      .attr("y", height - 26)
      .attr("text-anchor", "middle")
      .text(d => d.name);
    fadeIn(labels, .4, .45);
    keys.forEach((key, i) => {
      svg.append("rect").attr("x", 72 + i * 94).attr("y", 24).attr("width", 12).attr("height", 12).attr("fill", colors[i]);
      svg.append("text").attr("class", "label").attr("x", 90 + i * 94).attr("y", 35).text(key);
    });
  }
```
