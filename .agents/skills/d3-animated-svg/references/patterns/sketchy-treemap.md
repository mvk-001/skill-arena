# Sketchy Treemap

- **Pattern ID:** `d3-sketchy-treemap`
- **Gallery source ID:** `sketchy-treemap`
- **Family:** Sketchy
- **Use when:** A treemap keeps exact rectangular allocation but draws each cell as a rough marker block.
- **Renderer:** `renderSketchyTreemap`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyTreemap() {
    const svg = prepareSvg("sketchy-treemap", "Sketchy treemap", "Nested area allocation is rendered with rough rectangular cells.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([width - 50, height - 62]).paddingOuter(6).paddingTop(22).paddingInner(4).round(true)(root);
    const g = svg.append("g").attr("transform", "translate(25,31)");
    const color = d3.scaleOrdinal(root.children.map(d => d.data.name), colors);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent.data.name;
    const nodes = root.descendants().filter(d => d.depth);
    nodes.filter(d => d.children).forEach((d, i) => {
      appendSketchRect(g, d.x0, d.y0, Math.max(0, d.x1 - d.x0), Math.max(0, d.y1 - d.y0), {
        fill: color(branchName(d)),
        fillOpacity: .13,
        stroke: d3.color(color(branchName(d))).darker(.75).formatHex(),
        strokeWidth: 1.5,
        seed: 1060 + i * 23,
        roughness: 1.5,
        delay: .08 + i * .04,
        dur: .62,
        hachure: false
      });
    });
    nodes.filter(d => !d.children).forEach((d, i) => {
      const w = Math.max(0, d.x1 - d.x0);
      const h = Math.max(0, d.y1 - d.y0);
      appendSketchRect(g, d.x0, d.y0, w, h, {
        fill: color(branchName(d)),
        fillOpacity: .54,
        stroke: d3.color(color(branchName(d))).darker(.72).formatHex(),
        strokeWidth: 1.6,
        seed: 1100 + i * 29,
        roughness: 1.55,
        delay: .18 + i * .035,
        dur: .58,
        hachureStroke: d3.color(color(branchName(d))).darker(.75).formatHex(),
        hachureOpacity: .16,
        hachureSpacing: 14
      });
      if (w > 56 && h > 26) {
        g.append("text")
          .attr("class", "mark-label")
          .attr("x", d.x0 + 7)
          .attr("y", d.y0 + 18)
          .attr("font-size", 11.5)
          .text(d.data.name);
      }
    });
    nodes.filter(d => d.children && (d.x1 - d.x0) > 70).forEach(d => {
      g.append("text")
        .attr("class", "label")
        .attr("x", d.x0 + 8)
        .attr("y", d.y0 + 16)
        .attr("font-weight", 800)
        .text(d.data.name);
    });
  }
```
