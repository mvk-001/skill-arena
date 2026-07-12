# Shared Renderer Helpers

Use this reference only when a per-pattern file under `references/patterns/` includes helper names from the gallery fixture. Recreate the minimal behavior locally; do not read the gallery source for normal pattern generation.

## Default Geometry And Tokens

Most gallery excerpts assume these small constants:

```js
const width = 560;
const height = 420;
const palette = {
  blue: "#007298",
  orange: "#e77204",
  green: "#45842a",
  red: "#9e1b32",
  purple: "#652f6c",
  cyan: "#00ace6",
  gold: "#f1c319",
  ink: "#333e48",
  muted: "#696969",
  gray50: "#f7f7f7",
  gray100: "#e7e7e7",
  gray200: "#cfcfcf",
  gray300: "#b5b5b5",
  gray400: "#9c9c9c",
  gray500: "#828282",
  gray600: "#696969",
  gray700: "#4f4f4f",
  gray800: "#363636",
  gray900: "#1c1c1c",
  blueHover: "#004d66",
  orangeHover: "#994a00",
  greenHover: "#294d19",
  purpleHover: "#431f47",
  redHover: "#6d1222",
  yellowHover: "#98700c",
  blueHighlight: "#cdf3ff",
  orangeHighlight: "#ffe5cc",
  yellowHighlight: "#fff4cc",
  greenHighlight: "#dbffcc",
  purpleHighlight: "#f9ccff",
  redHighlight: "#ffccd5",
  surface: "#ffffff",
  line: "#cfcfcf"
};
const colors = [palette.blue, palette.orange, palette.green, palette.purple, palette.red];
const ramps = {
  blue: [palette.blueHighlight, palette.cyan, palette.blue, palette.blueHover],
  heat: [palette.yellowHighlight, palette.orangeHighlight, palette.orange, palette.red],
  terrain: [palette.yellowHighlight, palette.greenHighlight, palette.blueHighlight, palette.blue, palette.purple],
  gray: [palette.gray100, palette.gray200, palette.gray300, palette.gray400, palette.gray700],
  bivariate: [
    [palette.gray100, palette.blueHighlight, palette.blue],
    [palette.purpleHighlight, palette.gray200, palette.blueHover],
    [palette.purple, palette.red, palette.purpleHover]
  ]
};
```

For repository-owned artifacts, prefer the full token guidance in `references/visual-tokens.md` when choosing new semantic colors.

## Minimal Helpers

Use these helpers as compact equivalents when converting a pattern excerpt into a standalone artifact:

```js
function prepareSvg(id, title, desc) {
  const svg = d3.select("svg")
    .attr("id", id)
    .attr("data-pattern-id", `d3-${id}`)
    .attr("role", "img")
    .attr("aria-labelledby", `${id}-title ${id}-desc`)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);
  svg.selectAll("*").remove();
  svg.append("title").attr("id", `${id}-title`).text(title);
  svg.append("desc").attr("id", `${id}-desc`).text(desc);
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("rx", 16)
    .attr("fill", palette.surface);
  svg.style("font-family", '"Open Sans", Arial, sans-serif');
  return svg;
}

function fadeIn(selection, delay = 0, dur = 0.7) {
  selection.attr("opacity", 1)
    .append("animate")
    .attr("attributeName", "opacity")
    .attr("from", 0)
    .attr("to", 1)
    .attr("dur", `${dur}s`)
    .attr("begin", `${delay}s`)
    .attr("fill", "freeze");
}

function revealIn(selection, delay = 0, dur = 0.7) {
  selection.attr("opacity", 1).each(function (d, i) {
    const resolvedDelay = typeof delay === "function" ? Number(delay(d, i)) : Number(delay);
    const resolvedDur = typeof dur === "function" ? Number(dur(d, i)) : Number(dur);
    const safeDelay = Number.isFinite(resolvedDelay) ? Math.max(0, resolvedDelay) : 0;
    const safeDur = Number.isFinite(resolvedDur) ? Math.max(0.001, resolvedDur) : 0.7;
    const animation = d3.select(this).append("animate")
      .attr("attributeName", "opacity")
      .attr("dur", `${safeDelay + safeDur}s`)
      .attr("begin", "0s")
      .attr("fill", "freeze");
    if (safeDelay > 0) {
      animation
        .attr("values", "0;0;1")
        .attr("keyTimes", `0;${(safeDelay / (safeDelay + safeDur)).toFixed(3)};1`);
    } else {
      animation.attr("from", 0).attr("to", 1);
    }
  });
}

function grow(selection, attr, from, to, delay = 0, dur = 0.7) {
  selection.attr(attr, to).each(function (d, i) {
    const resolvedFrom = typeof from === "function" ? from(d, i) : from;
    const resolvedTo = typeof to === "function" ? to(d, i) : to;
    d3.select(this).append("animate")
      .attr("attributeName", attr)
      .attr("from", resolvedFrom)
      .attr("to", resolvedTo)
      .attr("dur", `${dur}s`)
      .attr("begin", `${delay + i * .025}s`)
      .attr("fill", "freeze");
  });
}

function drawPath(selection, delay = 0, dur = 1.1) {
  selection.each(function () {
    const length = this.getTotalLength();
    d3.select(this)
      .attr("stroke-dasharray", `${length} ${length}`)
      .attr("stroke-dashoffset", 0)
      .append("animate")
      .attr("attributeName", "stroke-dashoffset")
      .attr("from", length)
      .attr("to", 0)
      .attr("dur", `${dur}s`)
      .attr("begin", `${delay}s`)
      .attr("fill", "freeze");
  });
}

function axisBottom(svg, scale, y, ticks = 5) {
  return svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${y})`)
    .call(d3.axisBottom(scale).ticks(ticks));
}

