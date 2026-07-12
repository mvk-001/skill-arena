# D3 Kanban Board

- **Pattern ID:** `d3-kanban-board`
- **Gallery source ID:** `kanban-board`
- **Family:** Diagram
- **Use when:** Columns and ticket cards recreated with D3 joins and staged reveal.
- **Renderer:** `renderD3KanbanBoard`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry, priority legend, and semantic color roles before changing labels or domain data.
- Show the board scaffold first: columns and any needed legends reveal before task cards.
- Reveal task cards one at a time in left-to-right board order. Expose `data-reveal-order` and `data-reveal-begin-ms` on cards so browser checks can audit the sequence.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `revealIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3KanbanBoard() {
    const svg = prepareSvg("kanban-board", "D3 kanban board", "Mermaid kanban data rendered as D3 columns and cards.");
    const columns = [
      { id: "Backlog", x: 32, color: palette.blue },
      { id: "In progress", x: 204, color: palette.orange },
      { id: "Done", x: 376, color: palette.green }
    ];
    const cards = [
      { col: "Backlog", title: "Define colors", ticket: "EX-101", owner: "Design", priority: "High" },
      { col: "Backlog", title: "Choose shapes", ticket: "EX-102", owner: "Docs", priority: "High" },
      { col: "In progress", title: "Create wrappers", ticket: "EX-201", owner: "Docs", priority: "Very High" },
      { col: "Done", title: "Allow examples", ticket: "EX-301", owner: "Maintainer", priority: "Low" }
    ];
    const colW = 150;
    const cardH = 70;
    const priorityColor = { "Very High": palette.red, High: palette.orange, Low: palette.green };
    const priorityLegend = [
      { label: "Very High", color: priorityColor["Very High"] },
      { label: "High", color: priorityColor.High },
      { label: "Low", color: priorityColor.Low }
    ];
    const colById = new Map(columns.map(d => [d.id, d]));
    const columnOrder = new Map(columns.map((d, i) => [d.id, i]));
    const legendGroup = svg.append("g")
      .attr("class", "kanban-priority-legend")
      .attr("data-legend", "priority");
    legendGroup.append("text")
      .attr("class", "caption")
      .attr("x", 32)
      .attr("y", 35)
      .attr("font-size", 10.5)
      .attr("font-weight", 850)
      .text("Priority");
    const priorityItems = legendGroup.selectAll("g.kanban-priority-item")
      .data(priorityLegend)
      .join("g")
      .attr("class", "kanban-priority-item")
      .attr("data-priority", d => d.label)
      .attr("transform", (_, i) => `translate(${102 + i * 112},31)`);
    priorityItems.append("rect")
      .attr("x", 0)
      .attr("y", -9)
      .attr("width", 12)
      .attr("height", 12)
      .attr("rx", 3)
      .attr("fill", d => d.color);
    priorityItems.append("text")
      .attr("class", "caption")
      .attr("x", 18)
      .attr("y", 1.5)
      .attr("font-size", 10.5)
      .attr("font-weight", 750)
      .text(d => d.label);
    revealIn(legendGroup, .06, .3);
    const colGroups = svg.append("g").selectAll("g.kanban-column").data(columns).join("g")
      .attr("class", "kanban-column")
      .attr("data-column-order", d => columnOrder.get(d.id))
      .attr("transform", d => `translate(${d.x},54)`);
    colGroups.append("rect").attr("width", colW).attr("height", 310).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    colGroups.append("rect").attr("width", colW).attr("height", 34).attr("rx", 10).attr("fill", d => d.color).attr("fill-opacity", .86);
    colGroups.append("text").attr("class", "reverse-label").attr("x", colW / 2).attr("y", 22).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    revealIn(colGroups, (_, i) => .08 + i * .04, .34);
    const counts = new Map();
    const indexed = cards.map(card => {
      const preceding = counts.get(card.col) || 0;
      counts.set(card.col, preceding + 1);
      return { ...card, x: colById.get(card.col).x + 10, y: 104 + preceding * 92, columnOrder: columnOrder.get(card.col), order: preceding };
    });
    [...indexed]
      .sort((a, b) => d3.ascending(a.x, b.x) || d3.ascending(a.y, b.y))
      .forEach((card, revealOrder) => {
        card.revealOrder = revealOrder;
      });
    const cardRevealStart = .62;
    const cardRevealGap = .16;
    const cardGroups = svg.append("g").selectAll("g.kanban-card").data(indexed).join("g")
      .attr("class", "kanban-card")
      .attr("data-column", d => d.col)
      .attr("data-reveal-order", d => d.revealOrder)
      .attr("data-reveal-begin-ms", d => Math.round((cardRevealStart + d.revealOrder * cardRevealGap) * 1000))
      .attr("transform", d => `translate(${d.x},${d.y})`);
    cardGroups.append("rect").attr("width", colW - 20).attr("height", cardH).attr("rx", 8).attr("fill", palette.surface).attr("stroke", palette.gray300).attr("stroke-width", 1.3);
    cardGroups.append("rect").attr("x", 0).attr("y", 0).attr("width", 6).attr("height", cardH).attr("rx", 3).attr("fill", d => priorityColor[d.priority]);
    cardGroups.append("text").attr("class", "mark-label").attr("x", 16).attr("y", 21).attr("font-weight", 800).text(d => d.title);
    cardGroups.append("text").attr("class", "caption").attr("x", 16).attr("y", 43).text(d => d.ticket);
    cardGroups.append("text").attr("class", "caption").attr("x", 16).attr("y", 61).text(d => `${d.owner} / ${d.priority}`);
    revealIn(cardGroups, d => cardRevealStart + d.revealOrder * cardRevealGap, .34);
  }
```
