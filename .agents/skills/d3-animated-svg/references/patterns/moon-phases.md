# Moon Phases

- **Pattern ID:** `d3-moon-phases`
- **Gallery source ID:** `moon-phases`
- **Family:** Astronomy
- **Use when:** Repeated masks show the lunar cycle as changing illumination.
- **Renderer:** `renderMoonPhases`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMoonPhases() {
    const svg = prepareSvg("moon-phases", "Moon phases", "Projected terminators show a simplified waxing lunar illumination cycle.");
    const phases = d3.range(8).map(i => ({ i, phase: i / 7 }));
    const moonRadius = 34;
    const illuminatedPath = phase => {
      if (phase <= 0) return null;
      const terminatorRadius = moonRadius * Math.abs(1 - 2 * phase);
      const terminator = terminatorRadius < .001
        ? `L0,${-moonRadius}`
        : `A${terminatorRadius},${moonRadius} 0 0 ${phase < .5 ? 0 : 1} 0,${-moonRadius}`;
      return `M0,${-moonRadius}A${moonRadius},${moonRadius} 0 0 1 0,${moonRadius}${terminator}Z`;
    };
    const groups = svg.append("g").selectAll("g").data(phases).join("g")
      .attr("data-phase-index", d => d.i)
      .attr("data-illumination-fraction", d => d3.format(".3f")(d.phase))
      .attr("data-phase-direction", "waxing")
      .attr("transform", d => `translate(${74 + (d.i % 4) * 136},${128 + Math.floor(d.i / 4) * 128})`);
    groups.append("circle").attr("r", moonRadius).attr("fill", palette.gray900);
    groups.append("path")
      .attr("data-lit-hemisphere", "right")
      .attr("data-terminator-radius", d => d3.format(".3f")(moonRadius * Math.abs(1 - 2 * d.phase)))
      .attr("d", d => illuminatedPath(d.phase))
      .attr("fill", palette.yellowHighlight);
    groups.append("circle").attr("r", moonRadius).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 2);
    fadeIn(groups, .08, .65);
    groups.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 56).text(d => `${Math.round(d.phase * 100)}%`);
  }
```
