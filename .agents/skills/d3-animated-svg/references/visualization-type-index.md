# Complementary D3 Visualization Type Index

Use this index to choose visual forms that complement Mermaid instead of duplicating it. Load the specific implementation details from `layout-patterns.md` and `animation-patterns.md` after choosing a form.

## High-Value D3 Forms

- `visualizations/force-networks.md`: force-directed networks, clustered graphs, temporal topology, and collision-driven placement.
- `visualizations/radial-hierarchies.md`: radial dendrograms, collapsible trees, packed hierarchies, partitions, and edge bundling.
- `visualizations/geospatial-svg.md`: projected maps, cartograms, route maps, projection comparison, Tissot indicatrices, vector fields, spatial joins, and choropleth-to-symbol transitions.
- `visualizations/distribution-density.md`: beeswarms, mirrored beeswarms, population pyramids, jittered strips, dot density, violin, ridgeline, Q-Q plots, contour, and hexbin views.
- `visualizations/temporal-playback.md`: streamgraphs, normalized stacked areas, missing-data lines and areas, bump charts, horizon charts, moving averages, Bollinger bands, Marey train diagrams, rank transitions, and animated time windows.
- `visualizations/flow-path-choreography.md`: ribbons, directed chords, parallel sets, alluvial paths, particles, individual path motion, and bundled flow.
- `visualizations/packing-proximity.md`: circle packing, bubble collision, Voronoi, Delaunay, hulls, proximity maps, and Voronoi stippling.
- `visualizations/focus-context-interaction.md`: brushing, zooming, lassoing, linked views, fisheye focus, zoom-to-bounds panels, and drilldown.
- Custom glyphs and symbols: `d3.symbol`, nested mini-glyphs, shape-coded scatterplots, and small legends for multivariate point data.
- Text and semantic layouts: word clouds, weighted labels, term clusters, and annotation constellations.
- Mosaic and matrix forms: Marimekko, waffle grids, context-window token matrices, token-to-slot transformations, tile maps, adjacency matrices, calendar year grids, and public-health heatmaps where area, time, capacity, or unit counts carry the message.
- SVG data tables: typed row grids, inline bars, pivot heat tables, sortable ranking rows, sparkline rows, and column profiles when cell-level animation or embedded quantitative marks matter.
- Set-overlap task maps: fixed asymmetric circles with small labeled task dots when work items belong to one, two, or three-or-more scopes and exact membership counts matter.
- Matrix diagnostics: scatterplot matrices, pairwise comparison grids, and small-multiple correlation panels.
- Hybrid matrices: correlograms with diagonal histograms, lower-triangle scatter panels, and upper-triangle correlation cells.
- Spatial indexing and search: quadtrees, nearest-neighbor lookups, partition cells, and query overlays.
- Uncertainty and target forms: point ranges, error bars, bullet charts, confidence intervals, and target bands.
- Specialized composition: ternary/simplex plots, diverging Likert stacks, waterfall deltas, and dense event barcode-plot plots.
- Surface and spatial joins: geofenced points, isolines, scalar terrain, service catchments, and geodesic range rings.
- Temporal causality and evolution: event cascades, cohort lifelines, forecast fans, survival curves, difference charts, stacked-to-grouped transitions, scatterplot tours, and topology snapshots.
- Selection and annotation: lasso selection, linked brushing, zoom lenses, callout tours, and data-bound highlight overlays.
- Computed dependency views: tangled trees, tanglegrams, critical-path DAGs, clustered dendrogram matrices, subtree expansion, and weighted bottleneck paths.
- Morph and interaction primitives: shape tweens, path tweens, arc tweens, text tweens, brush handles, brush snapping, ordinal brushing, and independent x/y zoom views.
- Scientific and raster analysis: H-R diagrams, solar paths, image-region histograms, geospatial hexbin maps, service-area Voronoi maps, and raster-to-contour workflows.
- Projection edge cases and science catalogs: antimeridian cutting, satellite projection footprints, adaptive sampling, exoplanet orbit catalogs, and line-cursor inspection overlays.
- Astronomical and mechanical geometry: solar terminators, solar paths, star maps, H-R diagrams, moon phases, polar clocks, epicyclic gearing, and other generated geometric paths.

## Coverage Tags

Use these tags to avoid adding near-duplicates to an examples gallery:

