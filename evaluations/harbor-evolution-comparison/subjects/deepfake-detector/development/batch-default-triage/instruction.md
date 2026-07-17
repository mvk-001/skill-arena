# Default batch triage

Use the installed `deepfake-detector` skill for its batching, interpretation,
and reporting workflow. The task's detector implementation is the immutable,
root-owned CLI at `/opt/benchmark/bin/frozen-detector`; invoke that CLI, not a
detector script bundled inside the skill. Analyze every image in `/app/images`
with the default policy and treat its output as frozen benchmark behavior, not
as scientific ground truth.

Write `/app/triage.json` as JSON only, with exactly this shape:

```json
{
  "policy": "default",
  "files": [
    {
      "filename": "image-name.pgm",
      "classification": "likely_authentic|uncertain|likely_synthetic",
      "score": 0.0
    }
  ],
  "most_suspicious": "image-name.pgm",
  "method": "heuristic-only",
  "provenance_proof": false
}
```

Requirements:

- Include exactly the three `.pgm` files and order `files` alphabetically by
  filename.
- Preserve each detector classification and four-decimal score as JSON
  numbers.
- Set `most_suspicious` to the highest-score filename; break a tie
  alphabetically.
- Do not add keys or prose outside the JSON artifact.
