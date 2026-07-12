# Pattern Selection Contracts

Read this when choosing D3 chart patterns for dense data, distributions, uncertainty, linked views, maps, or publishable graphics. Use it to make chart choice, data mapping, interaction, and validation explicit before coding.

## Chart Purpose Gate

Before choosing a chart family, decide the primary task:

- Exact lookup: table, inline bars, or labeled compact chart.
- Comparison/ranking: aligned position before color, area, or angle.
- Distribution: raw observations, density/bin summary, or intervals based on sample size and overlap.
- Relationship: scatter, connected scatter, density, facet-sparklines, or model overlays with declared transforms.
- Geography: map only when location, boundary, distance, or geographic level changes interpretation.
- Publication: source, units, denominator, and final takeaway.

If interaction is part of the answer, name what hover, filter, brush, or selection reveals. Essential values, units, and interval meanings need a non-hover path.

## Visualization Contract

Before building the SVG or HTML, write a compact contract in working notes or code constants:

- `purpose_gate`: exact lookup, comparison, distribution, relationship, geography, model estimate, or story.
- `data_fields`: source fields, stable row IDs, units, grouping keys, and denominators.
- `visual_channels`: which field controls x, y, color, size, shape, opacity, stroke, area, label, or motion.
- `stat_transforms`: aggregation, binning, smoothing, sorting, ranking, weights, intervals, model fits, or normalization.
- `scale_contract`: scale type, domain source, shared-domain requirements, zero baseline requirements, and color ramp semantics.
- `ordering_contract`: category, legend, facet, and table order; data-driven, semantic, or user-selected.
- `coordinate_contract`: Cartesian, radial, geographic projection, small multiples, or transformed coordinates.
- `interaction_contract`: hover, click, brush, lasso, zoom, filter, highlight, persistent selection, and clear state.
- `accessibility_contract`: SVG `title`/`desc`, labels/legend, source, units, interval text, and non-hover access to essential values.

Do not add a visual channel that cannot be traced back to data, interaction state, or a stated decorative role.

## Distribution Pattern Choice

Use the least aggregated view that still answers the task:

- Raw points: use when individual observations matter and point count is readable.
- Jittered or beeswarm points: use when individual observations matter but points overlap on one axis.
- Dot plot: use for compact comparisons across categories when values are discrete or countable.
- Boxplot: use for quartile and outlier summaries, but not alone when sample size or shape matters.
- Violin or ridgeline: use when distribution shape matters more than individual values.
- Half-eye or point-range: use when interval semantics are central; label what the interval means.
- Facets: use when group comparison matters and a shared scale can be maintained.

Validation:

- Shared comparison groups must use a shared scale unless the chart explicitly labels independent scales.
- If raw observations disappear after a summary stage, the final chart must state the aggregation or interval semantics.
- Sample size should be visible in text, labels, or mark count when it affects interpretation.
- Weights that change counts, densities, or summaries must be declared because they are not directly visible in the marks.

## Uncertainty And Model Contract

For intervals, forecasts, estimates, or model output, define:

- `interval_type`: standard error, confidence interval, prediction interval, credible interval, quantile interval, or custom band.
- `coverage`: the interval width or probability level, such as 50%, 80%, 90%, or 95%.
- `estimator`: raw statistic, smoothed estimate, fitted model, simulation, or posterior sample.
- `sample_size`: visible count, denominator, or effective sample size.
- `selection_behavior`: whether selection recomputes, filters, or only highlights existing marks.

Validation:

- Do not draw an interval without visible or reachable semantics.
- Keep raw observations, summaries, and model estimates distinct.
- Selection layers should use fixed bin widths, bandwidths, model parameters, and interval definitions unless recomputation is labeled.
- Client-side recomputation of non-trivial statistics must be deterministic and named.

## Overplotting Ladder

For dense scatter or point clouds, choose the first method that preserves the user's task:

1. Smaller marks, hollow marks, or opacity for light overlap.
2. Jitter only when it cannot imply false precision.
3. Facets when group comparison matters more than global density.
4. Rectangular binning or hexbin when aggregate density is the message.
5. Density contours when topology and clusters matter more than exact counts.
6. Summary overlays when raw marks would distract from the analytical claim.

Validation:

- Dense regions must stay legible at the target viewport.
- Bins must expose count, rate, or density semantics through labels, legend, tooltip, or annotation.
- Jitter amplitude must be smaller than the meaningful data interval.
- Very dense point output may need a bitmap mark layer with vector labels and axes when vector size or browser performance would dominate.

