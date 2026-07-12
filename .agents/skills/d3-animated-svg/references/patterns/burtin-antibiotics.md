# Burtin Antibiotics

- **Pattern ID:** `d3-burtin-antibiotics`
- **Gallery source ID:** `burtin-antibiotics`
- **Family:** Radial matrix
- **Use when:** A radial sensitivity matrix compares organisms and treatments.
- **Renderer:** `renderBurtinAntibiotics`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderBurtinAntibiotics() {
    const svg = prepareSvg("burtin-antibiotics", "Burtin antibiotics", "A radial matrix compares organisms and treatments.");
    const organisms = ["Staph", "Strep", "E.coli", "Kleb", "Sal"];
    const drugs = ["Pen", "Strep", "Neo", "Chlor"];
    const values = [
      [4, 2, 1, 3],
      [3, 4, 1, 2],
      [1, 2, 4, 3],
      [1, 3, 2, 4],
      [2, 1, 3, 4]
    ];
    const cx = width / 2, cy = height / 2 + 14;
    const angle = d3.scaleBand().domain(organisms).range([-.82 * Math.PI, .82 * Math.PI]).padding(.04);
    const ring = d3.scaleBand().domain(drugs).range([42, 154]).padding(.08);
    const color = d3.scaleThreshold().domain([1.5, 2.5, 3.5]).range(["#e7e7e7", "#cdf3ff", "#f1c319", "#9e1b32"]);
    const arc = d3.arc();
    const cells = organisms.flatMap((org, i) => drugs.map((drug, j) => ({ org, drug, value: values[i][j] })));
    const marks = svg.append("g").attr("transform", `translate(${cx},${cy})`).selectAll("path").data(cells).join("path")
      .attr("d", d => arc({
        startAngle: angle(d.org),
        endAngle: angle(d.org) + angle.bandwidth(),
        innerRadius: ring(d.drug),
        outerRadius: ring(d.drug) + ring.bandwidth()
      }))
      .attr("fill", d => color(d.value)).attr("stroke", "#fff").attr("stroke-width", 1.3);
    fadeIn(marks, .06, .65);
    svg.append("g").attr("transform", `translate(${cx},${cy})`).selectAll("text").data(organisms).join("text")
      .attr("class", "mark-label")
      .attr("transform", d => {
        const a = angle(d) + angle.bandwidth() / 2 - Math.PI / 2;
        return `translate(${Math.cos(a) * 176},${Math.sin(a) * 176})`;
      })
      .attr("text-anchor", "middle").text(d => d);
  }
```
