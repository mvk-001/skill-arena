---
name: d3-animated-svg
description: "Create, animate, troubleshoot, and validate D3-generated SVG visualizations that complement Mermaid diagrams. Use when Codex needs bespoke data-driven SVG geometry or animated visuals Mermaid does not cover well: simulations, dense hierarchies, edge bundling, chords, parallel sets, asymmetric set-overlap task maps, Voronoi/Delaunay, quadtrees, geospatial projections, cartograms, spike/bubble/hexbin maps, contours, calendar and vaccine-style heatmaps, word clouds, beeswarms, population pyramids, statistical diagnostics, uncertainty views, temporal playback, missing-data series, scientific charts, raster/image analysis, shape/path/arc/text tweens, brush/zoom/selection views, custom glyphs, ternary plots, or animated annotations."
---

# D3 Animated SVG

## Core Workflow

1. Decide whether the request is a diagram or a custom visualization. Use Mermaid for conventional flowcharts, sequence diagrams, class diagrams, ER diagrams, state diagrams, requirements, Gantt timelines, and simple Mermaid-native charts. Use D3 when the visualization needs custom geometry, simulation, projections, dense quantitative encodings, or animated marks Mermaid cannot express cleanly.
2. Lock the output contract before coding:
   - For live interactive artifacts, deliver HTML with D3 transitions, zoom, drag, filters, or tooltips.
   - For portable animated SVG, use D3 to compute geometry and write inline SVG, CSS, or SMIL animation. Do not rely on D3 transitions to survive extraction into a standalone SVG.
   - If the request names an exact output file or path, write that exact path. Do not derive a replacement filename from a `d3-*` ID, title, or chart family.
   - If the request provides JSON, YAML, a table, or another structured output contract with IDs, counts, classes, or values, copy numeric counts and validation hooks exactly.
3. For self-contained, standalone, offline, or portable HTML/SVG deliverables, read `references/self-contained-output.md`, start from `assets/templates/self-contained-animated-svg.html` when useful, and validate with `scripts/check_self_contained_html.py`.
4. Before hand-rolling a visualization, check the pattern routing:
   - If the request involves dense observations, distribution alternatives, uncertainty intervals, linked views, map selection, or publishable explanatory graphics, read `references/pattern-selection-contracts.md` before choosing the chart structure.
   - Read `references/pattern-routing.md` when the request names or strongly resembles a reusable `d3-*` family, asks for exact mark counts, asks for small/medium/large variants, or mentions a builder-backed pattern such as critical queues, cache stampedes, circuit breakers, P&ID loops, organic growth, or Kanban assignee boards.
   - If the request names exact `d3-*` IDs, extract the complete unique set and read each matching `references/patterns/<id-without-prefix>.md` before coding.
   - If the request asks for a closest gallery pattern without naming an exact ID, search `references/pattern-index.md`, choose one pattern, then read only that matching file under `references/patterns/`.
   - Do not read the gallery fixture for normal pattern generation; use it only when maintaining that fixture.
5. Keep data deterministic. Inline small data, load local files for larger data, and seed or pre-tick force layouts so exported geometry is reproducible.
6. Build the SVG with a stable `viewBox`, `title`, `desc`, semantic groups, stable IDs/classes, and fixed dimensions. Ensure the final frame is a faithful data state, not only an animation midpoint.
7. Apply the visual token system before capture. Keep text neutral and readable, use white halos when labels sit on marks, reserve red for change/risk/emphasis, and prefer tokenized quantize/threshold ramps over raw D3 interpolator palettes when the output belongs to this repository. Read `references/visual-tokens.md` before creating or updating examples, galleries, or exported SVG fixtures.
8. Use `scripts/render_d3_svg.py` to open D3 HTML in Chromium, wait for the generated SVG, export the SVG markup, and optionally capture a screenshot for visual QA.
9. Verify that the SVG is nonblank, text fits, labels remain readable, moving marks do not cross readable text, animation starts from a meaningful state, and the final frame matches the intended values.

## Progressive Disclosure Map

- `references/pattern-routing.md`: read before using reusable pattern families, exact `d3-*` IDs, exact cardinality contracts, or builder-backed standalone patterns.
- `references/pattern-index.md`: search when selecting the closest gallery pattern without an exact pattern ID.
- `references/pattern-selection-contracts.md`: read when choosing among dense-data, distribution, uncertainty, linked-view, map, or publishable explanatory chart patterns.
- `references/visualization-type-index.md`: read when choosing a D3 visualization form or when the user asks for alternatives to Mermaid.
- `references/layout-patterns.md`: read when implementing layouts, scales, projections, hierarchy, force simulations, or data joins.
- `references/animation-patterns.md`: read when making portable SVG animation, staged reveals, path drawing, motion tokens, morphs, or final-frame verification.
- `references/self-contained-output.md`: read for self-contained, standalone, offline, or portable HTML/SVG artifacts.
- `references/cardinality-generalization.md`: read when adapting a pattern to fewer or more elements or satisfying exact SVG IDs, mark classes, and target counts.
- `references/shared-renderer-helpers.md`: read only when a per-pattern reference excerpt names shared helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`.
- `references/composition-audit.md`: read when analyzing point placement, dynamic symmetry, armature alignment, balance, or composition quality for an SVG pattern.
- `references/composition-variants.md`: read when maintaining composition sheets or adding curated `d3-composition-*` SVG preview variants.
- `references/svg-replication.md`: read when replicating, extracting, or adapting a D3-generated SVG from this repository.
- `references/gallery-patterns.md`: read only when extending or validating the multi-example gallery fixture.
- `references/command-reference.md`: read when you need exact capture, self-contained, contract, cardinality, gallery, or composition verification commands.
- `references/maintenance-validation.md`: read before changing this skill, its pattern references, scripts, examples, gallery, or composition sheets.

## Complementarity Rules

- Prefer Mermaid when the source notation is the value and the diagram type is supported.
- Prefer Slidev ECharts for standard dashboard charts inside Slidev decks when ECharts already provides the needed chart type.
- Prefer D3 when geometry is the message: simulated placement, custom marks, physical motion, projections, nested or bundled relationships, density fields, or animated transformations between data states.
- Do not recreate a Mermaid diagram in D3 just to animate it. If the input is Mermaid, use `mermaid-animated-svg`.
- Do not export an SVG that depends on external JavaScript. Extracted SVG should contain its own geometry and animation rules.

## Pattern Promotion

This section is for skill maintenance, not normal artifact generation. Do not update skill resources while creating a user artifact unless the user explicitly asks to promote, add, or maintain a reusable pattern.

When a gallery card or standalone SVG pattern proves reusable during skill maintenance, read `references/maintenance-validation.md` and update the owning pattern reference before finishing.

## Validation

After changing this skill, its references, scripts, or examples, read `references/maintenance-validation.md` and run the relevant validation commands. Always include:

```powershell
uv run --script scripts/validate-skills.py
```
