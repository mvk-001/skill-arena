# H-R Diagram

- **Pattern ID:** `d3-hr-diagram`
- **Gallery source ID:** `hr-diagram`
- **Family:** Science
- **Use when:** Stars map temperature and luminosity into a scientific scatter.
- **Renderer:** `renderHrDiagram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderHrDiagram() {
    const svg = prepareSvg("hr-diagram", "Hertzsprung-Russell diagram", "Stars map temperature and luminosity into a scientific scatter.");
    const data = d3.range(140).map(i => {
      const hot = (i * 37) % 100;
      const temp = 3300 + hot * 72;
      const lum = Math.pow(10, -1.2 + ((i * 53) % 100) / 24 + Math.sin(i / 11) * .5);
      return { temp, lum, type: hot > 70 ? "hot" : hot < 26 ? "cool" : "main" };
    });
    const margin = { top: 46, right: 38, bottom: 58, left: 70 };
    const x = d3.scaleLinear().domain([10500, 3000]).range([margin.left, width - margin.right]);
    const y = d3.scaleLog().domain([.04, 1000]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.temp)).attr("cy", d => y(d.lum)).attr("fill", d => d.type === "hot" ? "#cdf3ff" : d.type === "cool" ? "#ffe5cc" : "#fff4cc")
      .attr("stroke", d => d.type === "hot" ? palette.blue : d.type === "cool" ? palette.orange : palette.gold).attr("stroke-width", .8).attr("fill-opacity", .78);
    grow(dots, "r", 1, d => d.type === "main" ? 3.5 : 5.5, .02, .5);
  }
```
