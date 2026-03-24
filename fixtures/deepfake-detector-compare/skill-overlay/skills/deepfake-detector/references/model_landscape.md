# Open-Source Deepfake Detection Model Landscape

This note summarizes practical open-source baselines and frameworks to support future upgrades from heuristic detection to model-based inference.

## Candidate Projects

1. `SCLBD/DeepfakeBench`
- Link: https://github.com/SCLBD/DeepfakeBench
- Why relevant: Unified benchmark with multiple detectors and datasets for reproducible deepfake detection research.
- Practical tradeoff: Strong for research and comparisons, heavier setup for day-to-day local triage.

2. `selimsef/dfdc_deepfake_challenge`
- Link: https://github.com/selimsef/dfdc_deepfake_challenge
- Why relevant: Popular PyTorch baseline from the Deepfake Detection Challenge ecosystem.
- Practical tradeoff: Video-centric workflow and model weights management overhead.

3. `ondyari/FaceForensics`
- Link: https://github.com/ondyari/FaceForensics
- Why relevant: Canonical dataset tooling used by many manipulated-face detection papers.
- Practical tradeoff: Dataset preparation complexity and storage needs.

4. `AaltoVision/DeepfakeEval`
- Link: https://github.com/AaltoVision/DeepfakeEval
- Why relevant: Evaluation framework for robustness across manipulations and domains.
- Practical tradeoff: Primarily evaluation-oriented, not a plug-and-play production detector.

## Upgrade Path Recommendation

- Keep the current local heuristic checker for fast first-pass triage.
- Add optional model backend (for example DeepfakeBench-compatible inference) behind a feature flag.
- Store model confidence separately from heuristic confidence to avoid mixing signals.
