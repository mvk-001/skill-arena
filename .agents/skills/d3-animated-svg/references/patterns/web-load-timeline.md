# Web Load Timeline

- **Pattern ID:** `d3-web-load-timeline`
- **Gallery source ID:** `web-load-timeline`
- **Family:** Performance
- **Use when:** A page load unfolds across network, parsing, assets, paint, and interactivity lanes.
- **Renderer:** `renderWebLoadTimeline`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderWebLoadTimeline() {
    const svg = prepareSvg("web-load-timeline", "Web load timeline", "A D3 timeline inspired by historical timelines shows how browser load phases overlap from navigation start to interactivity.");
    const x = d3.scaleLinear().domain([0, 2500]).range([78, 514]);
    const laneY = d3.scalePoint()
      .domain(["Network", "Document", "Assets", "Render", "Main thread"])
      .range([104, 304]);
    const phaseColor = {
      Network: palette.blue,
      Document: palette.purple,
      Assets: palette.orange,
      Render: palette.green,
      "Main thread": palette.red
    };
    const phaseFill = {
      Network: palette.blueHighlight,
      Document: palette.purpleHighlight,
      Assets: palette.orangeHighlight,
      Render: palette.greenHighlight,
      "Main thread": palette.redHighlight
    };
    const eras = [
      { label: "connect", start: 0, end: 320, fill: palette.blueHighlight },
      { label: "response", start: 320, end: 820, fill: palette.yellowHighlight },
      { label: "parse", start: 820, end: 1420, fill: palette.purpleHighlight },
      { label: "paint", start: 1420, end: 2040, fill: palette.greenHighlight },
      { label: "interactive", start: 2040, end: 2500, fill: palette.redHighlight }
    ];
    const spans = [
      { lane: "Network", label: "DNS", start: 0, end: 70, track: 0 },
      { lane: "Network", label: "TCP + TLS", start: 70, end: 260, track: 0 },
      { lane: "Network", label: "request", start: 260, end: 360, track: 0 },
      { lane: "Network", label: "TTFB", start: 360, end: 820, track: 0, showLabel: true },
      { lane: "Document", label: "HTML stream", start: 820, end: 1080, track: -1 },
      { lane: "Document", label: "DOM parse", start: 980, end: 1340, track: 0, showLabel: true },
      { lane: "Document", label: "CSSOM", start: 1080, end: 1460, track: 1, showLabel: true },
      { lane: "Assets", label: "CSS", start: 840, end: 1180, track: -1.5 },
      { lane: "Assets", label: "JS bundle", start: 920, end: 1680, track: -.5, showLabel: true },
      { lane: "Assets", label: "fonts", start: 1220, end: 1740, track: .5 },
      { lane: "Assets", label: "hero image", start: 1360, end: 2140, track: 1.5, showLabel: true },
      { lane: "Render", label: "style", start: 1320, end: 1580, track: -1 },
      { lane: "Render", label: "layout", start: 1480, end: 1740, track: 0, showLabel: true },
      { lane: "Render", label: "paint", start: 1720, end: 1960, track: 1, showLabel: true },
      { lane: "Main thread", label: "hydrate", start: 1580, end: 2140, track: -.5, showLabel: true },
      { lane: "Main thread", label: "idle", start: 2140, end: 2380, track: .5, showLabel: true }
    ];
    const milestones = [
      { label: "nav", time: 0, lane: "Network", y: 34, color: palette.ink, anchor: "start" },
      { label: "TTFB 820", time: 820, lane: "Network", y: 78, color: palette.blue, anchor: "middle" },
      { label: "FCP 1.32s", time: 1320, lane: "Render", y: 336, color: palette.green, anchor: "middle" },
      { label: "LCP 1.86s", time: 1860, lane: "Render", y: 78, color: palette.red, anchor: "middle" },
      { label: "TTI 2.32s", time: 2320, lane: "Main thread", y: 336, color: palette.purple, anchor: "end" }
    ];
    const totalDuration = 6.2;
    const timeToDelay = ms => .28 + ms / 2500 * totalDuration;
    const spanDuration = d => Math.max(.36, (d.end - d.start) / 2500 * totalDuration);
    const trackOffset = d => (d.track ?? 0) * 9;

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 28)
      .attr("y", 34)
      .attr("font-size", 13)

    const eraGroup = svg.append("g");
    eraGroup.selectAll("rect").data(eras).join("rect")
      .attr("x", d => x(d.start))
      .attr("y", 48)
      .attr("width", d => x(d.end) - x(d.start))
      .attr("height", 24)
      .attr("rx", 4)
      .attr("fill", d => d.fill)
      .attr("stroke", palette.surface);
    eraGroup.selectAll("text").data(eras).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("x", d => (x(d.start) + x(d.end)) / 2)
      .attr("y", 64)
      .text(d => d.label);

    const axisY = 344;
    svg.append("line")
      .attr("x1", x(0))
      .attr("x2", x(2500))
      .attr("y1", axisY)
      .attr("y2", axisY)
      .attr("stroke", palette.gray400)
      .attr("stroke-width", 1.2);
    const tick = svg.append("g").selectAll("g.tick").data([0, 500, 1000, 1500, 2000, 2500]).join("g")
      .attr("class", "tick")
      .attr("transform", d => `translate(${x(d)},0)`);
    tick.append("line")
      .attr("y1", axisY)
      .attr("y2", axisY + 6)
      .attr("stroke", palette.gray400);
    tick.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("y", axisY + 20)
      .text(d => d === 0 ? "0" : `${d / 1000}s`);

    const lane = svg.append("g").selectAll("g.lane").data(laneY.domain()).join("g")
      .attr("class", "lane")
      .attr("transform", d => `translate(0,${laneY(d)})`);
    lane.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "end")
      .attr("x", 68)
      .attr("y", 4)
      .attr("font-size", 10)
      .text(d => d);
    lane.append("line")
      .attr("x1", x(0))
      .attr("x2", x(2500))
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", palette.gray100)
      .attr("stroke-dasharray", "2 5");

    const spanGroups = svg.append("g").selectAll("g.load-span").data(spans).join("g")
      .attr("class", "load-span")
      .attr("transform", d => `translate(${x(d.start)},${laneY(d.lane) + trackOffset(d) - 6})`);
    spanGroups.append("rect")
      .attr("width", d => x(d.end) - x(d.start))
      .attr("height", 12)
      .attr("rx", 4)
      .attr("fill", d => phaseFill[d.lane])
      .attr("stroke", d => phaseColor[d.lane])
      .attr("stroke-width", 1.2);
    const activeBars = spanGroups.append("rect")
      .attr("height", 12)
      .attr("rx", 4)
      .attr("fill", d => phaseColor[d.lane])
      .attr("opacity", .82)
      .attr("width", d => x(d.end) - x(d.start));
    activeBars.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", x(d.end) - x(d.start))
        .attr("dur", `${spanDuration(d)}s`)
        .attr("begin", `${timeToDelay(d.start)}s`)
        .attr("fill", "freeze");
    });
    spanGroups.append("text")
      .attr("class", "reverse-label")
      .attr("x", d => Math.min(8, Math.max(4, (x(d.end) - x(d.start)) * .18)))
      .attr("y", 8.5)
      .attr("font-size", 7.4)
      .attr("font-weight", 800)
      .text(d => d.showLabel ? d.label : "");

    const milestone = svg.append("g").selectAll("g.milestone").data(milestones).join("g")
      .attr("class", "milestone");
    milestone.append("line")
      .attr("x1", d => x(d.time))
      .attr("x2", d => x(d.time))
      .attr("y1", d => laneY(d.lane))
      .attr("y2", d => d.y + (d.y < laneY(d.lane) ? 13 : -13))
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.2)
      .attr("stroke-opacity", .64)
      .attr("stroke-dasharray", "3 4");
    const milestoneDot = milestone.append("circle")
      .attr("cx", d => x(d.time))
      .attr("cy", d => laneY(d.lane))
      .attr("r", 5)
      .attr("fill", d => d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2)
      .attr("opacity", 0);
    milestoneDot.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1")
        .attr("keyTimes", "0;.2;1")
        .attr("dur", ".7s")
        .attr("begin", `${timeToDelay(d.time)}s`)
        .attr("fill", "freeze");
      d3.select(this).append("animate")
        .attr("attributeName", "r")
        .attr("values", "3;8;5")
        .attr("keyTimes", "0;.35;1")
        .attr("dur", ".7s")
        .attr("begin", `${timeToDelay(d.time)}s`)
        .attr("fill", "freeze");
    });
    milestone.append("rect")
      .attr("x", d => d.anchor === "end" ? x(d.time) - 61 : d.anchor === "start" ? x(d.time) : x(d.time) - 31)
      .attr("y", d => d.y - 12)
      .attr("width", 62)
      .attr("height", 20)
      .attr("rx", 5)
      .attr("fill", palette.surface)
      .attr("stroke", d => d.color)
      .attr("opacity", .96);
    const milestoneLabel = milestone.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("x", d => d.anchor === "end" ? x(d.time) - 30 : d.anchor === "start" ? x(d.time) + 31 : x(d.time))
      .attr("y", d => d.y + 2)
      .attr("opacity", 0)
      .text(d => d.label);
    fadeIn(milestoneLabel, .65, .6);

    const cursor = svg.append("g").attr("class", "load-cursor");
    const cursorLine = cursor.append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 42)
      .attr("y2", axisY)
      .attr("stroke", palette.red)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .86);
    cursorLine.append("animate")
      .attr("attributeName", "x1")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");
    cursorLine.append("animate")
      .attr("attributeName", "x2")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");
    const cursorHead = cursor.append("circle")
      .attr("cx", x(0))
      .attr("cy", 42)
      .attr("r", 5)
      .attr("fill", palette.red);
    cursorHead.append("animate")
      .attr("attributeName", "cx")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");

  }
```
