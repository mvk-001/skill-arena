# Flow And Path Choreography

- **Data shape:** Use source, target, value, path ID, and optional sequence fields. For chords, convert records to a labeled square matrix.
- **Animation pattern:** Draw paths with dash offsets, send motion tokens along routes with `animateMotion`, or reveal ribbons after endpoints appear.
- **Display guidance:** Use when individual paths, reciprocal flows, circular flows, or exact route choreography matter more than a static diagram.
- **D3 APIs:** `chord`, `ribbon`, `sankey` from d3-sankey when installed, `line`, `linkHorizontal`, `linkRadial`, path length methods in the browser.
- **Pitfalls:** Thick ribbons can obscure direction. Use arrows, gradients, or token motion only where they clarify flow.
