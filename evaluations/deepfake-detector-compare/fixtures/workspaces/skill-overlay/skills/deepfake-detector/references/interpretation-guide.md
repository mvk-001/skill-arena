# Deepfake Detector Interpretation Guide

## Purpose

This detector is a local heuristic screening tool. It estimates manipulation likelihood from forensic markers, but it does not provide definitive provenance.

## Default Score Bands

- `score >= 0.60`: likely synthetic/manipulated
- `0.35 <= score < 0.60`: uncertain
- `score < 0.35`: likely authentic

These cutoffs are triage defaults, not universal truth. Different image domains may require different operating points.

## How to Tune Thresholds

- Raise `likely_synthetic` (for example `0.70`) to reduce false positives.
- Lower `likely_synthetic` (for example `0.50`) to increase recall in high-risk intake queues.
- Keep ordering valid: `0.0 <= uncertain <= likely_synthetic <= 1.0`.

Example:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path> --threshold-uncertain 0.30 --threshold-likely-synthetic 0.55`

## How to Tune Weights

Supported weight keys:
- `no_exif`
- `channel_correlation`
- `edge_energy`
- `blockiness`
- `periodic_residual`
- `smooth_metadata_free`

Example:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path> --weight periodic_residual=1.3 --weight blockiness=1.2`

Use weight tuning sparingly and document profile rationale for reproducibility.

## Recommended Escalation

- `likely_synthetic`: trigger secondary review (model-based detector + provenance checks).
- `uncertain`: request additional evidence (source history, original capture metadata, reverse image search).
- `likely_authentic`: keep low confidence if context is high risk or adversarial.

## Important Caveat

A low score is not proof of authenticity, and a high score is not legal proof of manipulation.
