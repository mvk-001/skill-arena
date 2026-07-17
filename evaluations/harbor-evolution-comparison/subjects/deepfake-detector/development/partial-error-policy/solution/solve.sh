#!/usr/bin/env bash
set -euo pipefail

cat > /app/intake.json <<'JSON'
{
  "policy": "review-policy.json",
  "files": [
    {
      "filename": "calm-plate.pgm",
      "classification": "uncertain",
      "score": 0.3
    },
    {
      "filename": "missing-frame.pgm",
      "classification": "error",
      "error": "input file does not exist or is not a regular file"
    },
    {
      "filename": "offset-grid.pgm",
      "classification": "likely_synthetic",
      "score": 0.745
    }
  ],
  "detector_exit": "nonzero_with_partial_results",
  "caveat": "This heuristic result does not establish image provenance."
}
JSON
