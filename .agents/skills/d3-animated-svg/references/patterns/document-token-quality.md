# Document Token Quality

- **Pattern ID:** `d3-document-token-quality`
- **Gallery source ID:** `document-token-quality`
- **Family:** Document
- **Use when:** Three document blocks encode correct, filler, and wrong word-length shares at 20/70/10, 10/85/5, and 70/10/20.
- **Renderer:** `renderDocumentTokenQuality`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDocumentTokenQuality() {
    renderDocumentTokenQualityVariant(
      "document-token-quality",
      "Document token quality",
      "Document word blocks encode correct, filler, and wrong spans by accumulated word length.",
      { wrong: { fill: palette.gold, stroke: palette.yellowHover } }
    );
  }
```
