# Deepfake Detector Demo Results

Known synthetic inputs:
- synthetic_gradient.png (procedurally generated)
- synthetic_checker.png (procedurally generated)
- synthetic_upscaled.png (nearest-neighbor upscaling + sharpening)

Control input:
- camera_like_control.jpg (includes minimal EXIF)

## Detector Output
- `camera_like_control.jpg` -> score=0.0, class=likely_authentic
- `synthetic_gradient.png` -> score=0.4536, class=uncertain
- `synthetic_checker.png` -> score=0.36, class=uncertain
- `synthetic_upscaled.png` -> score=0.4127, class=uncertain