function axisLeft(svg, scale, x, ticks = 5) {
  return svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${x},0)`)
    .call(d3.axisLeft(scale).ticks(ticks));
}

function quantizedRamp(domain, range) {
  return d3.scaleQuantize().domain(domain).range(range);
}

function estimateSvgTextWidth(text, fontSize = 10) {
  return Array.from(String(text)).reduce((sum, char) => {
    if ("MW@#%".includes(char)) return sum + fontSize * .92;
    if ("ABCDEFGHKNOPQRSTUVWXYZ0123456789".includes(char)) return sum + fontSize * .68;
    if ("ilI.,:;!|".includes(char)) return sum + fontSize * .34;
    if (char === " ") return sum + fontSize * .32;
    return sum + fontSize * .56;
  }, 0);
}
```

## Schematic Land Context

Map excerpts that call `appendSchematicLand` need a compact local `FeatureCollection` named `schematicLand`. Use six coarse polygons for North America, South America, Eurasia, Africa, Australia, and Greenland, then render them through the excerpt's projection before data marks. Mark the group `data-map-context="schematic-land"`; treat it as orientation context, never as analytical boundary data.

```js
const schematicLand = {
  type: "FeatureCollection",
  features: [
    [[[-168,16],[-150,68],[-108,74],[-58,50],[-80,8],[-122,12],[-168,16]]]],
    [[[-82,12],[-50,10],[-34,-54],[-70,-56],[-82,12]]]],
    [[[-10,35],[6,70],[72,76],[178,54],[150,8],[96,6],[42,28],[-10,35]]]],
    [[[-18,34],[48,34],[42,-36],[12,-35],[-18,34]]]],
    [[[112,-10],[154,-12],[150,-44],[114,-38],[112,-10]]]],
    [[[-74,60],[-60,82],[-22,84],[-20,60],[-74,60]]]]
  ].map((coordinates, index) => ({
    type: "Feature",
    properties: { schematicRegion: index + 1 },
    geometry: { type: "Polygon", coordinates }
  }))
};

function appendSchematicLand(svg, path, fill = palette.gray100) {
  return svg.append("g")
    .attr("class", "schematic-land")
    .attr("data-map-context", "schematic-land")
    .selectAll("path")
    .data(schematicLand.features)
    .join("path")
    .attr("d", path)
    .attr("fill", fill)
    .attr("fill-opacity", .92)
    .attr("stroke", palette.gray300)
    .attr("stroke-width", .8);
}
```

Keep the coarse land geometry visibly subordinate. When geographic boundary accuracy is part of the data question, replace it with a verified local GeoJSON source rather than presenting the schematic polygons as real boundaries.

## Standalone Conversion Rules

- Inline the required helpers into the generated HTML or SVG; do not leave references to shared gallery state.
- If the final artifact must be self-contained, use static SVG geometry and SVG-native animation. Do not depend on CDN D3 or runtime JavaScript.
- Keep the excerpt's deterministic layout choices, such as seeded force simulations and fixed viewBox dimensions.
- Replace gallery-specific CSS classes with local styles when needed, especially for `.mark-label`, `.axis`, grid lines, and label halos.
