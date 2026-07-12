# Replicating D3-Generated SVGs

Use this reference when recreating a D3-generated SVG from the gallery, adapting one into a standalone artifact, or building a new SVG that must match this repository's visual system.

## Replication Workflow

1. Identify the gallery card `id` and its `render*` function in `.agents/skills/d3-animated-svg/assets/examples/d3-animated-svg/gallery.js`.
2. Copy only the required data, scales, layout code, and local helpers. Do not copy unrelated renderers.
3. Preserve the output contract: fixed `viewBox`, `role="img"`, `title`, `desc`, scoped IDs, deterministic data, and final attributes that already encode the settled state.
4. Use D3 for geometry and joins. Use inline SVG `animate`, `animateTransform`, `animateMotion`, or CSS keyframes for portable animation.
5. Apply the token palette below. Keep text outside dense marks when possible; otherwise use `mark-label` halos or `reverse-label` only on dark fills.
6. Verify with the gallery verifier or `render_d3_svg.py`, then inspect the screenshot for label collisions, contrast, clipped text, and replay behavior.

## Required Palette

Use these exact colors unless the visualization is intentionally reproducing an external source palette:

```js
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
  gray700: "#4f4f4f",
  gray900: "#1c1c1c",
  blueHover: "#004d66",
  redHover: "#6d1222",
  blueHighlight: "#cdf3ff",
  orangeHighlight: "#ffe5cc",
  yellowHighlight: "#fff4cc",
  greenHighlight: "#dbffcc",
  purpleHighlight: "#f9ccff",
  redHighlight: "#ffccd5",
  surface: "#ffffff",
  line: "#cfcfcf"
};
```

Prefer the primary palette for categories. Use highlights for low-emphasis fills, selection areas, and background bands. Reserve red for risk, pressure, selected states, negative deltas, or final-alert values.

## Base SVG Skeleton

