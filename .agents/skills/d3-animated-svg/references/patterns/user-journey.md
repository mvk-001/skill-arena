# D3 User Journey

- **Pattern ID:** `d3-user-journey`
- **Gallery source ID:** `user-journey`
- **Family:** Diagram
- **Use when:** Journey sections, steps, actors, and satisfaction scores as a custom chart.
- **Renderer:** `renderD3UserJourney`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3UserJourney() {
    const svg = prepareSvg("user-journey", "D3 user journey", "A journey diagram rendered as scored steps and actor participation.");
    const steps = [
      { section: "Discover", label: "Open", score: 4, actors: ["R"] },
      { section: "Discover", label: "Pick", score: 5, actors: ["R"] },
      { section: "Inspect", label: "Colors", score: 5, actors: ["R", "M"] },
      { section: "Inspect", label: "Shapes", score: 4, actors: ["R"] },
      { section: "Reuse", label: "Copy", score: 5, actors: ["M"] },
      { section: "Reuse", label: "Palette", score: 3, actors: ["M"] }
    ];
    const x = d3.scalePoint().domain(d3.range(steps.length)).range([58, 512]);
    const y = d3.scaleLinear().domain([1, 5]).range([318, 104]);
    const sectionColors = { Discover: palette.blueHighlight, Inspect: palette.greenHighlight, Reuse: palette.purpleHighlight };
    const line = d3.line().x((_, i) => x(i)).y(d => y(d.score)).curve(d3.curveMonotoneX);
    const sections = d3.groups(steps, d => d.section).map(([section, values]) => {
      const indexes = values.map(d => steps.indexOf(d));
      return { section, x0: x(d3.min(indexes)) - 36, x1: x(d3.max(indexes)) + 36 };
    });
    svg.append("g").selectAll("rect.journey-section").data(sections).join("rect")
      .attr("class", "journey-section")
      .attr("x", d => d.x0)
      .attr("y", 54)
      .attr("width", d => d.x1 - d.x0)
      .attr("height", 34)
      .attr("rx", 8)
      .attr("fill", d => sectionColors[d.section])
      .attr("stroke", palette.surface);
    svg.append("g").selectAll("text.journey-section-label").data(sections).join("text")
      .attr("class", "mark-label")
      .attr("x", d => (d.x0 + d.x1) / 2)
      .attr("y", 76)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .text(d => d.section);
    svg.append("g").attr("class", "axis").attr("transform", "translate(0,0)").call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5])).attr("transform", "translate(36,0)");
    const path = svg.append("path").datum(steps).attr("d", line).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(path, .18, .95);
    const groups = svg.append("g").selectAll("g.journey-step").data(steps).join("g")
      .attr("class", "journey-step")
      .attr("transform", (d, i) => `translate(${x(i)},${y(d.score)})`);
    const circles = groups.append("circle").attr("fill", d => d.score >= 5 ? palette.green : d.score <= 3 ? palette.red : palette.orange).attr("stroke", palette.surface).attr("stroke-width", 2.2);
    grow(circles, "r", 4, 13, .35, .45);
    groups.append("text").attr("class", "reverse-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.score);
    svg.append("g").selectAll("text.journey-label").data(steps).join("text")
      .attr("class", "label")
      .attr("x", (_, i) => x(i))
      .attr("y", 356)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .attr("font-weight", 800)
      .text(d => d.label);
    const actorMarks = svg.append("g").selectAll("g.journey-actors").data(steps).join("g")
      .attr("class", "journey-actors")
      .attr("transform", (d, i) => `translate(${x(i)},378)`);
    actorMarks.each(function (d) {
      const group = d3.select(this);
      d.actors.forEach((actor, i) => {
        const cx = (i - (d.actors.length - 1) / 2) * 18;
        group.append("circle").attr("cx", cx).attr("cy", 0).attr("r", 8).attr("fill", actor === "R" ? palette.blueHighlight : palette.purpleHighlight).attr("stroke", actor === "R" ? palette.blue : palette.purple);
        group.append("text").attr("class", "mark-label").attr("x", cx).attr("y", 4).attr("text-anchor", "middle").style("font-size", "9px").attr("font-weight", 800).text(actor);
      });
    });
  }
```
