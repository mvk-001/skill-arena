#!/usr/bin/env bash
set -euo pipefail

cat > /app/assessment.json <<'JSON'
{
  "policy": "holdout-policy.json",
  "records": [
    {
      "filename": "chromatic-checker.ppm",
      "classification": "likely_synthetic",
      "score": 0.712,
      "signals": {
        "edge_energy": 59.43,
        "periodic_residual_ratio": 59429999992.5712
      }
    },
    {
      "filename": "color-flat.ppm",
      "classification": "likely_authentic",
      "score": 0.216,
      "signals": {
        "edge_energy": 0.0,
        "periodic_residual_ratio": 0.0
      }
    },
    {
      "filename": "luma-ramp.ppm",
      "classification": "likely_authentic",
      "score": 0.2065,
      "signals": {
        "edge_energy": 15.0,
        "periodic_residual_ratio": 0.375
      }
    }
  ],
  "review_order": [
    "chromatic-checker.ppm",
    "color-flat.ppm",
    "luma-ramp.ppm"
  ],
  "counts": {
    "likely_authentic": 2,
    "uncertain": 0,
    "likely_synthetic": 1
  },
  "interpretation": {
    "method": "heuristic-only",
    "provenance_proof": false
  }
}
JSON