| Family | D3 patterns | Typical animation | Replay check |
| --- | --- | --- | --- |
| Simulation | force, collision, pack | settle or staged reveal | nodes return to deterministic positions |
| Hierarchy | tree, cluster, partition, treemap | parent-to-child expansion | descendants and labels reappear once |
| Flow | sankey, chord, ribbon, path | ribbon fade, path draw, motion token | paths preserve weight and direction |
| Set overlap | asymmetric task circles, shared membership dots | circle grow, leader fade, task-dot reveal | set counts and membership attributes match the requested tasks |
| Proximity | Voronoi, Delaunay, hulls | cell, mesh, or hull reveal | points remain visible as anchors |
| Sampling | stippling, weighted point fields, Voronoi cells | cells then dots | point density follows the underlying field |
| Distribution | bins, density, quantiles | bar grow, contour sweep, mark reveal | axes and summaries stay stable |
| Temporal | line, area, ranks, spiral | path draw or time-window reveal | final period labels are correct |
| Geospatial | projection, geoPath, graticule | route draw or region reveal | projected geometry is nonblank |
| Projection | orthographic, Mercator, Natural Earth, Tissot | coordinate tween or distortion reveal | projection math stays performant and clipped |
| Geo-symbol | spike map, bubble map, hexbin map, airport/service Voronoi, non-contiguous cartogram | symbol grow, cell reveal, or region scale | projected anchors and region outlines remain clear |
| Glyph/matrix | symbol, unit grid, heatmap | per-mark cascade | legends and units remain readable |
| Data table | row/cell joins, inline bars, sparklines, profile histograms | row reveal, cell cascade, or sort transition | rows, headers, numbers, and embedded marks remain aligned |
| Multivariate matrix | scatterplot matrix, pairwise panels | panel cascade | diagonal labels and off-diagonal points are clear |
| Hybrid matrix | correlogram, diagonal histogram, correlation cells | panel fade or mark cascade | each triangle encodes a different but related statistic |
| Text | word cloud, weighted labels | scale and opacity reveal | large words remain readable and inside the frame |
| Index/search | quadtree, nearest lookup | partition reveal and query highlight | query target and nearest result are visible |
| Uncertainty | interval, target band, bullet | range draw and estimate reveal | intervals, targets, and estimates align |
| Diagnostics | Q-Q, moving average, Bollinger, threshold line | reference line then sample reveal | reference and observed values remain distinguishable |
| Composition | simplex, diverging stack, waterfall | baseline or unit reveal | totals and zero baselines remain correct |
| Events | rug, barcode-plot, timeline lanes | tick cascade | dense marks stay legible |
| Surface | contour, isoline, scalar grid | threshold sweep | bands map to ordered values |
| Rectangular density | rectbin, 2D histogram | cell fade or value sweep | bins preserve a visible grid and ordered density scale |
| Selection | lasso, brush, linked highlight | selection path and highlight reveal | selected and nonselected marks remain distinguishable |
| Brush/zoom | brush handles, snapping, ordinal brushing, x/y zoom | selection rectangle or zoom window reveal | handles, snapped range, and detail panel stay aligned |
| Morph | shape tween, path tween, arc tween, text tween | SVG-native attribute interpolation | final geometry or value is encoded in attributes |
| Causality | event arcs, DAG, lagged lanes | path draw and pulse | ordering and lag labels are preserved |
| Evolution | stable joins, force snapshots | enter/update/exit or position tween | node identities persist across states |
| Comparative hierarchy | tangled tree, tanglegram, hierarchical bars | cross-link draw or indented bar reveal | shared leaves, multiple parents, and totals remain traceable |
| Generated geometry | epicyclic paths, polar clocks, moon phases, star maps | path draw, arc reveal, or phase sequence | geometry is meaningful, not decorative motion |
| Scientific catalog | H-R diagram, exoplanet orbits, satellite footprints, solar path | mark grow, orbit reveal, or path draw | scientific axes or orbital/ring encodings remain labeled |

## Avoid As D3 Defaults

- Flowcharts, sequence diagrams, state machines, class diagrams, ER diagrams, requirements, and Gantt charts unless the request needs custom simulation or bespoke data geometry.
- Simple pie, radar, bar, line, XY, Sankey, timeline, mindmap, or treemap outputs when Mermaid or ECharts already answers the request with less custom code.
- Decorative motion that does not encode data, ordering, causality, attention, or state change.

## Selection Heuristic

Choose D3 when at least one of these is true:

- The layout depends on data values rather than a fixed diagram syntax.
- The visualization needs custom marks, packed or bundled geometry, projections, or simulation.
- The user needs portable animated SVG with data-specific timing and SVG-native animation.
- The final artifact must show a relationship Mermaid cannot express without losing the point of the data.
