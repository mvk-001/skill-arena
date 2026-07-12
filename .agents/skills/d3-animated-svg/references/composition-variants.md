# D3 Composition Variants

Use this reference when maintaining `assets/examples/d3-animated-svg/composition-sheets.html` and `composition-sheets.js`.

## Purpose

Composition variants are visual-first examples that show how an existing D3 pattern can be recomposed for a specific armature. They are not a classification of the strongest current gallery examples. The sheet generator must review every current `window.D3_ANIMATED_SVG_EXAMPLES` record, infer useful target compositions for that source pattern, and keep only the targets that can visibly express the composition. A source pattern may appear in several composition sheets when it has distinct useful versions, such as:

- `d3-composition-symmetry-force-network`
- `d3-composition-diagonal-force-network`
- `d3-composition-radial-force-network`

Target selection must pass a narrative-fit gate before a geometry-fit gate. Do not publish a variant merely because the marks can be moved onto balance axes, a diagonal, a grid, or a ring. Publish it only when the composition clarifies the source story: comparison, route/change, dominant artifact plus context, modular repetition, real center/cycle, source-to-output handoff, or dense-label readability. If no target passes, keep the source pattern reviewed and record a `rejectedReason` instead of forcing a weak card.

## Variant Record

Each generated record in `composition-sheets.js` uses:

- `compositionId`: one of the published sheet IDs.
- `sourceId`: the source example ID from `window.D3_ANIMATED_SVG_EXAMPLES`.
- `kind`: renderer family for the preview SVG, such as `network`, `flow`, `matrix`, `radial`, `hierarchy`, `scatter`, `lanes`, `table`, or `bar`.
- `renderer`: the concrete preview renderer selected for the target composition.
- `sourceFamily`: the source gallery family or inferred pattern family.
- `inferredKind`: the source pattern kind inferred during review.
- `variantTitle`: short visible role for the variant.
- `recipe`: one-sentence recomposition instruction.
- `armatureLines`: the composition lines used by the target.
- `quadrants`: how the target composition uses Q1-Q4 or equivalent fields.
- `reason`: visible narrative-fit rationale for why this source belongs in that composition.
- `reviewed`: `true` after the source pattern has passed the per-pattern review.
- `rejectedReason`: for reviewed source patterns with no publishable target.
- `id`: generated as `d3-composition-${compositionId}-${sourceId}`.

Each card renders an inline SVG preview and exposes:

- `data-composition-id`
- `data-example-id`
- `data-pattern-id`
- `data-composition-pattern-id`
- `data-source-family`
- `data-armature-lines`
- `data-quadrants`
- `data-reviewed`
- preview SVG `data-narrative-fit`

Each preview SVG must expose the same composition/source attributes, a `.source-pattern-recomposition` group that preserves or faithfully recreates the rendered base marks, and a `.base-signature` metadata group that ties the optimized variant back to the original source pattern without adding visible decoration. Keep composition armature diagrams in the sheet overview or metadata, not inside each card preview. Published cards must use a semantic recomposition mode such as `semantic-network-*`, `semantic-flow-*`, or `semantic-grid-*`; source-clone fallback, `.source-adaptation-cues` overlays, visible `.composition-line` guides, `.quadrant-field` overlays, visible source-field borders, and visible signature boxes are not publishable examples.

Each published card must also include one compact replay button scoped to that card. Mark visible source-derived SVG elements inside `.source-pattern-recomposition` with replay metadata, animate those elements on load and on click, and keep final geometry encoded in normal SVG attributes so the settled frame remains a valid composition preview. Replay controls must not add artificial direction lines, guide overlays, or duplicated marks.

Do not use fit tiers or fit badges. Keep only variants that are useful for the selected composition.

## Maintenance Rules

1. Review every current source pattern before publishing the sheets.
2. Add a target only when the source pattern can visibly express the target armature and the armature improves the narrative. For example, an airport or route pattern can use diagonal direction only if relative place spacing remains meaningful; do not turn spatial locations into equal-distance stations unless the data says they are equal.
3. Preserve the source pattern's semantic meaning by faithfully recreating the rendered base SVG marks. When a target composition requires it, re-layout those marks, links, labels, and groups instead of only rotating, scaling, or placing composition indicators over the original SVG.
4. Keep the preview SVG nonblank and specific enough to evaluate the composition without opening the base gallery. Do not draw borders, guide lines, or direction cues unless they are source-derived marks, label leaders, route paths, process links, or another narrative element.
5. Keep the base pattern link intact so the source `d3-*` ID remains reachable.
6. Order published variants by curated visual diversity, not source ID. The first visible row of each sheet should mix renderer families or narrative structures when possible, such as route plus flow plus chart for diagonal, or treemap plus probability plus hierarchy for golden/root.
7. Validate after changes:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/verify_composition_sheets.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg/composition-sheets.html --min-variants 70 --expected-reviewed-patterns 224 --required-variant d3-composition-radial-force-network --expect-clean
```