```js
const width = 560;
const height = 420;

function prepareSvg(id, title, desc) {
  const svg = d3.select(`#${id}`);
  svg.selectAll("*").remove();
  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-labelledby", `${id}-title ${id}-desc`);
  svg.append("title").attr("id", `${id}-title`).text(title);
  svg.append("desc").attr("id", `${id}-desc`).text(desc);
  return svg;
}
```

Use `Open Sans, Arial, sans-serif` for text. In standalone SVG exports, set the font family in CSS or attributes because page CSS will not travel with the SVG.

## Portable Animation Snippets

Use SVG-native animation when the artifact may be extracted from the page:

```js
function fadeIn(selection, delay = 0, dur = 0.7) {
  selection.attr("opacity", 1).each(function (_, i) {
    d3.select(this).append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", `${dur}s`)
      .attr("begin", `${delay + i * 0.025}s`)
      .attr("fill", "freeze");
  });
}
```

```js
function drawPath(selection, delay = 0, dur = 1.1) {
  selection.each(function () {
    const length = this.getTotalLength ? this.getTotalLength() : 240;
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
```

D3 transitions are appropriate for live HTML. The D3 documentation describes transitions as selection-like DOM interpolation over a duration; extracted standalone SVGs will not keep that JavaScript behavior, so encode persistent motion in SVG or CSS.

## Context Window Waffle Matrix

Use this pattern for token budgets, capacity planning, allocation shares, or any concept where each unit represents part of a finite window.

Concept sources:

- [Agents' Last Exam: Harness Matters](https://agents-last-exam.org/blogs/harness-matters) frames an agent harness around a main loop, prompt builder, tool system, and context manager, with optional product layers such as memory, skills, preferences, and sub-agents.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) treats context as a finite token resource that includes instructions, tools, external data, message history, compaction, memory, and sub-agent summaries.
- [Arize: Context management in agent harnesses](https://arize.com/blog/context-management-in-agent-harnesses/) lists active context-window contents such as conversation history, system and project instructions, file excerpts, tool results, memory entries, retrieved documents, and summaries.
- [Haystack: Context Engineering for Agentic Systems](https://haystack.deepset.ai/blog/context-engineering) similarly maps system prompts, tool definitions, retrieved documents, and session history into the agent context.

Design rules:

- Use a 20 by 10 matrix for a compact 200-unit budget.
- Use one unit per 1K tokens by default; change `unitTokens` if the total is not near 200K.
- Fill cells left-to-right, top-to-bottom in the order context enters the model.
- Initialize every matrix cell as `Free budget`; add a separate colored used-cell overlay clipped by row masks. Animate each row clip from width `0` to the row's needed width, starting the next row only after the previous row finishes. Do not animate the base cell `fill`, because browser paint/replay timing can read as a colored flash instead of free capacity becoming occupied.
- Put all explanatory text outside the matrix. Avoid labels inside cells.
- Include a legend titled `Context Window`.
- Put a bottom label in `used / total` form, followed by a smaller `token / total` label.
- Show free or remaining budget as a neutral gray segment, not as a saturated category.

Recommended token-source colors:

| Context element | Color |
| --- | --- |
| System prompt | `palette.blue` |
| Project rules | `palette.green` |
| Tool schemas | `palette.orange` |
| User task | `palette.purple` |
| Files and retrieved docs | `palette.cyan` |
| Tool results or observations | `palette.gold` |
| Memory or compaction summary | `palette.red` |
| Free budget | `palette.gray100` |

## Token Boxes To Context Window

Use gallery card `context-window-fill` when a video or SVG needs to show tokenization, numeric token IDs, and ordered context insertion without explanatory labels.

Implementation rules:

- Build one group per token from the beginning. The group should own the token text, a transparent or low-emphasis rectangle, its numeric ID state, and its final matrix slot.
- Compute token positions from measured or fixed token widths plus explicit gaps. Do not position overlay boxes over one sentence or depend on SVG whitespace width.
- Animate the same identity through three states: readable token box, numeric ID card, and small colored matrix cell.
- Draw the context as a square matrix of neutral cells. Fill the first open slots left-to-right, top-to-bottom, and keep the matrix frame minimal; avoid decorative colored borders.
- Keep narration-only videos free of labels, captions, duration widgets, and progress rails. If a word remains visible, it must be the concept material itself, such as the prompt token or token ID.

Minimal implementation:

```js
function renderContextWindowMatrix() {
  const svg = prepareSvg("context-window-matrix", "Context window matrix", "Token sources fill a finite context window.");
  const totalTokens = 200000;
  const unitTokens = 1000;
  const segments = [
    { name: "System prompt", tokens: 18000, color: palette.blue },
    { name: "Project rules", tokens: 24000, color: palette.green },
    { name: "Tool schemas", tokens: 30000, color: palette.orange },
    { name: "User task", tokens: 16000, color: palette.purple },
    { name: "Files & docs", tokens: 34000, color: palette.cyan },
    { name: "Tool results", tokens: 22000, color: palette.gold },
    { name: "Memory summary", tokens: 12000, color: palette.red },
    { name: "Free budget", tokens: 44000, color: palette.gray100, unused: true }
  ];
  const cols = 20;
  const fillStart = 0.35;
  const cells = segments.flatMap(segment =>
    d3.range(Math.round(segment.tokens / unitTokens)).map(() => segment)
  ).slice(0, 200).map((segment, index) => ({
    ...segment,
    index,
    col: index % cols,
    row: Math.floor(index / cols)
  }));

  svg.append("text").attr("class", "mark-label").attr("x", 36).attr("y", 40).text("Context Window");
  svg.append("g").selectAll("rect").data(cells).join("rect")
    .attr("x", d => 45 + d.col * 18)
    .attr("y", d => 104 + d.row * 18)
    .attr("width", 15)
    .attr("height", 15)
    .attr("rx", 3)
    .attr("fill", palette.gray100)
    .attr("stroke", palette.surface)
    .attr("opacity", .72);

  const usedCells = cells.filter(d => !d.unused).length;
  const rowDuration = 0.42;
  const defs = svg.append("defs");
  d3.range(10).forEach(row => {
    const count = Math.max(0, Math.min(cols, usedCells - row * cols));
    if (!count) return;
    const clipWidth = (count - 1) * 18 + 15;
    const clipId = `context-window-row-${row}-clip`;
    defs.append("clipPath").attr("id", clipId).append("rect")
      .attr("x", 45)
      .attr("y", 104 + row * 18)
      .attr("width", 0)
      .attr("height", 15)
      .append("animate")
      .attr("attributeName", "width")
      .attr("from", 0)
      .attr("to", clipWidth)
      .attr("dur", `${rowDuration}s`)
      .attr("begin", `${fillStart + row * rowDuration}s`)
      .attr("fill", "freeze");

    svg.append("g")
      .attr("clip-path", `url(#${clipId})`)
      .selectAll("rect")
      .data(cells.filter(d => !d.unused && d.row === row))
      .join("rect")
      .attr("x", d => 45 + d.col * 18)
      .attr("y", d => 104 + d.row * 18)
      .attr("width", 15)
      .attr("height", 15)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("stroke", palette.surface);
  });

  svg.append("text")
    .attr("class", "mark-label")
    .attr("x", 223)
    .attr("y", 330)
    .attr("text-anchor", "middle")
    .text("156K / 200K tokens");
  svg.append("text")
    .attr("class", "caption")
    .attr("x", 223)
    .attr("y", 350)
    .attr("text-anchor", "middle")
    .text("token / total");
}
```

## Verification Commands

Run syntax and gallery validation after edits:

```powershell
node --check .agents\skills\d3-animated-svg\assets\examples\d3-animated-svg\gallery.js
npm run verify --prefix .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg
uv run --script scripts/validate-skills.py
```

For served gallery checks:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/verify_d3_gallery.py http://127.0.0.1:4177/index.html --expected 224 --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery-224-http.png --wait-ms 2200
uv run --script .agents/skills/d3-animated-svg/scripts/verify_d3_gallery.py http://127.0.0.1:4177/index.html --expected 224 --viewport 390x900 --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery-224-mobile.png --wait-ms 2200
```
