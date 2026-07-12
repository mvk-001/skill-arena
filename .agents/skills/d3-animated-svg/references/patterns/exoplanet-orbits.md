# Exoplanet Orbits

- **Pattern ID:** `d3-exoplanet-orbits`
- **Gallery source ID:** `exoplanet-orbits`
- **Family:** Science
- **Use when:** Orbital radius and planet size encode a compact science catalog.
- **Renderer:** `renderExoplanetOrbits`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderExoplanetOrbits() {
    const svg = prepareSvg("exoplanet-orbits", "Exoplanet orbits", "Orbital radius and planet size encode a compact science catalog.");
    const systems = [
      { name: "Kepler-1", x: 120, planets: [22, 46, 76] },
      { name: "TRAPPIST", x: 280, planets: [18, 30, 42, 58, 74, 94] },
      { name: "HD 403", x: 436, planets: [28, 54, 104] }
    ];
    systems.forEach((system, si) => {
      const cy = height / 2 + 10;
      svg.append("circle").attr("cx", system.x).attr("cy", cy).attr("r", 8).attr("fill", palette.gold).attr("stroke", "#fff").attr("stroke-width", 2);
      const systemColor = [palette.blue, palette.purple, palette.green][si];
      const orbits = svg.append("g").selectAll("circle.orbit").data(system.planets).join("circle")
        .attr("class", "orbit").attr("cx", system.x).attr("cy", cy).attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-opacity", .72).attr("stroke-width", 1.2);
      grow(orbits, "r", 4, d => d, .06 + si * .04, .5);
      const planets = svg.append("g").selectAll("circle.planet").data(system.planets).join("circle")
        .attr("class", "planet").attr("cx", d => system.x + d).attr("cy", (d, i) => cy + Math.sin(i * 1.7) * 8)
        .attr("fill", systemColor).attr("fill-opacity", .88).attr("stroke", "#fff").attr("stroke-width", 1.3);
      grow(planets, "r", 2, (d, i) => 4 + (i % 3) * 1.8, .12 + si * .04, .45);
      svg.append("text").attr("class", "mark-label").attr("x", system.x).attr("y", 348).attr("text-anchor", "middle").text(system.name);
    });
  }
```
