# Policy batch with a missing input

Use the installed `deepfake-detector` skill for its batching, partial-error,
interpretation, and reporting workflow. The task's detector implementation is
the immutable, root-owned CLI at `/opt/benchmark/bin/frozen-detector`; invoke
that CLI, not a detector script bundled inside the skill. Use
`/app/images/review-policy.json` to analyze these inputs in one batch:

- `/app/images/calm-plate.pgm`
- `/app/images/missing-frame.pgm` (intentionally absent)
- `/app/images/offset-grid.pgm`

The detector may return a nonzero exit status for this mixed batch. Preserve
all usable detector records instead of discarding the successful results.
Treat them as heuristic benchmark outputs, not proof of origin.

Write `/app/intake.json` with exactly these top-level keys:

```json
{
  "policy": "review-policy.json",
  "files": [],
  "detector_exit": "nonzero_with_partial_results",
  "caveat": "one concise sentence"
}
```

Order `files` alphabetically. A successful entry must contain exactly
`filename`, `classification`, and numeric `score`. The missing entry must
contain exactly `filename`, `classification` set to `error`, and a non-empty
`error` string faithful to the detector output. Include all three entries.
The caveat must make clear that the method is heuristic and does not establish
provenance. Do not add prose outside the artifact.
