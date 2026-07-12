# Distribution And Density

- **Data shape:** Use one row per observation with stable IDs, numeric values, and grouping fields. For contours or hexbins, keep x/y domains fixed across states.
- **Animation pattern:** Animate individual marks into beeswarm or jittered positions, reveal density bands by threshold, draw Q-Q reference lines before samples, or transition group distributions with stable scales.
- **Display guidance:** Use when the shape of data, outliers, overlap, pairwise relationships, or individual observations are more important than aggregates.
- **D3 APIs:** `scaleLinear`, `scalePoint`, `forceSimulation`, `forceCollide`, `contourDensity`, `bin`, `rollup`, `area`, `line`, panel scales for scatterplot matrices.
- **Pitfalls:** Random jitter hides exact values unless seeded. Density charts can imply precision that is not in the data; show sample size or raw points when useful.
