# Attention Arc Decoding

- **Pattern ID:** `d3-attention-arc-decoding`
- **Gallery source ID:** `attention-arc-decoding`
- **Family:** LLM
- **Use when:** Attention arcs target an empty next-token slot, reveal a generated token, and then include that token in the next attention pass.
- **Renderer:** `renderAttentionArcDecoding`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Follow the requested output path exactly. Do not use the pattern ID as the filename unless the user asks for that filename.
- Keep the token sequence deterministic and inline.
- Preserve the core causal geometry: context tokens on one baseline, empty future slots to the right, arcs from context sources into the active slot, then generated-token reveal.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Data Contract

Use a short phrase split into visible prompt tokens plus three generated tokens. The gallery fixture uses:

```js
const tokens = [
  { text: "The", kind: "prompt", w: 52 },
  { text: "model", kind: "prompt", w: 74 },
  { text: "predicts", kind: "prompt", w: 90 },
  { text: "the", kind: "generated", w: 54, step: 0 },
  { text: "next", kind: "generated", w: 62, step: 1 },
  { text: "word", kind: "generated", w: 62, step: 2 }
];
const steps = [
  { target: 3, weights: [.18, .30, .52] },
  { target: 4, weights: [.10, .16, .26, .48] },
  { target: 5, weights: [.08, .12, .18, .25, .37] }
];
```

## Deterministic Builder

For standalone HTML artifacts, prefer the bundled deterministic builder and pass the exact requested output path:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_attention_arc_decoding.py attention-arc-decoding.html
```

Replace `attention-arc-decoding.html` with the exact path requested by the user or test prompt. The script writes a self-contained HTML file with inline SVG and SVG-native animation; it does not use network resources or the examples gallery.

## Geometry Contract

- Set a stable `viewBox` such as `0 0 560 420`.
- Place all tokens on one horizontal baseline. Prompt tokens render as solid white token boxes; generated tokens start as dashed empty slots.
- For each decode step, draw one cubic Bezier arc from every prior context token into the target empty slot.
- Make arc stroke width and opacity proportional to attention weight.
- Use distinct target colors for the three generated tokens. When a previously generated token becomes a source in a later step, draw its outgoing arc in that token's color so the growing context is visible.
- Keep arcs behind token boxes so endpoints do not cover word labels.

## Animation Contract

- Step 1 draws arcs from the prompt tokens into the first empty slot, then reveals `the`.
- Step 2 draws arcs from prompt tokens plus `the` into the next empty slot, then reveals `next`.
- Step 3 draws arcs from prompt tokens plus `the` and `next` into the final empty slot, then reveals `word`.
- Reveal each generated token just after its incoming arcs finish drawing.
- Leave final attributes in the completed state: all generated tokens visible, all attention arcs visible, and all slot labels readable.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-attention-arc-decoding"`.
- Arcs expose `data-decode-step`, `data-source-token`, `data-target-token`, and `data-attention-weight`.
- The final SVG contains 6 token groups, 12 attention arcs, 3 generated token overlays, and 3 query cursor pulses.
- A screenshot after about 2.2 seconds should show the complete phrase `The model predicts the next word`.

## Source Excerpt

The excerpt below captures the core renderer. If adapting it into a standalone artifact, recreate only the needed helper behavior from `references/shared-renderer-helpers.md`.

