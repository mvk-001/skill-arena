# Holdout color-image review queue

Use the installed `deepfake-detector` skill for its batch, policy,
interpretation, and reporting workflow. The task's detector implementation is
the immutable, root-owned CLI at `/opt/benchmark/bin/frozen-detector`; invoke
that CLI, not a detector script bundled inside the skill. Analyze the three
`.ppm` images in `/app/images` as one batch under
`/app/images/holdout-policy.json`.

Write `/app/assessment.json` with exactly this shape:

```json
{
  "policy": "holdout-policy.json",
  "records": [
    {
      "filename": "image-name.ppm",
      "classification": "likely_authentic|uncertain|likely_synthetic",
      "score": 0.0,
      "signals": {
        "edge_energy": 0.0,
        "periodic_residual_ratio": 0.0
      }
    }
  ],
  "review_order": ["highest-score-first.ppm"],
  "counts": {
    "likely_authentic": 0,
    "uncertain": 0,
    "likely_synthetic": 0
  },
  "interpretation": {
    "method": "heuristic-only",
    "provenance_proof": false
  }
}
```

Requirements:

- Order `records` alphabetically and preserve the detector's classifications,
  numeric scores, and the two selected numeric signal values.
- Include every filename exactly once in `review_order`, descending by score with
  alphabetical tie-breaking.
- Count the three classifications exactly in `counts`.
- Preserve the exact `interpretation` values shown above.
- Treat the detector output only as frozen benchmark behavior; make no claim
  about the real origin of these fixtures.
- Do not add keys or prose outside the JSON artifact.
