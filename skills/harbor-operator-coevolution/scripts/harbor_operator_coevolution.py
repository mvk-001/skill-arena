# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "pyyaml>=6,<7"]
# ///
"""Coevolve mutation operators from native Harbor candidate jobs."""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import math
import os
import re
import shutil
import statistics
import subprocess
from collections import defaultdict
from importlib.metadata import version
from pathlib import Path
from typing import Any, Iterable

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
    "holdout": "holdout-promotion.json",
    "log": "operator-coevolution-log.json",
    "report": "report.md",
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


def resolve_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    return raw.resolve() if raw.is_absolute() else (base / raw).resolve()


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
    return require_string(
        require_mapping(frontmatter, f"frontmatter in {skill_path}").get("name"),
        f"frontmatter.name in {skill_path}",
    )


def skill_line_count(skill_directory: Path) -> int:
    return len((skill_directory / "SKILL.md").read_text(encoding="utf-8").splitlines())


def normalize_job_reference(
    raw: dict[str, Any], base: Path, location: str
) -> dict[str, Path | None]:
    job_config = (
        resolve_path(base, raw["jobConfig"], f"{location}.jobConfig")
        if raw.get("jobConfig") is not None
        else None
    )
    job_directory = (
        resolve_path(base, raw["jobDirectory"], f"{location}.jobDirectory")
        if raw.get("jobDirectory") is not None
        else None
    )
    if job_config is None and job_directory is None:
        raise ValueError(f"{location} requires jobConfig or jobDirectory.")
    return {"jobConfig": job_config, "jobDirectory": job_directory}


def normalize_config(config_path: Path, output_override: Path | None) -> dict[str, Any]:
    raw = read_document(config_path)
    if raw.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1.")
    base = config_path.resolve().parent
    evolution = require_mapping(raw.get("evolution"), "evolution")
    harbor = require_mapping(raw.get("harbor", {}), "harbor")
    coevolution = require_mapping(raw.get("coevolution", {}), "coevolution")

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
        skill = resolve_path(base, entry.get("skill"), f"candidates[{index}].skill")
        if not skill.is_dir():
            raise ValueError(f"Candidate skill directory does not exist: {skill}")
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
    if not any(entry["operatorId"] is not None for entry in candidates):
        raise ValueError("At least one generated child candidate is required.")

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
    diagnostic_chars = int(harbor.get("diagnosticChars", 3000))
    if diagnostic_chars < 0 or diagnostic_chars > 20_000:
        raise ValueError("harbor.diagnosticChars must be in 0..20000.")

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
    if operator_survivors < 2:
        raise ValueError("coevolution.operatorSurvivors must be at least 2.")
    if next_operator_count < operator_survivors:
        raise ValueError(
            "coevolution.nextOperatorCount must be at least operatorSurvivors."
        )

    holdout_raw = require_mapping(raw.get("holdout"), "holdout")
    holdout_entries = {}
    for side in ("baseline", "candidate"):
        item = require_mapping(holdout_raw.get(side), f"holdout.{side}")
        candidate_id = require_string(
            item.get("candidateId"), f"holdout.{side}.candidateId"
        )
        if candidate_id not in candidate_id_set:
            raise ValueError(f"holdout.{side} references unknown candidate {candidate_id}.")
        holdout_entries[side] = {
            "candidateId": candidate_id,
            **normalize_job_reference(item, base, f"holdout.{side}"),
        }
    if holdout_entries["baseline"]["candidateId"] != baseline_id:
        raise ValueError("holdout.baseline must use evolution.baselineCandidateId.")

    minimum_mean_gain = float(holdout_raw.get("minimumMeanGain", 0))
    if not math.isfinite(minimum_mean_gain):
        raise ValueError("holdout.minimumMeanGain must be finite.")
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
    for side in ("baseline", "candidate"):
        job_directory = holdout_entries[side]["jobDirectory"]
        if job_directory is not None and (
            output == job_directory or output.is_relative_to(job_directory)
        ):
            raise ValueError("evolution.outputDir must not be inside a Harbor job.")
    return {
        "schemaVersion": 1,
        "id": require_string(evolution.get("id"), "evolution.id"),
        "generationId": require_string(
            evolution.get("generationId"), "evolution.generationId"
        ),
        "outputDirectory": output,
        "baselineCandidateId": baseline_id,
        "harbor": {
            "rewardKey": require_string(
                harbor.get("rewardKey", "reward"), "harbor.rewardKey"
            ),
            "passThreshold": pass_threshold,
            "requireNoErrors": bool(harbor.get("requireNoErrors", True)),
            "requiredEnv": required_env,
            "diagnosticChars": diagnostic_chars,
        },
        "coevolution": {
            "candidateSurvivors": candidate_survivors,
            "operatorSurvivors": operator_survivors,
            "nextOperatorCount": next_operator_count,
            "minimumOperatorTrials": minimum_operator_trials,
        },
        "operators": operators,
        "candidates": candidates,
        "holdout": {
            **holdout_entries,
            "minimumMeanGain": minimum_mean_gain,
            "allowTaskRegressions": bool(
                holdout_raw.get("allowTaskRegressions", False)
            ),
            "requireNoErrors": bool(holdout_raw.get("requireNoErrors", True)),
        },
    }


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


