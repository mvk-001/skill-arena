# Agent Loop Partial Covers

- **Pattern ID:** `d3-agent-loop-overlay`
- **Gallery source ID:** `agent-loop-overlay`
- **Family:** Image Overlay
- **Use when:** A source diagram remains visible while animated translucent covers selectively pass over key areas.
- **Renderer:** `renderAgentLoopPartialCovers`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAgentLoopPartialCovers() {
    const svg = prepareSvg("agent-loop-overlay", "Agent loop partial covers", "An image-backed SVG with animated partial covers over selected regions of the agent loop diagram.");
    const image = { x: 16, y: 34, w: 528, h: 333 };
    const source = { w: 980, h: 618 };
    const sx = image.w / source.w;
    const sy = image.h / source.h;
    const mapRegion = region => ({
      ...region,
      x: image.x + region.x * sx,
      y: image.y + region.y * sy,
      w: region.w * sx,
      h: region.h * sy
    });
    const regions = [
      { id: "main-loop", x: 38, y: 82, w: 272, h: 488, cover: .34, fill: palette.orange, stroke: palette.orangeHover, delay: .1 },
      { id: "prompt-builder", x: 354, y: 68, w: 586, h: 98, cover: .62, fill: palette.purple, stroke: palette.purpleHover, delay: .48 },
      { id: "tool-system", x: 354, y: 220, w: 382, h: 236, cover: .5, fill: palette.green, stroke: palette.greenHover, delay: .86 },
      { id: "sub-agents", x: 752, y: 220, w: 192, h: 232, cover: .55, fill: palette.blue, stroke: palette.blueHover, delay: 1.24 },
      { id: "compaction", x: 354, y: 512, w: 590, h: 94, cover: .58, fill: palette.gold, stroke: palette.yellowHover, delay: 1.62 }
    ].map(mapRegion);

    svg.append("rect")
      .attr("x", image.x - 8)
      .attr("y", image.y - 8)
      .attr("width", image.w + 16)
      .attr("height", image.h + 16)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.4);

    svg.append("clipPath")
      .attr("id", "agent-loop-overlay-clip")
      .append("rect")
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("rx", 8);

    svg.append("image")
      .attr("href", "assets/agent-loop-reference.png")
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .attr("opacity", .72);

    svg.append("rect")
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("opacity", .08)
      .attr("clip-path", "url(#agent-loop-overlay-clip)");

    const coverGroups = svg.append("g")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .selectAll("g.agent-cover")
      .data(regions)
      .join("g")
      .attr("class", "agent-cover")
      .attr("data-region", d => d.id)
      .attr("data-cover-ratio", d => d.cover)
      .attr("data-target-width", d => (d.w * d.cover).toFixed(2));

    const covers = coverGroups.append("rect")
      .attr("class", "agent-cover-fill")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w * d.cover)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", d => d.fill)
      .attr("fill-opacity", .19)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.4)
      .attr("stroke-opacity", .78)
      .attr("stroke-dasharray", "6 5");
    covers.each(function (d) {
      const cover = d3.select(this);
      const targetWidth = d.w * d.cover;
      cover.append("set")
        .attr("attributeName", "width")
        .attr("to", 0)
        .attr("begin", "0s")
        .attr("dur", `${d.delay}s`);
      cover.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", targetWidth)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .7 .2 1")
        .attr("fill", "freeze");
      cover.append("animate")
        .attr("attributeName", "fill-opacity")
        .attr("values", ".08;.23;.19")
        .attr("dur", ".9s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const sweeps = coverGroups.append("line")
      .attr("class", "agent-cover-sweep")
      .attr("x1", d => d.x)
      .attr("x2", d => d.x)
      .attr("y1", d => d.y + 4)
      .attr("y2", d => d.y + d.h - 4)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", 0)
      .attr("stroke-linecap", "round");
    sweeps.each(function (d) {
      const sweep = d3.select(this);
      const end = d.x + d.w * d.cover;
      sweep.append("animate")
        .attr("attributeName", "x1")
        .attr("from", d.x)
        .attr("to", end)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      sweep.append("animate")
        .attr("attributeName", "x2")
        .attr("from", d.x)
        .attr("to", end)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      sweep.append("animate")
        .attr("attributeName", "stroke-opacity")
        .attr("values", "0;.85;0")
        .attr("dur", ".7s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const outlineData = regions.map(region => ({
      ...region,
      points: [
        [region.x, region.y],
        [region.x + region.w, region.y],
        [region.x + region.w, region.y + region.h],
        [region.x, region.y + region.h],
        [region.x, region.y]
      ]
    }));
    const outlines = svg.append("g")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .selectAll("path.agent-cover-outline")
      .data(outlineData)
      .join("path")
      .attr("class", "agent-cover-outline")
      .attr("data-region", d => d.id)
      .attr("d", d => d3.line()(d.points))
      .attr("fill", "none")
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", .5)
      .attr("stroke-dasharray", "4 6");
    outlines.each(function (d) {
      const length = this.getTotalLength();
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", 0)
        .append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", ".74s")
        .attr("begin", `${d.delay + .12}s`)
        .attr("fill", "freeze");
    });
  }
```
