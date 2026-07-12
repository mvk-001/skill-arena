# Pocket Monster Stippling

- **Pattern ID:** `d3-creature-stippling`
- **Gallery source ID:** `creature-stippling`
- **Family:** Sampling
- **Use when:** Weighted Voronoi stipples settle into a stylized electric creature silhouette.
- **Renderer:** `renderPocketMonsterStippling`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderPocketMonsterStippling() {
    const svg = prepareSvg("creature-stippling", "Pocket monster Voronoi stippling", "Weighted centroidal Voronoi stipples form a stylized electric pocket creature silhouette.");
    const bounds = [70, 34, width - 58, height - 36];
    const leftEar = [[218, 132], [178, 42], [252, 103], [244, 146]];
    const rightEar = [[342, 132], [384, 42], [308, 103], [316, 146]];
    const leftTip = [[178, 42], [197, 83], [229, 85], [204, 55]];
    const rightTip = [[384, 42], [364, 83], [331, 85], [356, 55]];
    const tail = [[374, 232], [438, 184], [422, 224], [486, 218], [424, 280], [440, 238], [386, 260]];
    const sampleStep = 5.4;

    function polygonPath(points) {
      return `M${points.map(point => point.join(",")).join("L")}Z`;
    }

    function pointInPolygon(x, y, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    }

    function ellipseScore(x, y, cx, cy, rx, ry) {
      const value = 1 - (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      return Math.max(0, value);
    }

    function segmentDistance(px, py, ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      const length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
      const x = ax + t * dx;
      const y = ay + t * dy;
      return Math.hypot(px - x, py - y);
    }

    function creatureSignal(x, y) {
      const head = ellipseScore(x, y, 280, 184, 100, 84);
      const body = ellipseScore(x, y, 280, 260, 94, 88);
      const leftFoot = ellipseScore(x, y, 238, 330, 38, 18);
      const rightFoot = ellipseScore(x, y, 322, 330, 38, 18);
      const inLeftEar = pointInPolygon(x, y, leftEar);
      const inRightEar = pointInPolygon(x, y, rightEar);
      const inTail = pointInPolygon(x, y, tail);
      const cheek = Math.max(ellipseScore(x, y, 228, 214, 22, 16), ellipseScore(x, y, 332, 214, 22, 16));
      const eye = Math.max(ellipseScore(x, y, 252, 174, 9, 13), ellipseScore(x, y, 308, 174, 9, 13));
      const nose = ellipseScore(x, y, 280, 196, 5.5, 4.2);
      const mouth = Math.min(segmentDistance(x, y, 280, 202, 268, 216), segmentDistance(x, y, 280, 202, 292, 216)) < 4.2 ? 1 : 0;
      const tip = pointInPolygon(x, y, leftTip) || pointInPolygon(x, y, rightTip);
      const silhouette = Math.max(
        head * .9,
        body * .82,
        leftFoot * .46,
        rightFoot * .46,
        inLeftEar ? .74 : 0,
        inRightEar ? .74 : 0,
        inTail ? .62 : 0
      );

      if (tip) return { density: .98, region: "tip" };
      if (eye || nose || mouth) return { density: 1, region: "ink" };
      if (cheek) return { density: .94, region: "cheek" };
      if (inTail) return { density: .72, region: "tail" };
      if (silhouette > 0) return { density: Math.min(1, .34 + silhouette * .62), region: "body" };
      return { density: 0, region: "none" };
    }

    const samples = [];
    for (let y = bounds[1]; y <= bounds[3]; y += sampleStep) {
      for (let x = bounds[0]; x <= bounds[2]; x += sampleStep) {
        const signal = creatureSignal(x, y);
        if (signal.density > .2) {
          samples.push({ x, y, weight: signal.density ** 1.55, region: signal.region });
        }
      }
    }

    let totalWeight = 0;
    const cumulative = samples.map(sample => {
      totalWeight += sample.weight;
      return totalWeight;
    });
    const seeded01 = value => {
      const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const sampleAt = value => samples[Math.min(samples.length - 1, d3.bisectLeft(cumulative, value))];
    let points = d3.range(158).map(i => {
      const sample = sampleAt(((i * .61803398875 + .17) % 1) * totalWeight);
      const jitterX = (seeded01(i + 11) - .5) * sampleStep * .9;
      const jitterY = (seeded01(i + 29) - .5) * sampleStep * .9;
      const candidateX = sample.x + jitterX;
      const candidateY = sample.y + jitterY;
      const signal = creatureSignal(candidateX, candidateY);
      const x = signal.density > .18 ? candidateX : sample.x;
      const y = signal.density > .18 ? candidateY : sample.y;
      return { x, y, x0: x, y0: y, region: signal.density > .18 ? signal.region : sample.region };
    });

    for (let iteration = 0; iteration < 6; iteration++) {
      const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
      const accumulators = points.map(() => ({ x: 0, y: 0, weight: 0 }));
      samples.forEach(sample => {
        const index = delaunay.find(sample.x, sample.y);
        const accumulator = accumulators[index];
        accumulator.x += sample.x * sample.weight;
        accumulator.y += sample.y * sample.weight;
        accumulator.weight += sample.weight;
      });
      points = points.map((point, index) => {
        const accumulator = accumulators[index];
        if (!accumulator.weight) return point;
        return {
          ...point,
          x: accumulator.x / accumulator.weight,
          y: accumulator.y / accumulator.weight
        };
      });
    }

    points.forEach((point, index) => {
      const signal = creatureSignal(point.x, point.y);
      point.region = signal.region === "none" ? point.region : signal.region;
      point.weight = Math.max(.22, signal.density);
      point.cellIndex = index;
    });

    const defs = svg.append("defs");
    const clipId = "creature-stippling-clip";
    const clip = defs.append("clipPath").attr("id", clipId);
    clip.append("path").attr("d", polygonPath(leftEar));
    clip.append("path").attr("d", polygonPath(rightEar));
    clip.append("path").attr("d", polygonPath(tail));
    clip.append("ellipse").attr("cx", 280).attr("cy", 184).attr("rx", 100).attr("ry", 84);
    clip.append("ellipse").attr("cx", 280).attr("cy", 260).attr("rx", 94).attr("ry", 88);
    clip.append("ellipse").attr("cx", 238).attr("cy", 330).attr("rx", 38).attr("ry", 18);
    clip.append("ellipse").attr("cx", 322).attr("cy", 330).attr("rx", 38).attr("ry", 18);

    const dotFill = {
      body: palette.gold,
      tail: palette.orange,
      cheek: palette.red,
      ink: palette.gray900,
      tip: palette.gray900
    };
    const cellFill = {
      body: palette.yellowHighlight,
      tail: palette.orangeHighlight,
      cheek: palette.redHighlight,
      ink: palette.gray800,
      tip: palette.gray800
    };
    const orderedPoints = points.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
    const voronoi = delaunay.voronoi(bounds);

    const cells = svg.append("g")
      .attr("clip-path", `url(#${clipId})`)
      .selectAll("path")
      .data(orderedPoints)
      .join("path")
      .attr("d", d => voronoi.renderCell(d.cellIndex))
      .attr("fill", d => cellFill[d.region] || palette.yellowHighlight)
      .attr("fill-opacity", d => d.region === "ink" || d.region === "tip" ? .22 : .58)
      .attr("stroke", palette.surface)
      .attr("stroke-width", .95)
      .attr("opacity", .96);

    cells.each(function (_, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", .96)
        .attr("dur", ".72s")
        .attr("begin", `${i * .006}s`)
        .attr("fill", "freeze");
    });

    const dots = svg.append("g")
      .selectAll("circle")
      .data(orderedPoints)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.region === "ink" || d.region === "tip" ? 2.9 + d.weight * 2.4 : 2.1 + d.weight * 2.1)
      .attr("fill", d => dotFill[d.region] || palette.gold)
      .attr("fill-opacity", d => d.region === "body" ? .78 : .92);

    dots.each(function (d, i) {
      const delay = .16 + i * .006;
      const radius = d.region === "ink" || d.region === "tip" ? 2.9 + d.weight * 2.4 : 2.1 + d.weight * 2.1;
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "cx")
        .attr("from", d.x0)
        .attr("to", d.x)
        .attr("dur", ".96s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "cy")
        .attr("from", d.y0)
        .attr("to", d.y)
        .attr("dur", ".96s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "r")
        .attr("from", .4)
        .attr("to", radius)
        .attr("dur", ".64s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });
  }
```
