# Focus And Context Interaction

- **Data shape:** Use stable IDs across linked views. Store selected, highlighted, and filtered states separately from raw data.
- **Animation pattern:** For live HTML, use brush or zoom events to update linked marks. For portable SVG, render a staged focus path, lens, lasso, callout, or clipped zoom-to-bounds panel.
- **Display guidance:** Use when the user needs to inspect dense data, drill into hierarchy, compare linked subsets, expand a selected region, or follow an annotated route through a complex view.
- **D3 APIs:** `brush`, `brushX`, `zoom`, `drag`, `dispatch`, scales with rescaled domains, clip paths.
- **Pitfalls:** Extracted SVG cannot preserve JavaScript interaction. Deliver HTML for actual interaction, or export a scripted walkthrough as animated SVG/video.
