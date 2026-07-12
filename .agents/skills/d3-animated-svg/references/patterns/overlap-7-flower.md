# Symmetric Seven Circle Flower

- **Pattern ID:** `d3-overlap-7-flower`
- **Gallery source ID:** `overlap-7-flower`
- **Family:** Symmetric Overlap
- **Use when:** A center circle plus six equal neighbors forms a stable flower layout.
- **Renderer:** `renderSymmetricSevenCircleFlower`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSymmetricSevenCircleFlower() {
    const center = { x: 280, y: 210 };
    const outer = [
      ["input", "IN", "Input", palette.blue],
      ["embed", "EM", "Embed", palette.orange],
      ["attend", "AT", "Attend", palette.green],
      ["route", "RT", "Route", palette.purple],
      ["decode", "DC", "Decode", palette.red],
      ["eval", "EV", "Eval", palette.blueHover]
    ];
    const ring = vennRosettePoints(6, center, 82);
    const circles = [
      makeVennCircle("core", "LL", "Core", center.x, center.y, 82, palette.gold, center.x, center.y, { center: true, hideExternalLabel: true })
    ].concat(outer.map((item, index) => makeVennCircle(
      item[0],
      item[1],
      item[2],
      ring[index].x,
      ring[index].y,
      82,
      item[3],
      index === 3 ? 420 : center.x + Math.cos(ring[index].angle) * 210,
      index === 3 ? 330 : center.y + Math.sin(ring[index].angle) * 148
    )));
    renderVennPattern("overlap-7-flower", "Symmetric seven circle flower", "A center circle plus six equal neighboring domains in a stable flower pattern.", {
      layout: "symmetric-7-flower",
      center,
      guideCircle: { ...center, r: 82 },
      centerLabel: ["Core", "+ six"],
      note: "one center with six equal neighbors",
      opacity: .27,
      circles
    });
  }
```
