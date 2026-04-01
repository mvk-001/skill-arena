#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13"
# dependencies = ["pillow"]
# ///

from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def _save_with_minimal_exif(path: Path, image: Image.Image) -> None:
    exif = Image.Exif()
    exif[271] = "DemoCam"
    exif[272] = "Model-1"
    exif[306] = "2026:02:09 12:00:00"
    image.save(path, exif=exif)


def _create_camera_like_image(path: Path) -> None:
    width, height = 640, 480
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    rng = random.Random(7)

    for y in range(height):
        for x in range(width):
            r = int(95 + 95 * (x / width) + rng.uniform(-10, 10))
            g = int(90 + 85 * (y / height) + rng.uniform(-9, 9))
            b = int(80 + 70 * (1.0 - x / width) + rng.uniform(-9, 9))
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))

    draw = ImageDraw.Draw(image)
    draw.rectangle((120, 90, 520, 390), outline=(230, 230, 230), width=2)
    draw.text((150, 210), "Street scene test", fill=(245, 245, 245))
    image = image.filter(ImageFilter.GaussianBlur(radius=0.4))
    _save_with_minimal_exif(path, image)


def _create_synthetic_gradient(path: Path) -> None:
    width, height = 768, 768
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    rng = random.Random(3)
    tile = [[rng.randint(-30, 30) for _ in range(8)] for _ in range(8)]

    for y in range(height):
        for x in range(width):
            base = int(130 + 70 * (x / width) + 55 * (y / height))
            periodic = tile[y % 8][x % 8]
            texture = int(10 * math_sin((x + y) / 32.0))
            r = base + periodic + texture
            g = base + periodic
            b = base + periodic - texture
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))

    image.save(path)


def _create_synthetic_checker(path: Path) -> None:
    width, height = 768, 768
    image = Image.new("RGB", (width, height))
    pixels = image.load()

    for y in range(height):
        for x in range(width):
            pattern = 1 if ((x // 6 + y // 6) % 2 == 0) else 0
            blur = int((math_sin(x / 9.0) + math_cos(y / 11.0)) * 25)
            r = 50 + 180 * pattern + blur
            g = 200 - 150 * pattern - blur
            b = int(120 + 90 * math_sin((x + y) / 8.0))
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))

    image = image.filter(ImageFilter.UnsharpMask(radius=1.8, percent=180, threshold=2))
    image.save(path)


def _create_synthetic_upscaled(path: Path) -> None:
    small = Image.new("RGB", (96, 96))
    small_pixels = small.load()
    rng = random.Random(11)

    for y in range(96):
        for x in range(96):
            base = rng.randint(10, 245)
            small_pixels[x, y] = (base, (base + 30) % 256, (base + 65) % 256)

    image = small.resize((768, 768), resample=Image.Resampling.NEAREST)
    image = image.filter(ImageFilter.UnsharpMask(radius=2.1, percent=220, threshold=1))
    image.save(path)


def math_sin(value: float) -> float:
    from math import sin

    return sin(value)


def math_cos(value: float) -> float:
    from math import cos

    return cos(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate known synthetic test images and run detector")
    parser.add_argument("--output-dir", type=Path, default=Path("skills/deepfake-detector/assets/demo"))
    args = parser.parse_args()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs_dir = output_dir / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    camera_like = inputs_dir / "camera_like_control.jpg"
    synthetic_1 = inputs_dir / "synthetic_gradient.png"
    synthetic_2 = inputs_dir / "synthetic_checker.png"
    synthetic_3 = inputs_dir / "synthetic_upscaled.png"

    _create_camera_like_image(camera_like)
    _create_synthetic_gradient(synthetic_1)
    _create_synthetic_checker(synthetic_2)
    _create_synthetic_upscaled(synthetic_3)

    detector_script = Path("skills/deepfake-detector/scripts/detect_image.py")
    results_path = output_dir / "results.json"

    cmd = [
        sys.executable,
        str(detector_script),
        "--input",
        str(camera_like),
        "--input",
        str(synthetic_1),
        "--input",
        str(synthetic_2),
        "--input",
        str(synthetic_3),
        "--output",
        str(results_path),
        "--json",
    ]

    completed = subprocess.run(cmd, capture_output=True, text=True, check=True)
    results = json.loads(completed.stdout)

    summary_path = output_dir / "summary.md"
    lines = [
        "# Deepfake Detector Demo Results",
        "",
        "Known synthetic inputs:",
        "- synthetic_gradient.png (procedurally generated)",
        "- synthetic_checker.png (procedurally generated)",
        "- synthetic_upscaled.png (nearest-neighbor upscaling + sharpening)",
        "",
        "Control input:",
        "- camera_like_control.jpg (includes minimal EXIF)",
        "",
        "## Detector Output",
    ]

    for item in results:
        lines.append(f"- `{Path(item['image']).name}` -> score={item['score']}, class={item['classification']}")

    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Demo artifacts written to {output_dir}")
    print(f"Results JSON: {results_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
