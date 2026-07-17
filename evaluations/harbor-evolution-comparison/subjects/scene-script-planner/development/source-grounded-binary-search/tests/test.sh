#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from __future__ import annotations

import json
import os
import re
from pathlib import Path

APP_DIR = Path(os.environ.get("APP_DIR", "/app"))
LOG_DIR = Path(os.environ.get("VERIFIER_LOG_DIR", "/logs/verifier"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

CHECK_WEIGHTS = {
    "scene_plan_exact_path": 2.0,
    "research_exact_path": 2.0,
    "artifact_scope": 1.0,
    "single_plan_artifact": 1.0,
    "scene_plan_schema": 1.5,
    "status_preserved": 1.0,
    "runtime_preserved": 1.0,
    "required_fields": 1.0,
    "brief_semantics": 2.0,
    "timeline_header": 0.5,
    "timeline_row_count": 1.0,
    "timeline_five_columns": 1.0,
    "timeline_time_format": 1.0,
    "timeline_positive_ranges": 0.5,
    "timeline_contiguous": 1.5,
    "timeline_arithmetic": 1.5,
    "timeline_story_order": 2.0,
    "plan_source_linkage": 1.5,
    "research_source_linkage": 1.5,
    "research_schema": 1.0,
    "research_claim_semantics": 2.0,
    "research_urls": 1.0,
    "component_candidate_contract": 1.5,
    "no_implementation_code": 3.0,
    "english_and_topic_alignment": 1.5,
}
checks: dict[str, dict[str, object]] = {}
failures: list[str] = []
verifier_errors: list[str] = []


def record(name: str, passed: bool, detail: str) -> None:
    weight = CHECK_WEIGHTS[name]
    checks[name] = {"passed": bool(passed), "weight": weight, "detail": detail}
    if not passed:
        failures.append(f"{name}: {detail}")


def read_required(path: Path, label: str) -> str:
    exists = path.is_file()
    record(f"{label}_exact_path", exists, f"Expected regular file at {path}")
    return path.read_text(encoding="utf-8") if exists else ""


def field(text: str, name: str) -> str | None:
    match = re.search(rf"(?mi)^{re.escape(name)}:\s*(\S.*)$", text)
    return match.group(1).strip() if match else None


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"(?ms)^## {re.escape(heading)}\s*$\n(.*?)(?=^## |\Z)",
        text,
    )
    return match.group(1).strip() if match else ""


def timeline_rows(text: str) -> list[list[str]]:
    body = section(text, "Timeline")
    rows: list[list[str]] = []
    for line in body.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells and cells[0].lower() == "time":
            continue
        if cells and all(re.fullmatch(r":?-+:?", cell) for cell in cells):
            continue
        rows.append(cells)
    return rows


def seconds(value: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"(\d+):([0-5]\d)\s*-\s*(\d+):([0-5]\d)", value)
    if not match:
        return None
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    return start, end


def first_matching_index(rows: list[list[str]], terms: tuple[str, ...]) -> int | None:
    for index, row in enumerate(rows):
        row_text = " ".join(row).lower()
        if any(term in row_text for term in terms):
            return index
    return None


def implementation_files(root: Path) -> list[str]:
    extensions = {
        ".bash", ".c", ".cc", ".cpp", ".cs", ".fish", ".go", ".h",
        ".hpp", ".html", ".ipynb", ".java", ".jl", ".js", ".jsx",
        ".kt", ".kts", ".lua", ".m", ".mm", ".php", ".py", ".pyi",
        ".r", ".rb", ".rs", ".scala", ".sh", ".swift", ".ts", ".tsx",
        ".vue", ".zsh",
    }
    return sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in extensions
    )


def code_like_text_files(root: Path) -> list[str]:
    text_extensions = {".json", ".md", ".rst", ".toml", ".txt", ".yaml", ".yml"}
    pattern = re.compile(
        r"```|\bfrom\s+manim\b|\bimport\s+manim\b|\bclass\s+\w+\s*\([^)]*Scene[^)]*\)\s*:",
        re.IGNORECASE,
    )
    matches: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in text_extensions:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if pattern.search(content):
            matches.append(path.relative_to(root).as_posix())
    return sorted(matches)


