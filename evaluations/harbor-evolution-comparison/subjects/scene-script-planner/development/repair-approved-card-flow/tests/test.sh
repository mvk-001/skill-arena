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
    "artifact_scope": 1.5,
    "scene_plan_schema": 1.5,
    "approved_status_preserved": 1.5,
    "runtime_preserved": 1.5,
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
    "visual_specificity": 1.5,
    "english_repair": 2.0,
    "brief_alignment": 1.5,
    "research_routing": 2.0,
    "candidate_only_reuse": 1.5,
    "implementation_notes": 1.0,
    "no_implementation_code": 3.0,
}
checks: dict[str, dict[str, object]] = {}
failures: list[str] = []
verifier_errors: list[str] = []


def record(name: str, passed: bool, detail: str) -> None:
    weight = CHECK_WEIGHTS[name]
    checks[name] = {"passed": bool(passed), "weight": weight, "detail": detail}
    if not passed:
        failures.append(f"{name}: {detail}")


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


def parse_range(value: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"(\d+):([0-5]\d)\s*-\s*(\d+):([0-5]\d)", value)
    if not match:
        return None
    return (
        int(match.group(1)) * 60 + int(match.group(2)),
        int(match.group(3)) * 60 + int(match.group(4)),
    )


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
    exists = plan_path.is_file()
    record("scene_plan_exact_path", exists, "Expected repaired plan at /app/scene_plan.md")
    plan = plan_path.read_text(encoding="utf-8") if exists else ""

    allowed_files = {"project_brief.md", "scene_plan.md"}
    observed_files = sorted(
        path.relative_to(APP_DIR).as_posix()
        for path in APP_DIR.rglob("*")
        if path.is_file()
    )
    unexpected_files = [path for path in observed_files if path not in allowed_files]
    record("artifact_scope", not unexpected_files, f"Unexpected artifacts: {unexpected_files}")

    heading_names = [
        "Research Summary",
        "Visual Language",
        "Timeline",
        "Component Candidates",
        "Implementation Notes",
    ]
    heading_positions = [plan.find(f"## {heading}") for heading in heading_names]
    schema_ok = (
        all(position >= 0 for position in heading_positions)
        and heading_positions == sorted(heading_positions)
        and all(len(re.findall(rf"(?m)^## {re.escape(heading)}\s*$", plan)) == 1 for heading in heading_names)
    )
    record(
        "scene_plan_schema",
        schema_ok,
        "Required second-level headings must each appear once and in contract order",
    )
    record(
        "approved_status_preserved",
        field(plan, "Status") == "Approved",
        "The supplied Approved status must not be downgraded or renamed",
    )
    record(
        "runtime_preserved",
        field(plan, "Target runtime") == "18 seconds",
        "Target runtime must remain exactly 18 seconds",
    )
    missing_fields = [
        name for name in ("Audience", "Core idea", "Learning outcome") if not field(plan, name)
    ]
    record("required_fields", not missing_fields, f"Missing or empty fields: {missing_fields}")

    audience = (field(plan, "Audience") or "").lower()
    core = (field(plan, "Core idea") or "").lower()
    outcome = (field(plan, "Learning outcome") or "").lower()
    brief_semantics = (
        "product designer" in audience
        and "card" in core
        and "constraint" in core
        and "lane" in core
        and any(term in outcome for term in ("spacing", "grouping", "group"))
        and "constraint" in outcome
    )
    record(
        "brief_semantics",
        brief_semantics,
        "Audience, core idea, and learning outcome must preserve the supplied card-and-lane constraint story",
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
    ranges = [parse_range(row[0]) for row in rows if len(row) == 5]
    parsed = len(ranges) == len(rows) and all(item is not None for item in ranges)
    record("timeline_time_format", parsed and bool(rows), "Use M:SS-M:SS for every beat")
    if parsed and ranges:
        concrete = [item for item in ranges if item is not None]
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
            concrete[0][0] == 0 and concrete[-1][1] == 18 and total == 18,
            f"Expected coverage 0:00-0:18 totaling 18 seconds; observed total {total}",
        )
    else:
        record("timeline_positive_ranges", False, "Timeline ranges could not be parsed")
        record("timeline_contiguous", False, "Timeline ranges could not be parsed")
        record("timeline_arithmetic", False, "Timeline ranges could not be parsed")

    crowd_index = first_matching_index(rows, ("crowd", "overlap", "stack"))
    lanes_index = first_matching_index(rows, ("three lane", "lane guide", "lanes appear"))
    reflow_index = first_matching_index(rows, ("reflow", "fan", "separate arc", "move into"))
    result_index = first_matching_index(rows, ("hold the result", "remain crisp", "three clear lanes", "final layout"))
    ordered_story = (
        crowd_index is not None
        and lanes_index is not None
        and reflow_index is not None
        and result_index is not None
        and crowd_index < lanes_index <= reflow_index < result_index
    )
    record(
        "timeline_story_order",
        ordered_story,
        "Timeline must show crowding, reveal three lanes, trace the reflow, then hold the resolved state",
    )

    visual_language = section(plan, "Visual Language").lower()
    visual_specificity = (
        "card" in visual_language
        and "lane" in visual_language
        and any(term in visual_language for term in ("overlap", "crowd"))
        and any(term in visual_language for term in ("spacing", "spaced", "group"))
        and any(term in visual_language for term in ("motion", "path", "arc", "move"))
    )
    record(
        "visual_specificity",
        visual_specificity,
        "Visual language must make the crowded state, lane grouping, spacing, and traceable motion concrete",
    )

    normalized = plan.lower()
    supplied_spanish = (
        "tarjeta", "tarjetas", "azules", "fondo oscuro", "inicio", "aparecen",
        "aparece", "cambio", "mover", "carril", "carriles", "cortar",
        "lista ordenada",
    )
    remaining_spanish = [token for token in supplied_spanish if token in normalized]
    record("english_repair", not remaining_spanish, f"Unrepaired Spanish text: {remaining_spanish}")
    topic_terms = [term for term in ("cards", "lanes", "constraint") if term not in normalized]
    record("brief_alignment", not topic_terms, f"Plan omits brief terms: {topic_terms}")

    research_absent = not any(
        path.is_file() and path.name.lower() == "research.md" for path in APP_DIR.rglob("*")
    )
    research_summary = section(plan, "Research Summary").lower()
    summary_routes_out = (
        any(phrase in research_summary for phrase in ("no research", "no external", "no factual"))
        and any(term in research_summary for term in ("abstract", "metaphor", "designed"))
    )
    record(
        "research_routing",
        research_absent and summary_routes_out,
        "This abstract scene must not create research.md and must explain why research is unnecessary",
    )

    candidate_block = section(plan, "Component Candidates")
    candidate_fields = all(
        marker in candidate_block
        for marker in ("- Candidate:", "Reason:", "Proposed folder:", "Approval status: Candidate only")
    )
    folder_ok = re.search(
        r"(?mi)^\s*Proposed folder:\s*components/(animations|layouts|mobjects|styles)/?\s*$",
        candidate_block,
    )
    approved_component = bool(re.search(r"(?mi)Approval status:\s*Approved", candidate_block))
    record(
        "candidate_only_reuse",
        candidate_fields and folder_ok is not None and not approved_component,
        "Reusable motion must remain a candidate in an allowed folder",
    )

    notes = section(plan, "Implementation Notes").lower()
    notes_ok = (
        len(notes.split()) >= 12
        and "order" in notes
        and any(term in notes for term in ("layer", "z-order", "above", "below"))
        and any(term in notes for term in ("second", "timing", "duration", "hold"))
    )
    record(
        "implementation_notes",
        notes_ok,
        "Implementation notes must constrain order, layering, and timing without providing code",
    )

    code_files = implementation_files(APP_DIR)
    code_text_files = code_like_text_files(APP_DIR)
    record(
        "no_implementation_code",
        not code_files and not code_text_files,
        f"Recursive code artifacts: {code_files}; code-like text artifacts: {code_text_files}",
    )
except Exception as error:
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
