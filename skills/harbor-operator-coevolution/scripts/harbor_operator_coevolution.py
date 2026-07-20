# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "pyyaml>=6,<7"]
# ///
"""Coevolve mutation operators from native Harbor candidate jobs."""

from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import stat
import subprocess
from collections import Counter, defaultdict
from importlib.metadata import version
from pathlib import Path
from typing import Any, Iterable
from uuid import UUID

import yaml
from harbor import Job
from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock
from harbor.models.job.result import JobResult
from harbor.models.trial.result import TrialResult
from harbor.skills import compute_skill_digest


OUTPUT_FILES = {
    "evidence": "generation-evidence.json",
    "candidates": "candidate-ranking.json",
    "operators": "operator-ranking.json",
    "breeding": "breeding-plan.json",
    "repair": "repair-plan.json",
    "holdout": "holdout-promotion.json",
    "log": "operator-coevolution-log.json",
    "report": "report.md",
}

PORTABLE_SKILL_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
RESERVED_SKILL_NAMES = {
    "aux",
    "con",
    "nul",
    "prn",
    *(f"com{index}" for index in range(1, 10)),
    *(f"lpt{index}" for index in range(1, 10)),
}

NON_EVALUABLE_FAILURE_DOMAINS = {
    "authentication",
    "environment",
    "evaluator",
    "infrastructure",
    "provider",
}

FAILURE_SIGNAL_ALIASES = {
    "authentication": (
        "auth-",
        "credential-",
        "invalid-api-key",
        "missing-api-key",
        "unauthorized",
    ),
    "environment": (
        "container-",
        "docker-",
        "environment-",
        "runtime-environment-",
    ),
    "evaluator": (
        "evaluation-",
        "evaluator-",
        "verifier-",
    ),
    "infrastructure": (
        "infra-",
        "infrastructure-",
        "platform-",
    ),
    "provider": (
        "api-overloaded",
        "api-unavailable",
        "context-length-",
        "context-limit-",
        "context-window-",
        "insufficient-quota",
        "model-not-found",
        "provider-",
        "quota-",
        "rate-limit-",
        "service-unavailable",
    ),
}

# These are candidate-failure dispositions, not external-retry contracts. Keep
# the allowlist code-owned and versioned so a generation config cannot turn a
# transient provider, authentication, environment, evaluator, or
# infrastructure outage into a scored candidate result. Every configured
# contract is sealed into the evolution profile when enabled.
CANDIDATE_ATTRIBUTABLE_DIAGNOSTIC_CONTRACTS = {
    "provider-context-limit.v1": {
        "status": "provider-failure",
        "failure_domain": "provider",
        "terminal_outcome": "provider-context-limit",
        "error_code": "context_length_exceeded",
    },
}


