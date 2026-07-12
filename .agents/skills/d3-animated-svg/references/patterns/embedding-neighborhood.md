# Embedding Neighborhood

- **Pattern ID:** `d3-embedding-neighborhood`
- **Gallery source ID:** `embedding-neighborhood`
- **Family:** LLM
- **Use when:** Nearby vectors form semantic neighborhoods around a query.
- **Renderer:** `renderEmbeddingNeighborhood`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderEmbeddingNeighborhood() {
    const svg = prepareSvg("embedding-neighborhood", "Embedding neighborhood", "A query vector sits near semantically related vectors in a compact embedding space.");
    const points = [
      { text: "query", x: 242, y: 206, r: 9, color: palette.red, query: true },
      { text: "fruit", x: 184, y: 176, r: 6, color: palette.blue, near: true },
      { text: "pear", x: 214, y: 244, r: 6, color: palette.blue, near: true },
      { text: "recipe", x: 288, y: 166, r: 6, color: palette.blue, near: true },
      { text: "tree", x: 314, y: 238, r: 6, color: palette.blue, near: true },
      { text: "cache", x: 104, y: 306, r: 5, color: palette.gray400 },
      { text: "orbit", x: 430, y: 110, r: 5, color: palette.gray400 },
      { text: "ledger", x: 404, y: 306, r: 5, color: palette.gray400 },
      { text: "syntax", x: 126, y: 112, r: 5, color: palette.gray400 },
      { text: "matrix", x: 470, y: 226, r: 5, color: palette.gray400 }
    ];
    const query = points[0];
    svg.append("rect").attr("x", 52).attr("y", 86).attr("width", 456).attr("height", 266).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("path").attr("d", "M68,278C170,222 258,292 366,238S464,150 496,182").attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 1.4).attr("stroke-dasharray", "5 6");
    const links = svg.append("g").selectAll("line.embedding-link").data(points.filter(d => d.near)).join("line")
      .attr("class", "embedding-link")
      .attr("x1", query.x).attr("y1", query.y)
      .attr("x2", d => d.x).attr("y2", d => d.y)
      .attr("stroke", palette.blue)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .42);
    drawPath(links, .35, .8);
    const dots = svg.append("g").selectAll("g.embedding-dot").data(points).join("g")
      .attr("class", "embedding-dot")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    dots.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => d.query ? .96 : d.near ? .76 : .42)
      .attr("stroke", palette.surface)
      .attr("stroke-width", d => d.query ? 2.2 : 1.4);
    dots.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.query ? 14 : 10)
      .attr("y", 4)
      .style("font-size", "11px")
      .text(d => d.text);
    fadeIn(dots, .1, .5);
    const ring = svg.append("circle").attr("cx", query.x).attr("cy", query.y).attr("r", 26).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2).attr("opacity", .85);
    ring.append("animate").attr("attributeName", "r").attr("values", "18;52;64").attr("dur", "1.4s").attr("begin", ".8s").attr("fill", "freeze");
    ring.append("animate").attr("attributeName", "opacity").attr("values", ".9;.34;0").attr("dur", "1.4s").attr("begin", ".8s").attr("fill", "freeze");
  }
```
