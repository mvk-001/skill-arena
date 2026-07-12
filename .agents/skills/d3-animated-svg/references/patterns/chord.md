# Chord Ribbons

- **Pattern ID:** `d3-chord`
- **Gallery source ID:** `chord`
- **Family:** Flow
- **Use when:** Reciprocal category-to-category volume.
- **Renderer:** `renderChord`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderChord() {
    const svg = prepareSvg("chord", "Chord ribbons", "D3 chord layout showing reciprocal category flow.");
    const names = ["Research", "Build", "Ship", "Support"];
    const matrix = [[0, 18, 7, 4], [9, 0, 21, 8], [5, 11, 0, 17], [8, 5, 13, 0]];
    const color = d3.scaleOrdinal(names, [palette.blue, palette.orange, palette.green, palette.purple]);
    const outerRadius = 142;
    const innerRadius = outerRadius - 18;
    const groupArc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
    const ribbon = d3.ribbon().radius(innerRadius - 2).padAngle(.02);
    const chord = d3.chord().padAngle(.06).sortSubgroups(d3.descending)(matrix);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const ribbons = g.append("g").attr("fill-opacity", .68).selectAll("path").data(chord).join("path")
      .attr("d", ribbon).attr("fill", d => color(names[d.source.index]))
      .attr("stroke", d => d3.color(color(names[d.source.index])).darker(.55));
    fadeIn(ribbons, .25, .95);
    const groups = g.append("g").selectAll("g").data(chord.groups).join("g");
    groups.append("path").attr("d", groupArc).attr("fill", d => color(names[d.index])).attr("stroke", "#ffffff").attr("stroke-width", 1.5);
    groups.append("text").attr("class", "mark-label").attr("dy", "0.35em").attr("transform", d => {
      const angle = (d.startAngle + d.endAngle) / 2;
      const rotate = angle * 180 / Math.PI - 90;
      const flip = angle > Math.PI ? " rotate(180)" : "";
      return `rotate(${rotate}) translate(${outerRadius + 14})${flip}`;
    }).attr("text-anchor", d => ((d.startAngle + d.endAngle) / 2) > Math.PI ? "end" : "start").text(d => names[d.index]);
    fadeIn(groups, .05, .7);
  }
```
