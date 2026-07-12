# Paged KV Cache

- **Pattern ID:** `d3-paged-kv-cache`
- **Gallery source ID:** `paged-kv-cache`
- **Family:** Inference
- **Use when:** Concurrent requests allocate fixed KV pages and reuse freed blocks.
- **Renderer:** `renderPagedKvCache`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPagedKvCache() {
    const svg = prepareSvg("paged-kv-cache", "Paged KV cache", "Serving-time KV cache memory is allocated as fixed pages for concurrent requests and reused after completion.");
    const requests = [
      { id: "req A", y: 94, color: palette.blue, pages: [0, 1, 2] },
      { id: "req B", y: 154, color: palette.orange, pages: [3, 4] },
      { id: "req C", y: 214, color: palette.green, pages: [5, 6, 7] },
      { id: "req D", y: 274, color: palette.purple, pages: [1, 8], reused: true }
    ];
    const pages = d3.range(12).map(index => ({ index, col: index % 4, row: Math.floor(index / 4) }));
    const gridX = 306;
    const gridY = 98;
    const cell = 42;
    const gap = 10;
    svg.append("text").attr("class", "mark-label").attr("x", 88).attr("y", 62).attr("text-anchor", "middle").text("decode requests");
    svg.append("text").attr("class", "mark-label").attr("x", 396).attr("y", 62).attr("text-anchor", "middle").text("KV memory pages");
    requests.forEach((request, i) => {
      const group = svg.append("g").attr("transform", `translate(48,${request.y - 18})`);
      group.append("rect").attr("width", 94).attr("height", 36).attr("rx", 8).attr("fill", request.color).attr("fill-opacity", .8).attr("stroke", palette.surface);
      group.append("text").attr("class", "reverse-label").attr("x", 47).attr("y", 23).attr("text-anchor", "middle").attr("font-weight", 800).text(request.id);
      if (request.reused) {
        group.append("text").attr("class", "caption").attr("x", 108).attr("y", 23).attr("fill", palette.green).text("reuses freed page");
      }
      fadeIn(group, .08 + i * .1, .25);
    });
    const pageOwner = new Map();
    requests.forEach(request => request.pages.forEach(page => {
      if (!pageOwner.has(page) || request.reused) pageOwner.set(page, request);
    }));
    const grid = svg.append("g").attr("transform", `translate(${gridX},${gridY})`);
    grid.append("rect").attr("x", -16).attr("y", -18).attr("width", 4 * (cell + gap) + 22).attr("height", 3 * (cell + gap) + 22).attr("rx", 12).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    grid.selectAll("rect.page").data(pages).join("rect")
      .attr("class", "page")
      .attr("x", d => d.col * (cell + gap))
      .attr("y", d => d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 7)
      .attr("fill", d => pageOwner.get(d.index)?.color || palette.gray100)
      .attr("fill-opacity", d => pageOwner.has(d.index) ? .72 : .48)
      .attr("stroke", d => d.index === 1 ? palette.green : palette.surface)
      .attr("stroke-width", d => d.index === 1 ? 2.6 : 1.2)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".28s")
      .attr("begin", d => `${.25 + d.index * .035}s`)
      .attr("fill", "freeze");
    grid.selectAll("text.page-label").data(pages).join("text")
      .attr("class", "reverse-label")
      .attr("x", d => d.col * (cell + gap) + cell / 2)
      .attr("y", d => d.row * (cell + gap) + 26)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .text(d => `p${d.index}`);
    requests.forEach((request, requestIndex) => {
      request.pages.forEach((pageIndex, pageOffset) => {
        const page = pages[pageIndex];
        const targetX = gridX + page.col * (cell + gap);
        const targetY = gridY + page.row * (cell + gap) + cell / 2;
        const path = svg.append("path")
          .attr("id", `paged-kv-cache-${requestIndex}-${pageOffset}`)
          .attr("d", `M142,${request.y}C206,${request.y} 226,${targetY} ${targetX},${targetY}`)
          .attr("fill", "none")
          .attr("stroke", request.reused && pageIndex === 1 ? palette.green : request.color)
          .attr("stroke-width", request.reused && pageIndex === 1 ? 3 : 2)
          .attr("stroke-opacity", .42)
          .attr("stroke-linecap", "round");
        drawPath(path, .42 + requestIndex * .14 + pageOffset * .04, .7);
        const dot = svg.append("circle").attr("r", 4.5).attr("fill", request.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".78s")
          .attr("begin", `${.52 + requestIndex * .14 + pageOffset * .06}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#paged-kv-cache-${requestIndex}-${pageOffset}`);
      });
    });
    svg.append("path").attr("d", "M346,292H450").attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("stroke-dasharray", "6 6");
    svg.append("text").attr("class", "caption").attr("x", 398).attr("y", 318).attr("text-anchor", "middle").text("page table remaps logical cache");
  }
```
