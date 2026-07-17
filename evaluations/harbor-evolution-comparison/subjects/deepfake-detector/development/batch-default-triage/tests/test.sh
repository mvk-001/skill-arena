#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json
import math
from pathlib import Path

artifact = Path("/app/triage.json")
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

top_keys = {"policy", "files", "most_suspicious", "method", "provenance_proof"}
record(
    "top_level_schema",
    isinstance(payload, dict) and set(payload) == top_keys,
    0.10,
    f"expected keys: {sorted(top_keys)}",
)

metadata_ok = (
    isinstance(payload, dict)
    and payload.get("policy") == "default"
    and payload.get("method") == "heuristic-only"
    and payload.get("provenance_proof") is False
)
record(
    "policy_and_caveat_fields",
    metadata_ok,
    0.15,
    "policy=default, method=heuristic-only, provenance_proof=false",
)

files = payload.get("files") if isinstance(payload, dict) else None
files = files if isinstance(files, list) else []
expected_order = ["control-flat.pgm", "grid-alert.pgm", "split-vertical.pgm"]
observed_order = [
    item.get("filename") if isinstance(item, dict) else None for item in files
]
record(
    "filename_set_and_order",
    observed_order == expected_order,
    0.15,
    f"observed order: {observed_order}",
)

entry_schema_ok = len(files) == 3 and all(
    isinstance(item, dict)
    and set(item) == {"filename", "classification", "score"}
    for item in files
)
record(
    "file_entry_schema",
    entry_schema_ok,
    0.10,
    "each file entry must contain only filename, classification, and score",
)

by_name = {
    item.get("filename"): item
    for item in files
    if isinstance(item, dict) and isinstance(item.get("filename"), str)
}
expected = {
    "control-flat.pgm": ("likely_authentic", 0.3),
    "grid-alert.pgm": ("likely_synthetic", 0.745),
    "split-vertical.pgm": ("likely_authentic", 0.305),
}
classifications_ok = all(
    isinstance(by_name.get(name), dict)
    and by_name[name].get("classification") == classification
    for name, (classification, _) in expected.items()
)
record(
    "frozen_classifications",
    classifications_ok,
    0.15,
    "classification values must match the frozen detector output",
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
    0.15,
    "numeric scores must match the detector's four-decimal values",
)

most_ok = isinstance(payload, dict) and payload.get("most_suspicious") == "grid-alert.pgm"
record(
    "most_suspicious",
    most_ok,
    0.10,
    "highest frozen detector score belongs to grid-alert.pgm",
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
