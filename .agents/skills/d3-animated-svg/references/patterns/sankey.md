# Sankey Pipeline

- **Pattern ID:** `d3-sankey`
- **Gallery source ID:** `sankey`
- **Family:** Flow
- **Use when:** Weighted handoffs across ordered stages.
- **Renderer:** `renderSankey`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSankey() {
    const svg = prepareSvg("sankey", "Sankey pipeline", "D3 Sankey layout for weighted handoffs.");
    const graph = {
      nodes: ["Visit", "Trial", "Sales", "Self serve", "Paid", "Churn", "Expand"].map(name => ({ name })),
      links: [
        { source: 0, target: 1, value: 18 }, { source: 0, target: 2, value: 10 },
        { source: 1, target: 3, value: 12 }, { source: 1, target: 5, value: 6 },
        { source: 2, target: 4, value: 8 }, { source: 2, target: 5, value: 2 },
        { source: 3, target: 4, value: 9 }, { source: 4, target: 6, value: 7 }
      ]
    };
    if (!d3.sankey) {
      svg.append("text").attr("class", "mark-label").attr("x", 40).attr("y", 210).text("Install d3-sankey to render this example.");
      return;
    }
    const layout = d3.sankey().nodeWidth(16).nodePadding(14).extent([[46, 36], [width - 48, height - 52]]);
    const { nodes, links } = layout({ nodes: graph.nodes.map(d => ({ ...d })), links: graph.links.map(d => ({ ...d })) });
    const color = d3.scaleOrdinal(nodes.map(d => d.name), colors);
    const link = svg.append("g").attr("fill", "none").attr("stroke-opacity", .35).selectAll("path").data(links).join("path")
      .attr("d", d3.sankeyLinkHorizontal()).attr("stroke", d => color(d.source.name)).attr("stroke-width", d => Math.max(1, d.width));
    drawPath(link, .1, .95);
    const node = svg.append("g").selectAll("g").data(nodes).join("g");
    node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("height", d => d.y1 - d.y0).attr("width", d => d.x1 - d.x0).attr("fill", d => color(d.name)).attr("rx", 3);
    node.append("text").attr("class", "label").attr("x", d => d.x0 < width / 2 ? d.x1 + 7 : d.x0 - 7).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", ".35em").attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end").text(d => d.name);
    fadeIn(node, .25, .55);
  }
```