def require_mapping(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{location} must be a mapping.")
    return value


def require_list(value: Any, location: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{location} must be a list.")
    return value


def require_string(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{location} must be a non-empty string.")
    return value.strip()


def require_positive_integer(value: Any, location: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{location} must be a positive integer.")
    return value


def normalize_required_rewards(value: Any) -> dict[str, float]:
    mapping = require_mapping(
        value if value is not None else {}, "harbor.requiredRewards"
    )
    normalized: dict[str, float] = {}
    for raw_key, raw_threshold in mapping.items():
        if (
            not isinstance(raw_key, str)
            or not raw_key.strip()
            or any(character.isspace() for character in raw_key.strip())
        ):
            raise ValueError(
                "harbor.requiredRewards keys must be non-empty strings without whitespace."
            )
        key = raw_key.strip()
        if isinstance(raw_threshold, bool) or not isinstance(
            raw_threshold, (int, float)
        ):
            raise ValueError(
                f"harbor.requiredRewards.{key} threshold must be numeric."
            )
        threshold = float(raw_threshold)
        if not math.isfinite(threshold):
            raise ValueError(
                f"harbor.requiredRewards.{key} threshold must be finite."
            )
        normalized[key] = threshold
    return dict(sorted(normalized.items()))


def normalize_candidate_attributable_diagnostic_policy(value: Any) -> dict[str, Any]:
    if value is None:
        return {"contracts": []}
    policy = require_mapping(
        value, "harbor.candidateAttributableDiagnosticPolicy"
    )
    unknown_keys = sorted(set(policy) - {"contracts"})
    if unknown_keys:
        raise ValueError(
            "harbor.candidateAttributableDiagnosticPolicy has unknown keys: "
            + ", ".join(unknown_keys)
        )
    contracts = [
        require_string(
            item,
            "harbor.candidateAttributableDiagnosticPolicy.contracts",
        )
        for item in require_list(
            policy.get("contracts", []),
            "harbor.candidateAttributableDiagnosticPolicy.contracts",
        )
    ]
    if len(contracts) != len(set(contracts)):
        raise ValueError(
            "harbor.candidateAttributableDiagnosticPolicy.contracts must be unique."
        )
    unsupported = sorted(
        set(contracts) - set(CANDIDATE_ATTRIBUTABLE_DIAGNOSTIC_CONTRACTS)
    )
    if unsupported:
        raise ValueError(
            "Unsupported candidate-attributable diagnostic contracts: "
            + ", ".join(unsupported)
        )
    ordered = sorted(contracts)
    if not ordered:
        return {"contracts": []}
    definitions = {
        contract_id: CANDIDATE_ATTRIBUTABLE_DIAGNOSTIC_CONTRACTS[contract_id]
        for contract_id in ordered
    }
    return {
        "contracts": ordered,
        "contractDefinitionsDigest": stable_digest(definitions),
    }


def assert_not_reparse_root(directory: Path, location: str) -> None:
    try:
        metadata = directory.lstat()
    except FileNotFoundError:
        return
    except OSError as error:
        raise ValueError(f"Cannot inspect {location} root {directory}: {error}") from error
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    is_junction = bool(getattr(directory, "is_junction", lambda: False)())
    if (
        directory.is_symlink()
        or is_junction
        or bool(getattr(metadata, "st_file_attributes", 0) & reparse_flag)
    ):
        raise ValueError(
            f"{location} root must not be a symbolic link, junction, or reparse "
            f"point: {directory}"
        )


def assert_self_contained_bundle(directory: Path, location: str) -> None:
    assert_not_reparse_root(directory, location)
    root = directory.resolve()
    if not root.is_dir():
        raise ValueError(f"{location} must be a skill directory: {directory}")
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    for current, directories, files in os.walk(root, followlinks=False):
        for name in [*directories, *files]:
            entry = Path(current) / name
            try:
                metadata = entry.lstat()
                is_junction = bool(
                    getattr(entry, "is_junction", lambda: False)()
                )
            except OSError as error:
                raise ValueError(
                    f"Cannot inspect {location} entry {entry}: {error}"
                ) from error
            if (
                entry.is_symlink()
                or is_junction
                or bool(getattr(metadata, "st_file_attributes", 0) & reparse_flag)
            ):
                raise ValueError(
                    f"{location} must be self-contained; links and reparse points "
                    f"are not allowed: {entry}"
                )


def resolve_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    return raw.resolve() if raw.is_absolute() else (base / raw).resolve()


def resolve_bundle_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    unresolved = raw if raw.is_absolute() else base / raw
    assert_not_reparse_root(unresolved, location)
    return unresolved.resolve()


def read_document(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"File does not exist: {path}") from error
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML or JSON in {path}: {error}") from error
    return require_mapping(value, str(path))


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Required Harbor artifact is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in Harbor artifact {path}: {error}") from error
    return require_mapping(value, str(path))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def parse_skill_name(skill_directory: Path) -> str:
    skill_path = skill_directory / "SKILL.md"
    try:
        text = skill_path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"Candidate skill has no SKILL.md: {skill_directory}") from error
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError(f"Candidate SKILL.md lacks YAML frontmatter: {skill_path}")
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid candidate frontmatter in {skill_path}: {error}") from error
    raw_name = require_mapping(frontmatter, f"frontmatter in {skill_path}").get("name")
    name = require_string(
        raw_name,
        f"frontmatter.name in {skill_path}",
    )
    if (
        raw_name != name
        or not PORTABLE_SKILL_NAME.fullmatch(name)
        or name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(
            "SKILL.md frontmatter.name must be an exact portable skill basename "
            "(1-64 lowercase letters, digits, or interior hyphens): "
            f"{skill_path}: {name!r}."
        )
    return name


def skill_line_count(skill_directory: Path) -> int:
    return len((skill_directory / "SKILL.md").read_text(encoding="utf-8").splitlines())


def normalize_job_reference(
    raw: dict[str, Any],
    base: Path,
    location: str,
    *,
    resolve_references: bool = True,
) -> dict[str, Path | None]:
    def reference_path(value: Any, field: str) -> Path:
        if resolve_references:
            return resolve_path(base, value, field)
        path = Path(str(value)).expanduser()
        return path if path.is_absolute() else base / path

    job_config = (
        reference_path(raw["jobConfig"], f"{location}.jobConfig")
        if raw.get("jobConfig") is not None
        else None
    )
    job_directory = (
        reference_path(raw["jobDirectory"], f"{location}.jobDirectory")
        if raw.get("jobDirectory") is not None
        else None
    )
    if job_config is None and job_directory is None:
        raise ValueError(f"{location} requires jobConfig or jobDirectory.")
    return {"jobConfig": job_config, "jobDirectory": job_directory}


def opaque_job_reference_projection(
    raw: dict[str, Any], base: Path, location: str
) -> dict[str, str | None]:
    """Canonically bind declared paths without resolving or reading their targets."""

    def lexical_path(value: Any, field: str) -> str | None:
        if value is None:
            return None
        path = Path(require_string(value, field)).expanduser()
        declared = path if path.is_absolute() else base / path
        return os.path.normcase(os.path.abspath(os.path.normpath(str(declared))))

    return {
        "jobConfig": lexical_path(raw.get("jobConfig"), f"{location}.jobConfig"),
        "jobDirectory": lexical_path(
            raw.get("jobDirectory"), f"{location}.jobDirectory"
        ),
    }


def normalize_config(config_path: Path, output_override: Path | None) -> dict[str, Any]:
    raw = read_document(config_path)
    if raw.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1.")
    base = config_path.resolve().parent
    evolution = require_mapping(raw.get("evolution"), "evolution")
    harbor = require_mapping(raw.get("harbor", {}), "harbor")
    coevolution = require_mapping(raw.get("coevolution", {}), "coevolution")
    raw_generation = evolution.get("generation", 0)
    if isinstance(raw_generation, bool) or not isinstance(raw_generation, int):
        raise ValueError("evolution.generation must be a non-negative integer.")
    if raw_generation < 0:
        raise ValueError("evolution.generation must be a non-negative integer.")

    operators = []
    for index, item in enumerate(require_list(raw.get("operators"), "operators")):
        entry = require_mapping(item, f"operators[{index}]")
        operators.append(
            {
                "operatorId": require_string(
                    entry.get("operatorId"), f"operators[{index}].operatorId"
                ),
                "instruction": require_string(
                    entry.get("instruction"), f"operators[{index}].instruction"
                ),
                "parentOperatorIds": sorted(
                    require_string(parent, f"operators[{index}].parentOperatorIds")
                    for parent in require_list(
                        entry.get("parentOperatorIds", []),
                        f"operators[{index}].parentOperatorIds",
                    )
                ),
                "origin": require_string(
                    entry.get("origin", "seed"), f"operators[{index}].origin"
                ),
            }
        )
    if len(operators) < 2:
        raise ValueError("At least two operators are required for coevolution.")
    operator_ids = [entry["operatorId"] for entry in operators]
    if len(operator_ids) != len(set(operator_ids)):
        raise ValueError("operatorId values must be unique.")

    candidates = []
    for index, item in enumerate(require_list(raw.get("candidates"), "candidates")):
        entry = require_mapping(item, f"candidates[{index}]")
        candidate_id = require_string(
            entry.get("candidateId"), f"candidates[{index}].candidateId"
        )
        skill = resolve_bundle_path(
            base, entry.get("skill"), f"candidates[{index}].skill"
        )
        if not skill.is_dir():
            raise ValueError(f"Candidate skill directory does not exist: {skill}")
        assert_self_contained_bundle(skill, f"candidates[{index}].skill")
        skill_name = parse_skill_name(skill)
        parent_id = entry.get("parentCandidateId")
        operator_id = entry.get("operatorId")
        if (parent_id is None) != (operator_id is None):
            raise ValueError(
                f"Candidate {candidate_id} must provide both parentCandidateId and "
                "operatorId, or neither."
            )
        candidates.append(
            {
                "candidateId": candidate_id,
                "skill": skill,
                "skillName": skill_name,
                "skillDigest": compute_skill_digest(skill),
                "parentCandidateId": (
                    require_string(parent_id, f"candidates[{index}].parentCandidateId")
                    if parent_id is not None
                    else None
                ),
                "operatorId": (
                    require_string(operator_id, f"candidates[{index}].operatorId")
                    if operator_id is not None
                    else None
                ),
                **normalize_job_reference(entry, base, f"candidates[{index}]"),
            }
        )
    if len(candidates) < 2:
        raise ValueError("At least two candidates are required.")
    candidate_ids = [entry["candidateId"] for entry in candidates]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise ValueError("candidateId values must be unique.")
    candidate_id_set = set(candidate_ids)
    operator_id_set = set(operator_ids)
    for candidate in candidates:
        parent_id = candidate["parentCandidateId"]
        operator_id = candidate["operatorId"]
        if parent_id is not None and parent_id not in candidate_id_set:
            raise ValueError(
                f"Candidate {candidate['candidateId']} references unknown parent {parent_id}."
            )
        if parent_id == candidate["candidateId"]:
            raise ValueError(f"Candidate {parent_id} cannot be its own parent.")
        if operator_id is not None and operator_id not in operator_id_set:
            raise ValueError(
                f"Candidate {candidate['candidateId']} references unknown operator {operator_id}."
            )
    parent_by_candidate = {
        item["candidateId"]: item["parentCandidateId"] for item in candidates
    }
    for candidate_id in candidate_ids:
        visited: set[str] = set()
        current: str | None = candidate_id
        while current is not None:
            if current in visited:
                raise ValueError(
                    f"Candidate parent lineage contains a cycle at {current}."
                )
            visited.add(current)
            current = parent_by_candidate[current]
    if not any(entry["operatorId"] is not None for entry in candidates):
        raise ValueError("At least one generated child candidate is required.")
    children_by_operator_digest: dict[tuple[str, str], list[str]] = defaultdict(list)
    for candidate in candidates:
        if candidate["operatorId"] is not None:
            children_by_operator_digest[
                (candidate["operatorId"], candidate["skillDigest"])
            ].append(candidate["candidateId"])
    duplicate_child_bundles = [
        (operator_id, digest, sorted(candidate_ids))
        for (operator_id, digest), candidate_ids in children_by_operator_digest.items()
        if len(candidate_ids) > 1
    ]
    if duplicate_child_bundles:
        details = "; ".join(
            f"operator {operator_id} reuses {digest} for {', '.join(candidate_ids)}"
            for operator_id, digest, candidate_ids in sorted(duplicate_child_bundles)
        )
        raise ValueError(
            "Generated children attributed to the same operator must have distinct "
            f"skill digests; duplicate bundles are pseudoreplication: {details}."
        )

    baseline_id = require_string(
        evolution.get("baselineCandidateId"), "evolution.baselineCandidateId"
    )
    if baseline_id not in candidate_id_set:
        raise ValueError(f"Unknown baseline candidate: {baseline_id}")
    baseline_skill_name = next(
        item["skillName"] for item in candidates if item["candidateId"] == baseline_id
    )
    changed_names = [
        item["candidateId"]
        for item in candidates
        if item["skillName"] != baseline_skill_name
    ]
    if changed_names:
        raise ValueError(
            "All candidates must preserve the baseline skill name; changed: "
            + ", ".join(changed_names)
        )
    baseline_candidate = next(
        item for item in candidates if item["candidateId"] == baseline_id
    )
    if baseline_candidate["parentCandidateId"] is not None:
        raise ValueError("The baseline candidate must be a root candidate.")

    required_env = harbor.get("requiredEnv", [])
    if not isinstance(required_env, list) or any(
        not isinstance(name, str)
        or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name)
        for name in required_env
    ):
        raise ValueError("harbor.requiredEnv must contain portable variable names.")
    pass_threshold = float(harbor.get("passThreshold", 1))
    if not math.isfinite(pass_threshold):
        raise ValueError("harbor.passThreshold must be finite.")
    required_rewards = normalize_required_rewards(harbor.get("requiredRewards", {}))
    diagnostic_chars = int(harbor.get("diagnosticChars", 3000))
    if diagnostic_chars < 0 or diagnostic_chars > 20_000:
        raise ValueError("harbor.diagnosticChars must be in 0..20000.")
    candidate_attributable_diagnostic_policy = (
        normalize_candidate_attributable_diagnostic_policy(
            harbor.get("candidateAttributableDiagnosticPolicy")
        )
    )

    candidate_survivors = require_positive_integer(
        coevolution.get("candidateSurvivors", 2),
        "coevolution.candidateSurvivors",
    )
    operator_survivors = require_positive_integer(
        coevolution.get("operatorSurvivors", 2),
        "coevolution.operatorSurvivors",
    )
    next_operator_count = require_positive_integer(
        coevolution.get("nextOperatorCount", 6),
        "coevolution.nextOperatorCount",
    )
    minimum_operator_trials = require_positive_integer(
        coevolution.get("minimumOperatorTrials", 2),
        "coevolution.minimumOperatorTrials",
    )
    allow_case_regressions_for_credit = coevolution.get(
        "allowCaseRegressionsForCredit", False
    )
    if not isinstance(allow_case_regressions_for_credit, bool):
        raise ValueError(
            "coevolution.allowCaseRegressionsForCredit must be a boolean."
        )
    complementary_repair = coevolution.get("complementaryRepair", False)
    if not isinstance(complementary_repair, bool):
        raise ValueError("coevolution.complementaryRepair must be a boolean.")
    if operator_survivors < 2:
        raise ValueError("coevolution.operatorSurvivors must be at least 2.")
    if next_operator_count < operator_survivors:
        raise ValueError(
            "coevolution.nextOperatorCount must be at least operatorSurvivors."
        )

    holdout_raw = require_mapping(raw.get("holdout"), "holdout")
    holdout_entries = {}
    holdout_declaration_entries = {}
    for side in ("baseline", "candidate"):
        item = require_mapping(holdout_raw.get(side), f"holdout.{side}")
        candidate_id = require_string(
            item.get("candidateId"), f"holdout.{side}.candidateId"
        )
        if candidate_id not in candidate_id_set:
            raise ValueError(f"holdout.{side} references unknown candidate {candidate_id}.")
        holdout_entries[side] = {
            "candidateId": candidate_id,
            **normalize_job_reference(
                item,
                base,
                f"holdout.{side}",
                resolve_references=False,
            ),
        }
        holdout_declaration_entries[side] = {
            "candidateId": candidate_id,
            **opaque_job_reference_projection(item, base, f"holdout.{side}"),
        }
    if holdout_entries["baseline"]["candidateId"] != baseline_id:
        raise ValueError("holdout.baseline must use evolution.baselineCandidateId.")

    minimum_mean_gain = float(holdout_raw.get("minimumMeanGain", 0))
    if not math.isfinite(minimum_mean_gain):
        raise ValueError("holdout.minimumMeanGain must be finite.")
    allow_task_regressions = bool(holdout_raw.get("allowTaskRegressions", False))
    holdout_require_no_errors = bool(holdout_raw.get("requireNoErrors", True))
    holdout_declaration = {
        "schemaVersion": 2,
        "baseline": holdout_declaration_entries["baseline"],
        "candidateSlot": {
            "jobConfig": holdout_declaration_entries["candidate"]["jobConfig"],
            "jobDirectory": holdout_declaration_entries["candidate"][
                "jobDirectory"
            ],
        },
        "promotionPolicy": {
            "minimumMeanGain": minimum_mean_gain,
            "allowTaskRegressions": allow_task_regressions,
            "requireNoErrors": holdout_require_no_errors,
        },
    }
    output = (
        output_override.resolve()
        if output_override is not None
        else resolve_path(base, evolution.get("outputDir"), "evolution.outputDir")
    )
    for candidate in candidates:
        if output == candidate["skill"] or output.is_relative_to(candidate["skill"]):
            raise ValueError("evolution.outputDir must not be inside a candidate skill.")
        job_directory = candidate["jobDirectory"]
        if job_directory is not None and (
            output == job_directory or output.is_relative_to(job_directory)
        ):
            raise ValueError("evolution.outputDir must not be inside a Harbor job.")
    previous_generation_log = (
        resolve_path(
            base,
            evolution["previousGenerationLog"],
            "evolution.previousGenerationLog",
        )
        if evolution.get("previousGenerationLog") is not None
        else None
    )
    if raw_generation == 0 and previous_generation_log is not None:
        raise ValueError("Generation zero must not declare previousGenerationLog.")
    if raw_generation > 0 and previous_generation_log is None:
        raise ValueError(
            "evolution.previousGenerationLog is required after generation zero."
        )
    return {
        "schemaVersion": 1,
        "id": require_string(evolution.get("id"), "evolution.id"),
        "generation": raw_generation,
        "generationId": require_string(
            evolution.get("generationId"), "evolution.generationId"
        ),
        "previousGenerationLog": previous_generation_log,
        "outputDirectory": output,
        "baselineCandidateId": baseline_id,
        "harbor": {
            "rewardKey": require_string(
                harbor.get("rewardKey", "reward"), "harbor.rewardKey"
            ),
            "passThreshold": pass_threshold,
            "requiredRewards": required_rewards,
            "requireNoErrors": bool(harbor.get("requireNoErrors", True)),
            "requiredEnv": required_env,
            "diagnosticChars": diagnostic_chars,
            "candidateAttributableDiagnosticPolicy": (
                candidate_attributable_diagnostic_policy
            ),
        },
        "coevolution": {
            "candidateSurvivors": candidate_survivors,
            "operatorSurvivors": operator_survivors,
            "nextOperatorCount": next_operator_count,
            "minimumOperatorTrials": minimum_operator_trials,
            "allowCaseRegressionsForCredit": allow_case_regressions_for_credit,
            "complementaryRepair": complementary_repair,
        },
        "operators": operators,
        "candidates": candidates,
        "holdout": {
            **holdout_entries,
            "minimumMeanGain": minimum_mean_gain,
            "allowTaskRegressions": allow_task_regressions,
            "requireNoErrors": holdout_require_no_errors,
        },
        "holdoutDeclaration": holdout_declaration,
    }


def resolve_deferred_holdout_references(config: dict[str, Any]) -> None:
    """Resolve holdout paths only after development has selected a candidate."""

    for side in ("baseline", "candidate"):
        reference = config["holdout"][side]
        for field in ("jobConfig", "jobDirectory"):
            path = reference[field]
            if path is not None:
                reference[field] = path.resolve()
        job_directory = reference["jobDirectory"]
        if job_directory is not None and (
            config["outputDirectory"] == job_directory
            or config["outputDirectory"].is_relative_to(job_directory)
        ):
            raise ValueError("evolution.outputDir must not be inside a Harbor job.")


def resolve_local_path(base: Path, value: Any) -> Any:
    if not isinstance(value, str) or not value or "://" in value:
        return value
    path = Path(value).expanduser()
    return str(path.resolve() if path.is_absolute() else (base / path).resolve())


def load_native_job_config(path: Path) -> JobConfig:
    raw = read_document(path)
    base = path.parent
    if "job_name" not in raw or "jobs_dir" not in raw:
        raise ValueError(f"Native Harbor job config must declare job_name and jobs_dir: {path}")
    raw["jobs_dir"] = resolve_local_path(base, raw["jobs_dir"])
    for agent in raw.get("agents", []):
        if isinstance(agent, dict):
            agent["skills"] = [
                resolve_local_path(base, value) for value in agent.get("skills", [])
            ]
    for dataset in raw.get("datasets", []):
        if isinstance(dataset, dict) and dataset.get("path") is not None:
            dataset["path"] = resolve_local_path(base, dataset["path"])
    for task in raw.get("tasks", []):
        if isinstance(task, dict) and task.get("path") is not None:
            task["path"] = resolve_local_path(base, task["path"])
    raw["extra_instruction_paths"] = [
        resolve_local_path(base, value)
        for value in raw.get("extra_instruction_paths", [])
    ]
    config = JobConfig.model_validate(raw)
    validate_one_candidate_job(config, path)
    return config


def validate_one_candidate_job(config: JobConfig, source: Path) -> None:
    if len(config.agents) != 1:
        raise ValueError(f"One candidate per job requires exactly one agent: {source}")
    if len(config.agents[0].skills) != 1:
        raise ValueError(f"One candidate per job requires exactly one skill: {source}")
    if not config.tasks and not config.datasets:
        raise ValueError(
            f"Candidate job must declare at least one Harbor task or dataset: {source}"
        )
    if config.n_attempts < 1:
        raise ValueError(f"Candidate job n_attempts must be positive: {source}")
    if config.retry.max_retries != 0:
        raise ValueError(
            f"Candidate job retry.max_retries must be 0: {source}"
        )


def validate_job_config_skill(
    config: JobConfig, candidate: dict[str, Any], source: Path
) -> None:
    declared = Path(str(config.agents[0].skills[0])).resolve()
    if declared != candidate["skill"]:
        raise ValueError(
            f"Harbor job {source} installs {declared}, expected candidate skill "
            f"{candidate['skill']}."
        )


def staged_skill_path(container: Path, logical_name: str) -> Path:
    if (
        not PORTABLE_SKILL_NAME.fullmatch(logical_name)
        or logical_name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(f"Unsafe logical skill name: {logical_name!r}")
    skills_directory = (container / "skills").resolve()
    destination = skills_directory / logical_name
    if destination.parent != skills_directory or destination.name != logical_name:
        raise ValueError(
            f"Logical skill name escapes its staging directory: {logical_name!r}"
        )
    return destination


def stage_candidate_for_job(
    candidate: dict[str, Any], job_destination: Path
) -> Path:
    assert_self_contained_bundle(candidate["skill"], "source candidate skill")
    container = (
        job_destination.parent
        / ".harbor-operator-candidate-staging"
        / job_destination.name
    )
    destination = staged_skill_path(container, candidate["skillName"])
    if destination.exists():
        raise ValueError(
            f"Candidate staging destination already exists: {destination}"
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(candidate["skill"], destination, symlinks=True)
    assert_self_contained_bundle(destination, "staged candidate skill")
    staged_digest = compute_skill_digest(destination)
    if staged_digest != candidate["skillDigest"]:
        raise ValueError(
            "Staged candidate skill digest differs from its source: "
            f"{candidate['skillDigest']} != {staged_digest}: {destination}"
        )
    if parse_skill_name(destination) != candidate["skillName"]:
        raise ValueError(
            f"Staged candidate changed logical skill identity: {destination}"
        )
    return destination


def classify_evaluated_skill_identity(
    config: JobConfig,
    candidate: dict[str, Any],
    source: Path,
    *,
    allow_legacy_alias: bool,
) -> dict[str, Any]:
    declared = Path(str(config.agents[0].skills[0])).expanduser().resolve()
    logical_name = candidate["skillName"]
    if declared.name == logical_name:
        if not declared.is_dir():
            raise ValueError(
                f"Canonical evaluated skill directory does not exist: {declared}"
            )
        evaluated_digest = compute_skill_digest(declared)
        if evaluated_digest != candidate["skillDigest"]:
            raise ValueError(
                f"Canonical evaluated skill digest mismatch for candidate "
                f"{candidate['candidateId']}: {evaluated_digest} != "
                f"{candidate['skillDigest']}."
            )
        if allow_legacy_alias and declared != candidate["skill"]:
            return {
                "mode": "source-mismatch",
                "evaluatedSkill": declared,
                "promotionEligible": False,
                "exploratory": True,
                "reason": (
                    f"Analyze-only job evaluated canonical-looking source {declared}, "
                    f"not declared candidate source {candidate['skill']}."
                ),
            }
        return {
            "mode": "canonical",
            "evaluatedSkill": declared,
            "promotionEligible": True,
            "exploratory": False,
            "reason": None,
        }
    if declared == candidate["skill"] and allow_legacy_alias:
        return {
            "mode": "legacy-alias",
            "evaluatedSkill": declared,
            "promotionEligible": False,
            "exploratory": True,
            "reason": (
                f"Evaluated source basename {declared.name!r} differs from "
                f"frontmatter.name {logical_name!r}; legacy analyze-only artifact."
            ),
        }
    qualifier = (
        " Analyze-only accepts a legacy alias only when it is the declared "
        "candidate source, and such evidence is exploratory/non-promotable."
        if allow_legacy_alias
        else " Live execution requires the canonical staged basename."
    )
    raise ValueError(
        f"Harbor job {source} evaluates skill source {declared}, whose basename "
        f"must equal frontmatter.name {logical_name!r}.{qualifier}"
    )


def validate_locked_skill_identity(
    lock: JobLock,
    candidate: dict[str, Any],
    directory: Path,
    expected_source: Path,
    identity_mode: str,
) -> tuple[str, str, str]:
    expected_digest = candidate["skillDigest"]
    expected_name = candidate["skillName"]
    allowed_names = (
        {expected_name}
        if identity_mode == "canonical"
        else {expected_name, expected_source.name}
    )
    identities: set[tuple[str, str, str]] = set()
    for index, trial_lock in enumerate(lock.trials):
        if len(trial_lock.skills) != 1:
            raise ValueError(
                f"One candidate per job requires exactly one locked skill in "
                f"trial {index + 1} of {directory}."
            )
        locked = trial_lock.skills[0]
        if locked.digest != expected_digest:
            raise ValueError(
                f"Locked skill digest mismatch for candidate "
                f"{candidate['candidateId']}: Harbor has {locked.digest}, local "
                f"bundle has {expected_digest}."
            )
        locked_source = Path(str(locked.source)).expanduser().resolve()
        if locked_source != expected_source:
            raise ValueError(
                f"Locked skill source mismatch for candidate "
                f"{candidate['candidateId']}: Harbor has {locked_source}, expected "
                f"{expected_source}."
            )
        if locked.name not in allowed_names:
            raise ValueError(
                f"Locked skill name mismatch for candidate "
                f"{candidate['candidateId']}: Harbor has {locked.name!r}, expected "
                f"canonical frontmatter name {expected_name!r}"
                + (
                    f" or legacy source basename {expected_source.name!r}."
                    if identity_mode == "legacy-alias"
                    else "."
                )
            )
        if len(trial_lock.agent.skills) != 1:
            raise ValueError(
                f"One candidate per job requires exactly one agent skill in "
                f"trial {index + 1} of {directory}."
            )
        agent_source = Path(str(trial_lock.agent.skills[0])).expanduser().resolve()
        if agent_source != expected_source or agent_source != locked_source:
            raise ValueError(
                f"Trial-lock agent skill source mismatch for candidate "
                f"{candidate['candidateId']} in trial {index + 1} of {directory}."
            )
        identities.add((locked.name, str(locked_source), locked.digest))
    if len(identities) != 1:
        raise ValueError(
            f"One candidate per job requires one locked skill identity in {directory}."
        )
    return next(iter(identities))


def expected_job_directory(config: JobConfig) -> Path:
    return Path(config.jobs_dir).resolve() / config.job_name


async def execute_native_job(job_config_path: Path, candidate: dict[str, Any]) -> Path:
    config = load_native_job_config(job_config_path)
    validate_job_config_skill(config, candidate, job_config_path)
    destination = expected_job_directory(config)
    if destination.exists():
        raise ValueError(
            f"Refusing to overwrite or resume existing Harbor job: {destination}"
        )
    staged_skill = stage_candidate_for_job(candidate, destination)
    runtime_config = config.model_copy(deep=True)
    runtime_config.agents[0].skills = [staged_skill]
    job = await Job.create(runtime_config)
    await job.run()
    if not (destination / "result.json").is_file():
        raise ValueError(f"Harbor did not produce a completed job result: {destination}")
    return destination


def run_check(command: list[str]) -> str:
    if shutil.which(command[0]) is None:
        raise ValueError(f"Required executable is not on PATH: {command[0]}")
    completed = subprocess.run(
        command, capture_output=True, text=True, timeout=20, check=False
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise ValueError(f"Preflight failed for {' '.join(command)}: {detail}")
    return completed.stdout.strip() or "ready"


def public_plan(config: dict[str, Any], phase: str = "full") -> dict[str, Any]:
    return {
        "mode": "dry-run",
        "phase": phase,
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generation": config["generation"],
        "generationId": config["generationId"],
        "previousGenerationLog": (
            str(config["previousGenerationLog"])
            if config["previousGenerationLog"] is not None
            else None
        ),
        "outputDirectory": str(config["outputDirectory"]),
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        **(
            {
                "candidateAttributableDiagnosticPolicy": config["harbor"][
                    "candidateAttributableDiagnosticPolicy"
                ]
            }
            if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                "contracts"
            ]
            else {}
        ),
        "requiredEnv": config["harbor"]["requiredEnv"],
        "minimumOperatorTrials": config["coevolution"]["minimumOperatorTrials"],
        "allowCaseRegressionsForCredit": config["coevolution"][
            "allowCaseRegressionsForCredit"
        ],
        "complementaryRepair": config["coevolution"]["complementaryRepair"],
        "missingRequiredEnv": [
            name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
        ],
        "candidates": [
            {
                "candidateId": item["candidateId"],
                "parentCandidateId": item["parentCandidateId"],
                "operatorId": item["operatorId"],
                "skill": str(item["skill"]),
                "skillName": item["skillName"],
                "skillDigest": item["skillDigest"],
                "liveIdentityMode": "canonical-staged",
                "jobConfig": str(item["jobConfig"]) if item["jobConfig"] else None,
                "jobDirectory": (
                    str(item["jobDirectory"]) if item["jobDirectory"] else None
                ),
            }
            for item in config["candidates"]
        ],
        "holdout": {
            side: {
                "candidateId": config["holdout"][side]["candidateId"],
                "jobConfig": (
                    str(config["holdout"][side]["jobConfig"])
                    if config["holdout"][side]["jobConfig"]
                    else None
                ),
                "jobDirectory": (
                    str(config["holdout"][side]["jobDirectory"])
                    if config["holdout"][side]["jobDirectory"]
                    else None
                ),
            }
            for side in ("baseline", "candidate")
        },
    }


def doctor(config: dict[str, Any], phase: str = "full") -> dict[str, Any]:
    if phase == "full":
        resolve_deferred_holdout_references(config)
    plan = public_plan(config, phase)
    missing = plan["missingRequiredEnv"]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    references = [*config["candidates"]]
    if phase == "full":
        references.extend(
            config["holdout"][side] for side in ("baseline", "candidate")
        )
    loaded = []
    for reference in references:
        if reference["jobConfig"] is not None:
            loaded.append(load_native_job_config(reference["jobConfig"]))
        elif reference["jobDirectory"] is not None:
            artifact_config = reference["jobDirectory"] / "config.json"
            job_config = JobConfig.model_validate_json(
                artifact_config.read_text(encoding="utf-8")
            )
            validate_one_candidate_job(job_config, artifact_config)
            loaded.append(job_config)
    docker_required = any(job.environment.type == "docker" for job in loaded)
    checks: dict[str, Any] = {
        "credentials": "declared variables present",
        "jobConfigs": len(loaded),
    }
    if docker_required:
        checks["docker"] = run_check(
            ["docker", "info", "--format", "server={{.ServerVersion}}"]
        )
        checks["dockerCompose"] = run_check(
            ["docker", "compose", "version", "--short"]
        )
    else:
        checks["docker"] = "not required by declared job configs"
        checks["dockerCompose"] = "not required by declared job configs"
    return {**plan, "mode": "doctor", "checks": checks}


def exception_message(trial: TrialResult) -> str | None:
    if trial.exception_info is None:
        return None
    parts = [
        trial.exception_info.exception_type,
        trial.exception_info.exception_message,
    ]
    return ": ".join(part for part in parts if part)


def model_identifier(trial: TrialResult) -> str:
    model = trial.agent_info.model_info
    if model is None:
        return "unknown"
    return f"{model.provider}/{model.name}" if model.provider else model.name


def read_bounded(path: Path, limit: int, *, tail: bool = False) -> str:
    if limit == 0 or not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return (
        f"... truncated {omitted} chars\n" + text[-limit:]
        if tail
        else text[:limit] + f"\n... truncated {omitted} chars"
    )


def first_nonempty(paths: Iterable[Path], limit: int, *, tail: bool = False) -> str:
    for path in paths:
        value = read_bounded(path, limit, tail=tail)
        if value.strip():
            return value
    return ""


def trajectory_excerpt(path: Path, limit: int) -> str:
    if limit == 0 or not path.is_file():
        return ""
    try:
        value = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError:
        return read_bounded(path, limit, tail=True)
    if not isinstance(value, dict) or not isinstance(value.get("steps"), list):
        return read_bounded(path, limit, tail=True)
    messages = []
    for step in value["steps"]:
        if not isinstance(step, dict) or step.get("source") != "agent":
            continue
        message = step.get("message")
        if isinstance(message, str) and message.strip():
            messages.append(message.strip())
        observation = step.get("observation")
        if isinstance(observation, dict):
            results = observation.get("results")
            if isinstance(results, str) and results.strip():
                messages.append(results.strip())
    return "\n\n".join(messages)[-limit:]


def verifier_diagnostic_signals(trial_directory: Path) -> dict[str, Any] | None:
    verifier_directory = trial_directory / "verifier"
    paths = sorted(
        {
            path
            for path in verifier_directory.rglob("diagnostics.json")
            if path.is_file()
        }
    ) if verifier_directory.is_dir() else []
    if not paths:
        return None
    observations = [_read_verifier_diagnostic(path) for path in paths]
    malformed = [item for item in observations if item["parseError"] is not None]
    if malformed:
        details = "; ".join(
            f"{item['path']}: {item['parseError']}" for item in malformed
        )
        raise ValueError(
            "Malformed verifier diagnostics cannot be classified safely: " + details
        )
    classified = [
        (observation, infrastructure_failure_domain(observation))
        for observation in observations
    ]
    external = [(item, domain) for item, domain in classified if domain is not None]
    selected = external[0][0] if external else observations[0]
    domains = sorted({domain for _, domain in external if domain is not None})
    return {
        **selected,
        "observations": observations,
        "paths": [item["path"] for item in observations],
        "failure_domains": domains,
        "conflicting_failure_domains": len(domains) > 1,
    }


def _read_verifier_diagnostic(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError as error:
        return {
            "path": str(path.resolve()),
            "status": None,
            "failure_domain": None,
            "terminal_outcome": None,
            "error_code": None,
            "parseError": str(error),
        }
    if not isinstance(value, dict):
        return {
            "path": str(path.resolve()),
            "status": None,
            "failure_domain": None,
            "terminal_outcome": None,
            "error_code": None,
            "parseError": "diagnostics root is not an object",
        }

    def optional_signal(key: str) -> str | None:
        signal = value.get(key)
        return signal if isinstance(signal, str) and signal else None

    return {
        "path": str(path.resolve()),
        "status": optional_signal("status"),
        "failure_domain": optional_signal("failure_domain"),
        "terminal_outcome": optional_signal("terminal_outcome"),
        "error_code": optional_signal("error_code"),
        "parseError": None,
    }


def normalize_failure_signal(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def failure_domain_from_signal(value: Any) -> str | None:
    signal = normalize_failure_signal(value)
    if not signal:
        return None
    for domain in sorted(NON_EVALUABLE_FAILURE_DOMAINS):
        if (
            signal == domain
            or signal.startswith(f"{domain}-")
            or signal.endswith(f"-{domain}")
            or f"-{domain}-" in signal
        ):
            return domain
    for domain, aliases in FAILURE_SIGNAL_ALIASES.items():
        if any(
            signal == alias.rstrip("-") or signal.startswith(alias)
            for alias in aliases
        ):
            return domain
    return None


def infrastructure_failure_domain(signals: dict[str, Any] | None) -> str | None:
    if signals is None:
        return None
    aggregated = signals.get("failure_domains")
    if isinstance(aggregated, list) and aggregated:
        return str(aggregated[0])
    explicit_domain = normalize_failure_signal(signals.get("failure_domain"))
    if explicit_domain == "infra":
        explicit_domain = "infrastructure"
    elif explicit_domain == "auth":
        explicit_domain = "authentication"
    if explicit_domain in NON_EVALUABLE_FAILURE_DOMAINS:
        return explicit_domain
    for key in ("status", "terminal_outcome", "error_code"):
        domain = failure_domain_from_signal(signals.get(key))
        if domain is not None:
            return domain
    return None


def candidate_attributable_diagnostic_disposition(
    signals: dict[str, Any] | None,
    policy: dict[str, Any],
    rewards: dict[str, Any],
    score_keys: Iterable[str],
    error: str | None,
) -> dict[str, Any] | None:
    """Return a non-retryable candidate-failure disposition for an exact contract.

    This is deliberately stricter than external-domain classification. A
    contract match needs one unambiguous domain, every diagnostics observation
    must carry the complete raw signal tuple, the Harbor trial must have no
    exception, and the configured primary/required rewards (when present) must
    be numeric zero. Unconfigured auxiliary audit metrics do not compete with
    the frozen scoring contract. A transient external signal therefore remains
    unavailable even when this opt-in policy is enabled.
    """

    enabled = policy["contracts"]
    if signals is None or not enabled or error is not None:
        return None
    if signals.get("conflicting_failure_domains"):
        return None
    observations = signals.get("observations")
    if not isinstance(observations, list) or not observations:
        return None
    domains = signals.get("failure_domains")
    for contract_id in enabled:
        contract = CANDIDATE_ATTRIBUTABLE_DIAGNOSTIC_CONTRACTS[contract_id]
        if domains != [contract["failure_domain"]]:
            continue
        if not all(
            all(
                observation.get(field) == expected
                for field, expected in contract.items()
            )
            for observation in observations
        ):
            continue
        configured_values = [rewards.get(key) for key in score_keys]
        reward_conflict = any(
            value is not None
            and (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                or float(value) != 0.0
            )
            for value in configured_values
        )
        if reward_conflict:
            continue
        return {
            "contractId": contract_id,
            "classification": "candidate-failure",
            "reason": "absolute-deny-operational-signal",
            "score": 0.0,
            "retryAuthorized": False,
            "signals": dict(contract),
            "contractDefinitionDigest": stable_digest(contract),
        }
    return None


def collect_diagnostics(trial_directory: Path, limit: int) -> dict[str, Any]:
    verifier = trial_directory / "verifier"
    agent = trial_directory / "agent"
    agent_text_paths = sorted(agent.glob("*.txt")) if agent.is_dir() else []
    structured = verifier_diagnostic_signals(trial_directory)
    return {
        "verifier": first_nonempty(
            [
                verifier / "test-output.txt",
                verifier / "test-stdout.txt",
                verifier / "test-stderr.txt",
            ],
            limit,
            tail=True,
        ),
        "agentOutput": first_nonempty(agent_text_paths, limit, tail=True),
        "trajectory": trajectory_excerpt(agent / "trajectory.json", limit),
        "verifierDiagnostics": structured,
        "paths": {
            "trajectory": (
                str((agent / "trajectory.json").resolve())
                if (agent / "trajectory.json").is_file()
                else None
            ),
            "verifier": str(verifier.resolve()) if verifier.is_dir() else None,
            "verifierDiagnostics": structured["paths"] if structured else [],
        },
    }


def load_trials(
    job_directory: Path, job_result: JobResult
) -> list[tuple[TrialResult, Path]]:
    paths = sorted(
        path
        for path in job_directory.glob("*/result.json")
        if path.parent != job_directory
    )
    if paths:
        return [
            (TrialResult.model_validate_json(path.read_text(encoding="utf-8")), path)
            for path in paths
        ]
    return [
        (trial, job_directory / trial.trial_name / "result.json")
        for trial in job_result.trial_results
    ]


def completeness_problems(job_result: JobResult, trial_count: int) -> list[str]:
    problems = []
    if trial_count < 1:
        problems.append("job contains no completed trials")
    if job_result.finished_at is None:
        problems.append("job has no finished_at timestamp")
    if job_result.n_total_trials != trial_count:
        problems.append(
            f"job declares {job_result.n_total_trials} trials but {trial_count} exist"
        )
    stats = job_result.stats
    if stats.n_completed_trials != trial_count:
        problems.append(
            f"job stats declare {stats.n_completed_trials} completed trials but "
            f"{trial_count} exist"
        )
    if stats.n_pending_trials:
        problems.append(f"job still has {stats.n_pending_trials} pending trials")
    if stats.n_running_trials:
        problems.append(f"job still has {stats.n_running_trials} running trials")
    if stats.n_cancelled_trials:
        problems.append(f"job has {stats.n_cancelled_trials} cancelled trials")
    return problems


def canonical_lock(raw_lock: dict[str, Any]) -> dict[str, Any]:
    value = copy.deepcopy(raw_lock)
    value.pop("created_at", None)
    retry = value.get("retry")
    if isinstance(retry, dict):
        # Harbor declares these retry filters as unique sets. Their serialized
        # order is process-dependent; all other arrays remain order-sensitive.
        for key in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(key), list):
                retry[key] = sorted(retry[key])
    trials = value.get("trials", [])
    for trial in trials:
        if not isinstance(trial, dict):
            continue
        trial.pop("skills", None)
        agent = trial.get("agent")
        if isinstance(agent, dict):
            agent.pop("skills", None)
    value["trials"] = sorted(
        trials,
        key=lambda item: json.dumps(item, sort_keys=True, separators=(",", ":")),
    )
    return value


def fairness_signature(records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[(record["taskName"], record["agent"], record["model"])].append(record)
    cells = {}
    for key, group in sorted(grouped.items()):
        cells["|".join(key)] = {
            "attempts": len(group),
            "checksums": sorted({record["taskChecksum"] for record in group}),
            "agentVersions": sorted({record["agentVersion"] for record in group}),
        }
    return {"cells": cells}


def mean(values: Iterable[float]) -> float:
    observed = list(values)
    return statistics.fmean(observed) if observed else 0.0


def canonical_job_evaluation_profile(config: JobConfig) -> dict[str, Any]:
    value = config.model_dump(mode="json", exclude_defaults=False)
    value["job_name"] = "<job>"
    value["jobs_dir"] = "<jobs>"
    value["quiet"] = False
    value["tasks"] = []
    value["datasets"] = []
    retry = value.get("retry")
    if isinstance(retry, dict):
        for key in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(key), list):
                retry[key] = sorted(retry[key])
    for agent in value.get("agents", []):
        agent["skills"] = ["<candidate-skill>"]
    return value


def configured_agent_profile(agent: Any) -> tuple[str, str]:
    return str(agent.name), str(agent.model_name or "")


def observed_trial_profile(trial: TrialResult) -> tuple[str, str, str]:
    return (
        trial.agent_info.name,
        trial.agent_info.version,
        model_identifier(trial),
    )


def normalized_path_value(value: Any) -> str | None:
    if value is None:
        return None
    return os.path.normcase(str(Path(str(value)).expanduser()))


def trial_runtime_projection(value: Any, *, lock: bool) -> dict[str, Any]:
    raw = value.model_dump(mode="json", exclude_defaults=False)
    raw.pop("schema_version", None)
    raw.pop("skills", None)
    raw.pop("extra_docker_compose", None)
    raw.pop("trial_name", None)
    raw.pop("trials_dir", None)
    raw.pop("job_id", None)
    raw.pop("artifacts", None)
    task = require_mapping(raw.pop("task", {}), "trial task binding")
    raw["task"] = {
        "path": normalized_path_value(task.get("path")),
        "git_url": task.get("git_url"),
        "git_commit_id": task.get("git_commit_id"),
    }
    agent = require_mapping(raw.get("agent", {}), "trial agent binding")
    agent["skills"] = ["<candidate-skill>"]
    if lock:
        instructions = raw.pop("extra_instructions", None) or []
        raw["extra_instruction_paths"] = [
            normalized_path_value(
                item.get("path") if isinstance(item, dict) else getattr(item, "path", None)
            )
            for item in instructions
        ]
    else:
        raw["extra_instruction_paths"] = [
            normalized_path_value(item)
            for item in raw.get("extra_instruction_paths", [])
        ]
    return raw


def observed_profiles(evidence: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {"agent": agent, "agentVersion": agent_version, "model": model}
        for agent, agent_version, model in sorted(
            {
                (trial["agent"], trial["agentVersion"], trial["model"])
                for item in evidence
                for trial in item["trials"]
            }
        )
    ]


def stable_digest(value: Any) -> str:
    payload = json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def load_candidate_job(
    job_directory: Path,
    candidate: dict[str, Any],
    harbor_config: dict[str, Any],
    *,
    allow_legacy_alias: bool,
) -> dict[str, Any]:
    directory = job_directory.resolve()
    config_path = directory / "config.json"
    lock_path = directory / "lock.json"
    result_path = directory / "result.json"
    job_config = JobConfig.model_validate_json(config_path.read_text(encoding="utf-8"))
    validate_one_candidate_job(job_config, config_path)
    evaluation_profile = canonical_job_evaluation_profile(job_config)
    identity = classify_evaluated_skill_identity(
        job_config,
        candidate,
        config_path,
        allow_legacy_alias=allow_legacy_alias,
    )
    evaluated_skill = identity["evaluatedSkill"]
    raw_lock = read_json(lock_path)
    lock = JobLock.model_validate(raw_lock)
    if lock.harbor.version and lock.harbor.version != version("harbor"):
        raise ValueError(
            f"Harbor artifact version drift in {directory}: "
            f"lock={lock.harbor.version}, runtime={version('harbor')}."
        )
    job_result = JobResult.model_validate_json(result_path.read_text(encoding="utf-8"))
    loaded_trials = load_trials(directory, job_result)
    problems = completeness_problems(job_result, len(loaded_trials))
    if problems:
        raise ValueError(f"Incomplete Harbor job {directory}: " + "; ".join(problems))
    if len(lock.trials) != len(loaded_trials):
        raise ValueError(
            f"Harbor lock/trial count drift in {directory}: {len(lock.trials)} locks, "
            f"{len(loaded_trials)} trials."
        )

    locked_name, locked_source, locked_digest = validate_locked_skill_identity(
        lock,
        candidate,
        directory,
        evaluated_skill,
        identity["mode"],
    )

    reward_key = harbor_config["rewardKey"]
    pass_threshold = harbor_config["passThreshold"]
    required_reward_thresholds = harbor_config["requiredRewards"]
    candidate_diagnostic_policy_enabled = bool(
        harbor_config["candidateAttributableDiagnosticPolicy"]["contracts"]
    )
    records = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for trial, path in loaded_trials:
        if trial.config.trial_name != trial.trial_name:
            raise ValueError(
                f"TrialResult.config trial_name differs from trial_name for "
                f"{trial.trial_name} in {directory}."
            )
        task_id = trial.task_id.model_dump(mode="json", exclude_none=True)
        configured_task = trial.config.task.model_dump(mode="json", exclude_none=True)
        configured_task_path = configured_task.get("path")
        if configured_task_path is None:
            raise ValueError(
                f"Trial {trial.trial_name} has no bound local task path in {directory}."
            )
        logical_task_name = Path(str(configured_task_path)).name
        result_task_tail = trial.task_name.rsplit("/", 1)[-1]
        if (
            result_task_tail != logical_task_name
            and not result_task_tail.endswith("__" + logical_task_name)
        ):
            raise ValueError(
                f"Trial result task name {trial.task_name!r} does not bind to local "
                f"task {logical_task_name!r} in {directory}."
            )
        if (
            task_id.get("path") is not None
            and normalized_path_value(task_id.get("path"))
            != normalized_path_value(configured_task.get("path"))
        ):
            raise ValueError(
                f"TrialResult.config task differs from task_id for "
                f"{trial.trial_name} in {directory}."
            )
        if len(trial.config.agent.skills) != 1:
            raise ValueError(
                f"Trial {trial.trial_name} must declare exactly one candidate skill."
            )
        trial_source = Path(
            str(trial.config.agent.skills[0])
        ).expanduser().resolve()
        if trial_source != evaluated_skill:
            raise ValueError(
                f"Trial skill source mismatch for candidate "
                f"{candidate['candidateId']}: trial {trial.trial_name} has "
                f"{trial_source}, expected {evaluated_skill}."
            )
        declared_agent = job_config.agents[0]
        trial_agent = trial.config.agent
        if configured_agent_profile(trial_agent) != configured_agent_profile(
            declared_agent
        ):
            raise ValueError(
                f"Trial {trial.trial_name} agent/model profile differs from the "
                f"declared job config in {directory}."
            )
        observed_name, _, observed_model = observed_trial_profile(trial)
        declared_name, declared_model = configured_agent_profile(trial_agent)
        if observed_name != declared_name or observed_model != declared_model:
            raise ValueError(
                f"Trial {trial.trial_name} observed agent/model profile differs "
                f"from TrialResult.config in {directory}."
            )
        trial_id = str(trial.id)
        if trial_id in seen_ids or trial.trial_name in seen_names:
            raise ValueError(f"Duplicate Harbor trial id or name in {directory}.")
        seen_ids.add(trial_id)
        seen_names.add(trial.trial_name)
        rewards = (
            trial.verifier_result.rewards
            if trial.verifier_result and trial.verifier_result.rewards
            else {}
        )
        error = exception_message(trial)
        diagnostics = collect_diagnostics(path.parent, harbor_config["diagnosticChars"])
        structured_diagnostics = diagnostics["verifierDiagnostics"]
        infrastructure_domains = (
            list(structured_diagnostics.get("failure_domains", []))
            if structured_diagnostics is not None
            else []
        )
        infrastructure_domain = (
            infrastructure_domains[0] if infrastructure_domains else None
        )
        reward = rewards.get(reward_key)
        candidate_attributable_diagnostic = (
            candidate_attributable_diagnostic_disposition(
                structured_diagnostics,
                harbor_config["candidateAttributableDiagnosticPolicy"],
                rewards,
                [reward_key, *required_reward_thresholds],
                error,
            )
        )
        candidate_attributable_failure = (
            candidate_attributable_diagnostic is not None
        )
        infrastructure_failure = bool(infrastructure_domains) and not (
            candidate_attributable_failure
        )
        if (
            reward is None
            and error is None
            and not infrastructure_failure
            and not candidate_attributable_failure
        ):
            raise ValueError(
                f"Trial {trial.trial_name} has no '{reward_key}' reward, exception, "
                "or non-evaluable diagnostic."
            )
        if reward is not None and (
            isinstance(reward, bool)
            or not isinstance(reward, (int, float))
            or not math.isfinite(float(reward))
            or float(reward) < 0
            or float(reward) > 1
        ):
            raise ValueError(
                f"Trial {trial.trial_name} reward '{reward_key}' must be in 0..1."
            )
        required_rewards: dict[str, float | None] = {}
        qualification_failures: list[dict[str, Any]] = []
        for key, threshold in required_reward_thresholds.items():
            raw_value = rewards.get(key)
            if raw_value is None:
                required_rewards[key] = None
                qualification_failures.append(
                    {
                        "key": key,
                        "threshold": threshold,
                        "actual": None,
                        "reason": "missing",
                    }
                )
                continue
            if isinstance(raw_value, bool) or not isinstance(
                raw_value, (int, float)
            ):
                raise ValueError(
                    f"Trial {trial.trial_name} required reward '{key}' must be numeric."
                )
            actual = float(raw_value)
            if not math.isfinite(actual):
                raise ValueError(
                    f"Trial {trial.trial_name} required reward '{key}' must be finite."
                )
            required_rewards[key] = actual
            if actual < threshold:
                qualification_failures.append(
                    {
                        "key": key,
                        "threshold": threshold,
                        "actual": actual,
                        "reason": "below-threshold",
                    }
                )
        score = (
            candidate_attributable_diagnostic["score"]
            if candidate_attributable_diagnostic is not None
            else (
                None
                if infrastructure_failure
                else (0.0 if error is not None else float(reward))
            )
        )
        qualification_passed = (
            error is None
            and not qualification_failures
            and not infrastructure_failure
            and not candidate_attributable_failure
        )
        records.append(
            {
                "trialId": trial_id,
                "trialName": trial.trial_name,
                "taskName": trial.task_name,
                "taskChecksum": trial.task_checksum,
                "agent": trial.agent_info.name,
                "agentVersion": trial.agent_info.version,
                "model": model_identifier(trial),
                "reward": float(reward) if reward is not None else None,
                "reportedReward": float(reward) if reward is not None else None,
                "missingPrimaryReward": reward is None,
                "score": score,
                "passed": (
                    error is None
                    and score is not None
                    and score >= pass_threshold
                    and not candidate_attributable_failure
                ),
                "evaluationAvailable": not infrastructure_failure,
                **(
                    {
                        "candidateAttributableFailure": (
                            candidate_attributable_failure
                        ),
                        "candidateAttributableDiagnostic": (
                            candidate_attributable_diagnostic
                        ),
                    }
                    if candidate_diagnostic_policy_enabled
                    else {}
                ),
                "infrastructureFailure": infrastructure_failure,
                "infrastructureFailureDomain": infrastructure_domain,
                "infrastructureFailureDomains": infrastructure_domains,
                "conflictingDiagnosticDomains": (
                    bool(structured_diagnostics["conflicting_failure_domains"])
                    if structured_diagnostics is not None
                    else False
                ),
                "requiredRewards": required_rewards,
                "qualificationPassed": qualification_passed,
                "qualificationFailures": qualification_failures,
                "error": error,
                "resultPath": str(path.resolve()),
                "resultDigest": file_digest(path),
                "diagnostics": diagnostics,
            }
        )

    attempts_by_case = Counter(
        (record["taskName"], record["taskChecksum"], record["agent"], record["model"])
        for record in records
    )
    unexpected_attempts = {
        "|".join(case): count
        for case, count in attempts_by_case.items()
        if count != job_config.n_attempts
    }
    if unexpected_attempts:
        raise ValueError(
            f"Observed trial attempts differ from declared n_attempts="
            f"{job_config.n_attempts} in {directory}: {unexpected_attempts}"
        )
    # Harbor records two different task hashes: TrialResult.task_checksum is
    # the legacy directory checksum, while JobLock.task.digest is the Packager
    # content digest. They are both provenance evidence but are not equal by
    # construction. Bind result rows to lock rows by the exact local task
    # identity/path plus agent/model, then compare each hash family separately
    # across jobs in validate_fair_jobs.
    result_lock_cells = Counter(
        (
            Path(str(trial.config.task.path)).name,
            normalized_path_value(trial.config.task.path),
            trial.agent_info.name,
            model_identifier(trial),
        )
        for trial, _ in loaded_trials
    )
    lock_cells = Counter(
        (
            trial_lock.task.name,
            normalized_path_value(trial_lock.task.path),
            trial_lock.agent.name,
            str(trial_lock.agent.model_name or ""),
        )
        for trial_lock in lock.trials
    )
    if result_lock_cells != lock_cells:
        raise ValueError(
            f"Harbor lock/result local-task identity, path, agent, model, or "
            f"attempt drift in {directory}."
        )
    result_runtime_cells = Counter(
        json.dumps(
            trial_runtime_projection(trial.config, lock=False),
            sort_keys=True,
            separators=(",", ":"),
        )
        for trial, _ in loaded_trials
    )
    lock_runtime_cells = Counter(
        json.dumps(
            trial_runtime_projection(trial_lock, lock=True),
            sort_keys=True,
            separators=(",", ":"),
        )
        for trial_lock in lock.trials
    )
    if result_runtime_cells != lock_runtime_cells:
        raise ValueError(
            f"Harbor TrialResult.config/lock runtime drift in {directory}."
        )

    scores_by_task: dict[str, list[float | None]] = defaultdict(list)
    checksums_by_task: dict[str, set[str]] = defaultdict(set)
    for record in records:
        scores_by_task[record["taskName"]].append(record["score"])
        checksums_by_task[record["taskName"]].add(record["taskChecksum"])
    if any(len(values) != 1 for values in checksums_by_task.values()):
        raise ValueError(f"Task checksum drift inside Harbor job {directory}.")
    case_scores: dict[str, float | None] = {}
    for task_name in sorted(scores_by_task):
        task_scores = scores_by_task[task_name]
        case_scores[task_name] = (
            None
            if any(score is None for score in task_scores)
            else mean(score for score in task_scores if score is not None)
        )
    fitness_available = all(score is not None for score in case_scores.values())
    raw_fitness = (
        mean(score for score in case_scores.values() if score is not None)
        if fitness_available
        else None
    )
    unqualified_trials = sum(not record["qualificationPassed"] for record in records)
    missing_required_rewards = sum(
        failure["reason"] == "missing"
        for record in records
        for failure in record["qualificationFailures"]
    )
    below_threshold_rewards = sum(
        failure["reason"] == "below-threshold"
        for record in records
        for failure in record["qualificationFailures"]
    )
    missing_primary_rewards = sum(
        record["missingPrimaryReward"] for record in records
    )
    infrastructure_failures = sum(
        record["infrastructureFailure"] for record in records
    )
    candidate_attributable_failures = sum(
        record.get("candidateAttributableFailure", False) for record in records
    )
    candidate_attributable_contracts = Counter(
        record["candidateAttributableDiagnostic"]["contractId"]
        for record in records
        if record.get("candidateAttributableDiagnostic") is not None
    )
    provider_failures = sum(
        "provider" in record["infrastructureFailureDomains"] for record in records
    )
    infrastructure_failure_domains = Counter(
        domain
        for record in records
        for domain in set(record["infrastructureFailureDomains"])
    )
    diagnostic_summaries = [
        record["diagnostics"]["verifierDiagnostics"]
        for record in records
        if record["diagnostics"]["verifierDiagnostics"] is not None
    ]
    diagnostic_records = [
        observation
        for summary in diagnostic_summaries
        for observation in summary["observations"]
    ]
    terminal_outcomes = Counter(
        signal["terminal_outcome"]
        for signal in diagnostic_records
        if signal["terminal_outcome"] is not None
    )
    error_codes = Counter(
        signal["error_code"]
        for signal in diagnostic_records
        if signal["error_code"] is not None
    )
    qualification = {
        "passed": unqualified_trials == 0,
        "unqualifiedTrials": unqualified_trials,
        "missingRequiredRewards": missing_required_rewards,
        "belowThresholdRewards": below_threshold_rewards,
        "missingPrimaryRewards": missing_primary_rewards,
        "infrastructureFailures": infrastructure_failures,
        "providerFailures": provider_failures,
        "infrastructureFailureDomains": dict(
            sorted(infrastructure_failure_domains.items())
        ),
    }
    if candidate_diagnostic_policy_enabled:
        qualification["candidateAttributableFailures"] = (
            candidate_attributable_failures
        )
    diagnostic_summary = {
        "diagnosticsPresent": len(diagnostic_summaries),
        "diagnosticsFileCount": len(diagnostic_records),
        "conflictingDomainTrials": sum(
            record["conflictingDiagnosticDomains"] for record in records
        ),
        "missingPrimaryRewards": missing_primary_rewards,
        "infrastructureFailures": infrastructure_failures,
        "providerFailures": provider_failures,
        "infrastructureFailureDomains": dict(
            sorted(infrastructure_failure_domains.items())
        ),
        "terminalOutcomes": dict(sorted(terminal_outcomes.items())),
        "errorCodes": dict(sorted(error_codes.items())),
    }
    if candidate_diagnostic_policy_enabled:
        diagnostic_summary.update(
            {
                "candidateAttributableFailures": candidate_attributable_failures,
                "candidateAttributableDiagnosticContracts": dict(
                    sorted(candidate_attributable_contracts.items())
                ),
            }
        )
    return {
        "candidateId": candidate["candidateId"],
        "skill": str(candidate["skill"]),
        "evaluatedSkill": str(evaluated_skill),
        "skillName": candidate["skillName"],
        "lockedSkillName": locked_name,
        "skillSource": locked_source,
        "skillDigest": locked_digest,
        "identityMode": identity["mode"],
        "promotionEligibleIdentity": identity["promotionEligible"],
        "exploratory": identity["exploratory"],
        "identityReason": identity["reason"],
        "jobDirectory": str(directory),
        "jobId": str(job_result.id),
        "jobName": job_config.job_name,
        "jobConfigDigest": file_digest(config_path),
        "jobLockDigest": file_digest(lock_path),
        "jobResultPath": str(result_path.resolve()),
        "jobResultDigest": file_digest(result_path),
        "harborVersion": lock.harbor.version or version("harbor"),
        "evaluationProfileDigest": stable_digest(evaluation_profile),
        "completedTrials": len(records),
        "passedTrials": sum(1 for record in records if record["passed"]),
        "errorCount": sum(1 for record in records if record["error"] is not None),
        "requiredRewardThresholds": required_reward_thresholds,
        "qualification": qualification,
        "fitnessAvailable": fitness_available,
        "diagnosticSummary": diagnostic_summary,
        "caseScores": case_scores,
        "rawFitness": raw_fitness,
        "trials": sorted(records, key=lambda item: item["trialName"]),
        "fairnessSignature": fairness_signature(records),
        "_observedProfiles": sorted(set(observed_trial_profile(trial) for trial, _ in loaded_trials)),
        "_evaluationProfile": evaluation_profile,
        "_comparableLock": canonical_lock(raw_lock),
    }


def validate_fair_jobs(evidence: list[dict[str, Any]], phase: str) -> None:
    reference = evidence[0]
    for item in evidence[1:]:
        if item["fairnessSignature"] != reference["fairnessSignature"]:
            raise ValueError(
                f"Harbor {phase} job drift between {reference['candidateId']} and "
                f"{item['candidateId']}: tasks, checksums, attempts, agents, models, "
                "or versions differ."
            )
        if item["_comparableLock"] != reference["_comparableLock"]:
            raise ValueError(
                f"Harbor {phase} lock drift between {reference['candidateId']} and "
                f"{item['candidateId']}; only candidate skill provenance may differ."
            )
        if item["_evaluationProfile"] != reference["_evaluationProfile"]:
            raise ValueError(
                f"Harbor {phase} evaluation profile drift between "
                f"{reference['candidateId']} and {item['candidateId']}."
            )
        if item["harborVersion"] != reference["harborVersion"]:
            raise ValueError(f"Harbor {phase} version drift between candidate jobs.")


def validate_cross_phase_profile(
    development: list[dict[str, Any]], holdout: list[dict[str, Any]]
) -> None:
    if development[0]["_evaluationProfile"] != holdout[0]["_evaluationProfile"]:
        raise ValueError(
            "Harbor development and holdout evaluation profiles differ in agent, "
            "model, attempts, retry, environment, or timeout policy."
        )
    if development[0]["harborVersion"] != holdout[0]["harborVersion"]:
        raise ValueError("Harbor development and holdout versions differ.")
    development_profiles = observed_profiles(development)
    holdout_profiles = observed_profiles(holdout)
    if development_profiles != holdout_profiles:
        raise ValueError(
            "Harbor development and holdout observed agent/version/model profiles "
            f"differ: development={development_profiles}, holdout={holdout_profiles}."
        )


def holdout_declaration_profile_fields(config: dict[str, Any]) -> dict[str, Any]:
    declaration = config["holdoutDeclaration"]
    return {
        "holdoutDeclaration": declaration,
        "holdoutDeclarationDigest": stable_digest(declaration),
    }


def build_evolution_profile(
    config: dict[str, Any],
    development: list[dict[str, Any]],
    holdout: list[dict[str, Any]],
) -> dict[str, Any]:
    harbor_policy = {
        "rewardKey": config["harbor"]["rewardKey"],
        "passThreshold": config["harbor"]["passThreshold"],
        "requiredRewards": config["harbor"]["requiredRewards"],
    }
    if config["harbor"]["candidateAttributableDiagnosticPolicy"]["contracts"]:
        harbor_policy["candidateAttributableDiagnosticPolicy"] = config["harbor"][
            "candidateAttributableDiagnosticPolicy"
        ]
    return {
        "schemaVersion": 1,
        "harborVersion": development[0]["harborVersion"],
        "harborPolicy": harbor_policy,
        "coevolutionPolicy": {
            "minimumOperatorTrials": config["coevolution"][
                "minimumOperatorTrials"
            ],
            "allowCaseRegressionsForCredit": config["coevolution"][
                "allowCaseRegressionsForCredit"
            ],
            "complementaryRepair": config["coevolution"]["complementaryRepair"],
        },
        "promotionPolicy": {
            "minimumMeanGain": config["holdout"]["minimumMeanGain"],
            "allowTaskRegressions": config["holdout"]["allowTaskRegressions"],
            "requireNoErrors": config["holdout"]["requireNoErrors"],
        },
        "evaluationProfile": development[0]["_evaluationProfile"],
        "observedEvaluationProfiles": observed_profiles(development),
        "developmentLock": development[0]["_comparableLock"],
        "holdoutLock": holdout[0]["_comparableLock"],
        **holdout_declaration_profile_fields(config),
    }


def build_development_evolution_profile(
    config: dict[str, Any],
    development: list[dict[str, Any]],
    *,
    include_holdout_declaration: bool = False,
) -> dict[str, Any]:
    harbor_policy = {
        "rewardKey": config["harbor"]["rewardKey"],
        "passThreshold": config["harbor"]["passThreshold"],
        "requiredRewards": config["harbor"]["requiredRewards"],
    }
    if config["harbor"]["candidateAttributableDiagnosticPolicy"]["contracts"]:
        harbor_policy["candidateAttributableDiagnosticPolicy"] = config["harbor"][
            "candidateAttributableDiagnosticPolicy"
        ]
    profile = {
        "schemaVersion": 1,
        "harborVersion": development[0]["harborVersion"],
        "harborPolicy": harbor_policy,
        "coevolutionPolicy": {
            "minimumOperatorTrials": config["coevolution"][
                "minimumOperatorTrials"
            ],
            "allowCaseRegressionsForCredit": config["coevolution"][
                "allowCaseRegressionsForCredit"
            ],
            "complementaryRepair": config["coevolution"]["complementaryRepair"],
        },
        "promotionPolicy": {
            "minimumMeanGain": config["holdout"]["minimumMeanGain"],
            "allowTaskRegressions": config["holdout"]["allowTaskRegressions"],
            "requireNoErrors": config["holdout"]["requireNoErrors"],
        },
        "evaluationProfile": development[0]["_evaluationProfile"],
        "observedEvaluationProfiles": observed_profiles(development),
        "developmentLock": development[0]["_comparableLock"],
        "holdoutLock": None,
        "holdoutOpened": False,
    }
    if include_holdout_declaration or config["previousGenerationLog"] is not None:
        profile.update(holdout_declaration_profile_fields(config))
    return profile


def development_profile_projection(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        key: profile.get(key)
        for key in (
            "schemaVersion",
            "harborVersion",
            "harborPolicy",
            "coevolutionPolicy",
            "promotionPolicy",
            "evaluationProfile",
            "observedEvaluationProfiles",
            "developmentLock",
            "holdoutDeclaration",
            "holdoutDeclarationDigest",
        )
    }


def holdout_declaration_commitment(
    profile: dict[str, Any], location: str, *, required: bool
) -> dict[str, Any] | None:
    has_declaration = "holdoutDeclaration" in profile
    has_digest = "holdoutDeclarationDigest" in profile
    if has_declaration != has_digest:
        raise ValueError(
            f"{location} must contain both holdoutDeclaration and "
            "holdoutDeclarationDigest."
        )
    if not has_declaration:
        if required:
            raise ValueError(f"{location} has no sealed holdout declaration.")
        return None
    declaration = require_mapping(
        profile.get("holdoutDeclaration"), f"{location}.holdoutDeclaration"
    )
    digest = require_string(
        profile.get("holdoutDeclarationDigest"),
        f"{location}.holdoutDeclarationDigest",
    )
    if digest != stable_digest(declaration):
        raise ValueError(f"{location} holdout declaration digest is invalid.")
    return declaration


def validate_holdout_declaration_v2(
    declaration: dict[str, Any], location: str
) -> None:
    if declaration.get("schemaVersion") != 2:
        raise ValueError(
            f"{location} must use holdout declaration schemaVersion 2; legacy "
            "candidate-bound declarations cannot seed deferred release."
        )
    expected_keys = {
        "schemaVersion",
        "baseline",
        "candidateSlot",
        "promotionPolicy",
    }
    if set(declaration) != expected_keys:
        raise ValueError(f"{location} has an invalid schemaVersion 2 shape.")
    baseline = require_mapping(declaration.get("baseline"), f"{location}.baseline")
    candidate_slot = require_mapping(
        declaration.get("candidateSlot"), f"{location}.candidateSlot"
    )
    if set(baseline) != {"candidateId", "jobConfig", "jobDirectory"}:
        raise ValueError(f"{location}.baseline has an invalid shape.")
    require_string(baseline.get("candidateId"), f"{location}.baseline.candidateId")
    if set(candidate_slot) != {"jobConfig", "jobDirectory"}:
        raise ValueError(f"{location}.candidateSlot has an invalid shape.")
    if "candidateId" in candidate_slot:
        raise ValueError(
            f"{location}.candidateSlot must not predict the release candidate ID."
        )
    for reference_name, reference in (
        ("baseline", baseline),
        ("candidateSlot", candidate_slot),
    ):
        references = [reference.get("jobConfig"), reference.get("jobDirectory")]
        if all(value is None for value in references):
            raise ValueError(f"{location}.{reference_name} has no job reference.")
        for field, value in zip(("jobConfig", "jobDirectory"), references):
            if value is not None:
                require_string(value, f"{location}.{reference_name}.{field}")
    promotion_policy = require_mapping(
        declaration.get("promotionPolicy"), f"{location}.promotionPolicy"
    )
    if set(promotion_policy) != {
        "minimumMeanGain",
        "allowTaskRegressions",
        "requireNoErrors",
    }:
        raise ValueError(f"{location}.promotionPolicy has an invalid shape.")


def without_holdout_declaration_commitment(
    profile: dict[str, Any],
) -> dict[str, Any]:
    return {
        key: value
        for key, value in profile.items()
        if key not in {"holdoutDeclaration", "holdoutDeclarationDigest"}
    }


def development_evidence_identity(
    config: dict[str, Any], development: list[dict[str, Any]]
) -> dict[str, Any]:
    """Project immutable Harbor run identities without scoring payloads."""

    candidate_by_id = {item["candidateId"]: item for item in config["candidates"]}
    candidates = []
    for evidence in sorted(development, key=lambda item: item["candidateId"]):
        candidate = candidate_by_id[evidence["candidateId"]]
        candidates.append(
            {
                "candidateId": evidence["candidateId"],
                "parentCandidateId": candidate["parentCandidateId"],
                "operatorId": candidate["operatorId"],
                "evidenceClass": (
                    "generated-child"
                    if candidate["operatorId"] is not None
                    else "reference-or-survivor"
                ),
                "skillDigest": evidence["skillDigest"],
                "jobDirectory": evidence["jobDirectory"],
                "jobId": evidence["jobId"],
                "jobConfigDigest": evidence["jobConfigDigest"],
                "jobLockDigest": evidence["jobLockDigest"],
                "jobResultPath": evidence["jobResultPath"],
                "jobResultDigest": evidence["jobResultDigest"],
                "trials": [
                    {
                        "trialId": trial["trialId"],
                        "trialName": trial["trialName"],
                        "taskName": trial["taskName"],
                        "taskChecksum": trial["taskChecksum"],
                        "resultPath": trial["resultPath"],
                        "resultDigest": trial["resultDigest"],
                    }
                    for trial in sorted(
                        evidence["trials"],
                        key=lambda item: (item["trialName"], item["trialId"]),
                    )
                ],
            }
        )
    return {
        "schemaVersion": 1,
        "candidates": candidates,
    }


def require_sha256_digest(value: Any, location: str) -> str:
    digest = require_string(value, location)
    if re.fullmatch(r"sha256:[0-9a-f]{64}", digest) is None:
        raise ValueError(f"{location} must be a canonical sha256 digest.")
    return digest


def require_uuid(value: Any, location: str) -> str:
    identifier = require_string(value, location)
    try:
        UUID(identifier)
    except ValueError as error:
        raise ValueError(f"{location} must be a UUID.") from error
    return identifier


def validate_development_evidence_identity(
    raw: Any, location: str
) -> list[dict[str, Any]]:
    identity = require_mapping(raw, location)
    if identity.get("schemaVersion") != 1:
        raise ValueError(f"{location}.schemaVersion must be 1.")
    raw_candidates = require_list(identity.get("candidates"), f"{location}.candidates")
    if not raw_candidates:
        raise ValueError(f"{location}.candidates must not be empty.")
    candidates: list[dict[str, Any]] = []
    candidate_ids: set[str] = set()
    globally_unique: dict[str, set[str]] = {
        "jobDirectory": set(),
        "jobId": set(),
        "jobResultPath": set(),
        "jobResultDigest": set(),
        "trialId": set(),
        "trialResultPath": set(),
        "trialResultDigest": set(),
    }

    def unique(field: str, value: str, value_location: str) -> None:
        normalized = (
            os.path.normcase(os.path.abspath(value))
            if field in {"jobDirectory", "jobResultPath", "trialResultPath"}
            else value
        )
        if normalized in globally_unique[field]:
            raise ValueError(
                f"{location} reuses {field} identity at {value_location}."
            )
        globally_unique[field].add(normalized)

    for index, raw_candidate in enumerate(raw_candidates):
        candidate_location = f"{location}.candidates[{index}]"
        candidate = require_mapping(raw_candidate, candidate_location)
        candidate_id = require_string(
            candidate.get("candidateId"), f"{candidate_location}.candidateId"
        )
        if candidate_id in candidate_ids:
            raise ValueError(f"{location} contains duplicate candidate IDs.")
        candidate_ids.add(candidate_id)
        parent_candidate_id = candidate.get("parentCandidateId")
        operator_id = candidate.get("operatorId")
        if (parent_candidate_id is None) != (operator_id is None):
            raise ValueError(
                f"{candidate_location} must bind both parentCandidateId and "
                "operatorId, or neither."
            )
        if parent_candidate_id is not None:
            parent_candidate_id = require_string(
                parent_candidate_id, f"{candidate_location}.parentCandidateId"
            )
            operator_id = require_string(
                operator_id, f"{candidate_location}.operatorId"
            )
        expected_class = (
            "generated-child"
            if operator_id is not None
            else "reference-or-survivor"
        )
        if candidate.get("evidenceClass") != expected_class:
            raise ValueError(
                f"{candidate_location}.evidenceClass disagrees with operator "
                "attribution."
            )
        job_directory = require_string(
            candidate.get("jobDirectory"), f"{candidate_location}.jobDirectory"
        )
        job_id = require_uuid(candidate.get("jobId"), f"{candidate_location}.jobId")
        job_result_path = require_string(
            candidate.get("jobResultPath"), f"{candidate_location}.jobResultPath"
        )
        job_result_digest = require_sha256_digest(
            candidate.get("jobResultDigest"),
            f"{candidate_location}.jobResultDigest",
        )
        unique("jobDirectory", job_directory, candidate_location)
        unique("jobId", job_id, candidate_location)
        unique("jobResultPath", job_result_path, candidate_location)
        unique("jobResultDigest", job_result_digest, candidate_location)
        trials = []
        for trial_index, raw_trial in enumerate(
            require_list(candidate.get("trials"), f"{candidate_location}.trials")
        ):
            trial_location = f"{candidate_location}.trials[{trial_index}]"
            trial = require_mapping(raw_trial, trial_location)
            trial_id = require_uuid(trial.get("trialId"), f"{trial_location}.trialId")
            result_path = require_string(
                trial.get("resultPath"), f"{trial_location}.resultPath"
            )
            result_digest = require_sha256_digest(
                trial.get("resultDigest"), f"{trial_location}.resultDigest"
            )
            unique("trialId", trial_id, trial_location)
            unique("trialResultPath", result_path, trial_location)
            unique("trialResultDigest", result_digest, trial_location)
            trials.append(
                {
                    "trialId": trial_id,
                    "trialName": require_string(
                        trial.get("trialName"), f"{trial_location}.trialName"
                    ),
                    "taskName": require_string(
                        trial.get("taskName"), f"{trial_location}.taskName"
                    ),
                    "taskChecksum": require_string(
                        trial.get("taskChecksum"),
                        f"{trial_location}.taskChecksum",
                    ),
                    "resultPath": result_path,
                    "resultDigest": result_digest,
                }
            )
        if not trials:
            raise ValueError(f"{candidate_location}.trials must not be empty.")
        if trials != sorted(
            trials, key=lambda item: (item["trialName"], item["trialId"])
        ):
            raise ValueError(f"{candidate_location}.trials must be canonically sorted.")
        candidates.append(
            {
                "candidateId": candidate_id,
                "parentCandidateId": parent_candidate_id,
                "operatorId": operator_id,
                "evidenceClass": expected_class,
                "skillDigest": require_sha256_digest(
                    candidate.get("skillDigest"),
                    f"{candidate_location}.skillDigest",
                ),
                "jobDirectory": job_directory,
                "jobId": job_id,
                "jobConfigDigest": require_sha256_digest(
                    candidate.get("jobConfigDigest"),
                    f"{candidate_location}.jobConfigDigest",
                ),
                "jobLockDigest": require_sha256_digest(
                    candidate.get("jobLockDigest"),
                    f"{candidate_location}.jobLockDigest",
                ),
                "jobResultPath": job_result_path,
                "jobResultDigest": job_result_digest,
                "trials": trials,
            }
        )
    if candidates != sorted(candidates, key=lambda item: item["candidateId"]):
        raise ValueError(f"{location}.candidates must be canonically sorted.")
    return candidates


def evidence_freshness_identities(candidate: dict[str, Any]) -> dict[str, set[str]]:
    return {
        "jobDirectory": {
            os.path.normcase(os.path.abspath(candidate["jobDirectory"]))
        },
        "jobId": {candidate["jobId"]},
        "jobResultPath": {
            os.path.normcase(os.path.abspath(candidate["jobResultPath"]))
        },
        "jobResultDigest": {candidate["jobResultDigest"]},
        "trialId": {trial["trialId"] for trial in candidate["trials"]},
        "trialResultPath": {
            os.path.normcase(os.path.abspath(trial["resultPath"]))
            for trial in candidate["trials"]
        },
        "trialResultDigest": {
            trial["resultDigest"] for trial in candidate["trials"]
        },
    }


def validate_inter_generation_evidence_freshness(
    previous_candidates: list[dict[str, Any]],
    current_candidates: list[dict[str, Any]],
    previous_selected_candidate_id: str | None,
) -> None:
    previous_identities = [
        (candidate, evidence_freshness_identities(candidate))
        for candidate in previous_candidates
    ]
    for current in current_candidates:
        current_identity = evidence_freshness_identities(current)
        collisions = []
        for previous, previous_identity in previous_identities:
            fields = sorted(
                field
                for field, values in current_identity.items()
                if values & previous_identity[field]
            )
            if fields:
                collisions.append((previous, fields))
        if not collisions:
            continue
        if current["operatorId"] is not None:
            details = "; ".join(
                f"{previous['candidateId']} ({', '.join(fields)})"
                for previous, fields in collisions
            )
            raise ValueError(
                f"Generated-child Harbor evidence for {current['candidateId']} is "
                f"not fresh and disjoint from the predecessor: {details}."
            )
        for previous, fields in collisions:
            reusable_reference = (
                current["candidateId"] == previous["candidateId"]
                and current["skillDigest"] == previous["skillDigest"]
                and current_identity == evidence_freshness_identities(previous)
                and (
                    previous["operatorId"] is None
                    or previous["candidateId"]
                    == previous_selected_candidate_id
                )
            )
            if not reusable_reference:
                raise ValueError(
                    f"Unattributed candidate {current['candidateId']} reuses "
                    f"predecessor evidence from {previous['candidateId']} via "
                    f"{', '.join(fields)} without being the same root reference "
                    "or the exact selectedDevelopment winner with an identical "
                    "evidence identity."
                )


def validate_holdout_candidate_evidence_identity(
    raw: Any, location: str
) -> dict[str, Any]:
    identity = require_mapping(raw, location)
    if set(identity) != {
        "jobDirectory",
        "jobId",
        "jobResultPath",
        "jobResultDigest",
        "trials",
    }:
        raise ValueError(f"{location} has an invalid shape.")
    require_string(identity.get("jobDirectory"), f"{location}.jobDirectory")
    require_uuid(identity.get("jobId"), f"{location}.jobId")
    require_string(identity.get("jobResultPath"), f"{location}.jobResultPath")
    require_sha256_digest(
        identity.get("jobResultDigest"), f"{location}.jobResultDigest"
    )
    trials = require_list(identity.get("trials"), f"{location}.trials")
    if not trials:
        raise ValueError(f"{location}.trials must not be empty.")
    trial_ids: set[str] = set()
    result_paths: set[str] = set()
    result_digests: set[str] = set()
    for index, raw_trial in enumerate(trials):
        trial_location = f"{location}.trials[{index}]"
        trial = require_mapping(raw_trial, trial_location)
        if set(trial) != {"trialId", "resultPath", "resultDigest"}:
            raise ValueError(f"{trial_location} has an invalid shape.")
        trial_id = require_uuid(trial.get("trialId"), f"{trial_location}.trialId")
        result_path = require_string(
            trial.get("resultPath"), f"{trial_location}.resultPath"
        )
        result_digest = require_sha256_digest(
            trial.get("resultDigest"), f"{trial_location}.resultDigest"
        )
        if (
            trial_id in trial_ids
            or os.path.normcase(os.path.abspath(result_path)) in result_paths
            or result_digest in result_digests
        ):
            raise ValueError(f"{location} contains duplicate trial identities.")
        trial_ids.add(trial_id)
        result_paths.add(os.path.normcase(os.path.abspath(result_path)))
        result_digests.add(result_digest)
    return identity


def validate_previous_generation_profile(
    config: dict[str, Any],
    profile: dict[str, Any],
    *,
    development_evidence: list[dict[str, Any]],
    development_only: bool = False,
) -> None:
    path = config["previousGenerationLog"]
    if path is None:
        if config["generation"] > 0:
            raise ValueError(
                "evolution.previousGenerationLog is required after generation zero."
            )
        return
    previous = read_json(path)
    if previous.get("schemaVersion") != 1 or previous.get("source") != (
        "harbor-operator-coevolution"
    ):
        raise ValueError("Previous generation log has the wrong schema or source.")
    previous_phase = previous.get("phase")
    raw_previous_profile = previous.get("evolutionProfile")
    legacy_full_log = (
        "chainEligible" not in previous
        and "requestedPhase" not in previous
        and previous_phase is None
        and isinstance(raw_previous_profile, dict)
        and "holdoutDeclaration" not in raw_previous_profile
        and "holdoutDeclarationDigest" not in raw_previous_profile
    )
    chain_eligible = (
        previous.get("chainEligible")
        if "chainEligible" in previous
        else legacy_full_log
    )
    if chain_eligible is not True:
        raise ValueError(
            "Previous generation log is not chain-eligible and cannot seed a new "
            "coevolution generation."
        )
    previous_is_development_chain = previous_phase == "development"
    previous_is_explicit_full = previous_phase == "full"
    explicit_predecessor = (
        previous_is_development_chain or previous_is_explicit_full
    )
    if previous_is_development_chain and previous.get("requestedPhase") != (
        "development-chain"
    ):
        raise ValueError(
            "Only an explicit development-chain log can seed another generation "
            "without opening holdout."
        )
    if previous_is_explicit_full and previous.get("requestedPhase") != "full":
        raise ValueError(
            "An explicit full predecessor must record requestedPhase: full."
        )
    if previous_phase is None and not legacy_full_log:
        raise ValueError(
            "Only genuinely historical full logs may omit explicit phase and "
            "chain markers."
        )
    if previous_phase is not None and not explicit_predecessor:
        raise ValueError("Previous generation log has an unsupported phase marker.")
    if previous.get("evolutionId") != config["id"]:
        raise ValueError("Previous generation log belongs to another evolutionId.")
    previous_generation = previous.get("generation")
    if (
        isinstance(previous_generation, bool)
        or not isinstance(previous_generation, int)
        or previous_generation + 1 != config["generation"]
    ):
        raise ValueError(
            "Previous generation log is not the immediate predecessor of the "
            "current evolution.generation."
        )
    if previous.get("generationId") == config["generationId"]:
        raise ValueError("Current generationId must differ from the previous generationId.")
    seal = require_string(
        previous.get("generationSeal"), "previousGenerationLog.generationSeal"
    )
    if seal != stable_digest(generation_seal_payload(previous)):
        raise ValueError("Previous generation seal is invalid.")
    selected_candidate_id: str | None = None
    selected_skill_digest: str | None = None
    previous_holdout: dict[str, Any] | None = None
    previous_release_binding: dict[str, Any] | None = None
    candidate_rows: list[dict[str, Any]] | None = None
    candidate_survivors: list[Any] | None = None
    if explicit_predecessor:
        expected_holdout_opened = previous_is_explicit_full
        if (
            previous.get("diagnosticOnly") is not False
            or previous.get("holdoutOpened") is not expected_holdout_opened
            or previous.get("holdoutUsedForDevelopmentSelection") is not False
        ):
            raise ValueError(
                "An explicit predecessor must be non-diagnostic, record the "
                "expected holdout-open state, and prove holdout was not used "
                "for development selection."
            )
        if previous_is_development_chain and previous.get("promotion") is not False:
            raise ValueError(
                "A development-chain predecessor must keep promotion false."
            )
        selected_development = require_mapping(
            previous.get("selectedDevelopment"),
            "previousGenerationLog.selectedDevelopment",
        )
        if selected_development.get("qualified") is not True:
            raise ValueError(
                "A development-chain predecessor requires a qualified selected "
                "development candidate."
            )
        selected_candidate_id = require_string(
            selected_development.get("candidateId"),
            "previousGenerationLog.selectedDevelopment.candidateId",
        )
        selected_skill_digest = require_string(
            selected_development.get("skillDigest"),
            "previousGenerationLog.selectedDevelopment.skillDigest",
        )
        candidate_ranking = require_mapping(
            previous.get("candidateRanking"),
            "previousGenerationLog.candidateRanking",
        )
        candidate_survivors = require_list(
            candidate_ranking.get("survivors"),
            "previousGenerationLog.candidateRanking.survivors",
        )
        if not candidate_survivors or candidate_survivors[0] != selected_candidate_id:
            raise ValueError(
                "Explicit predecessor selectedDevelopment must match the first "
                "candidate survivor."
            )
        candidate_rows = [
            require_mapping(item, "previousGenerationLog candidate ranking row")
            for item in require_list(
                candidate_ranking.get("ranking"),
                "previousGenerationLog.candidateRanking.ranking",
            )
        ]
        selected_rows = [
            row
            for row in candidate_rows
            if row.get("candidateId") == selected_candidate_id
        ]
        if (
            len(selected_rows) != 1
            or selected_rows[0].get("qualified") is not True
            or selected_rows[0].get("skillDigest") != selected_skill_digest
        ):
            raise ValueError(
                "Explicit predecessor selectedDevelopment differs from its "
                "qualified candidate ranking row."
            )
        previous_holdout = require_mapping(
            previous.get("holdoutPromotion"),
            "previousGenerationLog.holdoutPromotion",
        )
    if previous_is_development_chain:
        assert previous_holdout is not None
        assert selected_candidate_id is not None
        assert selected_skill_digest is not None
        if (
            previous_holdout.get("opened") is not False
            or previous_holdout.get("holdoutOpened") is not False
            or previous_holdout.get("promotion") is not False
            or previous_holdout.get("promoted") is not False
        ):
            raise ValueError(
                "A development-chain predecessor must contain an explicitly "
                "unopened, non-promoting holdout projection."
            )
        if (
            previous_holdout.get("selectedCandidateId") != selected_candidate_id
            or previous_holdout.get("selectedCandidateSkillDigest")
            != selected_skill_digest
        ):
            raise ValueError(
                "Development-chain selected candidate identity differs from its "
                "unopened holdout projection."
            )
        if "holdoutReleaseBinding" in previous:
            raise ValueError(
                "A development-chain predecessor must not bind a final holdout "
                "release candidate."
            )
    if previous_is_explicit_full:
        assert previous_holdout is not None
        assert selected_candidate_id is not None
        promoted = previous_holdout.get("promoted")
        if not isinstance(promoted, bool):
            raise ValueError(
                "An explicit full predecessor must record a Boolean holdout "
                "promotion decision."
            )
        if (
            previous.get("promotion") is not promoted
            or previous.get("decision") != previous_holdout.get("decision")
            or previous_holdout.get("candidateId") != selected_candidate_id
        ):
            raise ValueError(
                "Explicit full predecessor promotion and selected candidate "
                "must agree with holdoutPromotion."
            )
        previous_release_binding = require_mapping(
            previous.get("holdoutReleaseBinding"),
            "previousGenerationLog.holdoutReleaseBinding",
        )
        expected_release_keys = {
            "schemaVersion",
            "candidateId",
            "developmentSkillDigest",
            "holdoutCandidateSkillDigest",
            "holdoutDeclarationDigest",
            "candidateSlotDigest",
            "candidateEvidenceIdentity",
            "candidateEvidenceIdentityDigest",
        }
        if (
            set(previous_release_binding) != expected_release_keys
            or previous_release_binding.get("schemaVersion") != 1
            or previous_release_binding.get("candidateId")
            != selected_candidate_id
            or previous_release_binding.get("developmentSkillDigest")
            != selected_skill_digest
            or previous_release_binding.get("holdoutCandidateSkillDigest")
            != selected_skill_digest
            or previous_holdout.get("candidateSkillDigest")
            != selected_skill_digest
        ):
            raise ValueError(
                "Explicit full predecessor has an invalid final holdout release "
                "candidate binding."
            )
        release_evidence = validate_holdout_candidate_evidence_identity(
            previous_release_binding.get("candidateEvidenceIdentity"),
            "previousGenerationLog.holdoutReleaseBinding.candidateEvidenceIdentity",
        )
        release_evidence_digest = require_sha256_digest(
            previous_release_binding.get("candidateEvidenceIdentityDigest"),
            "previousGenerationLog.holdoutReleaseBinding."
            "candidateEvidenceIdentityDigest",
        )
        if (
            release_evidence_digest != stable_digest(release_evidence)
            or previous_holdout.get("candidateEvidenceIdentity")
            != release_evidence
            or previous_holdout.get("candidateEvidenceIdentityDigest")
            != release_evidence_digest
            or previous_holdout.get("candidateJobDirectory")
            != release_evidence.get("jobDirectory")
        ):
            raise ValueError(
                "Explicit full predecessor release binding differs from its "
                "observed holdout result identity."
            )
    previous_profile = require_mapping(
        previous.get("evolutionProfile"), "previousGenerationLog.evolutionProfile"
    )
    if previous_is_development_chain and (
        previous_profile.get("holdoutLock") is not None
        or previous_profile.get("holdoutOpened") is not False
    ):
        raise ValueError(
            "A development-chain predecessor profile must contain no observed "
            "holdout lock."
        )
    if previous_is_explicit_full and previous_profile.get("holdoutLock") is None:
        raise ValueError(
            "An explicit full predecessor profile must contain an observed "
            "holdout lock."
        )
    previous_digest = require_string(
        previous.get("evolutionProfileDigest"),
        "previousGenerationLog.evolutionProfileDigest",
    )
    if previous_digest != stable_digest(previous_profile):
        raise ValueError("Previous generation evolution profile digest is invalid.")
    previous_holdout_declaration = holdout_declaration_commitment(
        previous_profile,
        "previousGenerationLog.evolutionProfile",
        required=explicit_predecessor,
    )
    current_holdout_declaration = holdout_declaration_commitment(
        profile,
        "current evolution profile",
        required=previous_holdout_declaration is not None,
    )
    if explicit_predecessor:
        assert previous_holdout_declaration is not None
        assert current_holdout_declaration is not None
        validate_holdout_declaration_v2(
            previous_holdout_declaration,
            "previousGenerationLog.evolutionProfile.holdoutDeclaration",
        )
        validate_holdout_declaration_v2(
            current_holdout_declaration,
            "current evolution profile holdoutDeclaration",
        )
        if previous_is_explicit_full:
            assert previous_release_binding is not None
            if (
                previous_release_binding.get("holdoutDeclarationDigest")
                != previous_profile.get("holdoutDeclarationDigest")
                or previous_release_binding.get("candidateSlotDigest")
                != stable_digest(
                    require_mapping(
                        previous_holdout_declaration.get("candidateSlot"),
                        "previous holdout declaration candidateSlot",
                    )
                )
            ):
                raise ValueError(
                    "Explicit full predecessor release binding differs from its "
                    "sealed holdout declaration or candidate slot."
                )
    if (
        previous_holdout_declaration is not None
        and previous_holdout_declaration != current_holdout_declaration
    ):
        raise ValueError(
            "Current holdout declaration drifted from the previous generation "
            "before holdout was opened."
        )
    if development_only or previous_is_development_chain:
        previous_comparison = development_profile_projection(previous_profile)
        current_comparison = development_profile_projection(profile)
    else:
        previous_comparison = previous_profile
        current_comparison = profile
    if previous_holdout_declaration is None:
        previous_comparison = without_holdout_declaration_commitment(
            previous_comparison
        )
        current_comparison = without_holdout_declaration_commitment(
            current_comparison
        )
    profiles_match = previous_comparison == current_comparison
    if not profiles_match:
        raise ValueError(
            "Current generation evaluation/promotion profile drifted from the "
            "previous generation."
        )
    if candidate_rows is None or candidate_survivors is None:
        candidate_ranking = require_mapping(
            previous.get("candidateRanking"),
            "previousGenerationLog.candidateRanking",
        )
        candidate_rows = [
            require_mapping(item, "previousGenerationLog candidate ranking row")
            for item in require_list(
                candidate_ranking.get("ranking"),
                "previousGenerationLog.candidateRanking.ranking",
            )
        ]
        candidate_survivors = require_list(
            candidate_ranking.get("survivors"),
            "previousGenerationLog.candidateRanking.survivors",
        )
    previous_identity_raw = previous.get("developmentEvidenceIdentity")
    previous_identity_digest_raw = previous.get(
        "developmentEvidenceIdentityDigest"
    )
    if previous_identity_raw is None or previous_identity_digest_raw is None:
        raise ValueError(
            "Previous generation log does not seal Harbor job/trial evidence "
            "identities, so generated-child freshness cannot be proven. "
            "Historical logs remain readable but cannot seed a new generation."
        )
    previous_identity_digest = require_sha256_digest(
        previous_identity_digest_raw,
        "previousGenerationLog.developmentEvidenceIdentityDigest",
    )
    if previous_identity_digest != stable_digest(previous_identity_raw):
        raise ValueError(
            "Previous generation development evidence identity digest is invalid."
        )
    previous_identity = validate_development_evidence_identity(
        previous_identity_raw,
        "previousGenerationLog.developmentEvidenceIdentity",
    )
    ranking_by_id = {
        require_string(row.get("candidateId"), "previous candidateId"): row
        for row in candidate_rows
    }
    if len(ranking_by_id) != len(candidate_rows):
        raise ValueError("Previous candidate ranking contains duplicate candidate IDs.")
    identity_by_id = {row["candidateId"]: row for row in previous_identity}
    if set(identity_by_id) != set(ranking_by_id):
        raise ValueError(
            "Previous development evidence identities do not cover exactly the "
            "candidate ranking."
        )
    for candidate_id, identity_row in identity_by_id.items():
        ranking_row = ranking_by_id[candidate_id]
        for field in (
            "parentCandidateId",
            "operatorId",
            "skillDigest",
            "jobDirectory",
        ):
            if identity_row[field] != ranking_row.get(field):
                raise ValueError(
                    f"Previous development evidence identity for {candidate_id} "
                    f"differs from candidate ranking field {field}."
                )
    current_identity_raw = development_evidence_identity(
        config, development_evidence
    )
    current_identity = validate_development_evidence_identity(
        current_identity_raw, "current developmentEvidenceIdentity"
    )
    validate_inter_generation_evidence_freshness(
        previous_identity,
        current_identity,
        selected_candidate_id,
    )
    previous_plan = require_mapping(
        previous.get("breedingPlan"), "previousGenerationLog.breedingPlan"
    )
    if previous_plan.get("sourceGenerationId") != previous.get("generationId"):
        raise ValueError("Previous breeding plan sourceGenerationId is inconsistent.")
    raw_planned = require_list(
        previous_plan.get("operators"), "previousGenerationLog.breedingPlan.operators"
    )
    if explicit_predecessor:
        operator_count = previous_plan.get("operatorCount")
        if (
            isinstance(operator_count, bool)
            or not isinstance(operator_count, int)
            or operator_count != len(raw_planned)
            or operator_count == 0
            or previous_plan.get("diagnosticOnly") is not False
            or previous_plan.get("chainEligible") is not True
        ):
            raise ValueError(
                "Explicit predecessor requires a non-diagnostic, chain-eligible "
                "normal breeding plan whose operatorCount matches its operators."
            )
    planned = {
        require_string(item.get("operatorId"), "planned operatorId"): item
        for item in (
            require_mapping(value, "planned operator") for value in raw_planned
        )
    }
    if len(planned) != len(raw_planned):
        raise ValueError("Previous breeding plan contains duplicate operator IDs.")
    current = {item["operatorId"]: item for item in config["operators"]}
    if set(planned) != set(current):
        raise ValueError(
            "Current operators must realize exactly the previous breeding plan IDs."
        )
    for operator_id in sorted(current):
        planned_operator = planned[operator_id]
        current_operator = current[operator_id]
        planned_instruction = require_string(
            planned_operator.get("instruction"),
            f"previous breeding plan operator {operator_id}.instruction",
        )
        instruction_contract = require_mapping(
            planned_operator.get("instructionContract"),
            f"previous breeding plan operator {operator_id}.instructionContract",
        )
        if (
            instruction_contract.get("mode") != "exact-text-v1"
            or instruction_contract.get("instructionDigest")
            != stable_digest({"instruction": planned_instruction})
        ):
            raise ValueError(
                f"Operator {operator_id} has an invalid sealed instruction contract."
            )
        if sorted(planned_operator.get("parentOperatorIds", [])) != current_operator[
            "parentOperatorIds"
        ] or planned_operator.get("origin") != current_operator["origin"]:
            raise ValueError(
                f"Operator {operator_id} lineage differs from the previous breeding plan."
            )
        if current_operator["instruction"] != planned_instruction:
            raise ValueError(
                f"Operator {operator_id} instruction differs from the sealed "
                "exact-text breeding-plan contract."
            )


def generation_seal_payload(log: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "schemaVersion": log.get("schemaVersion"),
        "source": log.get("source"),
        "evolutionId": log.get("evolutionId"),
        "generation": log.get("generation"),
        "generationId": log.get("generationId"),
        "evolutionProfileDigest": log.get("evolutionProfileDigest"),
        "candidateRanking": log.get("candidateRanking"),
        "operatorRanking": log.get("operatorRanking"),
        "breedingPlan": log.get("breedingPlan"),
        "holdoutPromotion": log.get("holdoutPromotion"),
    }
    for key in (
        "phase",
        "requestedPhase",
        "decision",
        "diagnosticOnly",
        "chainEligible",
        "holdoutOpened",
        "promotion",
        "selectedDevelopment",
        "holdoutReleaseBinding",
        "developmentEvidenceIdentity",
        "developmentEvidenceIdentityDigest",
        "repairPlan",
    ):
        if key in log:
            payload[key] = log[key]
    # Historical full logs predate explicit phase markers and did not seal this
    # field. Every newly phased log binds the negative-selection assertion.
    if "phase" in log and "holdoutUsedForDevelopmentSelection" in log:
        payload["holdoutUsedForDevelopmentSelection"] = log[
            "holdoutUsedForDevelopmentSelection"
        ]
    return payload


def public_evidence(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if not key.startswith("_")}


def candidate_attributable_diagnostic_summary(
    evidence: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    contracts = Counter(
        trial["candidateAttributableDiagnostic"]["contractId"]
        for candidate in evidence
        for trial in candidate["trials"]
        if trial.get("candidateAttributableDiagnostic") is not None
    )
    return {
        "matchedTrials": sum(contracts.values()),
        "contracts": dict(sorted(contracts.items())),
    }


def required_reward_vector(
    evidence: dict[str, Any], thresholds: dict[str, float]
) -> list[dict[str, Any]]:
    """Preserve the non-compensating required-reward vector for every trial."""

    return [
        {
            "trialId": trial["trialId"],
            "trialName": trial["trialName"],
            "taskName": trial["taskName"],
            "taskChecksum": trial["taskChecksum"],
            "values": {
                key: trial["requiredRewards"].get(key) for key in thresholds
            },
            "passes": {
                key: (
                    trial["requiredRewards"].get(key) is not None
                    and trial["requiredRewards"][key] >= threshold
                )
                for key, threshold in thresholds.items()
            },
        }
        for trial in sorted(evidence["trials"], key=lambda item: item["trialName"])
    ]


def aggregate_required_reward_gates(
    vector: list[dict[str, Any]], thresholds: dict[str, float]
) -> dict[str, bool]:
    return {
        key: bool(vector) and all(trial["passes"][key] for trial in vector)
        for key in thresholds
    }


def rank_generation(
    config: dict[str, Any],
    evidence_by_id: dict[str, dict[str, Any]],
    *,
    allow_incomplete_operator_population: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    baseline_lines = skill_line_count(
        next(
            item["skill"]
            for item in config["candidates"]
            if item["candidateId"] == config["baselineCandidateId"]
        )
    )
    candidate_by_id = {item["candidateId"]: item for item in config["candidates"]}
    computed = {}
    for candidate_id, evidence in evidence_by_id.items():
        source = candidate_by_id[candidate_id]
        hard_gate_reasons = []
        if evidence["errorCount"]:
            hard_gate_reasons.append(f"{evidence['errorCount']} Harbor trial errors")
        if evidence["qualification"]["missingRequiredRewards"]:
            count = evidence["qualification"]["missingRequiredRewards"]
            hard_gate_reasons.append(
                f"{count} missing required rewards"
            )
        if evidence["qualification"]["belowThresholdRewards"]:
            count = evidence["qualification"]["belowThresholdRewards"]
            hard_gate_reasons.append(
                f"{count} below-threshold required rewards"
            )
        if evidence["qualification"]["infrastructureFailures"]:
            count = evidence["qualification"]["infrastructureFailures"]
            hard_gate_reasons.append(
                f"{count} non-evaluable diagnostic failures"
            )
        if evidence["qualification"].get("candidateAttributableFailures", 0):
            count = evidence["qualification"]["candidateAttributableFailures"]
            hard_gate_reasons.append(
                f"{count} candidate-attributable diagnostic failures"
            )
        hard_gates_passed = evidence["qualification"]["passed"]
        effective_fitness = (
            None
            if not evidence["fitnessAvailable"]
            else (evidence["rawFitness"] if hard_gates_passed else 0.0)
        )
        reward_vector = required_reward_vector(
            evidence, config["harbor"]["requiredRewards"]
        )
        computed[candidate_id] = {
            "candidateId": candidate_id,
            "parentCandidateId": source["parentCandidateId"],
            "operatorId": source["operatorId"],
            "rawFitness": evidence["rawFitness"],
            "effectiveFitness": effective_fitness,
            "fitnessAvailable": evidence["fitnessAvailable"],
            "qualified": hard_gates_passed,
            "identityMode": evidence["identityMode"],
            "promotionEligibleIdentity": evidence["promotionEligibleIdentity"],
            "exploratory": evidence["exploratory"],
            "identityReason": evidence["identityReason"],
            "qualification": evidence["qualification"],
            "requiredRewardVector": reward_vector,
            "requiredRewardGates": aggregate_required_reward_gates(
                reward_vector, config["harbor"]["requiredRewards"]
            ),
            "hardGatesPassed": hard_gates_passed,
            "hardGateReasons": hard_gate_reasons,
            "caseScores": evidence["caseScores"],
            "complexityDelta": skill_line_count(source["skill"]) - baseline_lines,
            "evaluationCost": evidence["completedTrials"],
            "skillDigest": evidence["skillDigest"],
            "jobDirectory": evidence["jobDirectory"],
            "errorCount": evidence["errorCount"],
        }
    for candidate_id, item in computed.items():
        parent_id = item["parentCandidateId"]
        if parent_id is None:
            item["parentFitness"] = None
            item["caseRegressions"] = []
            item["improvement"] = (
                0.0 if item["effectiveFitness"] is not None else None
            )
            item["creditedImprovement"] = item["improvement"]
        else:
            parent_fitness = computed[parent_id]["effectiveFitness"]
            item["parentFitness"] = parent_fitness
            item["improvement"] = (
                item["effectiveFitness"] - parent_fitness
                if item["effectiveFitness"] is not None
                and parent_fitness is not None
                else None
            )
            parent_cases = computed[parent_id]["caseScores"]
            item["caseRegressions"] = sorted(
                case
                for case, score in item["caseScores"].items()
                if score is not None
                and parent_cases.get(case) is not None
                and score < parent_cases[case]
            )
            item["creditedImprovement"] = (
                None
                if item["caseRegressions"]
                and not config["coevolution"]["allowCaseRegressionsForCredit"]
                else item["improvement"]
            )

    ranking = sorted(
        computed.values(),
        key=lambda item: (
            not item["qualified"],
            item["effectiveFitness"] is None,
            -(item["effectiveFitness"] or 0),
            item["improvement"] is None,
            -(item["improvement"] or 0),
            item["complexityDelta"],
            item["evaluationCost"],
            item["candidateId"],
        ),
    )
    qualified_ranking = [item for item in ranking if item["qualified"]]
    candidate_survivors = [
        item["candidateId"]
        for item in qualified_ranking[: config["coevolution"]["candidateSurvivors"]]
    ]
    candidate_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "generationId": config["generationId"],
        "ranking": ranking,
        "survivors": candidate_survivors,
        "diagnosticOnly": (
            not candidate_survivors
            and config["coevolution"]["complementaryRepair"]
        ),
        "fitnessAwarded": not (
            not candidate_survivors
            and config["coevolution"]["complementaryRepair"]
        ),
    }

    operator_rows = []
    minimum_operator_trials = config["coevolution"]["minimumOperatorTrials"]
    for operator in config["operators"]:
        children = [
            item
            for item in computed.values()
            if item["operatorId"] == operator["operatorId"]
        ]
        raw_improvements = [
            item["improvement"]
            for item in children
            if item["improvement"] is not None
        ]
        improvements = [
            item["creditedImprovement"]
            for item in children
            if item["creditedImprovement"] is not None
        ]
        qualified_children = [item for item in children if item["qualified"]]
        unavailable_credit = [
            item for item in children if item["creditedImprovement"] is None
        ]
        regression_blocked = [
            item
            for item in children
            if item["caseRegressions"]
            and item["improvement"] is not None
            and item["creditedImprovement"] is None
        ]
        established = len(improvements) >= minimum_operator_trials
        credit_eligible = established and bool(qualified_children)
        operator_rows.append(
            {
                **operator,
                "trialCount": len(children),
                "creditTrialCount": len(improvements),
                "minimumCreditTrials": minimum_operator_trials,
                "unavailableCreditCount": len(unavailable_credit),
                "qualifiedChildCount": len(qualified_children),
                "unqualifiedChildCount": len(children) - len(qualified_children),
                "meanImprovement": (
                    mean(raw_improvements) if raw_improvements else None
                ),
                "creditedMeanImprovement": (
                    mean(improvements) if credit_eligible else None
                ),
                "successRate": (
                    sum(1 for value in improvements if value > 0) / len(improvements)
                    if improvements
                    else None
                ),
                "bestImprovement": max(improvements) if improvements else None,
                "established": established,
                "creditEligible": credit_eligible,
                "childCandidateIds": sorted(item["candidateId"] for item in children),
                "unavailableCreditCandidateIds": sorted(
                    item["candidateId"] for item in unavailable_credit
                ),
                "regressionBlockedCreditCount": len(regression_blocked),
                "regressionBlockedCandidateIds": sorted(
                    item["candidateId"] for item in regression_blocked
                ),
            }
        )
    operator_rows.sort(
        key=lambda item: (
            not item["creditEligible"],
            not item["established"],
            item["trialCount"] == 0,
            item["creditTrialCount"] == 0,
            item["qualifiedChildCount"] == 0,
            -(item["creditedMeanImprovement"] or 0),
            -(item["successRate"] or 0),
            -(item["bestImprovement"] or 0),
            -item["trialCount"],
            item["operatorId"],
        )
    )
    evaluated_operators = [item for item in operator_rows if item["creditEligible"]]
    survivor_count = config["coevolution"]["operatorSurvivors"]
    repair_diagnostic_only = (
        not candidate_survivors and config["coevolution"]["complementaryRepair"]
    )
    insufficient_established_operators = len(evaluated_operators) < survivor_count
    if (
        insufficient_established_operators
        and not repair_diagnostic_only
        and not allow_incomplete_operator_population
    ):
        raise ValueError(
            f"Need {survivor_count} established operators with qualified children "
            f"and at least {minimum_operator_trials} creditable parent-child "
            f"comparisons; found {len(evaluated_operators)}."
        )
    operator_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "generationId": config["generationId"],
        "minimumOperatorTrials": minimum_operator_trials,
        "requiredOperatorSurvivors": survivor_count,
        "eligibleOperatorIds": [
            item["operatorId"] for item in evaluated_operators
        ],
        "insufficientEstablishedOperators": insufficient_established_operators,
        "ranking": operator_rows,
        "survivors": (
            []
            if repair_diagnostic_only or insufficient_established_operators
            else [
                item["operatorId"] for item in evaluated_operators[:survivor_count]
            ]
        ),
        "diagnosticOnly": repair_diagnostic_only,
        "creditAwarded": not repair_diagnostic_only,
    }
    return candidate_output, operator_output


def _repair_evidence_reasons(
    candidate: dict[str, Any], thresholds: dict[str, float]
) -> list[str]:
    reasons = []
    if not thresholds:
        reasons.append("no-required-reward-gates")
    if candidate["parentCandidateId"] is None or candidate["operatorId"] is None:
        reasons.append("not-a-generated-child")
    if not candidate["fitnessAvailable"]:
        reasons.append("evaluation-unavailable")
    if candidate["errorCount"]:
        reasons.append("trial-error")
    if candidate["qualification"]["infrastructureFailures"]:
        reasons.append("non-evaluable-diagnostic")
    if candidate["qualification"].get("candidateAttributableFailures", 0):
        reasons.append("candidate-attributable-diagnostic")
    if any(
        value is None
        for trial in candidate["requiredRewardVector"]
        for value in trial["values"].values()
    ):
        reasons.append("missing-required-reward-value")
    return reasons


def build_complementary_repair_plan(
    config: dict[str, Any],
    candidate_output: dict[str, Any],
    operator_output: dict[str, Any],
) -> dict[str, Any]:
    """Build a non-promotable repair hypothesis from complementary gate evidence."""

    thresholds = config["harbor"]["requiredRewards"]
    by_id = {item["candidateId"]: item for item in candidate_output["ranking"]}
    repair_candidates = []
    excluded = []
    for candidate in sorted(by_id.values(), key=lambda item: item["candidateId"]):
        reasons = _repair_evidence_reasons(candidate, thresholds)
        parent = (
            by_id.get(candidate["parentCandidateId"])
            if candidate["parentCandidateId"] is not None
            else None
        )
        if candidate["parentCandidateId"] is not None and parent is None:
            reasons.append("evaluated-parent-missing")
        if parent is not None:
            parent_reasons = _repair_evidence_reasons(
                {
                    **parent,
                    "parentCandidateId": "root-evidence",
                    "operatorId": "root-evidence",
                },
                thresholds,
            )
            parent_reasons = [
                reason for reason in parent_reasons if reason != "not-a-generated-child"
            ]
            if parent_reasons:
                reasons.extend(f"evaluated-parent-{reason}" for reason in parent_reasons)
        if reasons:
            excluded.append(
                {
                    "candidateId": candidate["candidateId"],
                    "reasons": sorted(set(reasons)),
                }
            )
            continue
        assert parent is not None
        passed = {
            key for key, value in candidate["requiredRewardGates"].items() if value
        }
        parent_passed = {
            key for key, value in parent["requiredRewardGates"].items() if value
        }
        gained = passed - parent_passed
        lost = parent_passed - passed
        if lost or not gained:
            exclusion_reasons = []
            if lost:
                exclusion_reasons.append("regresses-parent-required-reward-gate")
            if not gained:
                exclusion_reasons.append("adds-no-required-reward-gate")
            excluded.append(
                {
                    "candidateId": candidate["candidateId"],
                    "reasons": exclusion_reasons,
                }
            )
            continue
        repair_candidates.append(
            {
                "candidate": candidate,
                "parent": parent,
                "passed": passed,
                "failed": set(thresholds) - passed,
                "gained": gained,
            }
        )

    repair_trial_counts = Counter(
        item["candidate"]["operatorId"] for item in repair_candidates
    )
    minimum_trials = config["coevolution"]["minimumOperatorTrials"]
    established_operator_ids = {
        operator_id
        for operator_id, count in repair_trial_counts.items()
        if count >= minimum_trials
    }
    for item in repair_candidates:
        if item["candidate"]["operatorId"] not in established_operator_ids:
            excluded.append(
                {
                    "candidateId": item["candidate"]["candidateId"],
                    "reasons": ["operator-below-minimum-repair-trials"],
                }
            )
    established_candidates = [
        item
        for item in repair_candidates
        if item["candidate"]["operatorId"] in established_operator_ids
    ]

    instruction = (
        "Cross over the two independently evaluated operator effects. Preserve the "
        "shared parent's passing required-reward behaviors, retain each candidate's "
        "exclusive gate contribution without compensating across gates or trials, "
        "and apply a focused mutation for any remaining required-reward gaps. "
        "Evaluate the resulting child from the same parent under the frozen "
        "development profile before assigning fitness or operator credit."
    )
    combinations = []
    for left_index, left in enumerate(established_candidates):
        for right in established_candidates[left_index + 1 :]:
            left_candidate = left["candidate"]
            right_candidate = right["candidate"]
            if (
                left_candidate["parentCandidateId"]
                != right_candidate["parentCandidateId"]
                or left_candidate["operatorId"] == right_candidate["operatorId"]
            ):
                continue
            left_exclusive = left["gained"] - right["gained"]
            right_exclusive = right["gained"] - left["gained"]
            if not left_exclusive or not right_exclusive:
                continue
            union = left["passed"] | right["passed"]
            shared_parent = left["parent"]
            combinations.append(
                {
                    "sharedParentCandidateId": left_candidate["parentCandidateId"],
                    "sharedParentSkillDigest": shared_parent["skillDigest"],
                    "sharedParentRequiredRewardVector": shared_parent[
                        "requiredRewardVector"
                    ],
                    "candidateParents": [
                        {
                            "candidateId": item["candidate"]["candidateId"],
                            "operatorId": item["candidate"]["operatorId"],
                            "skillDigest": item["candidate"]["skillDigest"],
                            "identityMode": item["candidate"]["identityMode"],
                            "exploratory": item["candidate"]["exploratory"],
                            "passedGates": sorted(item["passed"]),
                            "failedGates": sorted(item["failed"]),
                            "contributedGates": sorted(item["gained"]),
                            "exclusiveGates": sorted(exclusive),
                            "requiredRewardVector": item["candidate"][
                                "requiredRewardVector"
                            ],
                        }
                        for item, exclusive in (
                            (left, left_exclusive),
                            (right, right_exclusive),
                        )
                    ],
                    "unionPassedGates": sorted(union),
                    "remainingGaps": sorted(set(thresholds) - union),
                    "instruction": instruction,
                }
            )
    combinations.sort(
        key=lambda item: (
            len(item["remainingGaps"]),
            -len(item["unionPassedGates"]),
            item["sharedParentCandidateId"],
            [parent["candidateId"] for parent in item["candidateParents"]],
        )
    )
    return {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "generationId": config["generationId"],
        "mode": "complementary-repair",
        "diagnosticOnly": True,
        "chainEligible": False,
        "fitnessAwarded": False,
        "operatorCreditAwarded": False,
        "candidateSurvivors": [],
        "operatorSurvivors": [],
        "holdoutOpened": False,
        "promotion": False,
        "reason": "no-qualified-development-candidate",
        "requiredRewardThresholds": thresholds,
        "minimumOperatorTrials": minimum_trials,
        "operatorRepairTrialCounts": dict(sorted(repair_trial_counts.items())),
        "establishedRepairOperatorIds": sorted(established_operator_ids),
        "eligibleCandidateIds": sorted(
            item["candidate"]["candidateId"] for item in established_candidates
        ),
        "excludedCandidates": sorted(
            excluded, key=lambda item: (item["candidateId"], item["reasons"])
        ),
        "combinations": combinations,
        "planned": bool(combinations),
        "selectedPlan": combinations[0] if combinations else None,
        "nextStep": (
            "Realize the selected generic instruction as a new attributed child, "
            "then run a fresh development evaluation before normal survival or holdout."
            if combinations
            else "Collect complementary, same-parent, fully evaluable gate evidence."
        ),
    }


def build_breeding_plan(
    config: dict[str, Any], operator_output: dict[str, Any]
) -> dict[str, Any]:
    by_id = {item["operatorId"]: item for item in config["operators"]}
    ranked_by_id = {
        item["operatorId"]: item for item in operator_output["ranking"]
    }
    survivor_ids = operator_output["survivors"]
    ineligible_survivors = [
        operator_id
        for operator_id in survivor_ids
        if not ranked_by_id[operator_id]["creditEligible"]
    ]
    if ineligible_survivors:
        raise ValueError(
            "Breeding requires established, credit-eligible operator survivors; "
            "ineligible: " + ", ".join(ineligible_survivors)
        )
    target = config["coevolution"]["nextOperatorCount"]
    next_operators = []
    for index, operator_id in enumerate(survivor_ids):
        next_operators.append(
            {
                "operatorId": f"next-operator-{index:02d}",
                "origin": "survivor",
                "parentOperatorIds": [operator_id],
                "instruction": by_id[operator_id]["instruction"],
            }
        )
    for index in range(len(next_operators), target):
        child_index = index - len(survivor_ids)
        left_id = survivor_ids[child_index % len(survivor_ids)]
        right_id = survivor_ids[(child_index + 1) % len(survivor_ids)]
        crossover = child_index % 2 == 1
        next_operators.append(
            {
                "operatorId": f"next-operator-{index:02d}",
                "origin": "crossover-plan" if crossover else "mutation-plan",
                "parentOperatorIds": [left_id, right_id] if crossover else [left_id],
                "instruction": (
                    f"Combine the transferable strengths of {left_id} and {right_id} "
                    "into one concise mutation instruction; remove conflicts and "
                    "benchmark-specific details."
                    if crossover
                    else f"Mutate {left_id} to address its weakest observed child "
                    "outcome while preserving its successful general rule."
                ),
            }
        )
    for operator in next_operators:
        operator["instructionContract"] = {
            "mode": "exact-text-v1",
            "instructionDigest": stable_digest(
                {"instruction": operator["instruction"]}
            ),
        }
    return {
        "schemaVersion": 1,
        "sourceGenerationId": config["generationId"],
        "diagnosticOnly": False,
        "chainEligible": True,
        "operatorCount": target,
        "operators": next_operators,
    }


def summarize_holdout(
    config: dict[str, Any],
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    development_candidate: dict[str, Any],
) -> dict[str, Any]:
    baseline_tasks = set(baseline["caseScores"])
    candidate_tasks = set(candidate["caseScores"])
    if baseline_tasks != candidate_tasks:
        raise ValueError("Harbor holdout jobs do not contain the same tasks.")
    per_task = []
    regressions = []
    unavailable_tasks = []
    for task_name in sorted(baseline_tasks):
        baseline_score = baseline["caseScores"][task_name]
        candidate_score = candidate["caseScores"][task_name]
        delta = (
            candidate_score - baseline_score
            if candidate_score is not None and baseline_score is not None
            else None
        )
        if delta is None:
            unavailable_tasks.append(task_name)
        elif delta < 0:
            regressions.append(task_name)
        per_task.append(
            {
                "taskName": task_name,
                "baselineMeanReward": baseline_score,
                "candidateMeanReward": candidate_score,
                "delta": delta,
            }
        )
    rules = {
        "minimumMeanGain": config["holdout"]["minimumMeanGain"],
        "allowTaskRegressions": config["holdout"]["allowTaskRegressions"],
        "requireNoErrors": config["holdout"]["requireNoErrors"],
        "requireCanonicalSkillIdentity": True,
    }
    gain = (
        candidate["rawFitness"] - baseline["rawFitness"]
        if candidate["rawFitness"] is not None
        and baseline["rawFitness"] is not None
        else None
    )
    required_rewards_complete = (
        baseline["qualification"]["missingRequiredRewards"] == 0
        and candidate["qualification"]["missingRequiredRewards"] == 0
    )
    identity_promotion_eligible = (
        development_candidate["promotionEligibleIdentity"]
        and not development_candidate["exploratory"]
        and baseline["promotionEligibleIdentity"]
        and candidate["promotionEligibleIdentity"]
    )
    promoted = (
        gain is not None
        and not unavailable_tasks
        and gain >= rules["minimumMeanGain"]
        and (rules["allowTaskRegressions"] or not regressions)
        and candidate["qualification"]["passed"]
        and required_rewards_complete
        and identity_promotion_eligible
        and (not rules["requireNoErrors"] or candidate["errorCount"] == 0)
    )
    candidate_evidence_identity = {
        "jobDirectory": candidate["jobDirectory"],
        "jobId": candidate["jobId"],
        "jobResultPath": candidate["jobResultPath"],
        "jobResultDigest": candidate["jobResultDigest"],
        "trials": [
            {
                "trialId": trial["trialId"],
                "resultPath": trial["resultPath"],
                "resultDigest": trial["resultDigest"],
            }
            for trial in sorted(
                candidate["trials"],
                key=lambda item: (item["trialName"], item["trialId"]),
            )
        ],
    }
    return {
        "schemaVersion": 1,
        "source": "harbor",
        "baselineCandidateId": baseline["candidateId"],
        "candidateId": candidate["candidateId"],
        "baselineSkillDigest": baseline["skillDigest"],
        "candidateSkillDigest": candidate["skillDigest"],
        "candidateEvidenceIdentity": candidate_evidence_identity,
        "candidateEvidenceIdentityDigest": stable_digest(
            candidate_evidence_identity
        ),
        "baselineJobDirectory": baseline["jobDirectory"],
        "candidateJobDirectory": candidate["jobDirectory"],
        "baselineMeanReward": baseline["rawFitness"],
        "candidateMeanReward": candidate["rawFitness"],
        "meanGain": gain,
        "candidateErrors": candidate["errorCount"],
        "baselineFitnessAvailable": baseline["fitnessAvailable"],
        "candidateFitnessAvailable": candidate["fitnessAvailable"],
        "baselineInfrastructureFailures": baseline["qualification"][
            "infrastructureFailures"
        ],
        "candidateInfrastructureFailures": candidate["qualification"][
            "infrastructureFailures"
        ],
        **(
            {
                "baselineCandidateAttributableFailures": baseline[
                    "qualification"
                ]["candidateAttributableFailures"],
                "candidateAttributableFailures": candidate["qualification"][
                    "candidateAttributableFailures"
                ],
            }
            if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                "contracts"
            ]
            else {}
        ),
        "baselineQualified": baseline["qualification"]["passed"],
        "candidateQualified": candidate["qualification"]["passed"],
        "baselineQualification": baseline["qualification"],
        "candidateQualification": candidate["qualification"],
        "baselineIdentityMode": baseline["identityMode"],
        "candidateIdentityMode": candidate["identityMode"],
        "developmentIdentityMode": development_candidate["identityMode"],
        "developmentIdentityPromotionEligible": development_candidate[
            "promotionEligibleIdentity"
        ],
        "identityPromotionEligible": identity_promotion_eligible,
        "exploratory": not identity_promotion_eligible,
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        "requiredRewardsComplete": required_rewards_complete,
        "unavailableTasks": unavailable_tasks,
        "regressedTasks": regressions,
        "perTask": per_task,
        "promotionRules": rules,
        "decision": "promote" if promoted else "keep-baseline",
        "promoted": promoted,
    }


def validate_holdout_isolation(
    development: list[dict[str, Any]], holdout: list[dict[str, Any]]
) -> None:
    development_names = {
        trial["taskName"] for item in development for trial in item["trials"]
    }
    development_checksums = {
        trial["taskChecksum"] for item in development for trial in item["trials"]
    }
    holdout_names = {
        trial["taskName"] for item in holdout for trial in item["trials"]
    }
    holdout_checksums = {
        trial["taskChecksum"] for item in holdout for trial in item["trials"]
    }
    overlapping_names = sorted(development_names & holdout_names)
    overlapping_checksums = sorted(development_checksums & holdout_checksums)
    if overlapping_names or overlapping_checksums:
        raise ValueError(
            "Holdout overlaps development by task name or checksum: "
            f"names={overlapping_names}, checksums={overlapping_checksums}."
        )


def selected_development_artifact(
    selected_candidate: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if selected_candidate is None:
        return None
    return {
        "candidateId": selected_candidate["candidateId"],
        "skillDigest": selected_candidate["skillDigest"],
        "qualified": selected_candidate["qualified"],
        "identityMode": selected_candidate["identityMode"],
        "promotionEligibleIdentity": selected_candidate[
            "promotionEligibleIdentity"
        ],
        "jobDirectory": selected_candidate["jobDirectory"],
    }


def holdout_release_binding(
    config: dict[str, Any],
    selected_candidate: dict[str, Any],
    holdout: dict[str, Any],
) -> dict[str, Any]:
    candidate_slot = require_mapping(
        config["holdoutDeclaration"].get("candidateSlot"),
        "holdoutDeclaration.candidateSlot",
    )
    return {
        "schemaVersion": 1,
        "candidateId": selected_candidate["candidateId"],
        "developmentSkillDigest": selected_candidate["skillDigest"],
        "holdoutCandidateSkillDigest": holdout["candidateSkillDigest"],
        "holdoutDeclarationDigest": stable_digest(
            config["holdoutDeclaration"]
        ),
        "candidateSlotDigest": stable_digest(candidate_slot),
        "candidateEvidenceIdentity": holdout["candidateEvidenceIdentity"],
        "candidateEvidenceIdentityDigest": holdout[
            "candidateEvidenceIdentityDigest"
        ],
    }


def unopened_holdout_artifact(
    *,
    reason: str,
    selected_candidate: dict[str, Any] | None,
    diagnostic_only: bool,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "opened": False,
        "holdoutOpened": False,
        "diagnosticOnly": diagnostic_only,
        "chainEligible": False,
        "selectedCandidateId": (
            selected_candidate["candidateId"] if selected_candidate is not None else None
        ),
        "selectedCandidateSkillDigest": (
            selected_candidate["skillDigest"] if selected_candidate is not None else None
        ),
        "decision": "not-opened",
        "promotion": False,
        "promoted": False,
        "reason": reason,
    }


def render_development_report(
    config: dict[str, Any],
    candidate_output: dict[str, Any],
    operator_output: dict[str, Any],
    repair_plan: dict[str, Any] | None,
    *,
    chain_eligible: bool,
) -> str:
    selected = (
        next(
            item
            for item in candidate_output["ranking"]
            if item["candidateId"] == candidate_output["survivors"][0]
        )
        if candidate_output["survivors"]
        else None
    )
    if repair_plan is not None:
        decision = (
            "COMPLEMENTARY REPAIR PLAN"
            if repair_plan["planned"]
            else "INSUFFICIENT COMPLEMENTARY EVIDENCE"
        )
    else:
        decision = "DEVELOPMENT CANDIDATE SEALED"
    lines = [
        f"# Harbor Operator Coevolution: {config['generationId']}",
        "",
        f"Decision: **{decision}**",
        "",
        "## Development phase",
        "",
        f"- Selected candidate: `{selected['candidateId']}`"
        if selected is not None
        else "- Selected candidate: none",
        f"- Selected skill digest: `{selected['skillDigest']}`"
        if selected is not None
        else "- Selected skill digest: none",
        f"- Candidate survivors: {', '.join(candidate_output['survivors']) or 'none'}",
        f"- Operator survivors: {', '.join(operator_output['survivors']) or 'none'}",
        "- Holdout opened: no",
        "- Promotion: false",
        f"- Chain eligible: {str(chain_eligible).lower()}",
        *(
            [
                "- Candidate-attributable diagnostic failures: "
                + str(
                    sum(
                        item["qualification"].get(
                            "candidateAttributableFailures", 0
                        )
                        for item in candidate_output["ranking"]
                    )
                )
            ]
            if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                "contracts"
            ]
            else []
        ),
        "",
    ]
    if repair_plan is not None:
        lines.extend(
            [
                "## Complementary repair",
                "",
                "This artifact is diagnostic-only. It assigns no candidate fitness, "
                "operator credit, survival, promotion, or holdout access.",
                "",
                f"- Plan available: {str(repair_plan['planned']).lower()}",
                "- Eligible evidence candidates: "
                + (", ".join(repair_plan["eligibleCandidateIds"]) or "none"),
                "- Remaining gaps: "
                + (
                    ", ".join(repair_plan["selectedPlan"]["remainingGaps"])
                    if repair_plan["selectedPlan"] is not None
                    and repair_plan["selectedPlan"]["remainingGaps"]
                    else "none"
                ),
                "",
            ]
        )
    lines.extend(
        [
            "The holdout declarations remained frozen but their job paths were not "
            "resolved, loaded, validated, or executed in this phase.",
            "",
        ]
    )
    return "\n".join(lines)


def finalize_development_phase(
    config: dict[str, Any],
    development: list[dict[str, Any]],
    candidate_output: dict[str, Any],
    operator_output: dict[str, Any],
    *,
    analyze_only: bool,
    requested_phase: str,
    repair_plan: dict[str, Any] | None,
) -> dict[str, Any]:
    diagnostic_only = repair_plan is not None
    chain_eligible = requested_phase == "development-chain"
    if chain_eligible and (
        diagnostic_only or operator_output["insufficientEstablishedOperators"]
    ):
        raise ValueError(
            "Development-chain requires a qualified development winner and a "
            "complete normal breeding plan."
        )
    selected_candidate = (
        next(
            item
            for item in candidate_output["ranking"]
            if item["candidateId"] == candidate_output["survivors"][0]
        )
        if candidate_output["survivors"]
        else None
    )
    if chain_eligible and selected_candidate is None:
        raise ValueError(
            "Development-chain requires a selected development winner before "
            "the predecessor is sealed."
        )
    if diagnostic_only:
        breeding = {
            "schemaVersion": 1,
            "sourceGenerationId": config["generationId"],
            "diagnosticOnly": True,
            "chainEligible": False,
            "operatorCount": 0,
            "operators": [],
            "reason": "no-qualified-development-candidate",
        }
    elif operator_output["insufficientEstablishedOperators"]:
        breeding = {
            "schemaVersion": 1,
            "sourceGenerationId": config["generationId"],
            "diagnosticOnly": True,
            "chainEligible": False,
            "operatorCount": 0,
            "operators": [],
            "reason": "insufficient-established-operators",
            "requiredOperatorSurvivors": operator_output[
                "requiredOperatorSurvivors"
            ],
            "eligibleOperatorIds": operator_output["eligibleOperatorIds"],
        }
    else:
        breeding = build_breeding_plan(config, operator_output)
    holdout = unopened_holdout_artifact(
        reason=(
            "no-qualified-development-candidate"
            if diagnostic_only
            else "development-phase-only"
        ),
        selected_candidate=selected_candidate,
        diagnostic_only=diagnostic_only,
    )
    evolution_profile = build_development_evolution_profile(
        config,
        development,
        include_holdout_declaration=chain_eligible,
    )
    validate_previous_generation_profile(
        config,
        evolution_profile,
        development_evidence=development,
        development_only=True,
    )
    public_development = [public_evidence(item) for item in development]
    evidence_identity = development_evidence_identity(config, development)
    exploratory = any(item["exploratory"] for item in development)
    evidence_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "phase": "development",
        "requestedPhase": requested_phase,
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        **(
            {
                "candidateAttributableDiagnosticPolicy": config["harbor"][
                    "candidateAttributableDiagnosticPolicy"
                ],
                "candidateAttributableDiagnosticSummary": {
                    "development": candidate_attributable_diagnostic_summary(
                        development
                    ),
                    "holdout": {"matchedTrials": 0, "contracts": {}},
                },
            }
            if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                "contracts"
            ]
            else {}
        ),
        "exploratory": exploratory,
        "development": public_development,
        "holdout": [],
        "holdoutOpened": False,
    }
    selected_development = selected_development_artifact(selected_candidate)
    decision = (
        "repair-planned"
        if repair_plan is not None and repair_plan["planned"]
        else (
            "repair-evidence-insufficient"
            if repair_plan is not None
            else "development-selected"
        )
    )
    log = {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generation": config["generation"],
        "generationId": config["generationId"],
        "phase": "development",
        "requestedPhase": requested_phase,
        "decision": decision,
        "diagnosticOnly": diagnostic_only,
        "chainEligible": chain_eligible,
        "holdoutOpened": False,
        "promotion": False,
        "selectedDevelopment": selected_development,
        "developmentEvidenceIdentity": evidence_identity,
        "developmentEvidenceIdentityDigest": stable_digest(evidence_identity),
        "candidateRanking": candidate_output,
        "operatorRanking": operator_output,
        "breedingPlan": breeding,
        "repairPlan": repair_plan,
        "holdoutPromotion": holdout,
        "holdoutUsedForDevelopmentSelection": False,
        "exploratory": exploratory,
        "evolutionProfile": evolution_profile,
        "evolutionProfileDigest": stable_digest(evolution_profile),
    }
    log["generationSeal"] = stable_digest(generation_seal_payload(log))

    output = config["outputDirectory"]
    write_json(output / OUTPUT_FILES["evidence"], evidence_output)
    write_json(output / OUTPUT_FILES["candidates"], candidate_output)
    write_json(output / OUTPUT_FILES["operators"], operator_output)
    write_json(output / OUTPUT_FILES["breeding"], breeding)
    if repair_plan is not None:
        write_json(output / OUTPUT_FILES["repair"], repair_plan)
    write_json(output / OUTPUT_FILES["holdout"], holdout)
    write_json(output / OUTPUT_FILES["log"], log)
    (output / OUTPUT_FILES["report"]).write_text(
        render_development_report(
            config,
            candidate_output,
            operator_output,
            repair_plan,
            chain_eligible=chain_eligible,
        ),
        encoding="utf-8",
    )
    return {
        "mode": "analyze-only" if analyze_only else "live",
        "phase": "development",
        "requestedPhase": requested_phase,
        "decision": decision,
        "diagnosticOnly": diagnostic_only,
        "chainEligible": chain_eligible,
        "holdoutOpened": False,
        "promotion": False,
        "exploratory": exploratory,
        "topCandidate": (
            selected_candidate["candidateId"] if selected_candidate is not None else None
        ),
        "topOperator": (
            operator_output["survivors"][0]
            if operator_output["survivors"]
            else None
        ),
        "repairPlan": (
            str(output / OUTPUT_FILES["repair"]) if repair_plan is not None else None
        ),
        "outputDirectory": str(output),
        "log": str(output / OUTPUT_FILES["log"]),
        "report": str(output / OUTPUT_FILES["report"]),
    }


def render_report(
    config: dict[str, Any],
    candidate_output: dict[str, Any],
    operator_output: dict[str, Any],
    holdout: dict[str, Any],
) -> str:
    def metric(value: float | None, *, signed: bool = False) -> str:
        if value is None:
            return "unavailable"
        return f"{value:+.3f}" if signed else f"{value:.3f}"

    candidate = candidate_output["ranking"][0]
    operator = operator_output["ranking"][0]
    decision = "PROMOTE" if holdout["promoted"] else "KEEP BASELINE"
    lines = [
        f"# Harbor Operator Coevolution: {config['generationId']}",
        "",
        f"Decision: **{decision}**",
        "",
        "## Development selection",
        "",
        f"- Top candidate: `{candidate['candidateId']}` "
        f"({candidate['effectiveFitness']:.3f})",
        f"- Top operator: `{operator['operatorId']}` "
        f"(credited mean improvement {operator['creditedMeanImprovement']:+.3f})",
        f"- Candidate survivors: {', '.join(candidate_output['survivors'])}",
        f"- Operator survivors: {', '.join(operator_output['survivors'])}",
        "",
        "## Holdout gate",
        "",
        "| Task | Baseline | Candidate | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in holdout["perTask"]:
        lines.append(
            f"| {row['taskName']} | {metric(row['baselineMeanReward'])} | "
            f"{metric(row['candidateMeanReward'])} | "
            f"{metric(row['delta'], signed=True)} |"
        )
    lines.extend(
        [
            "",
            f"Overall gain: {metric(holdout['meanGain'], signed=True)}",
            f"Candidate errors: {holdout['candidateErrors']}",
            f"Identity promotion eligible: {holdout['identityPromotionEligible']}",
            "Candidate non-evaluable diagnostic failures: "
            f"{holdout['candidateInfrastructureFailures']}",
            *(
                [
                    "Candidate-attributable diagnostic failures: "
                    f"{holdout['candidateAttributableFailures']}"
                ]
                if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                    "contracts"
                ]
                else []
            ),
            "",
            "Holdout evidence was evaluated after development ranking and did not "
            "participate in operator credit or breeding.",
            "",
        ]
    )
    return "\n".join(lines)


def prepare_output_directory(path: Path) -> None:
    existing = [path / name for name in OUTPUT_FILES.values() if (path / name).exists()]
    if existing:
        raise ValueError(
            "Refusing to overwrite existing coevolution artifacts: "
            + ", ".join(str(item) for item in existing)
        )
    path.mkdir(parents=True, exist_ok=True)


def resolve_development_jobs(
    config: dict[str, Any], analyze_only: bool
) -> dict[str, Path]:
    paths = {}
    for candidate in config["candidates"]:
        if analyze_only:
            directory = candidate["jobDirectory"]
            if directory is None:
                raise ValueError(
                    f"--analyze-only requires jobDirectory for {candidate['candidateId']}."
                )
        else:
            job_config = candidate["jobConfig"]
            if job_config is None:
                raise ValueError(
                    f"Live mode requires jobConfig for {candidate['candidateId']}."
                )
            directory = asyncio.run(execute_native_job(job_config, candidate))
        paths[candidate["candidateId"]] = directory
    if len({str(path.resolve()) for path in paths.values()}) != len(paths):
        raise ValueError("Every candidate must use a separate Harbor job directory.")
    return paths


def resolve_holdout_jobs(
    config: dict[str, Any], analyze_only: bool
) -> dict[str, Path]:
    by_id = {item["candidateId"]: item for item in config["candidates"]}
    paths = {}
    for side in ("baseline", "candidate"):
        reference = config["holdout"][side]
        candidate = by_id[reference["candidateId"]]
        if analyze_only:
            directory = reference["jobDirectory"]
            if directory is None:
                raise ValueError(
                    f"--analyze-only requires jobDirectory for holdout.{side}."
                )
        else:
            job_config = reference["jobConfig"]
            if job_config is None:
                raise ValueError(f"Live mode requires jobConfig for holdout.{side}.")
            directory = asyncio.run(execute_native_job(job_config, candidate))
        paths[side] = directory
    if paths["baseline"].resolve() == paths["candidate"].resolve():
        raise ValueError("Holdout baseline and candidate require separate Harbor jobs.")
    return paths


def run_analysis(
    config: dict[str, Any], analyze_only: bool, phase: str = "full"
) -> dict[str, Any]:
    missing = [
        name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
    ]
    if missing and not analyze_only:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    prepare_output_directory(config["outputDirectory"])
    candidate_by_id = {item["candidateId"]: item for item in config["candidates"]}

    development_paths = resolve_development_jobs(config, analyze_only)
    development = [
        load_candidate_job(
            development_paths[item["candidateId"]],
            item,
            config["harbor"],
            allow_legacy_alias=analyze_only,
        )
        for item in config["candidates"]
    ]
    validate_fair_jobs(development, "development")
    evidence_by_id = {item["candidateId"]: item for item in development}

    # The development decision is complete before any holdout artifact is loaded.
    candidate_output, operator_output = rank_generation(
        config,
        evidence_by_id,
        allow_incomplete_operator_population=phase == "development",
    )
    if not candidate_output["survivors"]:
        if phase == "development-chain":
            raise ValueError(
                "Development-chain requires a qualified development winner; "
                "complementary repair cannot seed another generation."
            )
        if not config["coevolution"]["complementaryRepair"]:
            raise ValueError("No development candidate passed all qualification gates.")
        repair_plan = build_complementary_repair_plan(
            config, candidate_output, operator_output
        )
        return finalize_development_phase(
            config,
            development,
            candidate_output,
            operator_output,
            analyze_only=analyze_only,
            requested_phase=phase,
            repair_plan=repair_plan,
        )
    if phase in ("development", "development-chain"):
        return finalize_development_phase(
            config,
            development,
            candidate_output,
            operator_output,
            analyze_only=analyze_only,
            requested_phase=phase,
            repair_plan=None,
        )
    breeding = build_breeding_plan(config, operator_output)
    selected_candidate_id = candidate_output["survivors"][0]
    declared_holdout_candidate = config["holdout"]["candidate"]["candidateId"]
    if declared_holdout_candidate != selected_candidate_id:
        raise ValueError(
            f"Holdout candidate {declared_holdout_candidate} is not the top development "
            f"candidate {selected_candidate_id}; holdout cannot choose the candidate."
        )

    # Validate the predecessor, breeding lineage, and frozen development profile
    # before resolving any holdout reference. A later full-profile validation
    # additionally seals the newly observed holdout lock.
    validate_previous_generation_profile(
        config,
        build_development_evolution_profile(
            config,
            development,
            include_holdout_declaration=True,
        ),
        development_evidence=development,
        development_only=True,
    )
    resolve_deferred_holdout_references(config)
    holdout_paths = resolve_holdout_jobs(config, analyze_only)
    holdout_evidence = []
    for side in ("baseline", "candidate"):
        candidate = candidate_by_id[config["holdout"][side]["candidateId"]]
        holdout_evidence.append(
            load_candidate_job(
                holdout_paths[side],
                candidate,
                config["harbor"],
                allow_legacy_alias=analyze_only,
            )
        )
    validate_fair_jobs(holdout_evidence, "holdout")
    validate_holdout_isolation(development, holdout_evidence)
    validate_cross_phase_profile(development, holdout_evidence)
    evolution_profile = build_evolution_profile(
        config, development, holdout_evidence
    )
    validate_previous_generation_profile(
        config, evolution_profile, development_evidence=development
    )
    holdout = summarize_holdout(
        config,
        holdout_evidence[0],
        holdout_evidence[1],
        evidence_by_id[selected_candidate_id],
    )

    public_development = [public_evidence(item) for item in development]
    public_holdout_evidence = [public_evidence(item) for item in holdout_evidence]
    exploratory = any(
        item["exploratory"] for item in [*development, *holdout_evidence]
    )
    evidence_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        **(
            {
                "candidateAttributableDiagnosticPolicy": config["harbor"][
                    "candidateAttributableDiagnosticPolicy"
                ],
                "candidateAttributableDiagnosticSummary": {
                    "development": candidate_attributable_diagnostic_summary(
                        development
                    ),
                    "holdout": candidate_attributable_diagnostic_summary(
                        holdout_evidence
                    ),
                },
            }
            if config["harbor"]["candidateAttributableDiagnosticPolicy"][
                "contracts"
            ]
            else {}
        ),
        "exploratory": exploratory,
        "development": public_development,
        "holdout": public_holdout_evidence,
    }
    selected_ranking_candidate = next(
        item
        for item in candidate_output["ranking"]
        if item["candidateId"] == selected_candidate_id
    )
    selected_development = selected_development_artifact(
        selected_ranking_candidate
    )
    release_binding = holdout_release_binding(
        config, selected_ranking_candidate, holdout
    )
    evidence_identity = development_evidence_identity(config, development)
    log = {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generation": config["generation"],
        "generationId": config["generationId"],
        "phase": "full",
        "requestedPhase": "full",
        "decision": holdout["decision"],
        "diagnosticOnly": False,
        "chainEligible": True,
        "holdoutOpened": True,
        "promotion": holdout["promoted"],
        "selectedDevelopment": selected_development,
        "holdoutReleaseBinding": release_binding,
        "developmentEvidenceIdentity": evidence_identity,
        "developmentEvidenceIdentityDigest": stable_digest(evidence_identity),
        "candidateRanking": candidate_output,
        "operatorRanking": operator_output,
        "breedingPlan": breeding,
        "holdoutPromotion": holdout,
        "holdoutUsedForDevelopmentSelection": False,
        "exploratory": exploratory,
        "evolutionProfile": evolution_profile,
        "evolutionProfileDigest": stable_digest(evolution_profile),
    }
    log["generationSeal"] = stable_digest(generation_seal_payload(log))

    output = config["outputDirectory"]
    write_json(output / OUTPUT_FILES["evidence"], evidence_output)
    write_json(output / OUTPUT_FILES["candidates"], candidate_output)
    write_json(output / OUTPUT_FILES["operators"], operator_output)
    write_json(output / OUTPUT_FILES["breeding"], breeding)
    write_json(output / OUTPUT_FILES["holdout"], holdout)
    write_json(output / OUTPUT_FILES["log"], log)
    (output / OUTPUT_FILES["report"]).write_text(
        render_report(config, candidate_output, operator_output, holdout),
        encoding="utf-8",
    )
    return {
        "mode": "analyze-only" if analyze_only else "live",
        "decision": holdout["decision"],
        "exploratory": exploratory,
        "topCandidate": selected_candidate_id,
        "topOperator": operator_output["ranking"][0]["operatorId"],
        "outputDirectory": str(output),
        "log": str(output / OUTPUT_FILES["log"]),
        "report": str(output / OUTPUT_FILES["report"]),
    }


def validate_dry_run_job_configs(
    config: dict[str, Any], phase: str = "full"
) -> None:
    by_id = {item["candidateId"]: item for item in config["candidates"]}
    for candidate in config["candidates"]:
        if candidate["jobConfig"] is not None:
            job = load_native_job_config(candidate["jobConfig"])
            validate_job_config_skill(job, candidate, candidate["jobConfig"])
    if phase == "full":
        resolve_deferred_holdout_references(config)
        for side in ("baseline", "candidate"):
            reference = config["holdout"][side]
            if reference["jobConfig"] is not None:
                job = load_native_job_config(reference["jobConfig"])
                validate_job_config_skill(
                    job, by_id[reference["candidateId"]], reference["jobConfig"]
                )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--output-dir", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    mode.add_argument("--analyze-only", action="store_true")
    parser.add_argument(
        "--phase",
        choices=("full", "development", "development-chain"),
        default="full",
        help=(
            "Run the full workflow, a terminal development receipt, or an explicit "
            "chainable development predecessor; development modes never open holdout."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        config = normalize_config(args.config.resolve(), args.output_dir)
        if args.dry_run:
            validate_dry_run_job_configs(config, args.phase)
            result = public_plan(config, args.phase)
        elif args.doctor:
            result = doctor(config, args.phase)
        else:
            result = run_analysis(config, args.analyze_only, args.phase)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
