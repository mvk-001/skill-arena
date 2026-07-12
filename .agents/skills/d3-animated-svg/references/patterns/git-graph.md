# D3 Git Graph

- **Pattern ID:** `d3-git-graph`
- **Gallery source ID:** `git-graph`
- **Family:** Diagram
- **Use when:** Branches, commits, merge curves, and commit labels as SVG geometry.
- **Renderer:** `renderD3GitGraph`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderD3GitGraph() {
    const svg = prepareSvg("git-graph", "D3 git graph", "Branch lanes, commits, and merge geometry rendered without Mermaid.");
    const lanes = { main: 156, examples: 252 };
    const commits = [
      { id: "init", branch: "main", x: 70, y: lanes.main, color: palette.blue },
      { id: "mmd", branch: "examples", x: 160, y: lanes.examples, color: palette.green, highlight: true },
      { id: "md", branch: "examples", x: 250, y: lanes.examples, color: palette.green },
      { id: "validator", branch: "main", x: 250, y: lanes.main, color: palette.orange },
      { id: "merge", branch: "main", x: 370, y: lanes.main, color: palette.purple, label: "examples/mermaid" },
      { id: "verify", branch: "main", x: 488, y: lanes.main, color: palette.red }
    ];
    const mainLine = svg.append("path").attr("d", `M${commits[0].x},${lanes.main}H${commits.at(-1).x}`).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 4).attr("stroke-linecap", "round");
    const branchLine = svg.append("path").attr("d", `M${commits[0].x},${lanes.main}C104,${lanes.main} 108,${lanes.examples} 160,${lanes.examples}H250C308,${lanes.examples} 318,${lanes.main} 370,${lanes.main}`).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 4).attr("stroke-linecap", "round");
    drawPath(mainLine, .08, .9);
    drawPath(branchLine, .22, 1.05);
    Object.entries(lanes).forEach(([name, y]) => {
      svg.append("text").attr("class", "mark-label").attr("x", 34).attr("y", y + 4).attr("text-anchor", "start").attr("font-weight", 800).text(name);
    });
    const groups = svg.append("g").selectAll("g.git-commit").data(commits).join("g")
      .attr("class", "git-commit")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle").attr("fill", d => d.color).attr("stroke", palette.surface).attr("stroke-width", d => d.highlight ? 4 : 2.2);
    grow(circles, "r", 4, d => d.highlight ? 13 : 10, .35, .5);
    groups.append("text").attr("class", "label").attr("y", d => d.branch === "main" ? -22 : 28).attr("text-anchor", "middle").attr("font-weight", d => d.highlight ? 800 : 600).text(d => d.id);
    svg.append("text").attr("class", "caption").attr("x", 370).attr("y", lanes.main + 32).attr("text-anchor", "middle").text("examples/mermaid");
  }
```
