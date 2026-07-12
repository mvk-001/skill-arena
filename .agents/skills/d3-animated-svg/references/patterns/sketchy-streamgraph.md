# Sketchy Streamgraph

- **Pattern ID:** `d3-sketchy-streamgraph`
- **Gallery source ID:** `sketchy-streamgraph`
- **Family:** Sketchy
- **Use when:** Stacked areas keep their D3 geometry while rough outlines and fills add drawn texture.
- **Renderer:** `renderSketchyStreamgraph`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderSketchyStreamgraph() {
    const svg = prepareSvg("sketchy-streamgraph", "Sketchy streamgraph", "Stacked areas keep their data shape while rendered as rough filled bands.");
    const keys = ["Search", "Assist", "Automate", "Review"];
    const color = d3.scaleOrdinal(keys, [palette.blue, palette.green, palette.orange, palette.purple]);
    const data = d3.range(12).map(i => ({
      month: i,
      Search: 20 + Math.sin(i / 1.6) * 8 + i * 1.2,
      Assist: 18 + Math.cos(i / 2.2) * 7 + i * .8,
      Automate: 10 + Math.sin(i / 1.3 + 1) * 6 + i * 1.4,
      Review: 12 + Math.cos(i / 1.9 + 2) * 5 + i * .5
    }));
    const margin = { top: 42, right: 34, bottom: 50, left: 30 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.month)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
      .domain([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))])
      .range([height - margin.bottom, margin.top]);

    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 6, 980);
    const legend = svg.append("g").attr("transform", "translate(46,24)");
    keys.forEach((key, i) => {
      const lx = i * 118;
      appendSketchStroke(legend, [[lx, 0], [lx + 20, 0]], {
        stroke: color(key),
        strokeWidth: 3.4,
        seed: 990 + i * 13,
        roughness: .7,
        delay: .04,
        dur: .45
      });
      legend.append("text")
        .attr("class", "caption")
        .attr("x", lx + 27)
        .attr("y", 4)
        .attr("font-weight", 700)
        .text(key);
    });
    series.forEach((layer, layerIndex) => {
      const top = layer.map(d => [x(d.data.month), y(d[1])]);
      const bottom = layer.slice().reverse().map(d => [x(d.data.month), y(d[0])]);
      const areaPoints = top.concat(bottom);
      const layerColor = color(layer.key);
      appendSketchClosedShape(svg, areaPoints, {
        fill: layerColor,
        fillOpacity: .42,
        stroke: d3.color(layerColor).darker(.55).formatHex(),
        strokeWidth: 2,
        seed: 1000 + layerIndex * 41,
        roughness: 2.1,
        delay: .1 + layerIndex * .08,
        dur: .78
      });
    });
  }
```
