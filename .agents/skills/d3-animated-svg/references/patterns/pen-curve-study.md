# Pen Curve Study

- **Pattern ID:** `d3-pen-curve-study`
- **Gallery source ID:** `pen-curve-study`
- **Family:** Drawing
- **Use when:** A precise pen point lays pressure-modulated calligraphic curves.
- **Renderer:** `renderPenCurveStudy`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPenCurveStudy() {
    const svg = prepareSvg("pen-curve-study", "Pen curve study", "A precise pen point lays pressure-modulated calligraphic curves as a base technique for more complex line-art drawings.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const cubicPath = segments => segments.map((segment, index) => {
      const [p0, p1, p2, p3] = segment;
      return `${index === 0 ? `M${p0[0]},${p0[1]}` : ""}C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
    }).join("");
    const cubicPoint = (segment, t) => {
      const mt = 1 - t;
      const [p0, p1, p2, p3] = segment;
      return [
        mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0],
        mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1]
      ];
    };
    const pressure = (t, min, max, lift = .76) => min + (max - min) * Math.pow(Math.sin(Math.PI * t), lift);
    const ribbonLine = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveBasis);
    const buildRibbonPath = stroke => {
      const left = [];
      const right = [];
      stroke.sampled.forEach((sample, index, samples) => {
        const prev = samples[Math.max(0, index - 1)].point;
        const next = samples[Math.min(samples.length - 1, index + 1)].point;
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const length = Math.hypot(dx, dy) || 1;
        const normal = [-dy / length, dx / length];
        const radius = pressure(sample.t, stroke.minWidth, stroke.maxWidth) / 2;
        left.push([sample.point[0] + normal[0] * radius, sample.point[1] + normal[1] * radius]);
        right.push([sample.point[0] - normal[0] * radius, sample.point[1] - normal[1] * radius]);
      });
      return `${ribbonLine(left)}${ribbonLine(right.reverse()).replace(/^M/, "L")}Z`;
    };
    const rawStrokes = [
      {
        minWidth: 1.15, maxWidth: 5.8, samples: 22,
        segments: [
          [[54, 314], [142, 354], [230, 316], [304, 330]],
          [[304, 330], [382, 346], [440, 310], [510, 326]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 7.9, samples: 24,
        segments: [
          [[184, 312], [142, 238], [170, 124], [254, 112]],
          [[254, 112], [354, 96], [372, 214], [292, 244]],
          [[292, 244], [216, 274], [160, 210], [214, 164]],
          [[214, 164], [274, 112], [352, 146], [350, 218]]
        ]
      },
      {
        minWidth: 1, maxWidth: 4.8, samples: 22,
        segments: [
          [[78, 152], [142, 84], [226, 92], [286, 134]],
          [[286, 134], [350, 178], [414, 146], [478, 90]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 7.2, samples: 24,
        segments: [
          [[316, 280], [336, 190], [432, 168], [472, 224]],
          [[472, 224], [506, 272], [444, 326], [374, 286]],
          [[374, 286], [330, 260], [346, 210], [390, 202]],
          [[390, 202], [438, 192], [486, 228], [506, 270]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 6.4, samples: 22,
        segments: [
          [[62, 282], [88, 216], [166, 214], [182, 270]],
          [[182, 270], [192, 314], [126, 344], [84, 302]],
          [[84, 302], [52, 272], [70, 234], [116, 226]]
        ]
      },
      {
        minWidth: 1, maxWidth: 4.8, samples: 20,
        segments: [
          [[244, 324], [276, 276], [342, 292], [322, 334]],
          [[322, 334], [304, 370], [244, 354], [252, 320]]
        ]
      }
    ];
    let writeCursor = .1;
    const connectorDuration = .12;
    const strokes = rawStrokes.map((stroke, index) => {
      const d = cubicPath(stroke.segments);
      const duration = .78 + index * .08;
      const delay = writeCursor;
      writeCursor += duration + (index < rawStrokes.length - 1 ? connectorDuration : 0);
      const sampled = stroke.segments.flatMap((segment, segmentIndex) => d3.range(0, stroke.samples + 1).map(step => ({
        point: cubicPoint(segment, step / stroke.samples),
        t: (segmentIndex + step / stroke.samples) / stroke.segments.length
      })).slice(segmentIndex ? 1 : 0));
      const prepared = {
        ...stroke,
        d,
        points: sampled.map(datum => datum.point),
        sampled,
        id: `pen-curve-study-stroke-${index}`,
        delay,
        duration,
        strokeWidth: stroke.maxWidth
      };
      prepared.ribbonD = buildRibbonPath(prepared);
      return prepared;
    });
    const drawStroke = selection => {
      selection.each(function (d) {
        const length = this.getTotalLength ? this.getTotalLength() : 280;
        d.pathLength = length;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${d.duration}s`)
          .attr("begin", `${d.delay}s`)
          .attr("fill", "freeze");
      });
    };

    const halo = svg.append("g").selectAll("path.pen-curve-halo").data(strokes).join("path")
      .attr("class", "pen-curve-halo")
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", d => d.strokeWidth + 6.4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .38);
    drawStroke(halo);

    const pressureSegments = strokes.flatMap(stroke => stroke.sampled.slice(0, -1).map((sample, index) => {
      const next = stroke.sampled[index + 1];
      const segmentLength = Math.hypot(next.point[0] - sample.point[0], next.point[1] - sample.point[1]);
      const t = (sample.t + next.t) / 2;
      return {
        stroke,
        x1: sample.point[0],
        y1: sample.point[1],
        x2: next.point[0],
        y2: next.point[1],
        length: segmentLength,
        begin: stroke.delay + stroke.duration * index / Math.max(1, stroke.sampled.length - 1),
        duration: Math.max(.05, stroke.duration / Math.max(1, stroke.sampled.length - 1) * 1.6),
        width: pressure(t, stroke.minWidth, stroke.maxWidth)
      };
    }));

    const ink = svg.append("g").selectAll("line.pen-curve-pressure").data(pressureSegments).join("line")
      .attr("class", "pen-curve-pressure")
      .attr("x1", d => d.x1).attr("y1", d => d.y1)
      .attr("x2", d => d.x2).attr("y2", d => d.y2)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", d => d.width)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .97)
      .attr("stroke-dasharray", d => `${d.length} ${d.length}`)
      .attr("stroke-dashoffset", d => d.length);
    ink.append("animate")
      .attr("attributeName", "stroke-dashoffset")
      .attr("from", d => d.length)
      .attr("to", 0)
      .attr("dur", d => `${d.duration}s`)
      .attr("begin", d => `${d.begin}s`)
      .attr("fill", "freeze");
    ink.append("animate")
      .attr("attributeName", "stroke-opacity")
      .attr("from", .97)
      .attr("to", .04)
      .attr("dur", ".16s")
      .attr("begin", d => `${d.stroke.delay + d.stroke.duration + .03}s`)
      .attr("fill", "freeze");

    const ribbon = svg.append("g").selectAll("path.pen-curve-ribbon").data(strokes).join("path")
      .attr("class", "pen-curve-ribbon")
      .attr("d", d => d.ribbonD)
      .attr("fill", palette.redHover)
      .attr("fill-opacity", .98)
      .attr("opacity", 0);
    ribbon.append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".18s")
      .attr("begin", d => `${d.delay + d.duration - .08}s`)
      .attr("fill", "freeze");

    const hairline = svg.append("g").selectAll("path.pen-curve-hairline").data(strokes).join("path")
      .attr("class", "pen-curve-hairline")
      .attr("id", d => d.id)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.15)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .9);
    drawStroke(hairline);

    let motionDistance = 0;
    const motionCommands = [];
    strokes.forEach((stroke, index) => {
      const start = stroke.points[0];
      if (index === 0) {
        motionCommands.push(`M${start[0]},${start[1]}`);
      } else {
        const previousEnd = strokes[index - 1].points.at(-1);
        motionDistance += Math.hypot(start[0] - previousEnd[0], start[1] - previousEnd[1]);
        motionCommands.push(`L${start[0]},${start[1]}`);
      }
      stroke.motionStart = motionDistance;
      motionCommands.push(stroke.d.replace(/^M[^A-Za-z]*/, ""));
      motionDistance += stroke.pathLength;
      stroke.motionEnd = motionDistance;
    });
    const penPath = svg.append("path")
      .attr("id", "pen-curve-study-pen-path")
      .attr("d", motionCommands.join(""))
      .attr("fill", "none")
      .attr("stroke", "none");
    const motionLength = penPath.node()?.getTotalLength?.() || motionDistance || 1;
    const totalDuration = writeCursor + .2;
    const keyTimes = [0];
    const keyPoints = [0];
    strokes.forEach(stroke => {
      keyTimes.push(stroke.delay / totalDuration, (stroke.delay + stroke.duration) / totalDuration);
      keyPoints.push(stroke.motionStart / motionLength, stroke.motionEnd / motionLength);
    });
    keyTimes.push(1);
    keyPoints.push(strokes.at(-1).motionEnd / motionLength);

    const pen = svg.append("g").attr("class", "pen-curve-study-pen");
    pen.append("circle")
      .attr("r", 12.5)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    pen.append("animateMotion")
      .attr("dur", `${totalDuration}s`)
      .attr("begin", "0s")
      .attr("fill", "freeze")
      .attr("calcMode", "linear")
      .attr("keyTimes", keyTimes.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .attr("keyPoints", keyPoints.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .append("mpath")
      .attr("href", "#pen-curve-study-pen-path");
  }
```
