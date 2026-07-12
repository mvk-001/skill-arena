# D3 ER Schema

- **Pattern ID:** `d3-er-schema`
- **Gallery source ID:** `er-schema`
- **Family:** Diagram
- **Use when:** Entity tables and cardinality connectors generated from structured records.
- **Renderer:** `renderD3ErSchema`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3ErSchema() {
    const svg = prepareSvg("er-schema", "D3 ER schema", "Entity tables and relationship cardinalities rendered directly with D3.");
    const entities = [
      { id: "CUSTOMER", x: 44, y: 60, fields: ["customer_id PK", "email", "status"], color: palette.blue },
      { id: "ORDER", x: 228, y: 60, fields: ["order_id PK", "created_at", "state"], color: palette.orange },
      { id: "LINE_ITEM", x: 228, y: 246, fields: ["line_id PK", "quantity"], color: palette.green },
      { id: "PRODUCT", x: 410, y: 246, fields: ["sku PK", "name", "price"], color: palette.purple }
    ];
    const box = { w: 128, header: 28, row: 21 };
    entities.forEach(d => { d.h = box.header + d.fields.length * box.row + 10; });
    const byId = new Map(entities.map(d => [d.id, d]));
    const relations = [
      { a: "CUSTOMER", b: "ORDER", label: "places", ca: "1", cb: "0..n", sideA: "right", sideB: "left" },
      { a: "ORDER", b: "LINE_ITEM", label: "contains", ca: "1", cb: "1..n", sideA: "bottom", sideB: "top" },
      { a: "LINE_ITEM", b: "PRODUCT", label: "references", ca: "0..n", cb: "1", sideA: "right", sideB: "left" }
    ];
    const anchor = (entity, side) => {
      if (side === "right") return { x: entity.x + box.w, y: entity.y + entity.h / 2 };
      if (side === "left") return { x: entity.x, y: entity.y + entity.h / 2 };
      if (side === "bottom") return { x: entity.x + box.w / 2, y: entity.y + entity.h };
      return { x: entity.x + box.w / 2, y: entity.y };
    };
    const paths = svg.append("g").selectAll("path.er-link").data(relations).join("path")
      .attr("class", "er-link")
      .attr("d", d => {
        const a = anchor(byId.get(d.a), d.sideA);
        const b = anchor(byId.get(d.b), d.sideB);
        const mx = (a.x + b.x) / 2;
        return d.sideA === "bottom" ? `M${a.x},${a.y}V${(a.y + b.y) / 2}H${b.x}V${b.y}` : `M${a.x},${a.y}C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
      })
      .attr("fill", "none")
      .attr("stroke", palette.purple)
      .attr("stroke-width", 2.1)
      .attr("stroke-opacity", .75);
    drawPath(paths, .12, .85);
    svg.append("g").selectAll("text.er-cardinality-a").data(relations).join("text")
      .attr("class", "caption")
      .attr("x", d => anchor(byId.get(d.a), d.sideA).x + (d.sideA === "right" ? 8 : -8))
      .attr("y", d => anchor(byId.get(d.a), d.sideA).y - 8)
      .attr("text-anchor", d => d.sideA === "right" ? "start" : "end")
      .attr("font-weight", 800)
      .text(d => d.ca);
    svg.append("g").selectAll("text.er-cardinality-b").data(relations).join("text")
      .attr("class", "caption")
      .attr("x", d => anchor(byId.get(d.b), d.sideB).x + (d.sideB === "left" ? -8 : 8))
      .attr("y", d => anchor(byId.get(d.b), d.sideB).y - 8)
      .attr("text-anchor", d => d.sideB === "left" ? "end" : "start")
      .attr("font-weight", 800)
      .text(d => d.cb);
    const groups = svg.append("g").selectAll("g.er-entity").data(entities).join("g")
      .attr("class", "er-entity")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.append("rect").attr("width", box.w).attr("height", d => d.h).attr("rx", 8).attr("fill", palette.surface).attr("stroke", d => d.color).attr("stroke-width", 2);
    groups.append("rect").attr("width", box.w).attr("height", box.header).attr("rx", 8).attr("fill", d => d.color).attr("fill-opacity", .88);
    groups.append("text").attr("class", "reverse-label").attr("x", box.w / 2).attr("y", 19).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    groups.each(function (entity) {
      d3.select(this).selectAll("text.er-field").data(entity.fields).join("text")
        .attr("class", "caption")
        .attr("x", 10)
        .attr("y", (_, i) => box.header + 20 + i * box.row)
        .text(d => d);
    });
    fadeIn(groups, .18, .45);
  }
```