## Scale And Summary Semantics

Use visual channels according to task precision:

- Aligned x/y position supports precise comparison better than size, area, color, shape, or opacity.
- Linear-amount bars should start at zero. For ratios, logs, or non-zero baselines, prefer dots, point-ranges, or lines unless the baseline is explicit.
- Area encodings need area-aware scaling; avoid mixing size with shape when exact comparison matters.
- Binned views must declare bin width, bin origin when relevant, and whether color encodes count, rate, or density.
- Density contours and smoothers must be labeled as estimates and tuned so bandwidth does not invent or erase structure.
- Category, legend, and facet ordering is part of the chart contract; choose deliberately.

## Linked View Query Contract

When multiple views respond to the same user action, define one shared query state:

- `key`: stable row or group key shared by every view.
- `source_view`: the view that emits hover, click, brush, lasso, or zoom events.
- `target_views`: views that update from the shared query state.
- `mode`: highlight, filter, compare, detail, or persistent selection.
- `clear_state`: visible behavior for clearing hover, brush, or persistent selection.

Mode rules:

- Highlight preserves context by dimming non-selected marks.
- Filter removes marks and may rescale; label that rescale if the axis changes.
- Compare keeps at least two states visible and distinguishable.
- Detail updates text, table rows, or annotations without changing the main scale.

Validation:

- Every linked mark should resolve to the same key namespace.
- Target views need a meaningful baseline before interaction. Empty panels are failures unless labeled selection-only and another view carries baseline context.
- Clearing selection must restore all target views.
- Hover-only behavior must have a click, selected-state, table, or label fallback when values are essential.

## Map Fit Contract

Before choosing a map, verify that geography is part of the question. If the task is only ranking, trend, or part-to-whole comparison, consider a non-map chart or pair the map with one.

Contract fields:

- `geometry_level`: country, state, county, route, point, grid, or tile.
- `measure`: raw count, rate, index, category, or uncertainty.
- `denominator`: population, area, exposure, total, or none.
- `classification`: continuous, quantile, equal interval, threshold, bivariate, or categorical.
- `projection`: named projection and reason when projection affects the story.
- `source`: data source, geometry source, date, and credit.

Validation:

- Class breaks and denominator must be declared when color encodes a measure.
- Tooltips or labels must work on small screens or have a non-hover fallback.
- Choropleths should use rates or normalized measures unless raw totals are explicitly the story.

## Publication Data Contract

For publishable or shared artifacts, include:

- Title or caption with the question or takeaway.
- Data source, geometry source when applicable, date, unit, denominator, and transforms.
- Source and credit text visible in the exported artifact.
- Labels, selected-state text, table rows, or download affordances when exact values matter.
- Mobile and keyboard/non-hover fallback for essential interactive values.
- Reproducible rendering path with no manual post-processing.

Validation:

- The final chart should remain interpretable as a still frame.
- Essential metadata should not live only in code comments, console output, or hover text.
- Dense output should use an export format that keeps text crisp without making the artifact impractically large.

## Annotation And Finish

Treat annotation as part of the pattern, not a cleanup pass:

- Prefer direct labels over legends when there are few series or key marks.
- Use label lanes, leader lines, halos, or backplates when labels sit near marks.
- Reserve enough margin for off-plot labels; clipped labels are validation failures unless intentionally masked.
- In small panels, reserve separate rows for title, axis label, status, legend, and value labels; do not pile them at the same anchor.
- Keep callouts tied to data coordinates or clearly to layout coordinates.
- Keep source, units, and interval definitions visible or reachable.
- Give interactive state text, buttons, and filter controls explicit layout slots. Use flex rows, wrapping groups, or separate lines so a button cannot overlap a sentence at narrow or desktop widths.
- On mobile, stack views, use horizontal scroll, or provide a readable table/detail fallback instead of shrinking dense SVG text below readability.

Validation:

- Labels must not overlap each other, critical marks, axes, or controls.
- Subpanel titles, axis labels, legends, and status text need distinct positions in screenshots.
- Status text, reset buttons, legends, and summary controls must not overlap; long state text should wrap or truncate within its own reserved area.
- Text must fit inside its parent element at desktop and mobile widths.
- The final frame must remain interpretable without replaying the animation.
