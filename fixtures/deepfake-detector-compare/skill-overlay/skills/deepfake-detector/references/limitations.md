# Confidence Scoring and Limitations

## Confidence Scoring

The detector outputs a `score` in `[0, 1]` based on weighted forensic markers:

- Missing EXIF metadata
- Elevated edge energy and sharpening artifacts
- Periodic residual texture patterns
- JPEG-like block boundary artifacts
- Abnormally high RGB channel correlations
- Overly smooth texture distribution

Interpretation thresholds:

- `>= 0.60`: likely synthetic/manipulated
- `0.35 - 0.59`: uncertain, requires additional verification
- `< 0.35`: likely authentic

## Key Limitations

- Heuristic-only method: no learned classifier or dataset calibration.
- False positives possible for heavily compressed or edited authentic images.
- False negatives possible for high-quality deepfakes with post-processing.
- Image-only workflow: does not analyze video temporal cues or audio-lip sync.
- Metadata checks are weak evidence; EXIF can be removed or forged.

## Operational Guidance

- Use this as a screening layer, not definitive attribution.
- Combine with provenance checks (source, upload history, reverse image search).
- Escalate high-risk cases to model-based and human-led review.
