# Solar Path

- **Pattern ID:** `d3-solar-path`
- **Gallery source ID:** `solar-path`
- **Family:** Astronomy
- **Use when:** Seasonal sun arcs cross a local horizon diagram.
- **Renderer:** `renderSolarPath`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSolarPath() {
    const svg = prepareSvg("solar-path", "Solar path", "Seasonal sun arcs cross a local horizon diagram.");
    const cx = width / 2, horizon = 326;
    svg.append("line").attr("x1", 54).attr("x2", width - 54).attr("y1", horizon).attr("y2", horizon).attr("stroke", palette.ink).attr("stroke-width", 2);
    const seasons = [
      { name: "winter", h: 82, c: palette.blue },
      { name: "equinox", h: 142, c: palette.green },
      { name: "summer", h: 206, c: palette.orange }
    ];
    const paths = svg.append("g").selectAll("path").data(seasons).join("path")
      .attr("d", d => `M78,${horizon}Q${cx},${horizon - d.h} ${width - 78},${horizon}`)
      .attr("fill", "none").attr("stroke", d => d.c).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(paths, .08, .95);
    seasons.forEach((s, i) => svg.append("text").attr("class", "mark-label").attr("fill", s.c).attr("x", width - 66).attr("y", horizon - s.h * .48 + i * 2).attr("text-anchor", "end").text(s.name));
    const sun = svg.append("circle").attr("r", 9).attr("fill", palette.gold).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    sun.append("animateMotion").attr("dur", "3s").attr("repeatCount", "indefinite")
      .append("mpath").attr("href", "#solar-path-motion");
    svg.append("path").attr("id", "solar-path-motion").attr("d", `M78,${horizon}Q${cx},${horizon - 206} ${width - 78},${horizon}`).attr("fill", "none").attr("stroke", "none");
  }
```
