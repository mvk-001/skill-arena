#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json
import math
from pathlib import Path

artifact = Path("/app/assessment.json")
log_dir = Path("/logs/verifier")
log_dir.mkdir(parents=True, exist_ok=True)
checks = []


def record(name, passed, weight, detail):
    checks.append(
        {
            "name": name,
            "passed": bool(passed),
            "weight": weight,
            "detail": detail,
        }
    )


payload = None
parse_detail = "artifact is missing"
if artifact.is_file():
    try:
        payload = json.loads(artifact.read_text(encoding="utf-8"))
        parse_detail = "valid JSON object" if isinstance(payload, dict) else "JSON root is not an object"
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        parse_detail = f"invalid JSON: {exc}"
record("artifact_json", isinstance(payload, dict), 0.10, parse_detail)

top_keys = {"policy", "records", "review_order", "counts", "interpretation"}
record(
    "top_level_schema",
    isinstance(payload, dict) and set(payload) == top_keys,
    0.10,
    f"expected keys: {sorted(top_keys)}",
)
record(
    "policy",
    isinstance(payload, dict) and payload.get("policy") == "holdout-policy.json",
    0.05,
    "policy must identify holdout-policy.json",
)

records = payload.get("records") if isinstance(payload, dict) else None
records = records if isinstance(records, list) else []
expected_order = ["chromatic-checker.ppm", "color-flat.ppm", "luma-ramp.ppm"]
observed_order = [
    item.get("filename") if isinstance(item, dict) else None for item in records
]
record(
    "filename_set_and_order",
    observed_order == expected_order,
    0.10,
    f"observed order: {observed_order}",
)

entry_schema_ok = len(records) == 3 and all(
    isinstance(item, dict)
    and set(item) == {"filename", "classification", "score", "signals"}
    and isinstance(item.get("signals"), dict)
    and set(item["signals"]) == {"edge_energy", "periodic_residual_ratio"}
    for item in records
)
record(
    "record_and_signal_schema",
    entry_schema_ok,
    0.10,
    "record and selected signal keys must match the requested exact shape",
)

by_name = {
    item.get("filename"): item
    for item in records
    if isinstance(item, dict) and isinstance(item.get("filename"), str)
}
expected = {
    "chromatic-checker.ppm": ("likely_synthetic", 0.712),
    "color-flat.ppm": ("likely_authentic", 0.216),
    "luma-ramp.ppm": ("likely_authentic", 0.2065),
}
classes_ok = all(
    by_name.get(name, {}).get("classification") == expected_class
    for name, (expected_class, _) in expected.items()
)
record(
    "frozen_classifications",
    classes_ok,
    0.10,
    "classifications must match the frozen holdout policy behavior",
)

scores_ok = True
for name, (_, expected_score) in expected.items():
    value = by_name.get(name, {}).get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        scores_ok = False
        break
    if not math.isfinite(float(value)) or abs(float(value) - expected_score) > 1e-9:
        scores_ok = False
        break
record(
    "frozen_scores",
    scores_ok,
    0.10,
    "numeric scores must match the detector's four-decimal values",
)

expected_signals = {
    "chromatic-checker.ppm": {
        "edge_energy": 59.43,
        "periodic_residual_ratio": 59429999992.5712,
    },
    "color-flat.ppm": {"edge_energy": 0.0, "periodic_residual_ratio": 0.0},
    "luma-ramp.ppm": {"edge_energy": 15.0, "periodic_residual_ratio": 0.375},
}
signals_ok = all(
    by_name.get(name, {}).get("signals") == values
    for name, values in expected_signals.items()
)
record(
    "frozen_selected_signals",
    signals_ok,
    0.15,
    "selected signal values must match the frozen detector output",
)

review_order_ok = (
    isinstance(payload, dict)
    and payload.get("review_order")
    == ["chromatic-checker.ppm", "color-flat.ppm", "luma-ramp.ppm"]
)
record(
    "score_review_order",
    review_order_ok,
    0.10,
    "review_order must be descending by frozen score",
)

counts_ok = (
    isinstance(payload, dict)
    and payload.get("counts")
    == {"likely_authentic": 2, "uncertain": 0, "likely_synthetic": 1}
)
record(
    "classification_counts",
    counts_ok,
    0.05,
    "counts must exactly summarize the frozen classifications",
)

interpretation_ok = (
    isinstance(payload, dict)
    and payload.get("interpretation")
    == {"method": "heuristic-only", "provenance_proof": False}
)
record(
    "interpretation_caveat",
    interpretation_ok,
    0.05,
    "interpretation must preserve the heuristic-only provenance caveat",
)

reward = round(sum(item["weight"] for item in checks if item["passed"]), 4)
diagnostics = {"reward": reward, "checks": checks}
(log_dir / "diagnostics.json").write_text(
    json.dumps(diagnostics, indent=2) + "\n", encoding="utf-8"
)
(log_dir / "reward.txt").write_text(f"{reward:.4f}\n", encoding="utf-8")
for item in checks:
    print(f"{'PASS' if item['passed'] else 'FAIL'} {item['name']}: {item['detail']}")
print(f"reward={reward:.4f}")
PY
