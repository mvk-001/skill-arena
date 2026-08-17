#!/usr/bin/env python3
"""Create and verify digest-bound knowledge-expertise mutation portfolios."""

from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = 1
PLAN_SCHEMA = "harbor-knowledge-expertise-plan/1.0"
HEX_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
PORTABLE_ID = re.compile(r"^[a-z0-9](?:[a-z0-9._:-]*[a-z0-9])?$")
SKILL_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
FRONTMATTER = re.compile(r"\A---\r?\n(?P<body>.*?)\r?\n---(?:\r?\n|\Z)", re.DOTALL)
FRONTMATTER_NAME = re.compile(r"^name:\s*(?P<name>[^\r\n]+?)\s*$", re.MULTILINE)
REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)

DIMENSIONS = frozenset(
    {
        "knowledge-coverage",
        "retrieval-breadth",
        "ranking-discrimination",
        "evidence-fidelity",
        "synthesis-completeness",
        "calibration",
        "robustness",
        "efficiency",
    }
)
OBJECTIVES = frozenset({"maximize", "minimize", "hard-gate"})
FAILURE_MODES = frozenset(
    {
        "knowledge-surface-gap",
        "relevant-evidence-missing",
        "relevant-evidence-late",
        "query-intent-dilution",
        "ranking-disagreement",
        "evidence-identity-risk",
        "answer-coverage-gap",
        "abstention-calibration-gap",
        "latency-budget-pressure",
        "case-regression",
        "response-contract-failure",
    }
)
SELECTION_MECHANISMS = frozenset(
    {
        "harbor-reflective-pareto-search",
        "harbor-operator-coevolution",
    }
)

OPERATOR_LIBRARY: dict[str, dict[str, str]] = {
    "knowledge-surface-enrichment": {
        "family": "knowledge-surface",
        "instruction": (
            "Derive additional query-independent retrieval surfaces solely from "
            "the immutable knowledge snapshot. Preserve authoritative record "
            "identity, deterministic rebuilds, and exact evidence binding; add "
            "no external facts or benchmark-specific constants."
        ),
    },
    "bounded-coverage-expansion": {
        "family": "retrieval-coverage",
        "instruction": (
            "Expand bounded retrieval coverage with query-derived terms and "
            "immutable snapshot signals while preserving the complete user "
            "intent, one authoritative identity per source, deterministic "
            "ordering, and the existing result budget."
        ),
    },
    "early-rank-calibration": {
        "family": "ranking",
        "instruction": (
            "Recalibrate early ranking with query-derived features and immutable "
            "rank signals so authoritative evidence moves earlier without "
            "reducing bounded coverage. Preserve deterministic tie-breaking, "
            "exact evidence, and the declared result budget."
        ),
    },
    "anchor-facet-separation": {
        "family": "query-planning",
        "instruction": (
            "Keep the complete user request as an intent anchor and derive only "
            "a small set of complementary, non-redundant facets. Fuse their "
            "rankings without replacing distinctive request terms with generic "
            "domain paraphrases."
        ),
    },
    "confidence-gated-fusion": {
        "family": "ranking",
        "instruction": (
            "Gate incumbent and alternative rank fusion with answer-independent "
            "agreement, overlap, and score-margin signals. Preserve the "
            "incumbent order when confidence is high and use the alternative "
            "only when observable disagreement justifies the added signal."
        ),
    },
    "evidence-copy-integrity": {
        "family": "evidence",
        "instruction": (
            "Make evidence identity propagation fail closed: copy source, "
            "record, path, locator, and digest values only from verified helper "
            "output, validate them before synthesis, and reject any retyped or "
            "unbound evidence row."
        ),
    },
    "coverage-led-synthesis": {
        "family": "synthesis",
        "instruction": (
            "Drive synthesis from a verified coverage map of the requested "
            "comparison arms. Require exact support for every material arm, "
            "reuse a bounded evidence union, and report unsupported gaps "
            "instead of filling them from model memory."
        ),
    },
    "calibrated-abstention": {
        "family": "calibration",
        "instruction": (
            "Separate direct support, bounded inference, uncertainty, and "
            "abstention with observable evidence thresholds. Refuse unsupported "
            "claims and preserve the caller's requested answer-source policy."
        ),
    },
    "cost-aware-signal-routing": {
        "family": "efficiency",
        "instruction": (
            "Use cheap deterministic confidence signals first and invoke "
            "costlier retrieval or synthesis signals only when bounded "
            "agreement is insufficient. Preserve quality gates, exact evidence, "
            "and deterministic fallback behavior."
        ),
    },
    "conservative-regression-gate": {
        "family": "robustness",
        "instruction": (
            "Keep the incumbent behavior as an explicit conservative branch. "
            "Adopt a candidate behavior only under answer-independent signals "
            "that justify the change, and preserve per-case non-regression, "
            "evidence gates, deterministic fallback, and bounded cost."
        ),
    },
    "deterministic-response-finalization": {
        "family": "response-contract",
        "instruction": (
            "Finalize the public response through one deterministic contract "
            "check after evidence selection. Validate required fields, complete "
            "structure, evidence references, and terminal output before "
            "emission; fail closed instead of attempting an unverified repair."
        ),
    },
}

