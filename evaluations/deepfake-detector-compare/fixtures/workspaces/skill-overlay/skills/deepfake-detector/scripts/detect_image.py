#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13"
# dependencies = ["pillow"]
# ///

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image
from PIL.Image import DecompressionBombError

MAX_IMAGE_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

DEFAULT_MAX_PIXELS = 1_048_576
DEFAULT_THRESHOLDS = {
    "likely_synthetic": 0.60,
    "uncertain": 0.35,
}
DEFAULT_WEIGHTS = {
    "no_exif": 1.0,
    "channel_correlation": 1.0,
    "edge_energy": 1.0,
    "blockiness": 1.0,
    "periodic_residual": 1.0,
    "smooth_metadata_free": 1.0,
}
ALLOWED_WEIGHT_KEYS = tuple(DEFAULT_WEIGHTS.keys())


@dataclass
class DetectorConfig:
    likely_synthetic_threshold: float
    uncertain_threshold: float
    max_pixels: int
    weights: dict[str, float]


@dataclass
class AnalysisResult:
    image: str
    score: float
    classification: str
    markers: dict[str, float | bool]
    notes: list[str]


def _validate_thresholds(likely_synthetic: float, uncertain: float) -> None:
    if not (0.0 <= uncertain <= likely_synthetic <= 1.0):
        raise ValueError(
            "thresholds must satisfy 0.0 <= uncertain <= likely_synthetic <= 1.0"
        )


def _validate_weights(weights: dict[str, float]) -> None:
    for key in weights:
        if key not in DEFAULT_WEIGHTS:
            raise ValueError(f"unsupported weight key: {key}")
        if weights[key] < 0.0:
            raise ValueError(f"weight must be >= 0.0: {key}")


