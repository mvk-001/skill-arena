# gws-calendar-agenda Copy Card

Use this when the repository benchmark needs the shortest possible offline path.

## Steps

1. Copy `assets/gws-calendar-agenda-copy-card.yaml` into the requested output file.
2. If the task requires file output, write it to `deliverables/compare.yaml`.
3. Validate with:
   `node skills/skill-arena-compare/scripts/validate-compare-output.js deliverables/compare.yaml --benchmark skill-arena-compare`
4. Final answer: return the YAML only.

## Final answer rule

- No headings.
- No bullets.
- No fences.
- No test notes.
- No next steps.
- Start with `schemaVersion: 1`.
