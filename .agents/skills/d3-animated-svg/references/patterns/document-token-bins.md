# Document Extraction Buckets

- **Pattern ID:** `d3-document-token-bins`
- **Gallery source ID:** `document-token-bins`
- **Family:** Document
- **Use when:** A single page is scanned in writing order, then colored word blocks split into filler, correct, and wrong buckets with calculated totals.
- **Renderer:** `renderDocumentTokenExtractionBuckets`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderDocumentTokenExtractionBuckets() {
    const svg = prepareSvg("document-token-bins", "Document token extraction buckets", "A single colored document page is extracted into filler, correct, and wrong buckets with calculated totals.");
    const totalUnits = 420;
    const wordHeight = 7;
    const wordGap = 3.3;
    const unitPx = 1.58;
    const doc = { x: 40, y: 58, w: 148, h: 302 };
    const categories = {
      filler: { label: "Filler", fill: palette.gray500, stroke: palette.gray600, light: palette.gray100, ratio: .7 },
      correct: { label: "Correct", fill: palette.green, stroke: palette.greenHover, light: palette.greenHighlight, ratio: .2 },
      wrong: { label: "Wrong", fill: palette.red, stroke: palette.redHover, light: palette.redHighlight, ratio: .1 }
    };
    const buckets = [
      { kind: "filler", x: 238, y: 62, w: 282, h: 82 },
      { kind: "correct", x: 238, y: 171, w: 282, h: 82 },
      { kind: "wrong", x: 238, y: 280, w: 282, h: 82 }
    ];
    const seeded01 = value => {
      const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const splitUnits = (units, salt) => {
      let remaining = units;
      const chunks = [];
      while (remaining > 0) {
        let length = 4 + Math.floor(seeded01(salt + chunks.length * 17) * 10);
        if (remaining <= 13) length = remaining;
        else if (remaining - length > 0 && remaining - length < 4) length = remaining;
        chunks.push(Math.min(length, remaining));
        remaining -= chunks.at(-1);
      }
      return chunks;
    };
    const budgets = {
      filler: Math.round(totalUnits * categories.filler.ratio),
      correct: Math.round(totalUnits * categories.correct.ratio)
    };
    budgets.wrong = totalUnits - budgets.filler - budgets.correct;
    const kindOrder = ["filler", "correct", "wrong"];
    const tokens = kindOrder.flatMap((kind, kindIndex) => splitUnits(budgets[kind], 200 + kindIndex * 57).map((units, index) => ({
      id: `${kind}-${index}`,
      kind,
      units,
      w: Math.max(5.2, units * unitPx),
      sort: seeded01((kindIndex + 1) * 311 + index * 23)
    }))).sort((a, b) => d3.ascending(a.sort, b.sort));
    const innerX = doc.x + 14;
    const innerW = doc.w - 28;
    const linePlans = [
      { row: 0, fill: .98 },
      { row: 1, fill: .92 },
      { row: 2, fill: .7 },
      { row: 4, fill: .97 },
      { row: 5, fill: .96 },
      { row: 6, fill: .74 },
      { row: 8, fill: .95 },
      { row: 9, fill: .9 },
      { row: 10, fill: .58 },
      { row: 12, fill: .62 }
    ];
    const remaining = tokens.slice();
    const sourceLines = [];
    linePlans.forEach((linePlan, lineOrder) => {
      const target = innerW * linePlan.fill;
      const rowWords = [];
      let used = 0;
      while (remaining.length) {
        const gap = rowWords.length ? wordGap : 0;
        const available = target - used - gap;
        const localWindow = remaining.slice(0, Math.min(remaining.length, 14));
        let candidates = localWindow
          .map((token, index) => ({ token, index }))
          .filter(candidate => candidate.token.w <= available)
          .sort((a, b) => d3.descending(a.token.w, b.token.w) || d3.ascending(a.index, b.index));
        if (!candidates.length) {
          candidates = remaining
            .map((token, index) => ({ token, index }))
            .filter(candidate => candidate.token.w <= available)
            .sort((a, b) => d3.ascending(a.index, b.index));
        }
        if (!candidates.length) break;
        const candidate = candidates[0];
        remaining.splice(candidate.index, 1);
        rowWords.push(candidate.token);
        used += gap + candidate.token.w;
      }
      if (!rowWords.length) return;
      let cursorX = innerX;
      rowWords.forEach((token, wordOrder) => {
        token.sourceX = cursorX;
        token.sourceY = doc.y + 36 + linePlan.row * 18 - wordHeight / 2;
        token.lineOrder = lineOrder;
        token.wordOrder = wordOrder;
        cursorX += token.w + wordGap;
      });
      sourceLines.push({
        lineOrder,
        x1: innerX,
        x2: innerX + used,
        y: doc.y + 36 + linePlan.row * 18 + wordHeight + 3,
        fill: used / innerW,
        wordCount: rowWords.length
      });
    });
    const sourceTokens = tokens.filter(token => Number.isFinite(token.sourceX))
      .sort((a, b) => d3.ascending(a.lineOrder, b.lineOrder) || d3.ascending(a.sourceX, b.sourceX));
    sourceTokens.forEach((token, writingIndex) => {
      token.writingIndex = writingIndex;
      token.writeDelay = .08 + writingIndex * .006;
      token.extractDelay = .82 + writingIndex * .012;
    });

    const bucketByKind = new Map(buckets.map(bucket => [bucket.kind, bucket]));
    kindOrder.forEach(kind => {
      const bucket = bucketByKind.get(kind);
      const list = sourceTokens.filter(token => token.kind === kind).sort((a, b) => d3.ascending(a.writingIndex, b.writingIndex));
      const x0 = bucket.x + 14;
      const maxX = bucket.x + bucket.w - 14;
      let x = x0;
      let y = bucket.y + 38;
      list.forEach((token, index) => {
        if (x > x0 && x + token.w > maxX) {
          x = x0;
          y += 11;
        }
        token.bucketIndex = index;
        token.targetX = x;
        token.targetY = y;
        x += token.w + 2.2;
      });
    });
    const summaries = buckets.map(bucket => {
      const words = sourceTokens.filter(token => token.kind === bucket.kind);
      const units = d3.sum(words, d => d.units);
      return {
        ...bucket,
        ...categories[bucket.kind],
        units,
        tokens: words.length,
        ratio: units / totalUnits
      };
    });

    svg.append("rect")
      .attr("x", doc.x)
      .attr("y", doc.y)
      .attr("width", doc.w)
      .attr("height", doc.h)
      .attr("rx", 7)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2);
    svg.append("g").selectAll("line.extraction-source-rule")
      .data(sourceLines)
      .join("line")
      .attr("class", "extraction-source-rule")
      .attr("data-line-order", d => d.lineOrder)
      .attr("data-line-fill", d => d.fill)
      .attr("data-word-count", d => d.wordCount)
      .attr("x1", d => d.x1)
      .attr("x2", d => d.x2)
      .attr("y1", d => d.y)
      .attr("y2", d => d.y)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", .85)
      .attr("stroke-linecap", "round");

    const route = svg.append("g").selectAll("path.extraction-route")
      .data(summaries)
      .join("path")
      .attr("class", "extraction-route")
      .attr("data-kind", d => d.kind)
      .attr("d", d => `M${doc.x + doc.w + 10},${d.y + d.h / 2}H${d.x - 12}`)
      .attr("fill", "none")
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.15)
      .attr("stroke-opacity", .18)
      .attr("stroke-linecap", "round");
    drawPath(route, .72, .55);

    const bucketGroups = svg.append("g").selectAll("g.extraction-bucket")
      .data(summaries)
      .join("g")
      .attr("class", "extraction-bucket")
      .attr("data-kind", d => d.kind)
      .attr("data-total-units", d => d.units)
      .attr("data-total-ratio", d => d.ratio.toFixed(3))
      .attr("data-token-count", d => d.tokens);
    bucketGroups.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.5);
    bucketGroups.append("text")
      .attr("class", "label")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 21)
      .attr("fill", d => d.stroke)
      .attr("font-weight", 800)
      .text(d => d.label);
    bucketGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + d.w - 14)
      .attr("y", d => d.y + 21)
      .attr("text-anchor", "end")
      .attr("fill", palette.ink)
      .text(d => `${d.units} / ${totalUnits}`);
    bucketGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + d.w - 14)
      .attr("y", d => d.y + 36)
      .attr("text-anchor", "end")
      .attr("fill", palette.muted)
      .text(d => `${d3.format(".0%")(d.ratio)} · ${d.tokens}`);
    bucketGroups.append("rect")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + d.h - 13)
      .attr("width", d => d.w - 28)
      .attr("height", 5)
      .attr("rx", 2.5)
      .attr("fill", palette.gray100);
    const bucketBars = bucketGroups.append("rect")
      .attr("class", "extraction-bucket-bar")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-total-units", totalUnits)
      .attr("data-ratio", d => d.ratio.toFixed(3))
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + d.h - 13)
      .attr("width", d => (d.w - 28) * d.ratio)
      .attr("height", 5)
      .attr("rx", 2.5)
      .attr("fill", d => d.fill);
    grow(bucketBars, "width", 0, d => (d.w - 28) * d.ratio, 1.64, .42);

    const sourceWords = svg.append("g").selectAll("rect.extraction-source-word")
      .data(sourceTokens)
      .join("rect")
      .attr("class", "extraction-source-word")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-writing-delay", d => d.writeDelay.toFixed(3))
      .attr("data-extract-delay", d => d.extractDelay.toFixed(3))
      .attr("x", d => d.sourceX)
      .attr("y", d => d.sourceY)
      .attr("height", wordHeight)
      .attr("rx", 2.5)
      .attr("width", d => d.w)
      .attr("fill", d => categories[d.kind].fill)
      .attr("stroke", d => categories[d.kind].stroke)
      .attr("stroke-width", .35);
    sourceWords.each(function (d) {
      const word = d3.select(this);
      word.append("set")
        .attr("attributeName", "width")
        .attr("to", 0)
        .attr("begin", "0s")
        .attr("dur", `${d.writeDelay}s`);
      word.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", d.w)
        .attr("dur", ".2s")
        .attr("begin", `${d.writeDelay}s`)
        .attr("fill", "freeze");
      word.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 1)
        .attr("to", .18)
        .attr("dur", ".26s")
        .attr("begin", `${d.extractDelay + .08}s`)
        .attr("fill", "freeze");
    });

    const movers = svg.append("g").selectAll("g.extracted-token")
      .data(sourceTokens)
      .join("g")
      .attr("class", "extracted-token")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-bucket-index", d => d.bucketIndex)
      .attr("data-source-x", d => d.sourceX)
      .attr("data-source-y", d => d.sourceY)
      .attr("data-target-x", d => d.targetX)
      .attr("data-target-y", d => d.targetY)
      .attr("transform", d => `translate(${d.targetX},${d.targetY})`)
      .attr("opacity", 0);
    movers.append("rect")
      .attr("width", d => d.w)
      .attr("height", wordHeight)
      .attr("rx", 2.5)
      .attr("fill", d => categories[d.kind].fill)
      .attr("stroke", d => categories[d.kind].stroke)
      .attr("stroke-width", .35);
    movers.each(function (d) {
      const mover = d3.select(this);
      mover.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".16s")
        .attr("begin", `${d.extractDelay}s`)
        .attr("fill", "freeze");
      mover.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "translate")
        .attr("additive", "sum")
        .attr("from", `${d.sourceX - d.targetX} ${d.sourceY - d.targetY}`)
        .attr("to", "0 0")
        .attr("dur", ".52s")
        .attr("begin", `${d.extractDelay}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .7 .2 1")
        .attr("fill", "freeze");
    });
  }
```
