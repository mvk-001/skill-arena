# D3 Animated SVG Gallery Patterns

Use this reference when extending a gallery of multiple D3-generated SVG examples or building a browsable examples page.

## Card Contract

- Keep one data record per example with `id`, `kicker`, `title`, `copy`, and `render`.
- Use the `id` for the card `data-example`, the SVG `id`, and the per-card replay target.
- Derive a stable `patternId` as `d3-${id}` unless a specific stable override is required. Expose it on the card `id`, the card `data-pattern-id`, the SVG `data-pattern-id`, and a compact visible card label so examples can be referenced later as reusable patterns.
- Keep `window.D3_ANIMATED_SVG_EXAMPLES` in sync with gallery metadata. Derived pages such as `composition-sheets.html` depend on it for source titles, base `d3-*` IDs, and links, while rendering their own curated composition SVG previews.
- Keep card headers compact and stable. Do not let replay controls resize the visualization frame.
- Keep every SVG self-contained with a unique `title`, `desc`, and scoped IDs for definitions.

## Replay Contract

- Render each card by clearing only its own SVG and rebuilding its marks.
- Store a card-level render pass such as `data-render-pass` so verification can confirm isolated replay.
- Attach one delegated click listener to the gallery container and route through `data-replay`.
- After rebuilding a card, reset the target SVG timeline with `pauseAnimations()`, `setCurrentTime(0)`, and `unpauseAnimations()` so SMIL `begin` offsets replay visibly after the page has been open for a while.
- Replaying one card should not rebuild other cards, duplicate event listeners, or accumulate stale nodes.
- Keep the final visual state encoded in attributes, not only in transient D3 transition state.

## Animation Coverage

Use varied animation patterns across a large gallery:

- staged mark reveal for discrete marks and matrices
- path drawing for lines, routes, meshes, and trajectories
- radial reveal for arcs, partitions, polar views, and circular bars
- flow fade or motion tokens for ribbons, alluvial bands, Sankey paths, and routes
- force or collision settle for networks, beeswarms, Dorling maps, and packed clusters
- threshold or sweep reveal for density fields, choropleths, contours, and heatmaps
- focus/context interaction for brush, zoom, lasso, and drilldown demos
- cross-link reveal for tangled trees, tanglegrams, and comparable hierarchies
- tangled-tree or metro-style bundle paths should avoid redundant low-opacity stems when each route already includes the shared vertical run; duplicated stems make active links look like stray lines during level reveals
- text-weight and stipple reveals for word clouds, sampled fields, and Voronoi stippling
- projection or zoom-to-bounds transitions for analytical state changes
- projection comparison, vector-field, and Tissot distortion reveals for geospatial geometry
- diagnostic reveals for Q-Q plots, moving averages, Bollinger bands, scatterplot matrices, and threshold-colored lines
- cyclic geometry reveals for polar clocks, moon phases, solar terminators, star maps, and epicyclic paths
- SVG-native morphs for shape tweens, path tweens, arc tweens, and animated numeric labels
- brush and zoom explanations for custom handles, snapping, ordinal ranges, and linked detail windows
- geographic symbol and service-area maps such as spike maps, bubble maps, non-contiguous cartograms, projected hexbins, and Voronoi catchments
- scientific or raster-derived views such as H-R diagrams, solar paths, image histograms, and terrain or volcano contours
- image-backed explanatory overlays where a screenshot or diagram remains visible while D3-generated translucent covers, sweep lines, or outlines partially cover selected regions; keep the raster local, clipped, and low enough in opacity that overlays do not erase the source
- hybrid matrix and inspection views such as correlograms with diagonal histograms, rectangular 2D histograms, line cursors, and pie/data-switch arc tweens
- D3-only diagram counterparts for Mermaid-like forms when custom geometry or animation is the goal, such as flowchart DAGs, sequence lifelines, state machines, entity relationship schemas, Gantt rollouts, Git graphs, Kanban boards, and user journeys
- SVG data table forms such as typed row grids, inline bar tables, pivot heat tables, sortable ranking tables, sparkline rows, and column-profile tables where rows, cells, sort movement, and embedded mini-marks are animated with D3 joins
- context-window and capacity matrices such as waffle grids where each unit represents a token budget, allocation slot, or finite resource cell
- token-owned prompt transformations where each text group becomes a numeric ID and then occupies an ordered square context-window slot
- document word-quality blocks where each rounded word rectangle's length is the counting unit; keep the page, rules, and border neutral, encode correct and filler spans with green and gray, then use yellow for caution-style wrong spans or red for error/risk wrong spans when requested; pack words into paragraph-like lines with a fixed inter-word gap so spaces remain blank instead of being crossed by continuous rules, animate both row rules and word blocks in writing order from left to right and top to bottom, and use extraction-bucket variants when a single page should be separated by color into calculated filler/correct/wrong totals; keep extraction guides as subtle straight lanes instead of brace-like connectors
- LLM concept micro-visualizations for next-token probability, probability roulette sampling, temperature, nucleus sampling, attention routing, attention-arc decoding, embedding neighborhoods, key-value cache growth, tiled attention matrices, QKV projection flow, LoRA rank updates, FlashAttention block movement, MoE capacity routing, speculative decoding verification, RoPE rotation, tiled matrix accumulation, scaled dot-product attention, multi-head merge, logit-lens rank trajectories, residual normalization, SwiGLU gating, and paged KV cache allocation
- precision pen-rendered line art where a single persistent pen mark traverses hidden connector paths while visible strokes reveal pressure-modulated ribbons, not rough freehand jitter
- projection edge-case and scientific catalog views such as antimeridian cutting, adaptive sampling, satellite footprints, and exoplanet orbit catalogs
- sketchy variants or overlays for any D3 pattern, inspired by Jo Wood's Rough.js-backed Plot wrapper, where the data geometry remains faithful but SVG marks, axes, links, containers, tables, and comparison scorecards use deterministic seeded jitter, double strokes, and optional hachure texture in the repository color palette

