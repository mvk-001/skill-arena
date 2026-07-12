# Maintenance Validation

Read this file before changing this skill, its pattern references, scripts, examples, gallery, or composition sheets.

## Pattern Promotion

When a gallery card or standalone SVG pattern proves reusable during skill maintenance, update the owning reference before finishing.

Capture:

- stable `d3-*` ID
- trigger context
- data contract
- geometry contract
- animation contract
- semantic color roles
- validation hooks
- isolated-workspace caveats

For patterns expected to work in isolated skill-only workspaces, include a minimal standalone implementation recipe that does not depend on reading the gallery source.

## Baseline Validation

After changing this skill, references, scripts, or examples, run:

```powershell
uv run --script scripts/validate-skills.py
```

When changing the capture script or example fixture, also run the relevant smoke command from `references/command-reference.md` and inspect the generated screenshot.

## Gallery Changes

When changing the examples gallery, read `references/gallery-patterns.md` and run the gallery verifier documented there.

Verify that:

- all cards render
- each card has exactly one replay control
- release replay checks restart every target card in isolation; sampled replay remains acceptable for a fast smoke check
- repeated replay does not duplicate marks or listeners
- desktop and mobile screenshots keep text and controls readable

For large galleries, create contact sheets and run an explicit visual critique pass by example or batch before final validation. Integrate the critique centrally when possible: shared token ramps, label halos, axis/grid contrast, and replay-safe post-render polish should handle recurring issues before adding one-off chart fixes.

Generate the full settled-frame review with `scripts/review_gallery_visuals.py` for desktop and mobile viewports. Keep its cards, contact sheets, JSON, and Markdown reports under `projects/<project-id>/artifacts/`; do not commit generated review media.

Before release, validate reference and index coverage with `uv run --script .agents/skills/d3-animated-svg/scripts/extract_gallery_pattern_references.py --check-only --expected 224`.

## Composition Sheet Changes

When changing the composition sheets, run `scripts/verify_composition_sheets.py`.

Confirm that:

- every current gallery pattern is reviewed
- every curated variant has an inline SVG preview plus stable `data-composition-id`, `data-example-id`, `data-pattern-id`, `data-composition-pattern-id`, `data-armature-lines`, `data-quadrants`, and `data-reviewed` attributes
- each SVG includes a semantic `.source-pattern-recomposition` group plus a metadata-only source-pattern signature
- each card exposes one replay control and animates visible source-derived marks inside the SVG on load and replay without duplicating nodes or rebuilding unrelated cards
- visible composition guide lines, quadrant overlays, source-field borders, signature boxes, or direction cues are absent unless they are source-derived marks, route paths, process links, label leaders, or another narrative element

Keep only variants that work well for the selected composition. Do not restore fit classes such as `support` tiers or duplicate every pattern into every sheet.
