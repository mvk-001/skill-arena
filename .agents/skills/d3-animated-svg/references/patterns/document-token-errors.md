# Document Token Quality Red

- **Pattern ID:** `d3-document-token-errors`
- **Gallery source ID:** `document-token-errors`
- **Family:** Document
- **Use when:** The same document-quality pattern uses red for wrong spans while preserving the length-weighted ratios and paragraph spacing.
- **Renderer:** `renderDocumentTokenQualityRed`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDocumentTokenQualityRed() {
    renderDocumentTokenQualityVariant(
      "document-token-errors",
      "Document token quality red",
      "Document word blocks encode correct, filler, and red wrong spans by accumulated word length.",
      { wrong: { fill: palette.red, stroke: palette.redHover } }
    );
  }
```
