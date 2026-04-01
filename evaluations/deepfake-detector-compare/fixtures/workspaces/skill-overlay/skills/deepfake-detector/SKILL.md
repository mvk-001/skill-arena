---
name: deepfake-detector
description: Detect likely synthetic or manipulated images using local forensic heuristics and confidence scoring; use when users need local image authenticity triage.
triggers:
  - deepfake
  - synthetic image detection
  - manipulated photo check
when_to_use:
  - User asks whether an image may be AI-generated or edited.
  - Offline/local analysis is required.
when_not_to_use:
  - User needs legal-grade attribution or definitive provenance.
  - Primary evidence is video/audio behavior, not still images.
degrees_of_freedom: MEDIUM
---

# Deepfake Detector

## Level 1 - Fast Single Image Check

Use the default profile for quick triage:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path>`

This level is intentionally minimal: one command, default thresholds, and heuristic output.

## Level 2 - Operational Triage (JSON, Batch, Thresholds)

Run batch + JSON output:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <img1> --input <img2> --json --output results.json`

Use policy config from `assets/configs/`:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path> --policy skills/deepfake-detector/assets/configs/strict-policy.json`

Override thresholds directly when needed:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path> --threshold-uncertain 0.30 --threshold-likely-synthetic 0.55`

Interpretation bands (default policy):
- `score >= 0.60`: likely synthetic/manipulated
- `0.35 <= score < 0.60`: uncertain
- `score < 0.35`: likely authentic

Detailed interpretation and escalation guidance:
- `references/interpretation-guide.md`

## Level 3 - Expert Tuning and Research Context

Adjust heuristic weights for specialized queues:

`python3 skills/deepfake-detector/scripts/detect_image.py --input <image-path> --weight no_exif=1.2 --weight periodic_residual=1.4`

Generate and evaluate demo dataset:

`python3 skills/deepfake-detector/scripts/run_demo.py`

Prominent limitations and forensic caveats:
- `references/limitations.md`

Additional research context:
- `references/research_papers.md`
- `references/model_landscape.md`

## Skill Structure

- `scripts/detect_image.py`: heuristic detector CLI with policy/threshold/weight controls
- `scripts/run_demo.py`: demo dataset + execution
- `assets/configs/`: sample threshold/policy configs
- `assets/demo/`: generated demo inputs and outputs
- `assets/sample-authentic-image.png`: quick sample authentic-like image
- `assets/sample-synthetic-image.png`: quick sample synthetic-like image
- `references/interpretation-guide.md`: score bands and operating guidance
- `references/limitations.md`: limitations and cautions
