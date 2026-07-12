# Temporal Playback

- **Data shape:** Use ordered time steps with stable entity IDs. Normalize missing values before animation so entities do not flicker or teleport unexpectedly.
- **Animation pattern:** Interpolate along time with a scrubber, staged keyframes, SVG-native reveal, stacked-to-grouped bar transition, or projection-to-projection point movement. For rank, bump, moving-average, Bollinger, Marey, difference, or tour charts, keep stable entity colors and labels.
- **Display guidance:** Use for continuous change, rank movement, composition over time, schedule movement, smoothed trend, over/under comparison, or repeated snapshots where motion is the comparison mechanism.
- **D3 APIs:** `scaleTime`, `scaleUtc`, `line`, `area`, `stack`, `interpolate`, `easeCubic`, `bisector`, paired scale mappings.
- **Pitfalls:** Too many moving labels become unreadable. Limit tracked entities, fade background series, and verify final positions after animation completes.
