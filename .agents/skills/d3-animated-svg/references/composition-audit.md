# Composition Audit

Use this reference when reviewing the compositional structure of an SVG pattern, especially after a user asks for dynamic symmetry, point verification, balance, or visual improvement beyond collision checks.

## Dynamic Symmetry Audit

Run `scripts/audit_dynamic_symmetry.py` against the current SVG or a selected SVG child object. The script opens the source in Chromium, extracts final rendered SVG points, and compares them with a dynamic-symmetry armature.

The measured armature includes:

- frame boundaries and center axes
- thirds, fifths, golden-section divisions, and root-2/root-3/root-5 divisions
- primary rectangle diagonals
- reciprocal and diagonal-parallel armature lines clipped to the composition frame
- intersections between the guide lines

The script extracts points from circles, ellipses, rectangles, lines, polylines, polygons, paths, text anchors, text bounds, image bounds, and fallback bounding boxes. It resolves transforms, CSS sizing, and `viewBox` scaling in the browser before scoring.

## Command

Audit a gallery SVG by ID:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/audit_dynamic_symmetry.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg/index.html --selector "svg#task-overlap-dense" --output projects/d3-animated-svg-validation/artifacts/data/task-overlap-dense-dynamic-symmetry.json
```

Audit a nested object using its own bounding box as the frame:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/audit_dynamic_symmetry.py scene.html --selector "g.current-object" --frame object
```

Use `--expect-min-score` or `--expect-min-line-rate` only when a pattern has a known target. Do not force all chart types to the same score; dense scatter, label-heavy, or stochastic-looking patterns can be visually correct with weaker armature alignment than diagrammatic patterns.

## Interpreting Results

- `dynamicSymmetryScore`: a weighted 0-100 score from guide alignment, node alignment, and point-balance. Treat it as a critique signal, not as an absolute quality grade.
- `lineAlignmentRate`: share of extracted points within tolerance of a dynamic guide.
- `nodeAlignmentRate`: share of extracted points close to guide intersections.
- `centerRoles`: focused score for centers and text anchors. Improve these before moving secondary corners or decorative marks.
- `terminalRoles`: focused score for line/path endpoints. Useful for leader lines, arrows, routes, and connector-heavy diagrams.
- `farthestPoints`: points farthest from any guide; inspect these first when a pattern feels arbitrary.
- `outsideFramePointCount`: should usually be zero for published SVGs unless overflow is intentional.

## Improvement Loop

1. Run the audit on the current SVG or selected object.
2. Inspect `centerRoles`, `terminalRoles`, `guideHits`, and `farthestPoints`.
3. Move primary centers, major line endpoints, label columns, or dominant containers toward nearby named guides.
4. Keep semantic data truth first. Do not distort quantitative geometry just to raise a score.
5. Rerun collision, text-fit, gallery, or screenshot checks after geometric changes.

For dense patterns, improve the most structural anchors rather than every small point. A handful of strongly aligned centers or terminals can improve visual order without making the output look mechanically gridded.

## Composition Variant Sheets

Use `assets/examples/d3-animated-svg/composition-sheets.html` when a user wants pages or sheets organized by composition type instead of visualization type. The sheet generator reviews every current source pattern from `window.D3_ANIMATED_SVG_EXAMPLES`, assigns only the useful target compositions for that pattern, and renders optimized variants whose source-derived marks carry the composition. Each sheet is a curated set of good SVG variants, not a repeated copy of the full D3 gallery. Only add a source pattern to a sheet when the pattern can express that composition clearly.

Composition membership is a narrative decision before it is a geometry decision. Reject a target when it only proves that marks can be arranged on a guide. Keep the source pattern reviewed and record a rejection reason when no armature makes the data story clearer without distorting protected geometry.

Current sheet IDs:

- `symmetry`: center axes, mirrored weight, and quadrant balance.
- `diagonal`: major diagonal, minor diagonal, and reciprocal diagonal motion.
- `golden-root`: golden section plus root-2/root-3/root-5 divisions.
- `modular-grid`: modular thirds/fifths rows and columns.
- `radial`: center, rings, spokes, and rotational balance.
- `flow`: source, transform, checkpoint, and output roles.
- `label-lanes`: external lanes, clearance bands, and leader underpasses.

Each variant must expose a stable composition-specific ID:

```text
d3-composition-<composition-id>-<source-example-id>
```

Examples:

- `d3-composition-symmetry-force-network`
- `d3-composition-diagonal-force-network`
- `d3-composition-radial-force-network`

Each rendered card must include an inline SVG preview and expose:

- `data-composition-id`: the active sheet ID.
- `data-example-id`: the gallery source example ID.
- `data-pattern-id`: the stable `d3-*` ID.
- `data-composition-pattern-id`: the stable composition-specific variant ID.
- `data-source-family`: the source gallery family or inferred family.
- `data-armature-lines`: the lines used to optimize the target composition.
- `data-quadrants`: the quadrant roles used by the optimized variant.
- `data-reviewed`: `true` after the pattern has been reviewed.
- preview SVG `data-narrative-fit`: the visible reason the target composition helps the source story.

Each inline SVG preview must include a `.source-pattern-recomposition` group that preserves or faithfully recreates the rendered base marks, and a `.base-signature` metadata group that identifies the source pattern used for the recomposition without adding visible decoration. Keep armature diagrams in the sheet overview or hidden metadata. The card preview should not show `.composition-line` guides, `.quadrant-field` overlays, visible source-field borders, visible signature boxes, or direction cues that are not data marks, route paths, flow links, label leaders, or another narrative element. The composition must be carried by the recomposed source marks themselves; source-clone fallback and `.source-adaptation-cues` overlays are critique failures.

Do not use `data-fit`, fit badges, or `strong` / `support` tiers. The sheet membership itself means the variant is good enough for that composition.

When adding a variant:

1. Preserve the source pattern's data semantics.
2. Start from the rendered source SVG geometry or a faithful extraction of its marks, then recompose the preview toward the sheet armature: center balance, diagonal movement, golden/root split, modular grid, radial rings, process spine, or label lanes.
3. For geospatial diagonal variants, preserve relative spacing between places and use diagonal height/direction to express route, reach, or distance; do not equalize airports or regions into generic stations.
4. Render a nonblank SVG preview on the card so the composition can be visually inspected without opening the base gallery.
5. Keep the base pattern link so the original `d3-*` ID remains discoverable.
6. Search by the composition ID, source pattern ID, title, or role should reveal the card.

Validate the sheets after adding, removing, or renaming D3 patterns:

```powershell
uv run --script .agents/skills/d3-animated-svg/scripts/verify_composition_sheets.py .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg/composition-sheets.html --min-variants 70 --expected-reviewed-patterns 224 --required-variant d3-composition-radial-force-network --expect-clean
```