def _load_policy(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise ValueError(f"policy file does not exist: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in policy file: {path}") from exc
    if not isinstance(payload, dict):
        raise ValueError("policy JSON must be an object")
    return payload


def _parse_weight_overrides(entries: list[str] | None) -> dict[str, float]:
    if not entries:
        return {}
    overrides: dict[str, float] = {}
    for entry in entries:
        if "=" not in entry:
            raise ValueError(
                f"invalid --weight format '{entry}'. Expected key=value with key in {', '.join(ALLOWED_WEIGHT_KEYS)}"
            )
        key, raw_value = entry.split("=", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if key not in DEFAULT_WEIGHTS:
            raise ValueError(
                f"unsupported weight key '{key}'. Supported keys: {', '.join(ALLOWED_WEIGHT_KEYS)}"
            )
        try:
            value = float(raw_value)
        except ValueError as exc:
            raise ValueError(f"invalid numeric weight for '{key}': {raw_value}") from exc
        if value < 0.0:
            raise ValueError(f"weight must be >= 0.0 for '{key}'")
        overrides[key] = value
    return overrides


def _resolve_config(args: argparse.Namespace) -> DetectorConfig:
    likely = DEFAULT_THRESHOLDS["likely_synthetic"]
    uncertain = DEFAULT_THRESHOLDS["uncertain"]
    max_pixels = DEFAULT_MAX_PIXELS
    weights = DEFAULT_WEIGHTS.copy()

    if args.policy is not None:
        policy = _load_policy(args.policy)

        thresholds = policy.get("thresholds")
        if thresholds is not None:
            if not isinstance(thresholds, dict):
                raise ValueError("policy.thresholds must be an object")
            if "likely_synthetic" in thresholds:
                likely = float(thresholds["likely_synthetic"])
            if "uncertain" in thresholds:
                uncertain = float(thresholds["uncertain"])

        if "max_pixels" in policy:
            max_pixels = int(policy["max_pixels"])

        policy_weights = policy.get("weights")
        if policy_weights is not None:
            if not isinstance(policy_weights, dict):
                raise ValueError("policy.weights must be an object")
            for key, value in policy_weights.items():
                if key not in DEFAULT_WEIGHTS:
                    raise ValueError(f"unsupported policy weight key: {key}")
                weights[key] = float(value)

    if args.threshold_likely_synthetic is not None:
        likely = args.threshold_likely_synthetic
    if args.threshold_uncertain is not None:
        uncertain = args.threshold_uncertain
    if args.max_pixels is not None:
        max_pixels = args.max_pixels

    cli_weight_overrides = _parse_weight_overrides(args.weight)
    weights.update(cli_weight_overrides)

    if max_pixels < 64:
        raise ValueError("max_pixels must be >= 64")

    _validate_thresholds(likely, uncertain)
    _validate_weights(weights)

    return DetectorConfig(
        likely_synthetic_threshold=likely,
        uncertain_threshold=uncertain,
        max_pixels=max_pixels,
        weights=weights,
    )


def _read_pixels(
    path: Path, max_pixels: int
) -> tuple[list[tuple[int, int, int]], int, int, int, int, bool]:
    with Image.open(path) as image:
        exif = image.getexif()
        has_exif = bool(exif and len(exif) > 0)
        rgb = image.convert("RGB")
        original_width, original_height = rgb.size
        pixel_count = original_width * original_height

        if pixel_count > max_pixels:
            scale = math.sqrt(max_pixels / pixel_count)
            target = (
                max(1, int(original_width * scale)),
                max(1, int(original_height * scale)),
            )
            rgb = rgb.resize(target, resample=Image.Resampling.BILINEAR)

        width, height = rgb.size
        pixels = list(rgb.getdata())
    return pixels, width, height, original_width, original_height, has_exif


def _channel_correlation(pixels: list[tuple[int, int, int]]) -> float:
    n = len(pixels)
    if n == 0:
        return 1.0

    sum_r = sum_g = sum_b = 0.0
    for r, g, b in pixels:
        sum_r += r
        sum_g += g
        sum_b += b

    mean_r = sum_r / n
    mean_g = sum_g / n
    mean_b = sum_b / n

    cov_rg = cov_rb = cov_gb = 0.0
    var_r = var_g = var_b = 0.0

    for r, g, b in pixels:
        dr = r - mean_r
        dg = g - mean_g
        db = b - mean_b
        cov_rg += dr * dg
        cov_rb += dr * db
        cov_gb += dg * db
        var_r += dr * dr
        var_g += dg * dg
        var_b += db * db

    def corr(cov: float, var_a: float, var_bv: float) -> float:
        denom = math.sqrt((var_a + 1e-9) * (var_bv + 1e-9))
        return cov / denom

    corr_rg = corr(cov_rg, var_r, var_g)
    corr_rb = corr(cov_rb, var_r, var_b)
    corr_gb = corr(cov_gb, var_g, var_b)
    return (corr_rg + corr_rb + corr_gb) / 3.0


def _edge_energy(pixels: list[tuple[int, int, int]], width: int, height: int) -> float:
    if width < 2 or height < 2:
        return 0.0

    def gray_at(idx: int) -> float:
        r, g, b = pixels[idx]
        return 0.299 * r + 0.587 * g + 0.114 * b

    total = 0.0
    count = 0
    for y in range(height - 1):
        row = y * width
        next_row = (y + 1) * width
        for x in range(width - 1):
            g0 = gray_at(row + x)
            gx = gray_at(row + x + 1)
            gy = gray_at(next_row + x)
            total += abs(gx - g0) + abs(gy - g0)
            count += 2
    return total / (count + 1e-9)


def _blockiness(pixels: list[tuple[int, int, int]], width: int, height: int, block: int = 8) -> float:
    if width < block * 2 or height < block * 2:
        return 0.0

    def gray(x: int, y: int) -> float:
        r, g, b = pixels[y * width + x]
        return 0.299 * r + 0.587 * g + 0.114 * b

    boundary_total = 0.0
    boundary_count = 0

    for x in range(block, width, block):
        for y in range(height):
            boundary_total += abs(gray(x - 1, y) - gray(x, y))
            boundary_count += 1

    for y in range(block, height, block):
        for x in range(width):
            boundary_total += abs(gray(x, y - 1) - gray(x, y))
            boundary_count += 1

    natural_total = 0.0
    natural_count = 0
    for y in range(height):
        for x in range(width - 1):
            if (x + 1) % block == 0:
                continue
            natural_total += abs(gray(x, y) - gray(x + 1, y))
            natural_count += 1

    for y in range(height - 1):
        if (y + 1) % block == 0:
            continue
        for x in range(width):
            natural_total += abs(gray(x, y) - gray(x, y + 1))
            natural_count += 1

    boundary_avg = boundary_total / (boundary_count + 1e-9)
    natural_avg = natural_total / (natural_count + 1e-9)
    return boundary_avg / (natural_avg + 1e-9)


def _periodic_residual(pixels: list[tuple[int, int, int]], width: int, height: int, step: int = 8) -> float:
    if width <= step or height <= step:
        return 0.0

    def gray(x: int, y: int) -> float:
        r, g, b = pixels[y * width + x]
        return 0.299 * r + 0.587 * g + 0.114 * b

    periodic_sum = 0.0
    periodic_count = 0
    random_sum = 0.0
    random_count = 0

    for y in range(height - step):
        for x in range(width - step):
            g0 = gray(x, y)
            periodic_sum += abs(g0 - gray(x + step, y))
            periodic_sum += abs(g0 - gray(x, y + step))
            periodic_count += 2

            random_sum += abs(g0 - gray(x + 3, y))
            random_sum += abs(g0 - gray(x, y + 5))
            random_count += 2

    periodic_avg = periodic_sum / (periodic_count + 1e-9)
    random_avg = random_sum / (random_count + 1e-9)
    return random_avg / (periodic_avg + 1e-9)


def _classify(score: float, config: DetectorConfig) -> str:
    if score >= config.likely_synthetic_threshold:
        return "likely_synthetic"
    if score >= config.uncertain_threshold:
        return "uncertain"
    return "likely_authentic"


def analyze_image(path: Path, config: DetectorConfig) -> AnalysisResult:
    pixels, width, height, original_width, original_height, has_exif = _read_pixels(path, config.max_pixels)
    corr_avg = _channel_correlation(pixels)
    edge_energy = _edge_energy(pixels, width, height)
    blockiness = _blockiness(pixels, width, height)
    periodic = _periodic_residual(pixels, width, height)

    score = 0.0
    notes: list[str] = []

    if not has_exif:
        score += config.weights["no_exif"] * 0.18
        notes.append("No EXIF metadata detected")

    if corr_avg > 0.95:
        score += config.weights["channel_correlation"] * min(0.25, (corr_avg - 0.95) * 2.5)
        notes.append("RGB channels are unusually correlated")

    if edge_energy > 18.0:
        score += config.weights["edge_energy"] * min(0.24, (edge_energy - 18.0) * 0.014)
        notes.append("Edge energy is elevated")

    if blockiness > 1.12 and edge_energy > 8.0:
        score += config.weights["blockiness"] * min(0.18, (blockiness - 1.12) * 0.5)
        notes.append("Block boundary artifacts detected")

    if periodic > 1.07:
        score += config.weights["periodic_residual"] * min(0.20, (periodic - 1.07) * 1.5)
        notes.append("Periodic texture residual pattern detected")

    if not has_exif and edge_energy < 4.0:
        score += config.weights["smooth_metadata_free"] * 0.12
        notes.append("Image is very smooth and metadata-free")

    score = max(0.0, min(1.0, score))
    classification = _classify(score, config)

    markers: dict[str, float | bool] = {
        "has_exif": has_exif,
        "channel_correlation_avg": round(corr_avg, 4),
        "edge_energy": round(edge_energy, 4),
        "grid_blockiness": round(blockiness, 4),
        "periodic_residual_ratio": round(periodic, 4),
        "analysis_width": float(width),
        "analysis_height": float(height),
        "original_width": float(original_width),
        "original_height": float(original_height),
    }

    return AnalysisResult(
        image=str(path),
        score=round(score, 4),
        classification=classification,
        markers=markers,
        notes=notes,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Heuristic deepfake detector for images")
    parser.add_argument("--input", dest="inputs", action="append", required=True, help="Input image path")
    parser.add_argument("--json", action="store_true", help="Print JSON output")
    parser.add_argument("--output", type=Path, default=None, help="Write JSON output file")
    parser.add_argument(
        "--policy",
        type=Path,
        default=None,
        help="Optional policy JSON with thresholds, max_pixels, and weights",
    )
    parser.add_argument(
        "--threshold-likely-synthetic",
        type=float,
        default=None,
        help="Override likely_synthetic threshold (0.0-1.0)",
    )
    parser.add_argument(
        "--threshold-uncertain",
        type=float,
        default=None,
        help="Override uncertain threshold (0.0-1.0)",
    )
    parser.add_argument(
        "--weight",
        action="append",
        default=None,
        help=(
            "Override a heuristic weight (repeatable): "
            "key=value where key is one of " + ", ".join(ALLOWED_WEIGHT_KEYS)
        ),
    )
    parser.add_argument(
        "--max-pixels",
        type=int,
        default=None,
        help=(
            "Maximum pixels analyzed per image. "
            "If omitted: uses policy max_pixels when provided, else default 1048576"
        ),
    )
    args = parser.parse_args()

    config = _resolve_config(args)

    input_paths = [Path(item) for item in args.inputs]
    payload: list[dict[str, Any]] = []
    had_error = False

    for path in input_paths:
        if not path.exists() or not path.is_file():
            had_error = True
            payload.append(
                {
                    "image": str(path),
                    "classification": "error",
                    "error": "input file does not exist or is not a regular file",
                }
            )
            continue
        try:
            result = analyze_image(path, config=config)
            payload.append(
                {
                    "image": result.image,
                    "score": result.score,
                    "classification": result.classification,
                    "markers": result.markers,
                    "notes": result.notes,
                }
            )
        except (OSError, DecompressionBombError, ValueError) as exc:
            had_error = True
            payload.append(
                {
                    "image": str(path),
                    "classification": "error",
                    "error": str(exc),
                }
            )

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps(payload, indent=2))
        if had_error:
            raise SystemExit(1)
        return

    for result in payload:
        print(f"Image: {result['image']}")
        print(f"  Classification: {result['classification']}")
        if result["classification"] == "error":
            print(f"  Error: {result['error']}")
            print()
            continue
        print(f"  Score: {result['score']:.4f}")
        print(
            "  Thresholds: "
            f"uncertain>={config.uncertain_threshold:.2f}, "
            f"likely_synthetic>={config.likely_synthetic_threshold:.2f}"
        )
        print("  Markers:")
        for key, value in result["markers"].items():
            print(f"    - {key}: {value}")
        if result["notes"]:
            print("  Notes:")
            for note in result["notes"]:
                print(f"    - {note}")
        else:
            print("  Notes: none")
        print()

    if had_error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
