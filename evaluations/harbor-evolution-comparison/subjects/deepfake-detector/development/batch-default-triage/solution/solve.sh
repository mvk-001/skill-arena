#!/usr/bin/env bash
set -euo pipefail

cat > /app/triage.json <<'JSON'
{
  "policy": "default",
  "files": [
    {
      "filename": "control-flat.pgm",
      "classification": "likely_authentic",
      "score": 0.3
    },
    {
      "filename": "grid-alert.pgm",
      "classification": "likely_synthetic",
      "score": 0.745
    },
    {
      "filename": "split-vertical.pgm",
      "classification": "likely_authentic",
      "score": 0.305
    }
  ],
  "most_suspicious": "grid-alert.pgm",
  "method": "heuristic-only",
  "provenance_proof": false
}
JSON