Avoid adding examples that only restyle an existing chart. Prefer a new D3 module, geometry generator, interaction model, or data story.

## Example Reuse Patterns

Before creating a custom D3 component for a concept explainer, search the gallery for the closest existing geometry and adapt it. Preserve the example's core data semantics when they are the reason it works: weighted areas should remain weighted areas, ordered slots should remain ordered slots, and sampled outcomes should land in deterministic selected states.

Read `example-pattern-recipes.md` when adapting a promoted gallery pattern such as document token quality, extraction buckets, image partial covers, inline bar tables, sketchy overlays, model execution boxes, or token roulette sampling.

For token probability selection, prefer the `Token Roulette Sampler` pattern when the requested metaphor is roulette or chance-weighted sampling. Keep a probability-weighted pie or wheel, a fixed pointer, exterior tick marks, deterministic spin timing, and a final state where the selected wedge lands under the pointer. Use a compact legend or result mark only when it clarifies the wheel's mapping; do not replace the roulette with bars plus a scanning arrow unless the user asks for a ranking chart instead.

For inline bar tables, scale each embedded bar against the largest visible numeric value in its own column, not against a global table maximum. Keep a separate linear scale per metric column and expose enough data attributes to audit the rendered ratio. When the table compares live model/API pricing or current product metrics, curate rows to current, directly comparable entries with verified values, omit rows with missing/no-data prices, avoid stale model families in the comparison set, and use solid bars when the point is magnitude comparison rather than secondary background texture.

For Kanban boards with assignee dots, choose a legend layout before drawing columns. Use a top-row legend for maximum card width, a virtual legend column when symmetry matters more than card width, or distributed footer legend chips when the board has spare column height. Preserve square column/card edges, content-sized task cards, bottom-right assignee dots, and `data-legend-mode` / `data-legend-placement` hooks for browser validation.

For sketchy variants, preserve the existing chart or diagram's data semantics and use a seeded rough renderer so replay and exported SVGs are stable. Treat sketchiness as an overlay that can be applied to quantitative charts, maps, tables, model scorecards, comparison cards, and explanatory diagrams. Prefer reusable helpers for rough paths, rough rectangles, rough blobs, sketch axes, and hachure fills. Keep labels crisp and readable; apply sketchiness to marks, grids, axes, links, containers, and outlines rather than distorting text.

## Visual Critique Pass

For large galleries, review every card visually before delivery. Generate screenshots or contact sheets, then critique composition by example or by small batches. Focus on issues that automated checks cannot prove:

- token palette alignment and avoidance of raw D3 interpolator colors in repository-owned examples
- readable text, white text halos, and dark neutral label color on light surfaces
- solid informational backgrounds when text or badges sit on top of them; avoid translucent fills that make contrast depend on underlying marks
- axis, grid, link, and map scaffold contrast that supports the marks without competing
- semantic color hierarchy, with red reserved for risk, change, selected states, or highest-alert values
- legends or direct labels where color encodes categories or density
- dark/light label choices on heatmaps, choropleths, treemaps, and saturated fills
- replay-safe fixes that survive clearing and rebuilding one card at a time
- dynamic-symmetry alignment for composition-heavy patterns: use `scripts/audit_dynamic_symmetry.py` when points, centers, label lanes, routes, or major containers feel arbitrary even though collision and text-fit checks pass

