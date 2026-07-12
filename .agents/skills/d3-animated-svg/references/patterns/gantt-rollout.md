# D3 Gantt Rollout

- **Pattern ID:** `d3-gantt-rollout`
- **Gallery source ID:** `gantt-rollout`
- **Family:** Diagram
- **Use when:** Time-scaled tasks, sections, dependencies, milestones, and today marker.
- **Renderer:** `renderD3GanttRollout`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3GanttRollout() {
    const svg = prepareSvg("gantt-rollout", "D3 Gantt rollout", "A Mermaid-style rollout schedule drawn with D3 time scales.");
    const parse = d3.timeParse("%Y-%m-%d");
    const tasks = [
      { section: "Build", name: "Draft sources", start: "2026-06-19", end: "2026-06-21", status: "active", color: palette.blue },
      { section: "Build", name: "Add wrappers", start: "2026-06-21", end: "2026-06-22", status: "normal", color: palette.green },
      { section: "Build", name: "Validate", start: "2026-06-22", end: "2026-06-23", status: "crit", color: palette.red },
      { section: "Release", name: "Review palette", start: "2026-06-23", end: "2026-06-24", status: "normal", color: palette.orange },
      { section: "Release", name: "Publish", start: "2026-06-24", end: "2026-06-24", status: "milestone", color: palette.purple }
    ].map(d => ({ ...d, startDate: parse(d.start), endDate: parse(d.end) }));
    const x = d3.scaleTime().domain([parse("2026-06-19"), parse("2026-06-25")]).range([142, 518]);
    const y = d3.scaleBand().domain(tasks.map(d => d.name)).range([82, 326]).padding(.34);
    svg.append("g").attr("class", "axis").attr("transform", "translate(0,348)").call(d3.axisBottom(x).ticks(d3.timeDay.every(1)).tickFormat(d3.timeFormat("%b %d")));
    svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(d3.timeDay.every(1))).join("line")
      .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 56).attr("y2", 340);
    const sections = d3.group(tasks, d => d.section);
    [...sections].forEach(([name, rows]) => {
      const y0 = d3.min(rows, d => y(d.name));
      svg.append("text").attr("class", "mark-label").attr("x", 32).attr("y", y0 - 8).attr("font-weight", 800).style("font-size", "10px").text(name);
    });
    svg.append("g").selectAll("text.task-label").data(tasks).join("text")
      .attr("class", "label")
      .attr("x", 132)
      .attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .style("font-size", "10px")
      .text(d => d.name);
    const bars = svg.append("g").selectAll("g.gantt-task").data(tasks).join("g").attr("class", "gantt-task");
    bars.filter(d => d.status !== "milestone").append("rect")
      .attr("x", d => x(d.startDate))
      .attr("y", d => y(d.name))
      .attr("height", y.bandwidth())
      .attr("width", d => Math.max(8, x(d.endDate) - x(d.startDate)))
      .attr("rx", 7)
      .attr("fill", d => d.color)
      .attr("fill-opacity", .82)
      .attr("stroke", d => d.status === "crit" ? palette.redHover : palette.surface)
      .attr("stroke-width", d => d.status === "crit" ? 2.4 : 1.2);
    bars.filter(d => d.status === "milestone").append("path")
      .attr("d", d => {
        const cx = x(d.startDate), cy = y(d.name) + y.bandwidth() / 2;
        return `M${cx},${cy - 12}L${cx + 12},${cy}L${cx},${cy + 12}L${cx - 12},${cy}Z`;
      })
      .attr("fill", d => d.color);
    fadeIn(bars, .18, .45);
    const today = svg.append("line").attr("x1", x(parse("2026-06-22"))).attr("x2", x(parse("2026-06-22"))).attr("y1", 54).attr("y2", 338).attr("stroke", palette.green).attr("stroke-width", 3).attr("stroke-opacity", .72);
    drawPath(today, .55, .7);
  }
```
