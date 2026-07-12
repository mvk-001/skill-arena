# Occlusion Labels

- **Pattern ID:** `d3-occlusion-labels`
- **Gallery source ID:** `occlusion-labels`
- **Family:** Labels
- **Use when:** Dense labels resolve into a readable non-overlapping subset.
- **Renderer:** `renderOcclusionLabels`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderOcclusionLabels() {
    const svg = prepareSvg("occlusion-labels", "Occlusion labels", "Dense labels resolve into a readable non-overlapping subset.");
    const raw = d3.range(34).map(i => ({
      x: 82 + ((i * 61) % 402),
      y: 74 + ((i * 47 + i * i * 3) % 260),
      label: `P${i + 1}`,
      priority: ((i * 17) % 100)
    })).sort((a, b) => d3.descending(a.priority, b.priority));
    const kept = [];
    raw.forEach(d => {
      const box = { x0: d.x + 7, y0: d.y - 15, x1: d.x + 42, y1: d.y + 4 };
      const overlaps = kept.some(k => !(box.x1 < k.box.x0 || box.x0 > k.box.x1 || box.y1 < k.box.y0 || box.y0 > k.box.y1));
      if (!overlaps) kept.push({ ...d, box });
    });
    const dots = svg.append("g").selectAll("circle").data(raw).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", palette.blue).attr("fill-opacity", .65);
    grow(dots, "r", 1.5, 3.5, .04, .45);
    const labels = svg.append("g").selectAll("g").data(kept).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    labels.append("line").attr("x1", 4).attr("x2", 10).attr("y1", -3).attr("y2", -10).attr("stroke", palette.gray400);
    labels.append("text").attr("class", "mark-label").attr("x", 12).attr("y", -12).text(d => d.label);
    fadeIn(labels, .18, .55);
    svg.append("text").attr("class", "mark-label").attr("x", 60).attr("y", 358).text(`${kept.length} labels kept from ${raw.length} candidates`);
  }
```