FAILURE_TO_OPERATOR = {
    "knowledge-surface-gap": "knowledge-surface-enrichment",
    "relevant-evidence-missing": "bounded-coverage-expansion",
    "relevant-evidence-late": "early-rank-calibration",
    "query-intent-dilution": "anchor-facet-separation",
    "ranking-disagreement": "confidence-gated-fusion",
    "evidence-identity-risk": "evidence-copy-integrity",
    "answer-coverage-gap": "coverage-led-synthesis",
    "abstention-calibration-gap": "calibrated-abstention",
    "latency-budget-pressure": "cost-aware-signal-routing",
    "case-regression": "conservative-regression-gate",
    "response-contract-failure": "deterministic-response-finalization",
}

DIMENSION_TO_OPERATOR = {
    "knowledge-coverage": "knowledge-surface-enrichment",
    "retrieval-breadth": "bounded-coverage-expansion",
    "ranking-discrimination": "early-rank-calibration",
    "evidence-fidelity": "evidence-copy-integrity",
    "synthesis-completeness": "coverage-led-synthesis",
    "calibration": "calibrated-abstention",
    "robustness": "conservative-regression-gate",
    "efficiency": "cost-aware-signal-routing",
}


class PlanError(ValueError):
    """Raised when a campaign or bound artifact is invalid."""


def strict_json_bytes(data: bytes, *, label: str) -> Any:
    """Parse strict UTF-8 JSON with duplicate members and special numbers denied."""

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PlanError(f"{label} is not UTF-8") from exc

    def pairs(rows: list[tuple[str, Any]]) -> OrderedDict[str, Any]:
        value: OrderedDict[str, Any] = OrderedDict()
        for key, item in rows:
            if key in value:
                raise PlanError(f"{label} contains duplicate key: {key}")
            value[key] = item
        return value

    def invalid_constant(value: str) -> None:
        raise PlanError(f"{label} contains non-finite number: {value}")

    try:
        return json.loads(
            text,
            object_pairs_hook=pairs,
            parse_constant=invalid_constant,
        )
    except json.JSONDecodeError as exc:
        raise PlanError(f"{label} is invalid JSON: {exc}") from exc


def canonical_bytes(value: Any) -> bytes:
    """Serialize one value for canonical hashing."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def pretty_bytes(value: Any) -> bytes:
    """Serialize one deterministic publication."""

    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    """Return one prefixed SHA-256."""

    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def sha256_file(path: Path) -> str:
    """Hash one regular file."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def is_reparse(path: Path) -> bool:
    """Return whether one node is a link or filesystem reparse point."""

    metadata = path.lstat()
    attributes = getattr(metadata, "st_file_attributes", 0)
    return path.is_symlink() or bool(attributes & REPARSE_POINT)


def reject_reparse_ancestors(path: Path, *, label: str) -> None:
    """Reject linked existing nodes on the lexical path."""

    absolute = Path(os.path.abspath(path))
    chain = list(reversed((absolute, *absolute.parents)))
    for node in chain:
        if not node.exists() and not node.is_symlink():
            continue
        if is_reparse(node):
            raise PlanError(f"{label} traverses a linked or reparse node: {node}")


def resolve_existing(path: Path, *, label: str, kind: str) -> Path:
    """Resolve one existing regular path after link checks."""

    reject_reparse_ancestors(path, label=label)
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise PlanError(f"{label} does not exist: {path}") from exc
    if kind == "file" and not resolved.is_file():
        raise PlanError(f"{label} is not a regular file: {path}")
    if kind == "directory" and not resolved.is_dir():
        raise PlanError(f"{label} is not a directory: {path}")
    return resolved


