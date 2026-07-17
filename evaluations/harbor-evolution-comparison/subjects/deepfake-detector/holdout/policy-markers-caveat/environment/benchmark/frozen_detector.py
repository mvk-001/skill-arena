#!/usr/bin/env python3
"""Immutable benchmark detector for portable P2/P3 image fixtures.

This intentionally small CLI freezes the detector behavior so skill candidates
are compared on orchestration, result preservation, and forensic reporting.
It is copied into the task image as a root-owned executable.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_THRESHOLDS = {"likely_synthetic": 0.60, "uncertain": 0.35}
DEFAULT_WEIGHTS = {
    "no_exif": 1.0,
    "channel_correlation": 1.0,
    "edge_energy": 1.0,
    "blockiness": 1.0,
    "periodic_residual": 1.0,
    "smooth_metadata_free": 1.0,
}


@dataclass(frozen=True)
class Config:
    likely_synthetic: float
    uncertain: float
    weights: dict[str, float]


def _tokens(path: Path) -> list[str]:
    tokens: list[str] = []
    for line in path.read_text(encoding="ascii").splitlines():
        tokens.extend(line.split("#", 1)[0].split())
    return tokens


def _read_pnm(path: Path) -> tuple[list[tuple[int, int, int]], int, int]:
    values = _tokens(path)
    if len(values) < 4 or values[0] not in {"P2", "P3"}:
        raise ValueError("expected an ASCII P2 or P3 image")
    mode = values[0]
    width, height, maximum = map(int, values[1:4])
    if width <= 0 or height <= 0 or maximum <= 0:
        raise ValueError("invalid PNM dimensions or maximum value")
    raw = [int(value) for value in values[4:]]
    channels = 1 if mode == "P2" else 3
    if len(raw) != width * height * channels:
        raise ValueError("PNM sample count does not match its dimensions")
    if any(value < 0 or value > maximum for value in raw):
        raise ValueError("PNM sample is outside its declared range")

    scaled = [round(value * 255 / maximum) for value in raw]
    if mode == "P2":
        pixels = [(value, value, value) for value in scaled]
    else:
        pixels = [tuple(scaled[index : index + 3]) for index in range(0, len(scaled), 3)]
    return pixels, width, height


def _channel_correlation(pixels: list[tuple[int, int, int]]) -> float:
    count = len(pixels)
    means = [sum(pixel[channel] for pixel in pixels) / count for channel in range(3)]
    variances = [
        sum((pixel[channel] - means[channel]) ** 2 for pixel in pixels)
        for channel in range(3)
    ]

    def correlation(left: int, right: int) -> float:
        covariance = sum(
            (pixel[left] - means[left]) * (pixel[right] - means[right])
            for pixel in pixels
        )
        return covariance / math.sqrt((variances[left] + 1e-9) * (variances[right] + 1e-9))

    return sum(correlation(*pair) for pair in ((0, 1), (0, 2), (1, 2))) / 3


def _gray(pixel: tuple[int, int, int]) -> float:
    red, green, blue = pixel
    return 0.299 * red + 0.587 * green + 0.114 * blue


def _edge_energy(pixels: list[tuple[int, int, int]], width: int, height: int) -> float:
    if width < 2 or height < 2:
        return 0.0
    total = 0.0
    count = 0
    for y in range(height - 1):
        for x in range(width - 1):
            current = _gray(pixels[y * width + x])
            total += abs(_gray(pixels[y * width + x + 1]) - current)
            total += abs(_gray(pixels[(y + 1) * width + x]) - current)
            count += 2
    return total / (count + 1e-9)


def _blockiness(
    pixels: list[tuple[int, int, int]], width: int, height: int, block: int = 8
) -> float:
    if width < block * 2 or height < block * 2:
        return 0.0
    boundaries: list[float] = []
    natural: list[float] = []
    for y in range(height):
        for x in range(width - 1):
            delta = abs(_gray(pixels[y * width + x]) - _gray(pixels[y * width + x + 1]))
            (boundaries if (x + 1) % block == 0 else natural).append(delta)
    for y in range(height - 1):
        for x in range(width):
            delta = abs(_gray(pixels[y * width + x]) - _gray(pixels[(y + 1) * width + x]))
            (boundaries if (y + 1) % block == 0 else natural).append(delta)
    boundary_average = sum(boundaries) / (len(boundaries) + 1e-9)
    natural_average = sum(natural) / (len(natural) + 1e-9)
    return boundary_average / (natural_average + 1e-9)


def _periodic_residual(
    pixels: list[tuple[int, int, int]], width: int, height: int, step: int = 8
) -> float:
    if width <= step or height <= step:
        return 0.0
    periodic: list[float] = []
    comparison: list[float] = []
    for y in range(height - step):
        for x in range(width - step):
            current = _gray(pixels[y * width + x])
            periodic.extend(
                (
                    abs(current - _gray(pixels[y * width + x + step])),
                    abs(current - _gray(pixels[(y + step) * width + x])),
                )
            )
            comparison.extend(
                (
                    abs(current - _gray(pixels[y * width + x + 3])),
                    abs(current - _gray(pixels[(y + 5) * width + x])),
                )
            )
    return (sum(comparison) / (len(comparison) + 1e-9)) / (
        sum(periodic) / (len(periodic) + 1e-9) + 1e-9
    )


def _load_config(path: Path | None) -> Config:
    policy: dict[str, Any] = {}
    if path is not None:
        policy = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(policy, dict):
            raise ValueError("policy JSON must be an object")
    thresholds = policy.get("thresholds", {})
    weights = DEFAULT_WEIGHTS.copy()
    for key, value in policy.get("weights", {}).items():
        if key not in weights:
            raise ValueError(f"unsupported policy weight key: {key}")
        weights[key] = float(value)
    likely = float(thresholds.get("likely_synthetic", DEFAULT_THRESHOLDS["likely_synthetic"]))
    uncertain = float(thresholds.get("uncertain", DEFAULT_THRESHOLDS["uncertain"]))
    if not 0 <= uncertain <= likely <= 1:
        raise ValueError("thresholds must satisfy 0 <= uncertain <= likely_synthetic <= 1")
    if any(value < 0 for value in weights.values()):
        raise ValueError("policy weights must be nonnegative")
    return Config(likely_synthetic=likely, uncertain=uncertain, weights=weights)


def _analyze(path: Path, config: Config) -> dict[str, Any]:
    pixels, width, height = _read_pnm(path)
    correlation = _channel_correlation(pixels)
    edge = _edge_energy(pixels, width, height)
    blocks = _blockiness(pixels, width, height)
    periodic = _periodic_residual(pixels, width, height)
    score = config.weights["no_exif"] * 0.18
    if correlation > 0.95:
        score += config.weights["channel_correlation"] * min(0.25, (correlation - 0.95) * 2.5)
    if edge > 18:
        score += config.weights["edge_energy"] * min(0.24, (edge - 18) * 0.014)
    if blocks > 1.12 and edge > 8:
        score += config.weights["blockiness"] * min(0.18, (blocks - 1.12) * 0.5)
    if periodic > 1.07:
        score += config.weights["periodic_residual"] * min(0.20, (periodic - 1.07) * 1.5)
    if edge < 4:
        score += config.weights["smooth_metadata_free"] * 0.12
    score = round(max(0.0, min(1.0, score)), 4)
    classification = (
        "likely_synthetic"
        if score >= config.likely_synthetic
        else "uncertain"
        if score >= config.uncertain
        else "likely_authentic"
    )
    return {
        "image": str(path),
        "score": score,
        "classification": classification,
        "markers": {
            "has_exif": False,
            "channel_correlation_avg": round(correlation, 4),
            "edge_energy": round(edge, 4),
            "grid_blockiness": round(blocks, 4),
            "periodic_residual_ratio": round(periodic, 4),
            "analysis_width": float(width),
            "analysis_height": float(height),
            "original_width": float(width),
            "original_height": float(height),
        },
        "notes": ["Frozen local heuristic; not provenance evidence"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Frozen benchmark image detector")
    parser.add_argument("--input", dest="inputs", action="append", required=True)
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config = _load_config(args.policy)
    results: list[dict[str, Any]] = []
    had_error = False
    for raw_path in args.inputs:
        path = Path(raw_path)
        if not path.is_file():
            had_error = True
            results.append(
                {
                    "image": str(path),
                    "classification": "error",
                    "error": "input file does not exist or is not a regular file",
                }
            )
            continue
        try:
            results.append(_analyze(path, config))
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            had_error = True
            results.append(
                {"image": str(path), "classification": "error", "error": str(exc)}
            )
    rendered = json.dumps(results, indent=2)
    if args.output is not None:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if args.json:
        print(rendered)
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
