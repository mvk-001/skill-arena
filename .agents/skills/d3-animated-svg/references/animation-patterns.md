# Animation Patterns For D3-Generated SVG

Use these patterns when the final artifact is an animated SVG, not only a live D3 page.

## Portable SVG Strategy

1. Let D3 compute geometry, paths, scales, IDs, classes, and per-mark timing values.
2. Write SVG-native animation into the markup with inline CSS or SVG animation elements.
3. Verify by reopening the extracted SVG directly. It should animate without external JavaScript.

Keep standalone SVG animation separate from HTML gallery replay behavior. A gallery replay button may call a render function and rebuild one SVG, but an extracted SVG should still animate when opened without external JavaScript.

## Common Patterns

- **Staged reveal:** Use for discrete marks, matrices, waffle grids, choropleth tiles, and labels. Set per-mark delays and reveal labels after marks.
- **Drawn paths:** Use for trajectories, meshes, routes, bump charts, bundled links, and spiral timelines. After D3 appends paths, call `getTotalLength()` in the browser, store `stroke-dasharray` and `stroke-dashoffset`, then animate dash offset to zero.
- **Radial reveal:** Use for arcs, polar area charts, sunbursts, chords, circular bars, and radar outlines. Preserve final arc geometry in `d` attributes and reveal by opacity, dash draw, or compatible arc interpolation.
- **Motion tokens:** Use `animateMotion` on a small marker along a precomputed path when the story is about flow or handoff. Keep the path visible or explain it with labels.
- **Force-settle reveal:** Use for networks, beeswarms, Dorling cartograms, and collision layouts. Precompute initial and final node positions, then animate groups from meaningful starts to settled coordinates.
- **Hierarchy expansion:** Reveal parent containers first, then child marks, then cross-links and labels. This avoids unreadable early frames.
- **Tangled hierarchy reveal:** Draw ordinary parent-child structure first, then draw multiple-inheritance or matched-leaf links. Keep final cross-links visible enough to trace, but not so dominant that they hide node labels.
- **Density or field sweep:** Use clipping rectangles, opacity ramps, or threshold-by-threshold reveal for contours, hexbins, heatmaps, and choropleths. Do not morph unrelated contour paths without resampling.
- **Field reveal:** For vector fields and sampled scalar maps, reveal the grid first, then grow arrows or weighted marks by magnitude so the field structure appears before local detail.
- **Stippling reveal:** Reveal the underlying cells before the stipple dots, then grow dots by weight. This makes the sampled field understandable before the dense marks appear.
- **Baseline reveal:** Use for waterfall, diverging stacks, bullet charts, and interval views. Keep the final `x`, `y`, `width`, and baseline attributes correct, then animate from zero width, opacity, or a previous cumulative position.
- **Diagnostic reveal:** For Q-Q plots, moving averages, Bollinger bands, and threshold-colored lines, draw reference lines or bands first, then reveal observed samples or colored segments.
- **Text-weight reveal:** For word clouds and weighted labels, reveal opacity and scale together while preserving final font sizes and positions. Avoid rotating or moving text in ways that make words unreadable at rest.
- **Index/query reveal:** Use for quadtrees, Delaunay, Voronoi, and search overlays. Reveal structure first, then points, then query or nearest-neighbor annotations.
- **Selection reveal:** Use for lasso, brush, zoom lenses, and linked highlights. Draw the selection geometry first, then dim or brighten marks without changing their final positions.
- **Zoom focus reveal:** Draw the selected bounds, connector lines, and detail pane in order. Do not animate the original coordinate system unless the output remains live HTML.
- **Causal path reveal:** Use for event cascades, critical paths, and dependency DAGs. Draw faint context paths first, then animate the highlighted path or pulses in causal order.
- **State transition:** Use for temporal networks, rank playback, and evolving proximity. Preserve stable IDs and animate from the prior state to the final encoded state.
- **Projection tour:** For scatterplot tours or dimensional projections, animate `cx` and `cy` from the previous projection to the final projection and draw faint trails when point movement is the story.
- **Projection switch:** For map projection comparisons, animate projected coordinates or route strokes only after the graticule and clipping frame are visible. Avoid projection work that makes replay sluggish.
- **Cyclic geometry:** For polar clocks, moon phases, epicyclic paths, and astronomical views, animate arcs, phase masks, or traced paths in cycle order. The final frame should still read as a complete geometric state.
- **Path morphing:** Only morph paths with compatible point counts and semantics. If that is fragile, deliver live HTML with D3 interpolation instead of standalone SVG.
- **Annotation choreography:** Use rings, arrows, halos, or callout lines as separate overlay groups. Do not mutate the underlying data marks just to highlight them.

## Video Capture Motion

When D3 SVG scenes are captured into MP4, automated freeze detection can tempt agents to add unrelated ambient motion. Prefer semantic pixel change instead: extend a route token, reveal branch lanes, move a proof cursor, fill proportional marks, or complete radial/checklist marks. Do not repeat the same background sweep across unrelated scenes unless the sweep itself is a stable data object with the same role in every scene.

## CSS Skeleton

```css
.mark {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: mark-in var(--duration, 620ms) ease-out forwards;
  animation-delay: var(--delay, 0ms);
}

@keyframes mark-in {
  from { opacity: 0; transform: translateY(12px) scale(.8); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
  }
}
```

## Verification Checklist

- The first frame explains what is entering instead of showing random noise.
- The final frame is correct when animations finish.
- Reopening the extracted SVG from disk still animates.
- Text, markers, gradients, filters, and masks survive extraction.
- A screenshot taken after the animation delay shows a nonblank, settled visual.
- In galleries, replay restarts only the target card, repeated replay is idempotent, keyboard activation works through native buttons, and screenshot timing is deterministic.
