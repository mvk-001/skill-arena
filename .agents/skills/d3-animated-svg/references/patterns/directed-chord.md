# Directed Chord

- **Pattern ID:** `d3-directed-chord`
- **Gallery source ID:** `directed-chord`
- **Family:** Flow
- **Use when:** Asymmetric ribbons expose sender and receiver imbalance.
- **Renderer:** `renderDirectedChord`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDirectedChord() {
    const svg = prepareSvg("directed-chord", "Directed chord", "Asymmetric ribbons expose sender and receiver imbalance.");
    const names = ["API", "Data", "Ops", "UX", "ML"];
    const matrix = [
      [0, 18, 7, 10, 14],
      [8, 0, 16, 5, 18],
      [14, 6, 0, 15, 4],
      [9, 12, 5, 0, 13],
      [5, 14, 10, 7, 0]
    ];
    const outer = 154, inner = 142;
    const chord = d3.chord().padAngle(.045).sortSubgroups(d3.descending)(matrix);
    const arc = d3.arc().innerRadius(inner).outerRadius(outer);
    const ribbon = d3.ribbon().radius(inner - 2);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const groups = center.append("g").selectAll("path").data(chord.groups).join("path")
      .attr("d", arc).attr("fill", d => colors[d.index]).attr("stroke", "#fff").attr("stroke-width", 1.4);
    fadeIn(groups, .08, .55);
    const ribbons = center.append("g").attr("fill-opacity", .55).selectAll("path").data(chord).join("path")
      .attr("d", ribbon).attr("fill", d => colors[d.source.index]).attr("stroke", d => colors[d.source.index]).attr("stroke-width", .7);
    fadeIn(ribbons, .16, .75);
    center.selectAll("text").data(chord.groups).join("text")
      .attr("class", "mark-label")
      .attr("transform", d => {
        const a = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return `translate(${Math.cos(a) * 181},${Math.sin(a) * 181})`;
      })
      .attr("text-anchor", "middle").text(d => names[d.index]);
  }
```
