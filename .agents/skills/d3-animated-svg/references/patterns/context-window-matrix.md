# Context Window Matrix

- **Pattern ID:** `d3-context-window-matrix`
- **Gallery source ID:** `context-window-matrix`
- **Family:** Context
- **Use when:** Token budget fills as agent context enters the active window.
- **Renderer:** `renderContextWindowMatrix`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderContextWindowMatrix() {
    const svg = prepareSvg("context-window-matrix", "Context window matrix", "A D3 waffle matrix shows how agent context fills a finite token window.");
    const totalTokens = 200000;
    const unitTokens = 1000;
    const cols = 20;
    const rows = 10;
    const totalCells = cols * rows;
    const segments = [
      { name: "System prompt", tokens: 18000, color: palette.blue },
      { name: "Project rules", tokens: 24000, color: palette.green },
      { name: "Tool schemas", tokens: 30000, color: palette.orange },
      { name: "User task", tokens: 16000, color: palette.purple },
      { name: "Files & docs", tokens: 34000, color: palette.cyan },
      { name: "Tool results", tokens: 22000, color: palette.gold },
      { name: "Memory summary", tokens: 12000, color: palette.red },
      { name: "Free budget", tokens: 44000, color: palette.gray100, unused: true }
    ];
    const freeColor = segments.find(d => d.unused).color;
    const usedTokens = d3.sum(segments.filter(d => !d.unused), d => d.tokens);
    const cellSegments = segments.flatMap(segment => {
      const count = Math.round(segment.tokens / unitTokens);
      return d3.range(count).map(() => segment);
    }).slice(0, totalCells);
    const cells = d3.range(totalCells).map(i => ({
      index: i,
      col: i % cols,
      row: Math.floor(i / cols),
      segment: cellSegments[i] || segments.at(-1)
    }));
    const frame = { x: 36, y: 58, w: 374, h: 214 };
    const gap = 3;
    const cell = 15;
    const pitch = cell + gap;
    const matrixX = frame.x + 9;
    const matrixY = frame.y + 20;
    const usedCells = Math.round(usedTokens / unitTokens);
    const pct = usedTokens / totalTokens;
    const fillStart = 0.35;

    svg.append("rect")
      .attr("x", frame.x)
      .attr("y", frame.y)
      .attr("width", frame.w)
      .attr("height", frame.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.ink)
      .attr("stroke-width", 2);
    svg.append("rect")
      .attr("x", frame.x + 8)
      .attr("y", frame.y + 8)
      .attr("width", frame.w - 16)
      .attr("height", frame.h - 16)
      .attr("rx", 5)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray100);

    svg.append("g").selectAll("rect.context-cell").data(cells).join("rect")
      .attr("class", "context-cell")
      .attr("x", d => matrixX + d.col * pitch)
      .attr("y", d => matrixY + d.row * pitch)
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", freeColor)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .attr("opacity", .72);

    const usedRows = d3.range(rows).map(row => {
      const rowStart = row * cols;
      const count = Math.max(0, Math.min(cols, usedCells - rowStart));
      return {
        row,
        count,
        width: count > 0 ? (count - 1) * pitch + cell : 0
      };
    }).filter(d => d.count > 0);
    const rowDuration = 0.42;
    const sweepDuration = usedRows.length * rowDuration;
    const defs = svg.append("defs");
    usedRows.forEach(row => {
      const clipRect = defs.append("clipPath")
        .attr("id", `context-window-row-${row.row}-clip`)
        .append("rect")
        .attr("x", matrixX)
        .attr("y", matrixY + row.row * pitch)
        .attr("width", 0)
        .attr("height", cell);
      clipRect.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", row.width)
        .attr("dur", `${rowDuration}s`)
        .attr("begin", `${fillStart + row.row * rowDuration}s`)
        .attr("fill", "freeze");
    });

    const usedLayer = svg.append("g");
    usedRows.forEach(row => {
      usedLayer.append("g")
        .attr("class", "context-used-row")
        .attr("clip-path", `url(#context-window-row-${row.row}-clip)`)
        .selectAll("rect.context-used-cell")
        .data(cells.filter(d => !d.segment.unused && d.row === row.row))
        .join("rect")
        .attr("class", "context-used-cell")
        .attr("x", d => matrixX + d.col * pitch)
        .attr("y", d => matrixY + d.row * pitch)
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", d => d.segment.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .attr("opacity", 1);
    });

    svg.selectAll("rect.context-used-cell")
      .attr("data-linear-index", d => d.index);

    const boundaryCol = usedCells % cols;
    const boundaryRow = Math.floor(usedCells / cols);
    svg.append("path")
      .attr("d", `M${matrixX + boundaryCol * pitch - gap / 2},${matrixY + boundaryRow * pitch - 8}v${cell + 16}`)
      .attr("fill", "none")
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", .92)
      .attr("dur", ".36s")
      .attr("begin", `${fillStart + sweepDuration + 0.08}s`)
      .attr("fill", "freeze");

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", frame.x + frame.w / 2)
      .attr("y", frame.y + frame.h + 32)
      .attr("text-anchor", "middle")
      .attr("font-size", 20)
      .attr("font-weight", 800)
      .text(`${Math.round(usedTokens / 1000)}K / ${Math.round(totalTokens / 1000)}K tokens`);
    svg.append("text")
      .attr("class", "caption")
      .attr("x", frame.x + frame.w / 2)
      .attr("y", frame.y + frame.h + 52)
      .attr("text-anchor", "middle")
      .text("token / total");

    const barX = frame.x + 42;
    const barY = frame.y + frame.h + 64;
    const barW = frame.w - 84;
    svg.append("rect").attr("x", barX).attr("y", barY).attr("width", barW).attr("height", 7).attr("rx", 3.5).attr("fill", palette.gray100);
    const usedBar = svg.append("rect").attr("x", barX).attr("y", barY).attr("width", 0).attr("height", 7).attr("rx", 3.5).attr("fill", palette.blue);
    usedBar.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", barW * pct).attr("dur", `${sweepDuration}s`).attr("begin", `${fillStart}s`).attr("fill", "freeze");

    const legend = svg.append("g").attr("transform", "translate(418,58)");
    legend.append("text")
      .attr("class", "mark-label")
      .attr("x", 0)
      .attr("y", -18)
      .attr("font-weight", 800)
      .text("Context Window");
    legend.append("text")
      .attr("class", "caption")
      .attr("x", 0)
      .attr("y", 2)
      .text("token sources");
    const rowsG = legend.selectAll("g").data(segments).join("g")
      .attr("transform", (d, i) => `translate(0,${24 + i * 25})`);
    rowsG.append("rect")
      .attr("width", 13)
      .attr("height", 13)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("stroke", d => d.unused ? palette.gray300 : palette.surface)
      .attr("stroke-width", 1.2);
    rowsG.append("text")
      .attr("class", "mark-label")
      .attr("x", 19)
      .attr("y", 11)
      .style("font-size", "10px")
      .text(d => `${d.name} ${Math.round(d.tokens / 1000)}K`);
  }
```
