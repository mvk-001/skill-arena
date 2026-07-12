# Self-Contained Output

Read this when the user asks for a standalone, portable, offline, or self-contained D3/SVG artifact.

## Contract

- Deliver one HTML or SVG file that opens without network access.
- Do not use CDN scripts, remote fonts, remote CSS, remote images, or external runtime imports in the final artifact.
- If D3 is useful for layout, use it during authoring or in a local generator, then inline the computed SVG geometry and SVG-native animation in the final file.
- Prefer CSS keyframes, SVG `<animate>`, `<animateTransform>`, or SMIL for portable animation.
- Include `<title>` and `<desc>` inside the SVG, a stable `viewBox`, explicit text `font-family`, deterministic data, and final-state geometry.
- Encode a visible final state in attributes or reduced-motion CSS. If any mark starts with `opacity: 0`, a reduced-motion fallback that disables animation must restore `opacity: 1` or otherwise keep the mark visible.

## Workflow

1. Decide the visual structure and deterministic data first.
2. Compute geometry with D3 only if it saves meaningful work. If the final deliverable must be self-contained, do not leave D3 as a browser runtime dependency.
3. Start from `assets/templates/self-contained-animated-svg.html` when the request is a compact explanatory SVG or process visual.
4. Replace the template data groups, text, paths, and timing with task-specific marks.
5. Keep motion lanes separate from label and body text. For process visuals, place moving packets on a dedicated rail below or between cards, with at least 18 px clearance from text blocks and card borders. Do not animate tokens, arrows, or masks over readable text.
6. Use explicit text lines instead of long wrapping strings inside compact cards. Keep each body line within the card width and leave enough bottom padding for descenders.
7. Test reduced-motion rendering before delivery. Browser validation may run with reduced motion enabled, so disabling animation must not leave the SVG in an invisible initial state.
8. Before invoking the checker, inspect the completed markup once and confirm that the root SVG already contains a nonempty direct `<title>`, a nonempty direct `<desc>`, a stable `viewBox`, explicit text font families, visible final-state marks, and no remote URLs. Do not use the checker as an iterative linter for requirements already listed in this file.
9. Validate the final file:

```powershell
uv run --script skills/d3-animated-svg/scripts/check_self_contained_html.py artifact.html
```

Use the repo-relative path to the same script when working inside this repository:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/check_self_contained_html.py artifact.html
```

When the checker passes, treat that as the network-dependency and required-SVG contract gate. Do not add `rg`, `grep`, `Select-String`, or similar negative probes for strings that should be absent: a correct no-match result commonly exits with code 1 and becomes a tool error in strict evaluation traces.

## Common Pitfalls

- Do not write `<script src="https://...d3...">` for a self-contained deliverable.
- Do not use Google Fonts or remote icon fonts. Use the requested font family as a CSS fallback stack.
- Do not create an empty `<svg>` that is populated only after JavaScript loads.
- Do not combine `opacity: 0` starting states with `@media (prefers-reduced-motion: reduce) { animation: none; }` unless the same reduced-motion block sets the affected marks back to visible.
- Do not depend on local files outside the artifact unless the user asked for a folder deliverable.
