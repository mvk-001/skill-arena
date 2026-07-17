#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json
import math
from pathlib import Path

artifact = Path("/app/intake.json")
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

top_keys = {"policy", "files", "detector_exit", "caveat"}
record(
    "top_level_schema",
    isinstance(payload, dict) and set(payload) == top_keys,
    0.10,
    f"expected keys: {sorted(top_keys)}",
)

files = payload.get("files") if isinstance(payload, dict) else None
files = files if isinstance(files, list) else []
expected_order = ["calm-plate.pgm", "missing-frame.pgm", "offset-grid.pgm"]
observed_order = [
    item.get("filename") if isinstance(item, dict) else None for item in files
]
record(
    "filename_set_and_order",
    observed_order == expected_order,
    0.15,
    f"observed order: {observed_order}",
)

by_name = {
    item.get("filename"): item
    for item in files
    if isinstance(item, dict) and isinstance(item.get("filename"), str)
}
success_names = ["calm-plate.pgm", "offset-grid.pgm"]
schemas_ok = (
    all(
        isinstance(by_name.get(name), dict)
        and set(by_name[name]) == {"filename", "classification", "score"}
        for name in success_names
    )
    and isinstance(by_name.get("missing-frame.pgm"), dict)
    and set(by_name["missing-frame.pgm"]) == {"filename", "classification", "error"}
)
record(
    "mixed_entry_schemas",
    schemas_ok,
    0.10,
    "successful and error entries must use their requested exact schemas",
)

expected_classes = {
    "calm-plate.pgm": "uncertain",
    "offset-grid.pgm": "likely_synthetic",
}
classes_ok = all(
    by_name.get(name, {}).get("classification") == expected_class
    for name, expected_class in expected_classes.items()
)
record(
    "frozen_success_classifications",
    classes_ok,
    0.15,
    "successful classifications must match the policy-driven detector output",
)

expected_scores = {"calm-plate.pgm": 0.3, "offset-grid.pgm": 0.745}
scores_ok = True
for name, expected_score in expected_scores.items():
    value = by_name.get(name, {}).get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        scores_ok = False
        break
    if not math.isfinite(float(value)) or abs(float(value) - expected_score) > 1e-9:
        scores_ok = False
        break
record(
    "frozen_success_scores",
    scores_ok,
    0.15,
    "successful numeric scores must match the frozen detector output",
)

missing = by_name.get("missing-frame.pgm", {})
error_ok = (
    isinstance(missing, dict)
    and missing.get("classification") == "error"
    and missing.get("error") == "input file does not exist or is not a regular file"
)
record(
    "partial_error_record",
    error_ok,
    0.15,
    "the intentionally missing file must preserve the detector error",
)

exit_ok = (
    isinstance(payload, dict)
    and payload.get("policy") == "review-policy.json"
    and payload.get("detector_exit") == "nonzero_with_partial_results"
)
record(
    "policy_and_exit_status",
    exit_ok,
    0.05,
    "record the requested policy and nonzero partial-result status",
)

caveat = payload.get("caveat") if isinstance(payload, dict) else None
caveat_text = caveat.lower() if isinstance(caveat, str) else ""
negative = any(token in caveat_text for token in ("not", "cannot", "can't", "doesn't", "does not"))
caveat_ok = "heuristic" in caveat_text and "provenance" in caveat_text and negative
record(
    "forensic_caveat",
    caveat_ok,
    0.05,
    "caveat must describe the method as heuristic and negate provenance proof",
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