Use `scripts/review_gallery_visuals.py` to capture every settled card, create labeled contact sheets, and record per-pattern text overflow, text overlap, rendered text size, and horizontal overflow signals. Run both desktop and mobile viewports. These signals are advisory: inspect the corresponding card before moving marks, and never distort protected chart or map geometry merely to clear a heuristic.

Integrate repeated findings through shared CSS, token ramps, and a gallery-level post-render polish function before adding chart-specific tweaks. Use chart-specific code when the color encodes data meaning, such as heatmaps, density bins, vaccine-impact ramps, bivariate keys, missing-data annotations, or selected/focus states.

## Styled Gallery Versions

Use a separate published source such as `assets/examples/d3-animated-svg-colorset2/` when the full gallery needs a palette/style version without changing the base gallery. Load `colorset2-config.js` before the shared `gallery.js`; the shared renderer assigns `d3-<slug>-cs2` IDs, preserves each `d3-<slug>` base ID in metadata, and remaps rendered SVG paint values to the tokens in `design/colorset2.yaml`.

Keep the version page flat and modular: no decorative shadows, no gradient/orb backgrounds, compact card headers, and rectangular surfaces that can read as a large visual map. Validate it with `scripts/verify_colorset2_gallery.py` so every SVG exposes `data-style-version="colorset2"`, `data-color-set="colorset2"`, `data-palette-name="full-color-style"`, and no SVG paint value falls outside the colorset2 palette.

Use `assets/examples/d3-animated-svg-cs1/` for the colorset1 red-neutral version. Load `cs1-config.js` before the shared `gallery.js`; the shared renderer assigns suffixed IDs such as `d3-force-network-cs1`, keeps `data-base-pattern-id="d3-force-network"`, and remaps all SVG paint values to `design/colorset1.yml`. Validate it with `scripts/verify_style_gallery.py` so every SVG exposes `data-style-version="cs1"`, `data-color-set="colorset1"`, `data-palette-name="basic-red-neutral-style"`, and only uses colors from the colorset1 palette.

## Verification

For gallery updates, verify:

- the expected card count matches `body[data-example-count]`
- derived composition pages expose curated SVG variants with stable `d3-composition-<composition-id>-<source-id>` IDs instead of repeating every pattern on every sheet
- every card exposes one unique pattern ID, and the card plus SVG agree on that pattern ID
- package or CI commands pin `--expected` to the intended card count instead of relying only on the page-generated count
- every card contains exactly one SVG and one replay control
- every SVG has positive dimensions, nontrivial element count, and animation nodes
- truth-sensitive metadata stays internally consistent; the verifier independently recomputes the Solar Terminator equation of time, declination, and subsolar longitude from its UTC timestamp
- release verification replays every card and updates only the targeted card render pass; use sampled replay only for fast smoke checks
- replay resets the SVG timeline near zero and the timeline advances after the click
- repeated replay does not leave duplicated marks or empty SVGs
- desktop and mobile screenshots preserve readable card headers, replay controls, labels, and SVG framing
- publication is completed, not just built locally: run `uv run --script scripts/build-pages.py`, commit the updated gallery source and pattern references, push the Pages-deploying branch, then verify the GitHub Pages workflow before relying on the new `d3-*` URL in another task

Use the gallery verifier for deterministic checks:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/verify_d3_gallery.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg/index.html --expected 224 --replay-all --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery.png --wait-ms 2200
uv run --script .agents/skills/d3-animated-svg/scripts/verify_d3_gallery.py http://127.0.0.1:4177/index.html --expected 224 --viewport 390x900 --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery-mobile.png --wait-ms 2200
uv run --script .agents/skills/d3-animated-svg/scripts/verify_colorset2_gallery.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg-colorset2/index.html --expected 224 --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery-colorset2.png --json-report projects/d3-animated-svg-validation/artifacts/data/gallery-colorset2.json --wait-ms 2200
uv run --script .agents/skills/d3-animated-svg/scripts/verify_style_gallery.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg-cs1/index.html --palette-file design/colorset1.yml --style-version cs1 --color-set colorset1 --palette-name basic-red-neutral-style --pattern-id-suffix cs1 --expected 224 --screenshot projects/d3-animated-svg-validation/artifacts/screenshots/gallery-cs1.png --json-report projects/d3-animated-svg-validation/artifacts/data/gallery-cs1.json --wait-ms 2200
```
