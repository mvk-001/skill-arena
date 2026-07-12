# D3 Layout Patterns For Animated SVG

Use these patterns when implementing D3-generated SVG that may later be captured as a standalone animated SVG.

## Output Contract

- **Live HTML:** Use D3 transitions, event handlers, zoom, drag, brush, and tooltips. Deliver the HTML or app shell because extracted SVG will not keep JavaScript behavior.
- **Portable animated SVG:** Use D3 for scales, layout, path generation, and data joins. Encode animation with inline CSS keyframes, SVG `animate`, `animateTransform`, or `animateMotion`.
- **Static final SVG:** Use D3 to compute geometry and export after all transitions settle. Keep a screenshot for verification when labels or filters are involved.

## Base SVG Structure

```js
const svg = d3.select("#viz")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("role", "img")
  .attr("aria-labelledby", "viz-title viz-desc");

svg.append("title").attr("id", "viz-title").text(title);
svg.append("desc").attr("id", "viz-desc").text(description);
const root = svg.append("g").attr("class", "scene");
```

Keep margins, scales, and data normalization near the top of the script. Use stable record IDs for joins so updates and animations target semantic marks instead of DOM order.

When embedding many inline SVGs in one gallery, scope every `title`, `desc`, gradient, mask, clip path, marker, and filter ID with the example ID. Keep a fixed `viewBox` and aspect ratio per card so replay controls, dynamic labels, or late-loading marks cannot resize the layout.

## Layout Recipes

- **Force layouts:** Copy input nodes and links before mutation. Use a deterministic random source when available, run a fixed number of ticks, call `simulation.stop()`, and animate nodes from a meaningful initial state to the settled coordinates.
- **Hierarchy layouts:** Use `d3.hierarchy` with `tree`, `cluster`, `pack`, `partition`, or `treemap`. Preserve depth, parent ID, and path breadcrumbs in classes or data attributes so animation can stage from root to leaves.
- **Tangled trees and tanglegrams:** Use explicit node layers before drawing links. For multiple parents or matched leaves, preserve stable IDs, draw context tree links first, then draw cross-links with lower opacity or distinct color so the comparison does not collapse into an unreadable graph.
- **Chord and ribbons:** Build a square matrix with explicit row and column labels. Sort groups intentionally and use stable colors for both source and target categories.
- **Network matrices and arc diagrams:** Choose node ordering first. The order is part of the analysis, not just styling.
- **Voronoi and Delaunay:** Use clipped bounds that match the plot area. Keep original points visible so cells do not become abstract polygons without anchors. For stippling, compute or approximate the intensity field first, then size or filter points from that scalar value.
- **Density fields:** Use fixed bandwidth, thresholds, and domains across states. Animate contours by opacity or threshold reveal unless path morphing is carefully normalized.
- **Geographic projections:** Fit the projection to local GeoJSON or known bounds. Avoid network fetches for exportable artifacts unless the user explicitly wants live data. For orthographic globes, Mercator comparisons, and projection tweens, prefer explicit `scale` and `translate` over expensive `fitExtent` calls against a whole sphere.
- **Symbol and glyph layouts:** Use `d3.symbol`, custom paths, or mini-glyph groups when one mark needs to encode multiple variables. Keep a compact legend because custom glyphs are less self-explanatory than standard bars or points.
- **Mosaic and Marimekko layouts:** Normalize both horizontal segment width and vertical stack height explicitly. Label the segment dimension and stack dimension so readers do not mistake variable area for a simple stacked bar.
- **Calendar and public-health heatmaps:** Use real date intervals or fixed year/month/week bins. Keep intervention markers, month labels, and color domains stable so animation does not imply a changing baseline.
- **Statistical diagnostics:** For Q-Q plots, moving averages, Bollinger bands, and threshold-colored lines, compute reference series first. Draw the reference, interval, or baseline before the observed marks so the diagnostic frame is visible.
- **Scatterplot matrices:** Use shared variable domains and compact fixed-size panels. Put variable labels on the diagonal and keep off-diagonal points small enough that panels remain readable.
- **Vector and scalar fields:** Use a regular grid or sampled points with fixed domains. Encode magnitude through length, radius, or color, and keep a legend or label when the field has no obvious units.
- **Text layouts:** Prefer deterministic positions for exportable word clouds unless a collision solver is seeded and pre-ticked. Size text with a scale, keep high-weight words near the center, and verify the longest word stays inside the viewBox.
- **Hull and mesh layouts:** Use `d3.polygonHull` and `d3.Delaunay` when neighborhood structure is the message. Keep points visible so enclosing or triangulated geometry has clear anchors.
- **Spatial indexes:** Use `d3.quadtree` when search, nearest-neighbor lookup, or partitioning is the point. Draw enough partition cells to explain the index, but keep the query point and nearest result visually dominant.
- **Ternary/simplex layouts:** Convert normalized triplets to barycentric coordinates. Show the triangle frame, grid guides, and corner labels so the custom projection is readable.
- **Uncertainty and target layouts:** For point ranges, bullets, and target bands, align ranges, estimates, and targets on the same scale. Animate range or value reveal without changing the final encoded positions.
- **Diverging and cumulative layouts:** For Likert stacks and waterfall charts, compute the neutral/zero baseline explicitly. Validate cumulative totals because sign mistakes are hard to spot visually.
- **Spatial joins and surfaces:** For geofencing and isolines, keep the source geometry visible enough to explain membership or thresholds. Distinguish point-in-polygon joins from continuous scalar fields.
- **Causal lanes and dependency paths:** For event cascades and critical-path DAGs, lay out time or rank first, then draw dependency arcs. Avoid implying arbitrary graph structure when ordering and duration are the message.
- **Selection overlays:** For lasso, brush, and linked selections, encode both selected and nonselected states. The selection geometry should be visible and should not hide the underlying data marks.
- **Zoom-to-bounds panels:** Draw the original viewport, selection rectangle, connector lines, and magnified pane in the same SVG. Use clipped or rescaled detail marks rather than changing the original marks in place.
- **Evolving networks:** Keep stable node IDs across snapshots. Precompute positions with deterministic force settings and animate from prior positions to final positions so the viewer can track identity.
- **Projection tours and difference charts:** Preserve point or series identity across states. Draw faint trails, baselines, or comparison bands so the motion encodes an analytical change rather than arbitrary movement.
- **Astronomical and mechanical layouts:** For star maps, moon phases, polar clocks, solar terminators, and epicyclic paths, make the generated geometry carry the data story. Keep cycles, phase order, or path equations clear enough to distinguish these from decoration.

## Data And Styling Discipline

- Use local or inline deterministic data for exportable work.
- Avoid layout randomness unless seeded and documented.
- Define color scales with enough contrast for labels and screenshots.
- Keep labels collision-aware. Prefer leader lines, halos, or hover-only labels in live HTML when density is high.
- Put reusable visual constants in variables. Do not scatter magic numbers across marks.
