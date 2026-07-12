# Vector Field

- **Pattern ID:** `d3-vector-field`
- **Gallery source ID:** `vector-field`
- **Family:** Field
- **Use when:** Direction and magnitude are encoded as small arrows.
- **Renderer:** `renderVectorField`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVectorField() {
    const svg = prepareSvg("vector-field", "Vector field", "Direction and magnitude are encoded with small arrows on a grid.");
    const x = d3.scaleLinear().domain([0, 6]).range([78, width - 70]);
    const y = d3.scaleLinear().domain([0, 4]).range([320, 78]);
    const data = d3.range(7).flatMap(i => d3.range(5).map(j => {
      const angle = Math.sin(i * .8) + Math.cos(j * .9);
      const mag = .55 + Math.abs(Math.sin(i + j * .7)) * .45;
      return { i, j, angle, mag };
    }));
    const color = quantizedRamp([.55, 1], [palette.gold, palette.orange, palette.red]);
    d3.range(7).forEach(i => svg.append("line").attr("x1", x(i)).attr("x2", x(i)).attr("y1", y(0)).attr("y2", y(4)).attr("stroke", palette.gray100));
    d3.range(5).forEach(j => svg.append("line").attr("x1", x(0)).attr("x2", x(6)).attr("y1", y(j)).attr("y2", y(j)).attr("stroke", palette.gray100));
    const arrows = svg.append("g").selectAll("g").data(data).join("g").attr("transform", d => `translate(${x(d.i)},${y(d.j)}) rotate(${d.angle * 48})`);
    arrows.append("line").attr("x1", -11).attr("x2", d => 18 * d.mag).attr("y1", 0).attr("y2", 0).attr("stroke", d => color(d.mag)).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
    arrows.append("path").attr("d", d3.symbol().type(d3.symbolTriangle).size(42)).attr("transform", d => `translate(${18 * d.mag},0) rotate(90)`).attr("fill", d => color(d.mag));
    fadeIn(arrows, .025, .55);
  }
```
