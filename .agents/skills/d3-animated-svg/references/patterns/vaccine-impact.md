# Vaccine Impact

- **Pattern ID:** `d3-vaccine-impact`
- **Gallery source ID:** `vaccine-impact`
- **Family:** Public health
- **Use when:** Disease incidence collapses after intervention markers.
- **Renderer:** `renderVaccineImpact`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderVaccineImpact() {
    const svg = prepareSvg("vaccine-impact", "Vaccine impact", "A public-health heatmap shows incidence dropping after vaccine introduction.");
    const diseases = [
      { name: "Measles", vaccine: 1963, base: 92 },
      { name: "Polio", vaccine: 1955, base: 76 },
      { name: "Rubella", vaccine: 1969, base: 58 },
      { name: "Mumps", vaccine: 1967, base: 49 }
    ];
    const years = d3.range(1940, 1985, 5);
    const data = diseases.flatMap((disease, di) => years.map((year, yi) => {
      const before = year < disease.vaccine;
      const decay = Math.max(0, year - disease.vaccine) / 8;
      return {
        ...disease,
        year,
        value: before ? disease.base - yi * 2 + Math.sin(yi + di) * 6 : disease.base * Math.exp(-decay) * .22 + Math.cos(yi) * 2
      };
    }));
    const x = d3.scaleBand().domain(years).range([116, width - 32]).padding(.08);
    const y = d3.scaleBand().domain(diseases.map(d => d.name)).range([72, 304]).padding(.16);
    const color = quantizedRamp([0, d3.max(data, d => d.value)], ramps.vaccine);
    axisBottom(svg, d3.scaleLinear().domain(d3.extent(years)).range([x(years[0]) + x.bandwidth() / 2, x(years.at(-1)) + x.bandwidth() / 2]), 338, 5);
    svg.append("g").selectAll("text").data(diseases).join("text")
      .attr("class", "mark-label")
      .attr("x", 102)
      .attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.name);
    const cells = svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", d => x(d.year))
      .attr("y", d => y(d.name))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", d => color(d.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1);
    fadeIn(cells, .018, .5);
    const markers = svg.append("g").selectAll("line").data(diseases).join("line")
      .attr("x1", d => x(years.find(year => year >= d.vaccine)) || x(years.at(-1)))
      .attr("x2", d => x(years.find(year => year >= d.vaccine)) || x(years.at(-1)))
      .attr("y1", d => y(d.name) - 6)
      .attr("y2", d => y(d.name) + y.bandwidth() + 6)
      .attr("stroke", palette.blue)
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round");
    fadeIn(markers, .35, .55);
  }
```
