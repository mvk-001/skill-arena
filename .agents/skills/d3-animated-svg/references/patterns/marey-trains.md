# Marey Trains

- **Pattern ID:** `d3-marey-trains`
- **Gallery source ID:** `marey-trains`
- **Family:** Schedule
- **Use when:** Moving services appear as diagonal space-time trajectories.
- **Renderer:** `renderMareyTrains`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMareyTrains() {
    const svg = prepareSvg("marey-trains", "Marey trains", "Space-time trajectories show scheduled movement between stops.");
    const stations = ["North", "Civic", "Market", "Harbor", "South"];
    const services = d3.range(7).map(i => ({
      id: `T${i + 1}`,
      start: 6 + i * 1.15,
      speed: .82 + (i % 3) * .08,
      color: colors[i % colors.length]
    }));
    const latestArrival = d3.max(services, service => service.start + (stations.length - 1) * service.speed);
    const x = d3.scaleLinear().domain([6, Math.ceil(latestArrival * 2) / 2]).range([70, width - 42]);
    const y = d3.scalePoint().domain(stations).range([72, 318]);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("text").data(stations).join("text")
      .attr("class", "mark-label").attr("x", 58).attr("y", d => y(d) + 4).attr("text-anchor", "end").text(d => d);
    stations.forEach(station => svg.append("line").attr("x1", x(6)).attr("x2", x(15)).attr("y1", y(station)).attr("y2", y(station)).attr("stroke", palette.gray100));
    const line = d3.line().x(d => x(d.time)).y(d => y(d.station));
    const paths = svg.append("g").selectAll("path").data(services).join("path")
      .attr("d", service => line(stations.map((station, si) => ({ station, time: service.start + si * service.speed }))))
      .attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    drawPath(paths, .08, 1);
  }
```