```js
function renderAttentionArcDecoding() {
  const svg = prepareSvg("attention-arc-decoding", "Attention arc decoding", "Autoregressive decoding draws attention arcs into empty slots before revealing three generated tokens.");
  const tokenY = 244;
  const tokenH = 40;
  const gap = 10;
  const tokens = [
    { text: "The", kind: "prompt", w: 52 },
    { text: "model", kind: "prompt", w: 74 },
    { text: "predicts", kind: "prompt", w: 90 },
    { text: "the", kind: "generated", w: 54, step: 0, color: palette.red, fill: palette.redHighlight },
    { text: "next", kind: "generated", w: 62, step: 1, color: palette.orange, fill: palette.orangeHighlight },
    { text: "word", kind: "generated", w: 62, step: 2, color: palette.purple, fill: palette.purpleHighlight }
  ];
  const totalW = d3.sum(tokens, d => d.w) + gap * (tokens.length - 1);
  let cursor = (560 - totalW) / 2;
  tokens.forEach((token, index) => {
    token.index = index;
    token.x = cursor;
    token.y = tokenY;
    token.cx = cursor + token.w / 2;
    token.generated = token.kind === "generated";
    cursor += token.w + gap;
  });

  const steps = [
    { step: 1, target: 3, begin: .18, color: palette.red, weights: [.18, .30, .52] },
    { step: 2, target: 4, begin: .86, color: palette.orange, weights: [.10, .16, .26, .48] },
    { step: 3, target: 5, begin: 1.54, color: palette.purple, weights: [.08, .12, .18, .25, .37] }
  ];
  const stage = svg.append("g").attr("class", "attention-arc-decoding-stage");
  const arcLayer = stage.append("g").attr("class", "attention-arc-layer");
  const arcPath = (source, target, stepIndex) => {
    const distance = Math.abs(target.index - source.index);
    const apexY = tokenY - 48 - distance * 10 - stepIndex * 7;
    return `M${source.cx},${tokenY + 2}C${source.cx},${apexY} ${target.cx},${apexY} ${target.cx},${tokenY + 2}`;
  };

  steps.forEach(step => {
    const target = tokens[step.target];
    const sources = tokens.slice(0, step.target).map((source, sourceIndex) => ({
      source,
      target,
      weight: step.weights[sourceIndex],
      step
    }));
    const paths = arcLayer.selectAll(`path.decode-step-${step.step}`)
      .data(sources)
      .join("path")
      .attr("id", d => `attention-arc-decoding-step-${d.step.step}-source-${d.source.index}`)
      .attr("class", `attention-arc decode-step-${step.step}`)
      .attr("data-decode-step", step.step)
      .attr("data-source-token", d => d.source.text)
      .attr("data-target-token", d => d.target.text)
      .attr("data-attention-weight", d => d.weight.toFixed(2))
      .attr("d", d => arcPath(d.source, d.target, step.step))
      .attr("fill", "none")
      .attr("stroke", d => d.source.generated ? d.source.color : d.weight > .28 ? step.color : palette.blue)
      .attr("stroke-width", d => 1.2 + d.weight * 7.2)
      .attr("stroke-opacity", d => .22 + d.weight * .95)
      .attr("stroke-linecap", "round");
    paths.each(function (d, i) {
      const length = this.getTotalLength();
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", 0)
        .append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", ".42s")
        .attr("begin", `${d.step.begin + i * .014}s`)
        .attr("fill", "freeze");
    });
  });

  const tokenLayer = stage.append("g").attr("class", "attention-arc-token-layer");
  const tokenGroups = tokenLayer.selectAll("g.attention-arc-token")
    .data(tokens)
    .join("g")
    .attr("class", d => `attention-arc-token ${d.kind}`)
    .attr("transform", d => `translate(${d.x},${d.y})`);
  tokenGroups.append("rect")
    .attr("width", d => d.w)
    .attr("height", tokenH)
    .attr("rx", 9)
    .attr("fill", palette.surface)
    .attr("stroke", d => d.generated ? palette.gray300 : palette.gray400)
    .attr("stroke-dasharray", d => d.generated ? "5 5" : null);
  tokenGroups.filter(d => !d.generated).append("text")
    .attr("class", "mark-label")
    .attr("x", d => d.w / 2)
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .text(d => d.text);
  tokenGroups.filter(d => d.generated).append("rect")
    .attr("width", d => d.w)
    .attr("height", tokenH)
    .attr("rx", 9)
    .attr("fill", d => d.fill)
    .attr("stroke", d => d.color)
    .attr("opacity", 0)
    .each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".22s")
        .attr("begin", `${steps[d.step].begin + .46}s`)
        .attr("fill", "freeze");
    });
  tokenGroups.filter(d => d.generated).append("text")
    .attr("class", "mark-label")
    .attr("x", d => d.w / 2)
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .attr("opacity", 0)
    .text(d => d.text)
    .each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".18s")
        .attr("begin", `${steps[d.step].begin + .50}s`)
        .attr("fill", "freeze");
    });
}
```
