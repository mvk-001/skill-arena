# Sketchy Beeswarm

- **Pattern ID:** `d3-sketchy-beeswarm`
- **Gallery source ID:** `sketchy-beeswarm`
- **Family:** Sketchy
- **Use when:** The beeswarm distribution is redrawn with seeded hand-sketched dots and axes.
- **Renderer:** `renderSketchyBeeswarm`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyBeeswarm() {
    const svg = prepareSvg("sketchy-beeswarm", "Sketchy beeswarm", "Individual observations settle into grouped swarms with seeded rough dots.");
    const data = [
      ["Baseline", 34], ["Baseline", 41], ["Baseline", 46], ["Baseline", 52], ["Baseline", 57], ["Baseline", 63], ["Baseline", 69], ["Baseline", 74],
      ["Pilot", 39], ["Pilot", 48], ["Pilot", 54], ["Pilot", 59], ["Pilot", 67], ["Pilot", 73], ["Pilot", 81], ["Pilot", 86],
      ["Scaled", 45], ["Scaled", 53], ["Scaled", 61], ["Scaled", 68], ["Scaled", 76], ["Scaled", 83], ["Scaled", 88], ["Scaled", 92]
    ].map((d, i) => ({ id: `sp${i}`, group: d[0], score: d[1] }));
    const margin = { top: 42, right: 30, bottom: 58, left: 84 };
    const x = d3.scaleLinear().domain([30, 95]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(["Baseline", "Pilot", "Scaled"]).range([96, 302]).padding(.5);
    const groupColor = new Map([["Baseline", palette.blue], ["Pilot", palette.orange], ["Scaled", palette.green]]);
    const nodes = data.map(d => ({ ...d, x: x(d.score), y: y(d.group) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => x(d.score)).strength(.95))
      .force("y", d3.forceY(d => y(d.group)).strength(.25))
      .force("collide", d3.forceCollide(11)).stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();

    x.ticks(6).forEach((tick, i) => {
      appendSketchStroke(svg, [[x(tick), 76], [x(tick), 322]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 860 + i,
        roughness: .65,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, 322, 6, 880);
    y.domain().forEach((group, i) => {
      appendSketchStroke(svg, [[margin.left, y(group)], [width - margin.right, y(group)]], {
        stroke: palette.gray200,
        strokeWidth: 1.25,
        opacity: .56,
        seed: 900 + i,
        roughness: .9,
        delay: .04,
        dur: .5
      });
      svg.append("text")
        .attr("class", "label")
        .attr("x", margin.left - 18)
        .attr("y", y(group) + 4)
        .attr("text-anchor", "end")
        .text(group);
    });

    nodes.sort((a, b) => a.score - b.score).forEach((d, i) => {
      appendSketchBlob(svg, d.x, d.y, 8.6, {
        fill: groupColor.get(d.group),
        fillOpacity: .72,
        stroke: palette.surface,
        strokeWidth: 1.2,
        seed: 930 + i * 17,
        roughness: .18,
        edgeRoughness: 1.15,
        delay: .12 + i * .018,
        dur: .5
      });
    });
  }
```