try:
    plan_path = APP_DIR / "scene_plan.md"
    research_path = APP_DIR / "research.md"
    plan = read_required(plan_path, "scene_plan")
    research = read_required(research_path, "research")

    allowed_files = {"brief.md", "research.md", "scene_plan.md", "sources.md"}
    observed_files = sorted(
        path.relative_to(APP_DIR).as_posix()
        for path in APP_DIR.rglob("*")
        if path.is_file()
    )
    unexpected_files = [path for path in observed_files if path not in allowed_files]
    record("artifact_scope", not unexpected_files, f"Unexpected artifacts: {unexpected_files}")

    alternate_plans = [
        path.relative_to(APP_DIR).as_posix()
        for path in APP_DIR.rglob("*scene*plan*.md")
        if path != plan_path
    ]
    record(
        "single_plan_artifact",
        not alternate_plans,
        f"Unexpected alternate plan paths: {alternate_plans}",
    )

    required_headings = [
        "## Research Summary",
        "## Visual Language",
        "## Timeline",
        "## Component Candidates",
        "## Implementation Notes",
    ]
    missing_headings = [heading for heading in required_headings if heading not in plan]
    record("scene_plan_schema", not missing_headings, f"Missing headings: {missing_headings}")
    record("status_preserved", field(plan, "Status") == "Spike", "Status must remain Spike")
    record(
        "runtime_preserved",
        field(plan, "Target runtime") == "24 seconds",
        "Target runtime must be exactly 24 seconds",
    )
    missing_fields = [
        name for name in ("Audience", "Core idea", "Learning outcome") if not field(plan, name)
    ]
    record("required_fields", not missing_fields, f"Missing or empty fields: {missing_fields}")

    audience = (field(plan, "Audience") or "").lower()
    core = (field(plan, "Core idea") or "").lower()
    outcome = (field(plan, "Learning outcome") or "").lower()
    brief_semantics = (
        "student" in audience
        and "array" in audience
        and "comparison" in core
        and "half" in core
        and any(term in outcome for term in ("shrink", "narrow", "smaller"))
    )
    record(
        "brief_semantics",
        brief_semantics,
        "Audience, core idea, and learning outcome must preserve the supplied binary-search story",
    )

    timeline = section(plan, "Timeline")
    header_ok = bool(
        re.search(
            r"(?mi)^\|\s*Time\s*\|\s*Beat\s*\|\s*Visuals\s*\|\s*Narration or on-screen text\s*\|\s*Transition\s*\|\s*$",
            timeline,
        )
    )
    record("timeline_header", header_ok, "Timeline must use the five required named columns")
    rows = timeline_rows(plan)
    record("timeline_row_count", len(rows) >= 3, f"Expected at least 3 beats, found {len(rows)}")
    record(
        "timeline_five_columns",
        bool(rows) and all(len(row) == 5 and all(row) for row in rows),
        "Every timeline beat must contain five non-empty cells",
    )
    ranges = [seconds(row[0]) for row in rows if len(row) == 5]
    parsed = len(ranges) == len(rows) and all(value is not None for value in ranges)
    record("timeline_time_format", parsed and bool(rows), "Use M:SS-M:SS for every beat")
    if parsed and ranges:
        concrete = [value for value in ranges if value is not None]
        positive = all(end > start for start, end in concrete)
        contiguous = all(
            concrete[index][1] == concrete[index + 1][0]
            for index in range(len(concrete) - 1)
        )
        total = sum(end - start for start, end in concrete)
        record("timeline_positive_ranges", positive, "Every beat must have positive duration")
        record("timeline_contiguous", contiguous, "Timeline ranges must have no gaps or overlaps")
        record(
            "timeline_arithmetic",
            concrete[0][0] == 0 and concrete[-1][1] == 24 and total == 24,
            f"Expected coverage 0:00-0:24 totaling 24 seconds; observed total {total}",
        )
    else:
        record("timeline_positive_ranges", False, "Timeline ranges could not be parsed")
        record("timeline_contiguous", False, "Timeline ranges could not be parsed")
        record("timeline_arithmetic", False, "Timeline ranges could not be parsed")

    midpoint_index = first_matching_index(rows, ("midpoint", "middle"))
    narrowing_index = first_matching_index(rows, ("remove half", "reject", "narrow", "shrink", "contract"))
    target_index = first_matching_index(rows, ("isolate", "single position", "one position", "target cell"))
    ordered_story = (
        midpoint_index is not None
        and narrowing_index is not None
        and target_index is not None
        and midpoint_index <= narrowing_index < target_index
    )
    record(
        "timeline_story_order",
        ordered_story,
        "Timeline must compare the midpoint, narrow the active interval, then isolate the target",
    )

    source_ids = ("SRC-BS-01", "SRC-BS-02")
    missing_plan_ids = [source_id for source_id in source_ids if source_id not in plan]
    missing_research_ids = [source_id for source_id in source_ids if source_id not in research]
    record("plan_source_linkage", not missing_plan_ids, f"Plan omits source IDs: {missing_plan_ids}")
    record(
        "research_source_linkage",
        not missing_research_ids,
        f"Research record omits source IDs: {missing_research_ids}",
    )
    research_schema = all(
        marker in research
        for marker in ("# Research Notes", "## Claims Used", "## Sources Checked", "Confidence:")
    )
    record("research_schema", research_schema, "Research notes need claims, confidence, and sources checked")
    research_lower = research.lower()
    research_claim_semantics = (
        all(source_id in research for source_id in source_ids)
        and "sorted" in research_lower
        and any(term in research_lower for term in ("middle", "midpoint"))
        and any(term in research_lower for term in ("partition", "bisect", "narrow"))
        and research_lower.count("confidence:") >= 2
    )
    record(
        "research_claim_semantics",
        research_claim_semantics,
        "Research must separately ground midpoint search and repeated interval partitioning",
    )
    record(
        "research_urls",
        "https://algs4.cs.princeton.edu/" in research and "https://docs.python.org/" in research,
        "Research notes must preserve both supplied source URLs",
    )

    candidate_block = section(plan, "Component Candidates")
    candidate_fields = all(
        marker in candidate_block
        for marker in ("- Candidate:", "Reason:", "Proposed folder:", "Approval status: Candidate only")
    )
    candidate_folder = re.search(
        r"(?mi)^\s*Proposed folder:\s*components/(animations|layouts|mobjects|styles)/?\s*$",
        candidate_block,
    )
    record(
        "component_candidate_contract",
        candidate_fields and candidate_folder is not None,
        "Record a candidate-only component with a permitted components/ folder",
    )

    code_files = implementation_files(APP_DIR)
    code_text_files = code_like_text_files(APP_DIR)
    record(
        "no_implementation_code",
        not code_files and not code_text_files,
        f"Recursive code artifacts: {code_files}; code-like text artifacts: {code_text_files}",
    )

    plan_lower = plan.lower()
    english_contract = all(
        word in plan_lower for word in ("array", "target", "interval", "sorted", "half")
    )
    record(
        "english_and_topic_alignment",
        english_contract,
        "Plan must retain the sorted-array, target, half, and active-interval visual contract",
    )
except Exception as error:  # verifier must always emit useful feedback
    verifier_errors.append(f"{type(error).__name__}: {error}")

for name in CHECK_WEIGHTS:
    if name not in checks:
        record(name, False, "Verifier did not complete this check")

total_weight = sum(CHECK_WEIGHTS.values())
earned_weight = sum(
    float(item["weight"]) for item in checks.values() if bool(item["passed"])
)
score = earned_weight / total_weight if total_weight else 0.0
passed = not failures and not verifier_errors
(LOG_DIR / "reward.txt").write_text(f"{score:.6f}\n", encoding="utf-8")
(LOG_DIR / "feedback.json").write_text(
    json.dumps(
        {
            "passed": passed,
            "score": round(score, 6),
            "earned_weight": earned_weight,
            "total_weight": total_weight,
            "checks": checks,
            "failures": failures,
            "verifier_errors": verifier_errors,
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
summary = f"Score: {score:.6f} ({earned_weight:g}/{total_weight:g} weighted points)\n"
details = "All deterministic checks passed.\n" if passed else "\n".join(failures + verifier_errors) + "\n"
(LOG_DIR / "feedback.txt").write_text(summary + details, encoding="utf-8")
PY