def tree_record(root: Path) -> dict[str, Any]:
    """Compute a canonical skill-tree record including empty directories."""

    root = resolve_existing(root, label="target skill", kind="directory")
    entries: list[tuple[bytes, str, Path]] = []
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        directory_names.sort(key=lambda value: value.encode("utf-8"))
        file_names.sort(key=lambda value: value.encode("utf-8"))
        for name in directory_names:
            path = current_path / name
            if is_reparse(path):
                raise PlanError(f"target skill contains linked directory: {path}")
            relative = path.relative_to(root).as_posix()
            entries.append((relative.encode("utf-8"), "directory", path))
        for name in file_names:
            path = current_path / name
            if is_reparse(path):
                raise PlanError(f"target skill contains linked file: {path}")
            if not path.is_file():
                raise PlanError(f"target skill contains non-regular node: {path}")
            relative = path.relative_to(root).as_posix()
            entries.append((relative.encode("utf-8"), "file", path))
    entries.sort(key=lambda row: (row[0], row[1]))

    digest = hashlib.sha256()
    file_count = 0
    directory_count = 0
    total_bytes = 0
    for relative, kind, path in entries:
        if kind == "directory":
            digest.update(b"D\0")
            digest.update(relative)
            digest.update(b"\0")
            directory_count += 1
        else:
            data = path.read_bytes()
            digest.update(b"F\0")
            digest.update(relative)
            digest.update(b"\0")
            digest.update(data)
            digest.update(b"\0")
            file_count += 1
            total_bytes += len(data)
    return {
        "treeSha256": f"sha256:{digest.hexdigest()}",
        "fileCount": file_count,
        "directoryCount": directory_count,
        "totalBytes": total_bytes,
    }


def read_skill_name(root: Path) -> str:
    """Read and validate exact SKILL.md frontmatter name."""

    skill_path = root / "SKILL.md"
    if not skill_path.is_file() or is_reparse(skill_path):
        raise PlanError("target skill lacks a regular SKILL.md")
    try:
        source = skill_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise PlanError("target SKILL.md is unreadable UTF-8") from exc
    match = FRONTMATTER.match(source)
    if match is None:
        raise PlanError("target SKILL.md lacks YAML frontmatter")
    name_match = FRONTMATTER_NAME.search(match.group("body"))
    if name_match is None:
        raise PlanError("target SKILL.md frontmatter lacks name")
    name = name_match.group("name").strip().strip("'\"")
    if SKILL_NAME.fullmatch(name) is None:
        raise PlanError(f"target skill has non-portable name: {name}")
    return name


def expect_mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PlanError(f"{label} must be an object")
    return value