def validate_job_config_skill(
    config: JobConfig, candidate: dict[str, Any], source: Path
) -> None:
    declared = Path(str(config.agents[0].skills[0])).resolve()
    if declared != candidate["skill"]:
        raise ValueError(
            f"Harbor job {source} installs {declared}, expected candidate skill "
            f"{candidate['skill']}."
        )


def validate_locked_skill_identity(
    lock: JobLock,
    candidate: dict[str, Any],
    directory: Path,
) -> tuple[str, str, str]:
    expected_source = candidate["skill"]
    expected_digest = candidate["skillDigest"]
    expected_name = candidate["skillName"]
    allowed_names = {expected_name, expected_source.name}
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
                f"frontmatter name {expected_name!r} or source basename "
                f"{expected_source.name!r}."
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
    job = await Job.create(config)
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


def public_plan(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "dry-run",
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "outputDirectory": str(config["outputDirectory"]),
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredEnv": config["harbor"]["requiredEnv"],
        "missingRequiredEnv": [
            name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
        ],
        "candidates": [
            {
                "candidateId": item["candidateId"],
                "parentCandidateId": item["parentCandidateId"],
                "operatorId": item["operatorId"],
                "skill": str(item["skill"]),
                "skillDigest": item["skillDigest"],
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


def doctor(config: dict[str, Any]) -> dict[str, Any]:
    plan = public_plan(config)
    missing = plan["missingRequiredEnv"]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    references = [*config["candidates"]] + [
        config["holdout"][side] for side in ("baseline", "candidate")
    ]
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


def collect_diagnostics(trial_directory: Path, limit: int) -> dict[str, Any]:
    verifier = trial_directory / "verifier"
    agent = trial_directory / "agent"
    agent_text_paths = sorted(agent.glob("*.txt")) if agent.is_dir() else []
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
        "paths": {
            "trajectory": (
                str((agent / "trajectory.json").resolve())
                if (agent / "trajectory.json").is_file()
                else None
            ),
            "verifier": str(verifier.resolve()) if verifier.is_dir() else None,
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


def load_candidate_job(
    job_directory: Path,
    candidate: dict[str, Any],
    harbor_config: dict[str, Any],
) -> dict[str, Any]:
    directory = job_directory.resolve()
    config_path = directory / "config.json"
    lock_path = directory / "lock.json"
    result_path = directory / "result.json"
    job_config = JobConfig.model_validate_json(config_path.read_text(encoding="utf-8"))
    validate_one_candidate_job(job_config, config_path)
    validate_job_config_skill(job_config, candidate, config_path)
    raw_lock = read_json(lock_path)
    lock = JobLock.model_validate(raw_lock)
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
        lock, candidate, directory
    )

    reward_key = harbor_config["rewardKey"]
    pass_threshold = harbor_config["passThreshold"]
    records = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for trial, path in loaded_trials:
        if len(trial.config.agent.skills) != 1:
            raise ValueError(
                f"Trial {trial.trial_name} must declare exactly one candidate skill."
            )
        trial_source = Path(
            str(trial.config.agent.skills[0])
        ).expanduser().resolve()
        if trial_source != candidate["skill"]:
            raise ValueError(
                f"Trial skill source mismatch for candidate "
                f"{candidate['candidateId']}: trial {trial.trial_name} has "
                f"{trial_source}, expected {candidate['skill']}."
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
        reward = rewards.get(reward_key)
        if reward is None and error is None:
            raise ValueError(
                f"Trial {trial.trial_name} has no '{reward_key}' reward or exception."
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
        score = 0.0 if error is not None else float(reward)
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
                "score": score,
                "passed": error is None and score >= pass_threshold,
                "error": error,
                "resultPath": str(path.resolve()),
                "diagnostics": collect_diagnostics(
                    path.parent, harbor_config["diagnosticChars"]
                ),
            }
        )

    scores_by_task: dict[str, list[float]] = defaultdict(list)
    checksums_by_task: dict[str, set[str]] = defaultdict(set)
    for record in records:
        scores_by_task[record["taskName"]].append(record["score"])
        checksums_by_task[record["taskName"]].add(record["taskChecksum"])
    if any(len(values) != 1 for values in checksums_by_task.values()):
        raise ValueError(f"Task checksum drift inside Harbor job {directory}.")
    case_scores = {
        task_name: mean(scores_by_task[task_name])
        for task_name in sorted(scores_by_task)
    }
    return {
        "candidateId": candidate["candidateId"],
        "skill": str(candidate["skill"]),
        "skillName": candidate["skillName"],
        "lockedSkillName": locked_name,
        "skillSource": locked_source,
        "skillDigest": locked_digest,
        "jobDirectory": str(directory),
        "jobName": job_config.job_name,
        "completedTrials": len(records),
        "passedTrials": sum(1 for record in records if record["passed"]),
        "errorCount": sum(1 for record in records if record["error"] is not None),
        "caseScores": case_scores,
        "rawFitness": mean(case_scores.values()),
        "trials": sorted(records, key=lambda item: item["trialName"]),
        "fairnessSignature": fairness_signature(records),
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


def public_evidence(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if not key.startswith("_")}


def rank_generation(
    config: dict[str, Any], evidence_by_id: dict[str, dict[str, Any]]
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
        hard_gates_passed = (
            not config["harbor"]["requireNoErrors"] or evidence["errorCount"] == 0
        )
        computed[candidate_id] = {
            "candidateId": candidate_id,
            "parentCandidateId": source["parentCandidateId"],
            "operatorId": source["operatorId"],
            "rawFitness": evidence["rawFitness"],
            "effectiveFitness": evidence["rawFitness"] if hard_gates_passed else 0.0,
            "hardGatesPassed": hard_gates_passed,
            "hardGateReasons": (
                []
                if hard_gates_passed
                else [f"{evidence['errorCount']} Harbor trial errors"]
            ),
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
            item["improvement"] = 0.0
        else:
            parent_fitness = computed[parent_id]["effectiveFitness"]
            item["parentFitness"] = parent_fitness
            item["improvement"] = item["effectiveFitness"] - parent_fitness

    ranking = sorted(
        computed.values(),
        key=lambda item: (
            -item["effectiveFitness"],
            -item["improvement"],
            item["complexityDelta"],
            item["evaluationCost"],
            item["candidateId"],
        ),
    )
    candidate_survivors = [
        item["candidateId"]
        for item in ranking[: config["coevolution"]["candidateSurvivors"]]
    ]
    candidate_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "generationId": config["generationId"],
        "ranking": ranking,
        "survivors": candidate_survivors,
    }

    operator_rows = []
    for operator in config["operators"]:
        children = [
            item
            for item in computed.values()
            if item["operatorId"] == operator["operatorId"]
        ]
        improvements = [item["improvement"] for item in children]
        operator_rows.append(
            {
                **operator,
                "trialCount": len(children),
                "meanImprovement": mean(improvements) if improvements else None,
                "successRate": (
                    sum(1 for value in improvements if value > 0) / len(improvements)
                    if improvements
                    else None
                ),
                "bestImprovement": max(improvements) if improvements else None,
                "established": (
                    len(children) >= config["coevolution"]["minimumOperatorTrials"]
                ),
                "childCandidateIds": sorted(item["candidateId"] for item in children),
            }
        )
    operator_rows.sort(
        key=lambda item: (
            item["trialCount"] == 0,
            -(item["meanImprovement"] or 0),
            -(item["successRate"] or 0),
            -(item["bestImprovement"] or 0),
            -item["trialCount"],
            item["operatorId"],
        )
    )
    evaluated_operators = [item for item in operator_rows if item["trialCount"] > 0]
    survivor_count = config["coevolution"]["operatorSurvivors"]
    if len(evaluated_operators) < survivor_count:
        raise ValueError(
            f"Need {survivor_count} evaluated operators, found {len(evaluated_operators)}."
        )
    operator_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "generationId": config["generationId"],
        "ranking": operator_rows,
        "survivors": [
            item["operatorId"] for item in evaluated_operators[:survivor_count]
        ],
    }
    return candidate_output, operator_output


def build_breeding_plan(
    config: dict[str, Any], operator_output: dict[str, Any]
) -> dict[str, Any]:
    by_id = {item["operatorId"]: item for item in config["operators"]}
    survivor_ids = operator_output["survivors"]
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
    return {
        "schemaVersion": 1,
        "sourceGenerationId": config["generationId"],
        "operatorCount": target,
        "operators": next_operators,
    }


def summarize_holdout(
    config: dict[str, Any],
    baseline: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    baseline_tasks = set(baseline["caseScores"])
    candidate_tasks = set(candidate["caseScores"])
    if baseline_tasks != candidate_tasks:
        raise ValueError("Harbor holdout jobs do not contain the same tasks.")
    per_task = []
    regressions = []
    for task_name in sorted(baseline_tasks):
        baseline_score = baseline["caseScores"][task_name]
        candidate_score = candidate["caseScores"][task_name]
        delta = candidate_score - baseline_score
        if delta < 0:
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
    }
    gain = candidate["rawFitness"] - baseline["rawFitness"]
    promoted = (
        gain >= rules["minimumMeanGain"]
        and (rules["allowTaskRegressions"] or not regressions)
        and (not rules["requireNoErrors"] or candidate["errorCount"] == 0)
    )
    return {
        "schemaVersion": 1,
        "source": "harbor",
        "baselineCandidateId": baseline["candidateId"],
        "candidateId": candidate["candidateId"],
        "baselineJobDirectory": baseline["jobDirectory"],
        "candidateJobDirectory": candidate["jobDirectory"],
        "baselineMeanReward": baseline["rawFitness"],
        "candidateMeanReward": candidate["rawFitness"],
        "meanGain": gain,
        "candidateErrors": candidate["errorCount"],
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


def render_report(
    config: dict[str, Any],
    candidate_output: dict[str, Any],
    operator_output: dict[str, Any],
    holdout: dict[str, Any],
) -> str:
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
        f"(mean improvement {operator['meanImprovement']:+.3f})",
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
            f"| {row['taskName']} | {row['baselineMeanReward']:.3f} | "
            f"{row['candidateMeanReward']:.3f} | {row['delta']:+.3f} |"
        )
    lines.extend(
        [
            "",
            f"Overall gain: {holdout['meanGain']:+.3f}",
            f"Candidate errors: {holdout['candidateErrors']}",
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


def run_analysis(config: dict[str, Any], analyze_only: bool) -> dict[str, Any]:
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
            development_paths[item["candidateId"]], item, config["harbor"]
        )
        for item in config["candidates"]
    ]
    validate_fair_jobs(development, "development")
    evidence_by_id = {item["candidateId"]: item for item in development}

    # The development decision is complete before any holdout artifact is loaded.
    candidate_output, operator_output = rank_generation(config, evidence_by_id)
    breeding = build_breeding_plan(config, operator_output)
    selected_candidate_id = candidate_output["ranking"][0]["candidateId"]
    declared_holdout_candidate = config["holdout"]["candidate"]["candidateId"]
    if declared_holdout_candidate != selected_candidate_id:
        raise ValueError(
            f"Holdout candidate {declared_holdout_candidate} is not the top development "
            f"candidate {selected_candidate_id}; holdout cannot choose the candidate."
        )

    holdout_paths = resolve_holdout_jobs(config, analyze_only)
    holdout_evidence = []
    for side in ("baseline", "candidate"):
        candidate = candidate_by_id[config["holdout"][side]["candidateId"]]
        holdout_evidence.append(
            load_candidate_job(holdout_paths[side], candidate, config["harbor"])
        )
    validate_fair_jobs(holdout_evidence, "holdout")
    validate_holdout_isolation(development, holdout_evidence)
    holdout = summarize_holdout(
        config, holdout_evidence[0], holdout_evidence[1]
    )

    public_development = [public_evidence(item) for item in development]
    public_holdout_evidence = [public_evidence(item) for item in holdout_evidence]
    evidence_output = {
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "rewardKey": config["harbor"]["rewardKey"],
        "development": public_development,
        "holdout": public_holdout_evidence,
    }
    log = {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "candidateRanking": candidate_output,
        "operatorRanking": operator_output,
        "breedingPlan": breeding,
        "holdoutPromotion": holdout,
        "holdoutUsedForDevelopmentSelection": False,
    }

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
        "topCandidate": selected_candidate_id,
        "topOperator": operator_output["ranking"][0]["operatorId"],
        "outputDirectory": str(output),
        "log": str(output / OUTPUT_FILES["log"]),
        "report": str(output / OUTPUT_FILES["report"]),
    }


def validate_dry_run_job_configs(config: dict[str, Any]) -> None:
    by_id = {item["candidateId"]: item for item in config["candidates"]}
    for candidate in config["candidates"]:
        if candidate["jobConfig"] is not None:
            job = load_native_job_config(candidate["jobConfig"])
            validate_job_config_skill(job, candidate, candidate["jobConfig"])
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        config = normalize_config(args.config.resolve(), args.output_dir)
        if args.dry_run:
            validate_dry_run_job_configs(config)
            result = public_plan(config)
        elif args.doctor:
            result = doctor(config)
        else:
            result = run_analysis(config, args.analyze_only)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
