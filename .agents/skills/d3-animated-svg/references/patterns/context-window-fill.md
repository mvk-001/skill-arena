# Token Boxes To Context Window

- **Pattern ID:** `d3-context-window-fill`
- **Gallery source ID:** `context-window-fill`
- **Family:** Context
- **Use when:** Prompt tokens become ordered colored slots in a square context grid.
- **Renderer:** `renderTokenBoxesToContextWindow`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTokenBoxesToContextWindow() {
    const svg = prepareSvg("context-window-fill", "Token boxes to context window", "Token-owned text boxes become ordered colored slots in a square context grid.");
    const tokens = [
      { text: "AI", id: "15836", color: palette.blue, width: 42 },
      { text: "tools", id: "7526", color: palette.green, width: 66 },
      { text: "write", id: "3350", color: palette.orange, width: 68 },
      { text: "code", id: "2082", color: palette.red, width: 62 }
    ];
    const prompt = { x: 52, y: 46, w: 456, h: 86 };
    const gap = 13;
    const pad = 10;
    const sourceH = 42;
    const sourceY = prompt.y + 24;
    const totalWords = d3.sum(tokens, d => d.width) + gap * (tokens.length - 1);
    let cursor = prompt.x + (prompt.w - totalWords) / 2;
    tokens.forEach(token => {
      token.source = { x: cursor - pad, y: sourceY, w: token.width + pad * 2, h: sourceH };
      cursor += token.width + gap;
    });

    const idY = 166;
    const idGap = 18;
    const idW = 64;
    const totalIds = tokens.length * idW + (tokens.length - 1) * idGap;
    let idCursor = (width - totalIds) / 2;
    tokens.forEach(token => {
      token.idBox = { x: idCursor, y: idY, w: idW, h: 34 };
      idCursor += idW + idGap;
    });

    const matrix = { x: 198, y: 232, size: 176 };
    const rows = 8;
    const cols = 8;
    const cell = 16;
    const cellGap = 6;
    const gridSize = cols * cell + (cols - 1) * cellGap;
    const grid = {
      x: matrix.x + (matrix.size - gridSize) / 2,
      y: matrix.y + (matrix.size - gridSize) / 2
    };
    tokens.forEach((token, index) => {
      token.slot = {
        x: grid.x + index * (cell + cellGap),
        y: grid.y,
        w: cell,
        h: cell
      };
    });

    svg.append("rect")
      .attr("x", prompt.x)
      .attr("y", prompt.y)
      .attr("width", prompt.w)
      .attr("height", prompt.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);

    const cells = d3.range(rows * cols).map(index => ({
      index,
      row: Math.floor(index / cols),
      col: index % cols
    }));
    svg.append("g")
      .selectAll("rect")
      .data(cells)
      .join("rect")
      .attr("x", d => grid.x + d.col * (cell + cellGap))
      .attr("y", d => grid.y + d.row * (cell + cellGap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", palette.gray100)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2)
      .attr("opacity", .76)
      .each(function (_, index) {
        d3.select(this).append("animate")
          .attr("attributeName", "opacity")
          .attr("from", 0)
          .attr("to", .76)
          .attr("dur", ".42s")
          .attr("begin", `${1.45 + index * 0.004}s`)
          .attr("fill", "freeze");
      });

    const flowLayer = svg.append("g");
    tokens.forEach((token, index) => {
      const source = token.source;
      const id = token.idBox;
      const slot = token.slot;
      const begin = 0.62 + index * 0.08;
      const dur = 2.4;
      const keyTimes = "0;.34;.66;1";
      const line = d3.path();
      line.moveTo(source.x + source.w / 2, source.y + source.h + 4);
      line.bezierCurveTo(source.x + source.w / 2, 138, id.x + id.w / 2, 138, id.x + id.w / 2, id.y - 8);
      line.moveTo(id.x + id.w / 2, id.y + id.h + 8);
      line.bezierCurveTo(id.x + id.w / 2, 222, slot.x + slot.w / 2, 214, slot.x + slot.w / 2, slot.y - 6);
      const path = flowLayer.append("path")
        .attr("d", line.toString())
        .attr("fill", "none")
        .attr("stroke", token.color)
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("opacity", .24);
      drawPath(path, begin + .1, 1.4);
      path.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;.24;.18;0")
        .attr("keyTimes", "0;.2;.72;1")
        .attr("dur", `${dur}s`)
        .attr("begin", `${begin}s`)
        .attr("fill", "freeze");

      const card = svg.append("rect")
        .attr("x", slot.x)
        .attr("y", slot.y)
        .attr("width", slot.w)
        .attr("height", slot.h)
        .attr("rx", 3)
        .attr("fill", token.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.4);
      card.append("animate").attr("attributeName", "x").attr("values", `${source.x};${source.x};${id.x};${slot.x}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "y").attr("values", `${source.y};${source.y};${id.y};${slot.y}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "width").attr("values", `${source.w};${source.w};${id.w};${slot.w}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "height").attr("values", `${source.h};${source.h};${id.h};${slot.h}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "fill").attr("values", `${palette.surface};${palette.surface};${palette.surface};${token.color}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "opacity").attr("values", "0;.95;.95;1").attr("keyTimes", "0;.25;.66;1").attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");

      const word = svg.append("text")
        .attr("class", "mark-label")
        .attr("x", slot.x + slot.w / 2)
        .attr("y", slot.y + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 18)
        .attr("font-weight", 800)
        .attr("opacity", 0)
        .text(token.text);
      word.append("animate").attr("attributeName", "x").attr("values", `${source.x + source.w / 2};${source.x + source.w / 2};${id.x + id.w / 2};${slot.x + slot.w / 2}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "y").attr("values", `${source.y + 27};${source.y + 27};${id.y + 21};${slot.y + 12}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "font-size").attr("values", "28;28;16;8").attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "opacity").attr("values", "1;1;.15;0").attr("keyTimes", "0;.42;.68;1").attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");

      const idText = svg.append("text")
        .attr("class", "caption")
        .attr("x", slot.x + slot.w / 2)
        .attr("y", slot.y + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 15)
        .attr("font-weight", 800)
        .attr("fill", token.color)
        .attr("opacity", 0)
        .text(token.id);
      idText.append("animate").attr("attributeName", "x").attr("values", `${id.x + id.w / 2};${id.x + id.w / 2};${slot.x + slot.w / 2}`).attr("keyTimes", "0;.7;1").attr("dur", `${dur * .68}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
      idText.append("animate").attr("attributeName", "y").attr("values", `${id.y + 21};${id.y + 21};${slot.y + 12}`).attr("keyTimes", "0;.7;1").attr("dur", `${dur * .68}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
      idText.append("animate").attr("attributeName", "opacity").attr("values", "0;1;1;0").attr("keyTimes", "0;.16;.62;1").attr("dur", `${dur * .66}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
    });
  }
```