def expect_list(value: Any, *, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise PlanError(f"{label} must be an array")
    return value


def exact_keys(
    value: Mapping[str, Any],
    *,
    label: str,
    required: set[str],
) -> None:
    observed = set(value)
    missing = sorted(required - observed)
    unknown = sorted(observed - required)
    if missing:
        raise PlanError(f"{label} is missing keys: {', '.join(missing)}")
    if unknown:
        raise PlanError(f"{label} has unknown keys: {', '.join(unknown)}")


def portable_id(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or PORTABLE_ID.fullmatch(value) is None:
        raise PlanError(f"{label} must be a portable opaque ID")
    return value


def digest_value(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or HEX_DIGEST.fullmatch(value) is None:
        raise PlanError(f"{label} must be sha256:<64 lowercase hex>")
    return value


def finite_number(value: Any, *, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PlanError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise PlanError(f"{label} must be finite")
    return result


def integer(value: Any, *, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise PlanError(f"{label} must be an integer")
    if value < minimum or value > maximum:
        raise PlanError(f"{label} must be in {minimum}..{maximum}")
    return value


def resolve_from(config_path: Path, raw: Any, *, label: str) -> tuple[str, Path]:
    if not isinstance(raw, str) or not raw.strip():
        raise PlanError(f"{label} must be a non-empty path string")
    declared = raw.replace("\\", "/")
    source = Path(raw)
    if not source.is_absolute():
        source = config_path.parent / source
    return declared, Path(os.path.abspath(source))


def obviously_non_development(identifier: str, declared_path: str) -> bool:
    """Reject obvious holdout or private-test evidence labels."""

    normalized = f"{identifier}/{declared_path}".lower().replace("\\", "/")
    tokens = re.split(r"[^a-z0-9]+", normalized)
    return "holdout" in tokens or "private" in tokens or "hardevidence" in tokens


def parse_campaign(config_path: Path) -> dict[str, Any]:
    """Parse, bind, and normalize one campaign."""

    config_path = resolve_existing(config_path, label="campaign config", kind="file")
    config_bytes = config_path.read_bytes()
    root = expect_mapping(
        strict_json_bytes(config_bytes, label="campaign config"),
        label="campaign config",
    )
    exact_keys(root, label="campaign config", required={"schemaVersion", "campaign"})
    if root["schemaVersion"] != SCHEMA_VERSION:
        raise PlanError(f"unsupported schemaVersion: {root['schemaVersion']!r}")
    campaign = expect_mapping(root["campaign"], label="campaign")
    exact_keys(
        campaign,
        label="campaign",
        required={
            "id",
            "targetSkill",
            "expectedTargetTreeSha256",
            "outputPath",
            "developmentEvidence",
            "expertiseDimensions",
            "gaps",
            "portfolio",
            "evaluation",
        },
    )
    campaign_id = portable_id(campaign["id"], label="campaign.id")

    target_declared, target_path = resolve_from(
        config_path,
        campaign["targetSkill"],
        label="campaign.targetSkill",
    )
    target_path = resolve_existing(target_path, label="target skill", kind="directory")
    expected_tree = digest_value(
        campaign["expectedTargetTreeSha256"],
        label="campaign.expectedTargetTreeSha256",
    )
    target_tree = tree_record(target_path)
    if target_tree["treeSha256"] != expected_tree:
        raise PlanError(
            "target skill tree digest mismatch: "
            f"expected {expected_tree}, observed {target_tree['treeSha256']}"
        )
    target_name = read_skill_name(target_path)

    output_declared, output_path = resolve_from(
        config_path,
        campaign["outputPath"],
        label="campaign.outputPath",
    )
    reject_reparse_ancestors(output_path.parent, label="campaign.outputPath")
    try:
        output_path.relative_to(target_path)
    except ValueError:
        pass
    else:
        raise PlanError("campaign.outputPath must be outside the target skill")

    evidence_rows = expect_list(
        campaign["developmentEvidence"],
        label="campaign.developmentEvidence",
    )
    if not evidence_rows:
        raise PlanError("campaign.developmentEvidence must not be empty")
    evidence: list[dict[str, Any]] = []
    evidence_ids: set[str] = set()
    for index, raw_row in enumerate(evidence_rows):
        row = expect_mapping(raw_row, label=f"developmentEvidence[{index}]")
        exact_keys(
            row,
            label=f"developmentEvidence[{index}]",
            required={"id", "role", "path", "sha256", "sanitized"},
        )
        identifier = portable_id(row["id"], label=f"developmentEvidence[{index}].id")
        if identifier in evidence_ids:
            raise PlanError(f"duplicate development evidence id: {identifier}")
        evidence_ids.add(identifier)
        if row["role"] != "development":
            raise PlanError(f"development evidence {identifier} must have role development")
        if row["sanitized"] is not True:
            raise PlanError(f"development evidence {identifier} must declare sanitized true")
        declared_path, source_path = resolve_from(
            config_path,
            row["path"],
            label=f"development evidence {identifier} path",
        )
        if obviously_non_development(identifier, declared_path):
            raise PlanError(
                f"development evidence {identifier} has an obvious non-development label"
            )
        source_path = resolve_existing(
            source_path,
            label=f"development evidence {identifier}",
            kind="file",
        )
        expected_sha = digest_value(
            row["sha256"],
            label=f"development evidence {identifier} sha256",
        )
        observed_sha = sha256_file(source_path)
        if observed_sha != expected_sha:
            raise PlanError(
                f"development evidence {identifier} digest mismatch: "
                f"expected {expected_sha}, observed {observed_sha}"
            )
        evidence.append(
            {
                "id": identifier,
                "role": "development",
                "path": declared_path,
                "sha256": observed_sha,
                "bytes": source_path.stat().st_size,
                "sanitized": True,
            }
        )

    dimension_rows = expect_list(
        campaign["expertiseDimensions"],
        label="campaign.expertiseDimensions",
    )
    if len(dimension_rows) < 3:
        raise PlanError("declare at least three expertise dimensions")
    dimensions: list[dict[str, Any]] = []
    dimension_ids: set[str] = set()
    for index, raw_row in enumerate(dimension_rows):
        row = expect_mapping(raw_row, label=f"expertiseDimensions[{index}]")
        exact_keys(
            row,
            label=f"expertiseDimensions[{index}]",
            required={"id", "objective", "priority", "metricKeys"},
        )
        identifier = portable_id(row["id"], label=f"expertiseDimensions[{index}].id")
        if identifier not in DIMENSIONS:
            raise PlanError(f"unknown expertise dimension: {identifier}")
        if identifier in dimension_ids:
            raise PlanError(f"duplicate expertise dimension: {identifier}")
        dimension_ids.add(identifier)
        objective = row["objective"]
        if objective not in OBJECTIVES:
            raise PlanError(f"invalid objective for dimension {identifier}: {objective!r}")
        priority = integer(
            row["priority"],
            label=f"expertise dimension {identifier} priority",
            minimum=1,
            maximum=5,
        )
        metric_values = expect_list(
            row["metricKeys"],
            label=f"expertise dimension {identifier} metricKeys",
        )
        if not metric_values:
            raise PlanError(f"expertise dimension {identifier} requires metricKeys")
        metric_keys = [
            portable_id(item, label=f"expertise dimension {identifier} metric key")
            for item in metric_values
        ]
        if len(metric_keys) != len(set(metric_keys)):
            raise PlanError(f"expertise dimension {identifier} repeats metricKeys")
        dimensions.append(
            {
                "id": identifier,
                "objective": objective,
                "priority": priority,
                "metricKeys": metric_keys,
            }
        )
    for required_dimension in ("evidence-fidelity", "robustness"):
        if required_dimension not in dimension_ids:
            raise PlanError(f"required expertise dimension absent: {required_dimension}")
    dimensions.sort(key=lambda row: (-row["priority"], row["id"]))

    gap_rows = expect_list(campaign["gaps"], label="campaign.gaps")
    if not gap_rows:
        raise PlanError("campaign.gaps must not be empty")
    gaps: list[dict[str, Any]] = []
    gap_ids: set[str] = set()
    for index, raw_row in enumerate(gap_rows):
        row = expect_mapping(raw_row, label=f"gaps[{index}]")
        exact_keys(
            row,
            label=f"gaps[{index}]",
            required={
                "id",
                "failureMode",
                "severity",
                "dimensionIds",
                "evidenceIds",
                "caseIds",
            },
        )
        identifier = portable_id(row["id"], label=f"gaps[{index}].id")
        if identifier in gap_ids:
            raise PlanError(f"duplicate gap id: {identifier}")
        gap_ids.add(identifier)
        failure_mode = row["failureMode"]
        if failure_mode not in FAILURE_MODES:
            raise PlanError(f"unknown failure mode for gap {identifier}: {failure_mode!r}")
        severity = finite_number(row["severity"], label=f"gap {identifier} severity")
        if severity < 0.0 or severity > 1.0:
            raise PlanError(f"gap {identifier} severity must be in 0..1")
        raw_dimensions = expect_list(
            row["dimensionIds"],
            label=f"gap {identifier} dimensionIds",
        )
        if not raw_dimensions:
            raise PlanError(f"gap {identifier} requires dimensionIds")
        gap_dimensions = [
            portable_id(item, label=f"gap {identifier} dimension id")
            for item in raw_dimensions
        ]
        if len(gap_dimensions) != len(set(gap_dimensions)):
            raise PlanError(f"gap {identifier} repeats dimensionIds")
        unknown_dimensions = sorted(set(gap_dimensions) - dimension_ids)
        if unknown_dimensions:
            raise PlanError(
                f"gap {identifier} references undeclared dimensions: "
                f"{', '.join(unknown_dimensions)}"
            )
        raw_evidence = expect_list(
            row["evidenceIds"],
            label=f"gap {identifier} evidenceIds",
        )
        if not raw_evidence:
            raise PlanError(f"gap {identifier} requires evidenceIds")
        gap_evidence = [
            portable_id(item, label=f"gap {identifier} evidence id")
            for item in raw_evidence
        ]
        if len(gap_evidence) != len(set(gap_evidence)):
            raise PlanError(f"gap {identifier} repeats evidenceIds")
        unknown_evidence = sorted(set(gap_evidence) - evidence_ids)
        if unknown_evidence:
            raise PlanError(
                f"gap {identifier} references unknown evidence: "
                f"{', '.join(unknown_evidence)}"
            )
        raw_cases = expect_list(row["caseIds"], label=f"gap {identifier} caseIds")
        if not raw_cases:
            raise PlanError(f"gap {identifier} requires opaque caseIds")
        case_ids = [
            portable_id(item, label=f"gap {identifier} case id")
            for item in raw_cases
        ]
        if len(case_ids) != len(set(case_ids)):
            raise PlanError(f"gap {identifier} repeats caseIds")
        gaps.append(
            {
                "id": identifier,
                "failureMode": failure_mode,
                "severity": severity,
                "dimensionIds": sorted(gap_dimensions),
                "evidenceIds": sorted(gap_evidence),
                "caseIds": sorted(case_ids),
            }
        )
    gaps.sort(key=lambda row: (-row["severity"], row["id"]))

    portfolio = expect_mapping(campaign["portfolio"], label="campaign.portfolio")
    exact_keys(
        portfolio,
        label="campaign.portfolio",
        required={"minimumOperators", "maximumOperators", "includeConservative"},
    )
    minimum_operators = integer(
        portfolio["minimumOperators"],
        label="portfolio.minimumOperators",
        minimum=3,
        maximum=8,
    )
    maximum_operators = integer(
        portfolio["maximumOperators"],
        label="portfolio.maximumOperators",
        minimum=3,
        maximum=8,
    )
    if minimum_operators > maximum_operators:
        raise PlanError("portfolio.minimumOperators exceeds maximumOperators")
    if not isinstance(portfolio["includeConservative"], bool):
        raise PlanError("portfolio.includeConservative must be Boolean")

    evaluation = expect_mapping(campaign["evaluation"], label="campaign.evaluation")
    exact_keys(
        evaluation,
        label="campaign.evaluation",
        required={
            "developmentSplitId",
            "selectionMechanism",
            "requiredRewardKeys",
            "allowCaseRegressions",
            "minimumOperatorTrials",
            "holdout",
        },
    )
    development_split = portable_id(
        evaluation["developmentSplitId"],
        label="evaluation.developmentSplitId",
    )
    mechanism = evaluation["selectionMechanism"]
    if mechanism not in SELECTION_MECHANISMS:
        raise PlanError(f"unsupported selection mechanism: {mechanism!r}")
    reward_values = expect_list(
        evaluation["requiredRewardKeys"],
        label="evaluation.requiredRewardKeys",
    )
    if not reward_values:
        raise PlanError("evaluation.requiredRewardKeys must not be empty")
    reward_keys = [
        portable_id(item, label="evaluation required reward key")
        for item in reward_values
    ]
    if len(reward_keys) != len(set(reward_keys)):
        raise PlanError("evaluation.requiredRewardKeys contains duplicates")
    if not isinstance(evaluation["allowCaseRegressions"], bool):
        raise PlanError("evaluation.allowCaseRegressions must be Boolean")
    minimum_operator_trials = integer(
        evaluation["minimumOperatorTrials"],
        label="evaluation.minimumOperatorTrials",
        minimum=2,
        maximum=1000,
    )
    holdout = expect_mapping(evaluation["holdout"], label="evaluation.holdout")
    exact_keys(
        holdout,
        label="evaluation.holdout",
        required={"status", "splitId"},
    )
    holdout_status = holdout["status"]
    if holdout_status not in {"frozen-unopened", "unavailable"}:
        raise PlanError("evaluation.holdout.status is invalid")
    if holdout_status == "frozen-unopened":
        holdout_split = portable_id(
            holdout["splitId"],
            label="evaluation.holdout.splitId",
        )
        if holdout_split == development_split:
            raise PlanError("development and holdout split IDs must differ")
    else:
        if holdout["splitId"] is not None:
            raise PlanError("unavailable holdout requires splitId null")
        holdout_split = None

    return {
        "configPath": config_path,
        "configSha256": sha256_bytes(config_bytes),
        "campaignId": campaign_id,
        "target": {
            "path": target_declared,
            "logicalName": target_name,
            **target_tree,
        },
        "targetPath": target_path,
        "outputPath": output_path,
        "outputDeclared": output_declared,
        "developmentEvidence": sorted(evidence, key=lambda row: row["id"]),
        "expertiseDimensions": dimensions,
        "gaps": gaps,
        "portfolio": {
            "minimumOperators": minimum_operators,
            "maximumOperators": maximum_operators,
            "includeConservative": portfolio["includeConservative"],
        },
        "evaluation": {
            "developmentSplitId": development_split,
            "selectionMechanism": mechanism,
            "requiredRewardKeys": sorted(reward_keys),
            "allowCaseRegressions": evaluation["allowCaseRegressions"],
            "minimumOperatorTrials": minimum_operator_trials,
            "holdout": {
                "status": holdout_status,
                "splitId": holdout_split,
            },
        },
    }


def operator_portfolio(campaign: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Derive one bounded, deterministic operator portfolio."""

    selected: dict[str, dict[str, Any]] = {}

    def add_operator(
        operator_id: str,
        *,
        gap: Mapping[str, Any] | None = None,
        dimension: Mapping[str, Any] | None = None,
        mandatory: bool = False,
    ) -> None:
        library = OPERATOR_LIBRARY[operator_id]
        row = selected.setdefault(
            operator_id,
            {
                "operatorId": operator_id,
                "family": library["family"],
                "instruction": library["instruction"],
                "origin": "fixed-knowledge-expertise-library-v1",
                "coveredGapIds": set(),
                "coveredFailureModes": set(),
                "dimensionIds": set(),
                "evidenceIds": set(),
                "caseIds": set(),
                "maximumSeverity": 0.0,
                "maximumDimensionPriority": 0,
                "mandatory": False,
            },
        )
        row["mandatory"] = row["mandatory"] or mandatory
        if gap is not None:
            row["coveredGapIds"].add(gap["id"])
            row["coveredFailureModes"].add(gap["failureMode"])
            row["dimensionIds"].update(gap["dimensionIds"])
            row["evidenceIds"].update(gap["evidenceIds"])
            row["caseIds"].update(gap["caseIds"])
            row["maximumSeverity"] = max(row["maximumSeverity"], gap["severity"])
        if dimension is not None:
            row["dimensionIds"].add(dimension["id"])
            row["maximumDimensionPriority"] = max(
                row["maximumDimensionPriority"],
                dimension["priority"],
            )

    for gap in campaign["gaps"]:
        add_operator(FAILURE_TO_OPERATOR[gap["failureMode"]], gap=gap)
    if campaign["portfolio"]["includeConservative"]:
        robustness = next(
            row
            for row in campaign["expertiseDimensions"]
            if row["id"] == "robustness"
        )
        add_operator(
            "conservative-regression-gate",
            dimension=robustness,
            mandatory=True,
        )

    dimensions = campaign["expertiseDimensions"]
    for dimension in dimensions:
        if len(selected) >= campaign["portfolio"]["minimumOperators"]:
            break
        add_operator(DIMENSION_TO_OPERATOR[dimension["id"]], dimension=dimension)

    fallback_order = (
        "bounded-coverage-expansion",
        "early-rank-calibration",
        "evidence-copy-integrity",
        "conservative-regression-gate",
        "cost-aware-signal-routing",
        "calibrated-abstention",
        "coverage-led-synthesis",
        "anchor-facet-separation",
    )
    for operator_id in fallback_order:
        if len(selected) >= campaign["portfolio"]["minimumOperators"]:
            break
        add_operator(operator_id)

    ranked = sorted(
        selected.values(),
        key=lambda row: (
            not row["mandatory"],
            -row["maximumSeverity"],
            -row["maximumDimensionPriority"],
            row["operatorId"],
        ),
    )
    retained = ranked[: campaign["portfolio"]["maximumOperators"]]
    if len(retained) < campaign["portfolio"]["minimumOperators"]:
        raise PlanError("operator library could not satisfy minimumOperators")
    if len({row["family"] for row in retained}) < 2:
        raise PlanError("operator portfolio must preserve at least two families")

    result: list[dict[str, Any]] = []
    for row in retained:
        result.append(
            {
                "operatorId": row["operatorId"],
                "family": row["family"],
                "instruction": row["instruction"],
                "origin": row["origin"],
                "coveredGapIds": sorted(row["coveredGapIds"]),
                "coveredFailureModes": sorted(row["coveredFailureModes"]),
                "dimensionIds": sorted(row["dimensionIds"]),
                "evidenceIds": sorted(row["evidenceIds"]),
                "caseIds": sorted(row["caseIds"]),
                "maximumSeverity": row["maximumSeverity"],
                "mandatory": row["mandatory"],
            }
        )
    return result


def build_plan(campaign: Mapping[str, Any]) -> dict[str, Any]:
    """Build one deterministic plan from validated bindings."""

    operators = operator_portfolio(campaign)
    holdout = campaign["evaluation"]["holdout"]
    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "schema": PLAN_SCHEMA,
        "state": "planned-fitness-unverified",
        "campaignId": campaign["campaignId"],
        "configSha256": campaign["configSha256"],
        "target": campaign["target"],
        "developmentEvidence": campaign["developmentEvidence"],
        "expertiseDimensions": campaign["expertiseDimensions"],
        "gaps": campaign["gaps"],
        "portfolio": {
            **campaign["portfolio"],
            "operatorCount": len(operators),
            "operators": operators,
        },
        "evaluationHandoff": {
            **campaign["evaluation"],
            "minimumCandidateCount": len(operators) + 1,
            "baselineRequired": True,
            "freshNativeHarborJobsRequired": True,
            "promotionEligible": holdout["status"] == "frozen-unopened",
            "claimScope": (
                "holdout-promotion-unverified"
                if holdout["status"] == "frozen-unopened"
                else "retrospective-development-only"
            ),
        },
        "boundaries": {
            "harborCalls": 0,
            "modelCalls": 0,
            "candidateBundlesCreated": 0,
            "candidateFitnessEvaluated": False,
            "candidateSelected": False,
            "holdoutOpened": False,
            "promotionPerformed": False,
            "rewardValuesRead": False,
            "semanticGapTruthVerified": False,
            "developmentOnlySanitizationVerified": False,
            "operatorInstructionsContainCaseIds": False,
            "sourceSkillModified": False,
        },
    }
    payload["planSha256"] = sha256_bytes(canonical_bytes(payload))
    return payload


def plan_command(config_path: Path) -> dict[str, Any]:
    """Publish one absent deterministic plan."""

    campaign = parse_campaign(config_path)
    output_path: Path = campaign["outputPath"]
    if output_path.exists() or output_path.is_symlink():
        raise PlanError(f"refusing to overwrite existing plan: {output_path}")
    plan = build_plan(campaign)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    reject_reparse_ancestors(output_path.parent, label="campaign.outputPath")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(output_path, flags, 0o644)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(pretty_bytes(plan))
    except BaseException:
        try:
            output_path.unlink(missing_ok=True)
        finally:
            raise
    return {
        "status": "pass",
        "mode": "planned",
        "campaignId": campaign["campaignId"],
        "operatorCount": plan["portfolio"]["operatorCount"],
        "planSha256": plan["planSha256"],
        "outputPath": campaign["outputDeclared"],
    }


def verify_command(config_path: Path) -> dict[str, Any]:
    """Recompute and verify one stored plan."""

    campaign = parse_campaign(config_path)
    output_path: Path = campaign["outputPath"]
    output_path = resolve_existing(output_path, label="stored plan", kind="file")
    observed = expect_mapping(
        strict_json_bytes(output_path.read_bytes(), label="stored plan"),
        label="stored plan",
    )
    expected = build_plan(campaign)
    if observed != expected:
        raise PlanError("stored plan differs from deterministic recomputation")
    stored_digest = observed.get("planSha256")
    unsigned = dict(observed)
    unsigned.pop("planSha256", None)
    recomputed_digest = sha256_bytes(canonical_bytes(unsigned))
    if stored_digest != recomputed_digest:
        raise PlanError("stored plan self-digest is invalid")
    return {
        "status": "pass",
        "mode": "verified",
        "campaignId": campaign["campaignId"],
        "operatorCount": observed["portfolio"]["operatorCount"],
        "planSha256": stored_digest,
        "outputPath": campaign["outputDeclared"],
    }


def digest_command(skill_path: Path) -> dict[str, Any]:
    """Return the canonical binding for one target skill."""

    resolved = resolve_existing(skill_path, label="target skill", kind="directory")
    return {
        "logicalName": read_skill_name(resolved),
        **tree_record(resolved),
    }


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    digest_parser = subparsers.add_parser("digest", help="Digest one target skill")
    digest_parser.add_argument("skill", type=Path)
    plan_parser = subparsers.add_parser("plan", help="Create one absent plan")
    plan_parser.add_argument("config", type=Path)
    verify_parser = subparsers.add_parser("verify", help="Verify one stored plan")
    verify_parser.add_argument("config", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run one planner command."""

    args = build_parser().parse_args(argv)
    try:
        if args.command == "digest":
            result = digest_command(args.skill)
        elif args.command == "plan":
            result = plan_command(args.config)
        else:
            result = verify_command(args.config)
    except (OSError, UnicodeError, PlanError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
