---
name: d3-composition-evaluator
description: Evaluate D3 or SVG composition quality using dynamic symmetry, balance, reading path, label clearance, visible SVG previews, and stable composition IDs. Use when a user asks what is missing or wrong in a D3/SVG pattern, gallery card, composition sheet, or generated visual example.
---

# D3 Composition Evaluator

## Workflow

1. Identify the artifact, SVG selector, visible screenshot, and intended composition: balance, diagonal, proportional split, grid, radial, flow, or dense-label lanes.
   - If the user names an exact output file or path, write that exact path. Do not replace it with a conversational-only response.
   - In skill-only or isolated validation, treat the prompt as complete unless it names a local artifact to inspect. Do not search parent repositories, sibling skills, evaluation prompt folders, or gallery fixtures for extra context.
2. Render or inspect the actual SVG before judging it. Prefer a browser screenshot or SVG export when local tooling is available; do not evaluate only from source text when the request is visual.
3. Check the contract first: every evaluated pattern should have a visible nonblank SVG, `title` and `desc`, stable IDs, and enough attributes to connect the composition variant back to the source pattern.
4. Evaluate the composition with the rubric in `references/evaluation-rubric.md`. Treat data truth as a constraint: improve placement, grouping, guides, labels, and hierarchy without falsifying quantitative geometry.
5. For a composition-variant gallery, run `scripts/evaluate_composition_variants.py` when a base gallery is available. Use it to score both source-pattern closeness and target-composition fit from rendered SVGs.
6. Report concrete findings first. Reference exact selectors, IDs, files, or card names when available, then list the minimum fixes required.
7. When the pattern needs to be reimagined into a different composition instead of only critiqued, hand off to `$d3-composition-recomposer`.

## Output Shape

- Start with `Artifact: <exact ID, selector, or file>` so the report remains traceable when copied out of context.
- Follow with what is missing or wrong.
- Separate composition issues from implementation contract issues.
- Prefer one overall composition score. If you show component scores, make their weights, denominator, and arithmetic exactly reconcile with the reported total.
- Preserve the number and meaning of data entities and relationships. Never recommend adding, removing, or inventing a node, mark, link, category, or value merely to improve symmetry; adjust layout only when data geometry is not protected.
- Include validation commands or browser checks when the artifact lives in a runnable project.
- Avoid broad style advice unless it changes readability, data integrity, or composition strength.

## Progressive Disclosure

Read `references/evaluation-rubric.md` when the task involves scoring, comparing multiple variants, auditing dynamic-symmetry alignment, or deciding whether a variant is good enough to publish.

## Scripted Variant Evaluation

Use the gallery-level evaluator when the artifact has both composition variants and a base gallery. Resolve the evaluator from the loaded skill directory, pass both inputs explicitly, and do not discover or depend on fixtures from another skill. The example uses the isolated `skills/<name>/` layout:

```powershell
$Evaluator = "skills/d3-composition-evaluator/scripts/evaluate_composition_variants.py"
$CompositionHtml = "path/to/composition-sheets.html"
$BaseGallery = "path/to/base-gallery.html"
uv run --script $Evaluator $CompositionHtml --base-gallery $BaseGallery --output composition-evaluation.json --report composition-evaluation.md --screenshot-dir composition-evaluation-screenshots --expect-clean
```

The script opens both pages in Chromium, extracts rendered SVG mark profiles, and scores:

- source closeness: traceability to the base pattern, renderer continuity, mark profile similarity, palette overlap, source signature, title trace, and protected chart/map geometry, measured from the recomposed source content rather than composition-only cues.
- composition fit: visible, family-relevant component placement plus relationship alignment against the target armature. Use nodes and links for graphs, cells for grids, stations and connectors for flows, data marks for charts, rings/segments for radial views, and labels/leaders for dense-label lanes. Exclude guides, quadrant fields, source signatures, and composition-only overlays from the composition geometry.

Review the generated worst-score screenshots before changing thresholds or declaring the gallery clean.
