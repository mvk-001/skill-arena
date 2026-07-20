# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Distill native Harbor artifacts into an evidence-cited skill candidate."""

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
import stat
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from uuid import uuid4

import yaml
from harbor import Job
from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock, TrialLock
from harbor.models.job.result import JobResult
from harbor.models.trajectories.trajectory import Trajectory
from harbor.models.trial.config import TrialConfig
from harbor.models.trial.result import TrialResult
from harbor.skills import compute_skill_digest


SCHEMA_VERSION = 1
SUPPORTED_CONFIG_SCHEMA_VERSIONS = {1, 2}
RETRY_FIELDS = {
    "max_retries",
    "include_exceptions",
    "exclude_exceptions",
    "wait_multiplier",
    "min_wait_sec",
    "max_wait_sec",
}
MAX_TEXT = 6000
CONTEXT_BUDGET_DOMAIN = "execution-efficiency/context-budget"
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
    "evaluator": ("evaluation-", "evaluator-", "verifier-"),
    "infrastructure": ("infra-", "infrastructure-", "platform-"),
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
ALLOWED_EXACT_TARGETS = {"SKILL.md", "agents/openai.yaml"}
ALLOWED_TARGET_PREFIXES = ("references/", "scripts/")
PORTABLE_SKILL_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
RESERVED_SKILL_NAMES = {
    "aux",
    "con",
    "nul",
    "prn",
    *(f"com{index}" for index in range(1, 10)),
    *(f"lpt{index}" for index in range(1, 10)),
}
SECRET_PATTERNS = (
    re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(
        r"(?i)(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret)"
        r"\s*[:=]\s*['\"]?[^\s,'\"}]{8,}"
    ),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}"),
)


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


def normalize_required_rewards(value: Any) -> dict[str, float]:
    mapping = require_mapping(value if value is not None else {}, "harbor.requiredRewards")
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
        if isinstance(raw_threshold, bool) or not isinstance(raw_threshold, (int, float)):
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


def finite_number(value: Any, location: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be numeric.")
    normalized = float(value)
    if not math.isfinite(normalized):
        raise ValueError(f"{location} must be finite.")
    return normalized


def canonical_retry_config(retry: Any, location: str) -> dict[str, Any]:
    value = retry.model_dump(mode="json")
    max_retries = value.get("max_retries")
    if isinstance(max_retries, bool) or not isinstance(max_retries, int):
        raise ValueError(f"{location}.max_retries must be an integer.")
    waits = {
        key: finite_number(value.get(key), f"{location}.{key}")
        for key in ("wait_multiplier", "min_wait_sec", "max_wait_sec")
    }
    if any(number < 0 for number in waits.values()):
        raise ValueError(f"{location} wait values must be non-negative.")
    if waits["min_wait_sec"] > waits["max_wait_sec"]:
        raise ValueError(f"{location}.min_wait_sec must not exceed max_wait_sec.")

    exception_values: dict[str, list[str] | None] = {}
    for key in ("include_exceptions", "exclude_exceptions"):
        raw = value.get(key)
        if raw is None:
            exception_values[key] = None
            continue
        if not isinstance(raw, list) or any(
            not isinstance(item, str) or not item for item in raw
        ):
            raise ValueError(f"{location}.{key} must be null or a string list.")
        exception_values[key] = sorted(raw)
    return {
        "maxRetries": max_retries,
        "includeExceptions": exception_values["include_exceptions"],
        "excludeExceptions": exception_values["exclude_exceptions"],
        "waitMultiplier": waits["wait_multiplier"],
        "minWaitSec": waits["min_wait_sec"],
        "maxWaitSec": waits["max_wait_sec"],
    }


def require_complete_locked_retry(
    raw_job_lock: dict[str, Any], job_lock: JobLock, location: str
) -> dict[str, Any]:
    raw_retry = require_mapping(raw_job_lock.get("retry"), f"{location}.retry")
    missing = sorted(RETRY_FIELDS - set(raw_retry))
    if missing:
        raise ValueError(
            f"{location}.retry is missing required fields: {', '.join(missing)}."
        )
    raw_max_retries = raw_retry.get("max_retries")
    if isinstance(raw_max_retries, bool) or not isinstance(raw_max_retries, int):
        raise ValueError(f"{location}.retry.max_retries must be an integer.")
    for key in ("wait_multiplier", "min_wait_sec", "max_wait_sec"):
        finite_number(raw_retry.get(key), f"{location}.retry.{key}")
    for key in ("include_exceptions", "exclude_exceptions"):
        raw = raw_retry.get(key)
        if raw is None:
            continue
        if not isinstance(raw, list) or any(
            not isinstance(item, str) or not item for item in raw
        ):
            raise ValueError(
                f"{location}.retry.{key} must be null or a string list."
            )
        if len(raw) != len(set(raw)):
            raise ValueError(
                f"{location}.retry.{key} must not contain duplicate values."
            )
    canonical = canonical_retry_config(job_lock.retry, f"{location}.retry")
    if canonical["maxRetries"] != 0:
        raise ValueError(
            f"{location}.retry.max_retries must be 0 for schemaVersion 2 evaluation."
        )
    return canonical


def require_zero_job_config_retries(config: JobConfig, location: str) -> dict[str, Any]:
    canonical = canonical_retry_config(config.retry, f"{location}.retry")
    if canonical["maxRetries"] != 0:
        raise ValueError(
            f"{location}.retry.max_retries must be 0 for schemaVersion 2 evaluation."
        )
    return canonical


def assert_not_reparse_root(directory: Path, location: str) -> None:
    """Reject a bundle path whose root entry is itself a link/reparse point."""

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
    """Reject links/reparse points before a skill is copied or mutated."""

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


def load_yaml(path: Path, label: str) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"{label} does not exist: {path}") from error
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML in {label} {path}: {error}") from error
    return require_mapping(value, label)


def resolve_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    return raw.resolve() if raw.is_absolute() else (base / raw).resolve()


def resolve_bundle_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    unresolved = raw if raw.is_absolute() else base / raw
    assert_not_reparse_root(unresolved, location)
    return unresolved.resolve()


def resolve_path_list(base: Path, value: Any, location: str) -> list[Path]:
    values = require_list(value if value is not None else [], location)
    return [resolve_path(base, item, f"{location}[{index}]") for index, item in enumerate(values)]


def parse_skill_frontmatter(text: str) -> dict[str, Any]:
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError("SKILL.md must begin with YAML frontmatter.")
    try:
        value = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise ValueError(f"SKILL.md frontmatter is invalid YAML: {error}") from error
    result = require_mapping(value, "SKILL.md frontmatter")
    name = require_string(result.get("name"), "SKILL.md frontmatter.name")
    if (
        name != result.get("name")
        or not PORTABLE_SKILL_NAME.fullmatch(name)
        or name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(
            "SKILL.md frontmatter.name must be an exact portable skill basename "
            "(1-64 lowercase letters, digits, or interior hyphens)."
        )
    require_string(result.get("description"), "SKILL.md frontmatter.description")
    return result


def installed_skill_path(container: Path, logical_name: str) -> Path:
    """Return an isolated skill path whose basename is its logical identity."""

    if (
        not PORTABLE_SKILL_NAME.fullmatch(logical_name)
        or logical_name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(f"Unsafe logical skill name: {logical_name!r}")
    skills_directory = container / "skills"
    destination = skills_directory / logical_name
    if destination.parent != skills_directory or destination.name != logical_name:
        raise ValueError(
            f"Logical skill name escapes its staging directory: {logical_name!r}"
        )
    return destination


def stage_skill_bundle(source: Path, container: Path, logical_name: str) -> Path:
    assert_self_contained_bundle(source, "source skill bundle")
    destination = installed_skill_path(container, logical_name)
    if destination.exists():
        raise ValueError(f"Staged skill destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination, symlinks=True)
    assert_self_contained_bundle(destination, "staged skill bundle")
    if directory_digest(destination) != directory_digest(source):
        raise ValueError(f"Staged skill digest mismatch: {destination}")
    return destination


def directory_digest(directory: Path) -> str:
    return compute_skill_digest(directory)


def normalize_config(path: Path, output_override: Path | None = None) -> dict[str, Any]:
    raw = load_yaml(path, "config")
    config_schema_version = raw.get("schemaVersion")
    if config_schema_version not in SUPPORTED_CONFIG_SCHEMA_VERSIONS:
        raise ValueError("schemaVersion must be 1 or 2.")
    if config_schema_version == 1 and "development" in raw:
        raise ValueError(
            "The development block requires schemaVersion 2; schemaVersion 1 "
            "retains the legacy discovery-to-holdout workflow."
        )
    base = path.resolve().parent
    run = require_mapping(raw.get("run"), "run")
    harbor = require_mapping(raw.get("harbor", {}), "harbor")
    discovery = require_mapping(raw.get("discovery", {}), "discovery")
    development = require_mapping(raw.get("development", {}), "development")
    proposals = require_mapping(raw.get("proposals", {}), "proposals")
    holdout = require_mapping(raw.get("holdout", {}), "holdout")

    baseline = resolve_bundle_path(
        base, run.get("baselineSkill"), "run.baselineSkill"
    )
    skill_path = baseline / "SKILL.md"
    if not skill_path.is_file():
        raise ValueError(f"Baseline skill has no SKILL.md: {baseline}")
    assert_self_contained_bundle(baseline, "run.baselineSkill")
    baseline_frontmatter = parse_skill_frontmatter(skill_path.read_text(encoding="utf-8"))
    output = (
        output_override.resolve()
        if output_override is not None
        else resolve_path(base, run.get("outputDir"), "run.outputDir")
    )
    if output == baseline or output.is_relative_to(baseline):
        raise ValueError("run.outputDir must not be inside the baseline skill.")

    required_env = harbor.get("requiredEnv", [])
    if not isinstance(required_env, list) or any(
        not isinstance(item, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", item)
        for item in required_env
    ):
        raise ValueError("harbor.requiredEnv must contain portable environment-variable names.")

    minimum_trials = int(proposals.get("minimumUniqueTrials", 2))
    minimum_tasks = int(proposals.get("minimumUniqueTasks", 2))
    if minimum_trials < 2 or minimum_tasks < 2:
        raise ValueError(
            "Proposal support thresholds must require at least 2 unique trials "
            "and 2 unique tasks."
        )

    proposal_path = (
        resolve_path(base, proposals["path"], "proposals.path")
        if proposals.get("path") is not None
        else None
    )
    development_artifacts = resolve_path_list(
        base,
        development.get("candidateArtifacts", []),
        "development.candidateArtifacts",
    )
    development_job_configs = resolve_path_list(
        base,
        development.get("candidateJobConfigs", []),
        "development.candidateJobConfigs",
    )
    if config_schema_version == 2:
        if not development_artifacts and not development_job_configs:
            raise ValueError(
                "schemaVersion 2 requires at least one development candidate "
                "artifact or job config."
            )
        if "minimumPassRate" not in development:
            raise ValueError(
                "schemaVersion 2 requires development.minimumPassRate."
            )
        minimum_development_pass_rate = finite_number(
            development.get("minimumPassRate"),
            "development.minimumPassRate",
        )
        if not 0.0 <= minimum_development_pass_rate <= 1.0:
            raise ValueError("development.minimumPassRate must be between 0 and 1.")
    else:
        minimum_development_pass_rate = 0.0
    return {
        "configSchemaVersion": config_schema_version,
        "configPath": path.resolve(),
        "runId": require_string(run.get("id"), "run.id"),
        "baselineSkill": baseline,
        "baselineDigest": directory_digest(baseline),
        "skillName": baseline_frontmatter["name"],
        "outputDirectory": output,
        "harbor": {
            "rewardKey": require_string(harbor.get("rewardKey", "reward"), "harbor.rewardKey"),
            "passThreshold": finite_number(
                harbor.get("passThreshold", 1.0), "harbor.passThreshold"
            ),
            "requiredRewards": normalize_required_rewards(harbor.get("requiredRewards", {})),
            "requiredEnv": required_env,
            "requireDiscoveryLocks": bool(harbor.get("requireDiscoveryLocks", False)),
        },
        "discovery": {
            "artifacts": resolve_path_list(base, discovery.get("artifacts", []), "discovery.artifacts"),
            "jobConfigs": resolve_path_list(base, discovery.get("jobConfigs", []), "discovery.jobConfigs"),
        },
        "development": {
            "candidateArtifacts": development_artifacts,
            "candidateJobConfigs": development_job_configs,
            "minimumPassRate": minimum_development_pass_rate,
        },
        "proposals": {
            "path": proposal_path,
            "minimumUniqueTrials": minimum_trials,
            "minimumUniqueTasks": minimum_tasks,
        },
        "holdout": {
            "baselineArtifacts": resolve_path_list(base, holdout.get("baselineArtifacts", []), "holdout.baselineArtifacts"),
            "candidateArtifacts": resolve_path_list(base, holdout.get("candidateArtifacts", []), "holdout.candidateArtifacts"),
            "baselineJobConfigs": resolve_path_list(base, holdout.get("baselineJobConfigs", []), "holdout.baselineJobConfigs"),
            "candidateJobConfigs": resolve_path_list(base, holdout.get("candidateJobConfigs", []), "holdout.candidateJobConfigs"),
            "allowWeakFairness": bool(holdout.get("allowWeakFairness", False)),
            "minimumMeanGain": finite_number(
                holdout.get("minimumMeanGain", 0.0), "holdout.minimumMeanGain"
            ),
            "allowTaskRegressions": bool(holdout.get("allowTaskRegressions", False)),
            "requireNoErrors": bool(holdout.get("requireNoErrors", True)),
        },
    }


def public_plan(config: dict[str, Any]) -> dict[str, Any]:
    if config["configSchemaVersion"] == 2:
        for path in [
            *config["discovery"]["jobConfigs"],
            *config["development"]["candidateJobConfigs"],
        ]:
            load_job_config(path, require_zero_retries=True)
    staged_baseline = installed_skill_path(
        config["outputDirectory"] / "baseline", config["skillName"]
    )
    candidate = installed_skill_path(
        config["outputDirectory"] / "candidate", config["skillName"]
    )
    plan = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": config["runId"],
        "baselineSkill": str(config["baselineSkill"]),
        "baselineDigest": config["baselineDigest"],
        "skillName": config["skillName"],
        "outputDirectory": str(config["outputDirectory"]),
        "stagedBaselineSkill": str(staged_baseline),
        "candidateSkill": str(candidate),
        "harborVersion": version("harbor"),
        "rewardKey": config["harbor"]["rewardKey"],
        "passThreshold": config["harbor"]["passThreshold"],
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        "requiredEnv": config["harbor"]["requiredEnv"],
        "missingRequiredEnv": [
            name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
        ],
        "discovery": {
            "artifacts": [str(path) for path in config["discovery"]["artifacts"]],
            "jobConfigs": [str(path) for path in config["discovery"]["jobConfigs"]],
        },
        "proposalSupport": {
            "minimumUniqueTrials": config["proposals"]["minimumUniqueTrials"],
            "minimumUniqueTasks": config["proposals"]["minimumUniqueTasks"],
        },
        "holdout": {
            "baselineArtifactCount": len(config["holdout"]["baselineArtifacts"]),
            "candidateArtifactCount": len(config["holdout"]["candidateArtifacts"]),
            "baselineJobConfigCount": len(config["holdout"]["baselineJobConfigs"]),
            "candidateJobConfigCount": len(config["holdout"]["candidateJobConfigs"]),
        },
    }
    if config["configSchemaVersion"] == 2:
        plan["configSchemaVersion"] = 2
        plan["development"] = {
            "candidateArtifactCount": len(
                config["development"]["candidateArtifacts"]
            ),
            "candidateJobConfigCount": len(
                config["development"]["candidateJobConfigs"]
            ),
            "minimumPassRate": config["development"]["minimumPassRate"],
        }
    return plan


def prepare_job_raw(path: Path) -> dict[str, Any]:
    raw = copy.deepcopy(load_yaml(path, "Harbor job config"))
    base = path.parent.resolve()
    for dataset in raw.get("datasets", []) or []:
        if isinstance(dataset, dict) and isinstance(dataset.get("path"), str):
            dataset["path"] = str(resolve_path(base, dataset["path"], "datasets[].path"))
    for task in raw.get("tasks", []) or []:
        if isinstance(task, dict) and isinstance(task.get("path"), str):
            task["path"] = str(resolve_path(base, task["path"], "tasks[].path"))
    for agent in raw.get("agents", []) or []:
        if not isinstance(agent, dict):
            continue
        skills = []
        for skill in agent.get("skills", []) or []:
            if isinstance(skill, str) and "://" not in skill:
                possible = (base / skill).resolve()
                skills.append(str(possible) if possible.exists() else skill)
            else:
                skills.append(skill)
        agent["skills"] = skills
    if isinstance(raw.get("extra_instruction_paths"), list):
        raw["extra_instruction_paths"] = [
            str(resolve_path(base, item, "extra_instruction_paths[]"))
            for item in raw["extra_instruction_paths"]
        ]
    environment = raw.get("environment")
    if isinstance(environment, dict) and isinstance(environment.get("extra_docker_compose"), list):
        environment["extra_docker_compose"] = [
            str(resolve_path(base, item, "environment.extra_docker_compose[]"))
            for item in environment["extra_docker_compose"]
        ]
    return raw


def load_job_config(path: Path, *, require_zero_retries: bool = False) -> JobConfig:
    config = JobConfig.model_validate(prepare_job_raw(path))
    if require_zero_retries:
        require_zero_job_config_retries(config, f"Harbor job config {path}")
    return config


def candidate_job_config(
    source: JobConfig,
    *,
    baseline_skill: Path,
    candidate_skill: Path,
) -> JobConfig:
    agents = []
    replaced_total = 0
    for agent in source.agents:
        replaced = 0
        skills: list[str | Path] = []
        for skill in agent.skills:
            raw = str(skill)
            local = Path(raw).expanduser()
            same_path = local.is_absolute() and local.resolve() == baseline_skill.resolve()
            same_name = PurePosixPath(raw.replace("\\", "/")).name == baseline_skill.name
            if same_path or same_name:
                skills.append(candidate_skill)
                replaced += 1
            else:
                skills.append(skill)
        if replaced > 1:
            raise ValueError(f"Agent {agent.name} lists the baseline skill more than once.")
        replaced_total += replaced
        agents.append(agent.model_copy(update={"skills": skills}))
    if replaced_total == 0:
        raise ValueError(
            "Candidate job config does not reference the declared baseline skill."
        )
    return source.model_copy(update={"agents": agents})


async def execute_jobs(
    paths: list[Path],
    *,
    output: Path,
    phase: str,
    baseline_skill: Path,
    candidate_skill: Path | None = None,
    require_zero_retries: bool = False,
) -> list[Path]:
    job_directories: list[Path] = []
    for index, path in enumerate(paths, start=1):
        config = load_job_config(path, require_zero_retries=require_zero_retries)
        if candidate_skill is not None:
            config = candidate_job_config(
                config,
                baseline_skill=baseline_skill,
                candidate_skill=candidate_skill,
            )
        unique = f"{phase}-{index:02d}-{uuid4().hex[:10]}"
        config = config.model_copy(
            update={"job_name": unique, "jobs_dir": output / "harbor-jobs"}
        )
        job = await Job.create(config)
        await job.run()
        job_directories.append(job.job_dir.resolve())
    return job_directories


def run_check(command: list[str]) -> str:
    if shutil.which(command[0]) is None:
        raise ValueError(f"Required executable is not on PATH: {command[0]}")
    completed = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise ValueError(f"Preflight failed for {' '.join(command)}: {detail}")
    return completed.stdout.strip() or "ready"


def doctor(config: dict[str, Any]) -> dict[str, Any]:
    plan = public_plan(config)
    if plan["missingRequiredEnv"]:
        raise ValueError(
            "Missing required environment variables: " + ", ".join(plan["missingRequiredEnv"])
        )
    job_paths = [*config["discovery"]["jobConfigs"]]
    if config["configSchemaVersion"] == 2:
        # Development must pass before holdout inputs are opened. Doctor validates
        # the pre-release jobs only; holdout JobConfigs are validated immediately
        # before their guarded execution.
        job_paths.extend(config["development"]["candidateJobConfigs"])
    else:
        job_paths.extend(config["holdout"]["baselineJobConfigs"])
        job_paths.extend(config["holdout"]["candidateJobConfigs"])
    job_configs = [
        load_job_config(
            path,
            require_zero_retries=config["configSchemaVersion"] == 2,
        )
        for path in job_paths
    ]
    uses_docker = any(str(job.environment.type or "docker") == "docker" for job in job_configs)
    checks: dict[str, Any] = {
        "credentials": "declared variables present",
        "jobConfigs": len(job_configs),
    }
    if config["configSchemaVersion"] == 2:
        checks["deferredHoldoutJobConfigs"] = (
            len(config["holdout"]["baselineJobConfigs"])
            + len(config["holdout"]["candidateJobConfigs"])
        )
    if uses_docker:
        checks["docker"] = run_check(["docker", "info", "--format", "server={{.ServerVersion}}"])
        checks["dockerCompose"] = run_check(["docker", "compose", "version", "--short"])
    else:
        checks["docker"] = "not required by configured jobs"
        checks["dockerCompose"] = "not required by configured jobs"
    return {**plan, "checks": checks}


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Required Harbor artifact is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in Harbor artifact {path}: {error}") from error
    return require_mapping(value, str(path))


def sanitize_text(text: str, limit: int = MAX_TEXT) -> str:
    normalized = text.replace("\x00", "")
    for pattern in SECRET_PATTERNS:
        normalized = pattern.sub(lambda match: f"{match.group(1)} [REDACTED]" if match.lastindex else "[REDACTED]", normalized)
    if len(normalized) <= limit:
        return normalized
    head = limit // 2
    tail = limit - head
    return normalized[:head] + f"\n... truncated ({len(normalized)} chars) ...\n" + normalized[-tail:]


def read_bounded(path: Path, limit: int = MAX_TEXT) -> str:
    if not path.is_file():
        return ""
    return sanitize_text(path.read_text(encoding="utf-8", errors="replace"), limit)


def content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        pieces = []
        for part in content:
            if getattr(part, "type", None) == "text" and getattr(part, "text", None):
                pieces.append(part.text)
            elif getattr(part, "type", None) == "image":
                pieces.append("[image]")
        return "\n".join(pieces)
    return ""


def normalize_trajectory(path: Path) -> dict[str, Any]:
    try:
        trajectory = Trajectory.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception as error:
        return {
            "path": str(path.resolve()),
            "valid": False,
            "error": sanitize_text(f"{type(error).__name__}: {error}", 1000),
            "steps": [],
            "finalOutput": "",
        }
    steps = []
    final_output = ""
    for step in trajectory.steps[-12:]:
        message = sanitize_text(content_text(step.message), 1200)
        if step.source == "agent" and message:
            final_output = message
        observations: list[str] = []
        if step.observation:
            for result in step.observation.results[:4]:
                value = sanitize_text(content_text(result.content), 800)
                if value:
                    observations.append(value)
        steps.append(
            {
                "stepId": step.step_id,
                "source": step.source,
                "message": message,
                "toolNames": [call.function_name for call in (step.tool_calls or [])],
                "observations": observations,
            }
        )
    return {
        "path": str(path.resolve()),
        "valid": True,
        "schemaVersion": trajectory.schema_version,
        "agent": {
            "name": trajectory.agent.name,
            "version": trajectory.agent.version,
            "model": trajectory.agent.model_name,
        },
        "steps": steps,
        "finalOutput": final_output,
    }


def evidence_directories(trial_directory: Path) -> list[tuple[str, Path]]:
    values: list[tuple[str, Path]] = [("trial", trial_directory)]
    steps = trial_directory / "steps"
    if steps.is_dir():
        values.extend(
            (f"step:{path.name}", path)
            for path in sorted(steps.iterdir())
            if path.is_dir()
        )
    return values


def collect_feedback(trial_directory: Path, agent_name: str) -> dict[str, Any]:
    trajectories = []
    agent_logs = []
    verifier_stdout = []
    verifier_stderr = []
    verifier_other = []
    for label, directory in evidence_directories(trial_directory):
        trajectory_path = directory / "agent" / "trajectory.json"
        if trajectory_path.is_file():
            trajectories.append({"scope": label, **normalize_trajectory(trajectory_path)})
        agent_candidates = [
            directory / "agent" / f"{agent_name}.txt",
            directory / "agent" / "output.txt",
        ]
        for candidate in agent_candidates:
            value = read_bounded(candidate)
            if value:
                agent_logs.append({"scope": label, "path": str(candidate.resolve()), "text": value})
                break
        for filename, target in (
            ("test-stdout.txt", verifier_stdout),
            ("test-stderr.txt", verifier_stderr),
            ("test-output.txt", verifier_other),
        ):
            candidate = directory / "verifier" / filename
            value = read_bounded(candidate)
            if value:
                target.append({"scope": label, "path": str(candidate.resolve()), "text": value})
    final_output = ""
    for trajectory in trajectories:
        if trajectory.get("finalOutput"):
            final_output = trajectory["finalOutput"]
    return {
        "trajectories": trajectories,
        "finalOutput": final_output,
        "agentLogs": agent_logs,
        "verifierStdout": verifier_stdout,
        "verifierStderr": verifier_stderr,
        "verifierOther": verifier_other,
    }


def optional_diagnostic_value(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list)):
        return None
    return sanitize_text(str(value), 300)


def collect_verifier_diagnostics(trial_directory: Path) -> list[dict[str, Any]]:
    diagnostics = []
    for label, directory in evidence_directories(trial_directory):
        path = directory / "verifier" / "diagnostics.json"
        if not path.is_file():
            continue
        raw = read_json(path)
        diagnostics.append(
            {
                "scope": label,
                "path": str(path.resolve()),
                "status": optional_diagnostic_value(raw.get("status")),
                "failureDomain": optional_diagnostic_value(raw.get("failure_domain")),
                "terminalOutcome": optional_diagnostic_value(raw.get("terminal_outcome")),
                "errorCode": optional_diagnostic_value(raw.get("error_code")),
            }
        )
    return diagnostics


def normalize_failure_signal(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def failure_domain_from_signal(value: Any) -> str | None:
    signal = normalize_failure_signal(value)
    if not signal:
        return None
    if signal == "infra" or signal.startswith("infra-"):
        return "infrastructure"
    if signal == "auth" or signal.startswith("auth-"):
        return "authentication"
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


def context_budget_failure(diagnostic: dict[str, Any]) -> bool:
    signals = {
        normalize_failure_signal(diagnostic.get(key))
        for key in ("status", "terminalOutcome", "errorCode")
    }
    markers = (
        "provider-context-limit",
        "context-length-exceeded",
        "context-limit-exceeded",
        "context-window-exceeded",
    )
    return any(
        signal == marker or signal.startswith(f"{marker}-")
        for signal in signals
        for marker in markers
    )


def external_evaluation_failure(
    diagnostics: list[dict[str, Any]],
) -> dict[str, Any] | None:
    failures: list[tuple[dict[str, Any], str, bool]] = []
    for diagnostic in diagnostics:
        domain = failure_domain_from_signal(diagnostic.get("failureDomain"))
        if domain is None:
            for key in ("status", "terminalOutcome", "errorCode"):
                domain = failure_domain_from_signal(diagnostic.get(key))
                if domain is not None:
                    break
        if domain is not None:
            failures.append((diagnostic, domain, context_budget_failure(diagnostic)))
    if not failures:
        return None

    actionable_context_budget = all(
        domain == "provider" and is_context
        for _, domain, is_context in failures
    )
    priority = {
        "authentication": 0,
        "environment": 1,
        "evaluator": 2,
        "infrastructure": 3,
        "provider": 4,
    }
    diagnostic, domain, _ = min(failures, key=lambda item: priority[item[1]])
    joined = " ".join(
        normalize_failure_signal(diagnostic.get(key))
        for key in ("status", "failureDomain", "terminalOutcome", "errorCode")
    )
    if actionable_context_budget:
        evidence_class = "operational-context-budget"
        actionability = {
            "actionable": True,
            "domain": CONTEXT_BUDGET_DOMAIN,
            "reason": "context-budget-exhausted",
        }
    else:
        if domain == "authentication":
            evidence_class = "external-provider-auth"
        elif "quota" in joined:
            evidence_class = "external-provider-quota"
        elif "rate-limit" in joined:
            evidence_class = "external-provider-rate-limit"
        elif domain == "environment":
            evidence_class = "external-environment"
        elif domain == "evaluator":
            evidence_class = "external-evaluator"
        else:
            evidence_class = "external-provider-or-infrastructure"
        actionability = {
            "actionable": False,
            "domain": None,
            "reason": evidence_class,
        }
    return {
        "failureDomain": domain,
        "status": diagnostic.get("status"),
        "terminalOutcome": diagnostic.get("terminalOutcome"),
        "errorCode": diagnostic.get("errorCode"),
        "diagnosticsPath": diagnostic["path"],
        "evidenceClass": evidence_class,
        "actionability": actionability,
    }


def model_identifier(trial: TrialResult) -> str:
    model = trial.agent_info.model_info
    if model is None:
        return "unknown"
    return f"{model.provider}/{model.name}" if model.provider else model.name


def skill_reference_name(value: str | Path) -> str:
    raw = str(value)
    path = Path(raw).expanduser()
    if path.is_dir() and (path / "SKILL.md").is_file():
        try:
            frontmatter = parse_skill_frontmatter(
                (path / "SKILL.md").read_text(encoding="utf-8")
            )
            return frontmatter["name"]
        except (OSError, ValueError):
            pass
    return PurePosixPath(raw.replace("\\", "/")).name


def normalized_skill_source(value: str | Path) -> str:
    return str(PurePosixPath(str(value).replace("\\", "/")))


def same_skill_source(left: str | Path, right: str | Path) -> bool:
    if normalized_skill_source(left) == normalized_skill_source(right):
        return True
    left_path = Path(str(left)).expanduser()
    right_path = Path(str(right)).expanduser()
    try:
        return (
            left_path.is_absolute()
            and right_path.is_absolute()
            and left_path.resolve() == right_path.resolve()
        )
    except OSError:
        return False


def resolve_locked_target_skill(
    lock: TrialLock,
    trial_config: TrialConfig,
    *,
    trial_directory: Path,
    target_skill_name: str,
    expected_skill_digest: str,
    allow_legacy_identity_alias: bool,
) -> tuple[Any, bool]:
    matches = [
        skill for skill in lock.skills if skill.digest == expected_skill_digest
    ]
    if len(matches) != 1:
        raise ValueError(
            f"Harbor trial {trial_directory} must lock exactly one target skill "
            f"with digest {expected_skill_digest}; found {len(matches)}."
        )
    target = matches[0]
    source_references = [
        skill
        for skill in trial_config.agent.skills
        if same_skill_source(skill, target.source)
    ]
    if len(source_references) != 1:
        raise ValueError(
            f"Locked target skill source {target.source!s} must be referenced exactly "
            f"once by TrialConfig.agent.skills in Harbor trial {trial_directory}; "
            f"found {len(source_references)}."
        )
    lock_agent_references = [
        skill
        for skill in lock.agent.skills
        if same_skill_source(skill, target.source)
    ]
    if len(lock_agent_references) != 1:
        raise ValueError(
            f"Locked target skill source {target.source!s} must be referenced exactly "
            f"once by TrialLock.agent.skills in Harbor trial {trial_directory}; "
            f"found {len(lock_agent_references)}."
        )

    source_basename = PurePosixPath(
        str(target.source).replace("\\", "/").rstrip("/")
    ).name
    strict_identity = (
        target.name == target_skill_name and source_basename == target_skill_name
    )
    legacy_identity_alias = (
        not strict_identity
        and allow_legacy_identity_alias
        and target.name in {target_skill_name, source_basename}
    )
    if not strict_identity and not legacy_identity_alias:
        raise ValueError(
            f"Locked target skill identity in Harbor trial {trial_directory} must "
            f"use logical frontmatter name {target_skill_name!r} as both locked "
            f"name and source basename; found locked name {target.name!r} and "
            f"source basename {source_basename!r}. Physical basename aliases are "
            "accepted only for analyze-only legacy discovery evidence."
        )

    source_path = Path(str(target.source)).expanduser()
    source_skill_path = source_path / "SKILL.md"
    if source_path.is_dir() and source_skill_path.is_file():
        source_frontmatter = parse_skill_frontmatter(
            source_skill_path.read_text(encoding="utf-8")
        )
        if source_frontmatter["name"] != target_skill_name:
            raise ValueError(
                f"Locked target skill source {source_path} has frontmatter name "
                f"{source_frontmatter['name']!r}, expected {target_skill_name!r}."
            )
        source_digest = directory_digest(source_path)
        if source_digest != expected_skill_digest:
            raise ValueError(
                f"Locked target skill source {source_path} has digest {source_digest}, "
                f"expected {expected_skill_digest}."
            )
    return target, legacy_identity_alias


def canonical_trial_config(
    trial_config: TrialConfig,
    target_skill_name: str,
    target_skill_source: str | Path | None = None,
) -> dict[str, Any]:
    value = trial_config.model_dump(
        mode="json",
        exclude_none=True,
        exclude={"trial_name", "trials_dir", "job_id"},
    )
    agent = value.get("agent")
    target_count = 0
    if isinstance(agent, dict):
        static_skills = []
        for skill in trial_config.agent.skills:
            is_target = (
                same_skill_source(skill, target_skill_source)
                if target_skill_source is not None
                else skill_reference_name(skill) == target_skill_name
            )
            if is_target:
                target_count += 1
            else:
                static_skills.append(str(skill))
        agent["skills"] = sorted(static_skills)
    value["targetSkillCount"] = target_count
    return value


def canonical_trial_lock(lock: TrialLock, target_skill: Any) -> dict[str, Any]:
    agent = lock.agent.model_dump(mode="json", exclude_none=True, exclude={"skills"})
    environment = lock.environment.model_dump(
        mode="json", exclude_none=True, exclude={"extra_docker_compose"}
    )
    verifier = lock.verifier.model_dump(mode="json", exclude_none=True)
    static_skills = sorted(
        (skill.name, skill.digest)
        for skill in lock.skills
        if skill is not target_skill
    )
    return {
        "schemaVersion": lock.schema_version,
        "taskDigest": lock.task.digest,
        "installOnly": lock.install_only,
        "timeoutMultiplier": lock.timeout_multiplier,
        "agentTimeoutMultiplier": lock.agent_timeout_multiplier,
        "verifierTimeoutMultiplier": lock.verifier_timeout_multiplier,
        "agentSetupTimeoutMultiplier": lock.agent_setup_timeout_multiplier,
        "environmentBuildTimeoutMultiplier": lock.environment_build_timeout_multiplier,
        "extraInstructionDigests": [item.digest for item in (lock.extra_instructions or [])],
        "agent": agent,
        "staticSkills": static_skills,
        "environment": environment,
        "extraDockerComposeDigests": [
            item.digest for item in (lock.extra_docker_compose or [])
        ],
        "verifier": verifier,
        "targetSkillCount": 1,
    }


def stable_digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def attempt_fingerprint(
    trial: TrialResult, config_canonical: dict[str, Any]
) -> str:
    """Bind attempt evidence while ignoring labels that a copied job can rename."""

    value = trial.model_dump(mode="json", exclude_none=False)
    for key in ("id", "trial_name", "trial_uri", "source"):
        value.pop(key, None)
    value["config"] = config_canonical
    return stable_digest(value)


def normalize_trial(
    trial: TrialResult,
    *,
    result_path: Path,
    source_label: str,
    harbor_version: str | None,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
    allow_legacy_identity_alias: bool,
) -> dict[str, Any]:
    trial_directory = result_path.parent
    lock_path = trial_directory / "lock.json"
    lock: TrialLock | None = None
    lock_problem: str | None = None
    if lock_path.is_file():
        try:
            lock = TrialLock.model_validate_json(lock_path.read_text(encoding="utf-8"))
        except Exception as error:
            lock_problem = f"invalid lock.json: {type(error).__name__}: {error}"
    else:
        lock_problem = "missing lock.json"
    if lock_problem and require_lock:
        raise ValueError(f"Harbor trial {trial_directory} has {lock_problem}.")

    side_config = trial_directory / "config.json"
    if side_config.is_file():
        parsed = TrialConfig.model_validate_json(side_config.read_text(encoding="utf-8"))
        if parsed != trial.config:
            raise ValueError(f"Trial config drift between result.json and config.json: {trial_directory}")

    rewards = (
        trial.verifier_result.rewards
        if trial.verifier_result is not None and trial.verifier_result.rewards is not None
        else {}
    )
    for key, value in rewards.items():
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
        ):
            raise ValueError(
                f"Harbor trial {trial_directory} reward {key!r} must be finite numeric."
            )
    raw_reward = rewards.get(reward_key)
    reported_reward = (
        float(raw_reward)
        if not isinstance(raw_reward, bool)
        and isinstance(raw_reward, (int, float))
        and math.isfinite(float(raw_reward))
        else None
    )
    verifier_diagnostics = collect_verifier_diagnostics(trial_directory)
    # Diagnostics are authoritative before reward availability is interpreted.
    # A provider can terminate before emitting any verifier reward; that must
    # remain a provider failure rather than being relabeled as a missing metric.
    evaluation_failure = external_evaluation_failure(verifier_diagnostics)
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
        if (
            isinstance(raw_value, bool)
            or not isinstance(raw_value, (int, float))
            or not math.isfinite(float(raw_value))
        ):
            raise ValueError(
                f"Harbor trial {trial_directory} required reward {key!r} must be finite numeric or null."
            )
        actual = float(raw_value)
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
    error = None
    if trial.exception_info is not None:
        error = {
            "type": trial.exception_info.exception_type,
            "message": sanitize_text(trial.exception_info.exception_message, 1500),
        }

    primary_reward_missing = (
        error is None
        and evaluation_failure is None
        and reported_reward is None
    )
    if primary_reward_missing:
        evaluation_failure = {
            "failureDomain": "evaluator",
            "status": "missing-primary-reward",
            "terminalOutcome": "missing-primary-reward",
            "errorCode": "missing_primary_reward",
            "diagnosticsPath": None,
            "evidenceClass": "missing-primary-reward",
            "actionability": {
                "actionable": False,
                "domain": None,
                "reason": "missing-primary-reward",
            },
        }
    reward = None if evaluation_failure is not None else reported_reward

    if error is not None:
        outcome = "error"
    elif primary_reward_missing:
        outcome = "missing-reward"
    elif evaluation_failure is not None:
        outcome = "non-evaluable"
    elif reward >= pass_threshold:
        outcome = "success"
    else:
        outcome = "verifier-failure"

    if evaluation_failure is not None:
        evidence_class = evaluation_failure["evidenceClass"]
        actionability = evaluation_failure["actionability"]
        evidence_eligible = actionability["actionable"]
    elif error is not None:
        evidence_class = "harbor-execution-error"
        actionability = None
        evidence_eligible = True
    else:
        evidence_class = "semantic-evaluation"
        actionability = None
        evidence_eligible = True

    locked_target: Any | None = None
    legacy_identity_alias = False
    if lock:
        locked_target, legacy_identity_alias = resolve_locked_target_skill(
            lock,
            trial.config,
            trial_directory=trial_directory,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
            allow_legacy_identity_alias=allow_legacy_identity_alias,
        )
    lock_canonical = canonical_trial_lock(lock, locked_target) if lock else None
    config_canonical = canonical_trial_config(
        trial.config,
        target_skill_name,
        str(locked_target.source) if locked_target is not None else None,
    )
    target_skill_digests = [locked_target.digest] if locked_target is not None else []
    artifacts_signature = stable_digest(
        trial.config.model_dump(mode="json", include={"artifacts"})
    )
    n_input, n_cache, n_output, cost = trial.compute_token_cost_totals()
    record = {
        "evidenceId": f"{source_label}:{trial.id}",
        "sourceLabel": source_label,
        "harborVersion": harbor_version,
        "trialId": str(trial.id),
        "trialName": trial.trial_name,
        "taskName": trial.task_name,
        "taskChecksum": trial.task_checksum,
        "agent": trial.agent_info.name,
        "agentVersion": trial.agent_info.version,
        "model": model_identifier(trial),
        "rewardKey": reward_key,
        "reward": reward,
        "reportedReward": reported_reward,
        "primaryRewardMissing": primary_reward_missing,
        "rewards": dict(rewards),
        "requiredRewards": required_rewards,
        "qualificationPassed": (
            error is None
            and evaluation_failure is None
            and not qualification_failures
        ),
        "qualificationFailures": qualification_failures,
        "evaluable": evaluation_failure is None,
        "evaluationFailure": evaluation_failure,
        "verifierDiagnostics": verifier_diagnostics,
        "evidenceClass": evidence_class,
        "actionability": actionability,
        "evidenceEligible": evidence_eligible,
        "outcome": outcome,
        "error": error,
        "usage": {
            "inputTokens": n_input,
            "cachedInputTokens": n_cache,
            "outputTokens": n_output,
            "costUsd": cost,
        },
        "artifactDirectory": str(trial_directory.resolve()),
        "resultPath": str(result_path.resolve()),
        "lockPath": str(lock_path.resolve()) if lock_path.is_file() else None,
        "lockProblem": sanitize_text(lock_problem, 1000) if lock_problem else None,
        "lockSignature": stable_digest(lock_canonical) if lock_canonical else None,
        "targetSkillDigests": target_skill_digests,
        "skillIdentity": {
            "logicalName": target_skill_name,
            "lockedName": locked_target.name if locked_target is not None else None,
            "sourceBasename": (
                PurePosixPath(
                    str(locked_target.source).replace("\\", "/").rstrip("/")
                ).name
                if locked_target is not None
                else None
            ),
            "lockVerified": locked_target is not None,
            "legacyAliasAccepted": legacy_identity_alias,
            "promotionEligible": locked_target is not None and not legacy_identity_alias,
        },
        "configSignature": stable_digest(config_canonical),
        "artifactsSignature": artifacts_signature,
        "feedback": collect_feedback(trial_directory, trial.agent_info.name)
        if include_feedback
        else None,
        "_resultArtifactDigest": file_digest(result_path),
        "_attemptFingerprint": attempt_fingerprint(trial, config_canonical),
        "_trialUri": str(trial.trial_uri) if trial.trial_uri is not None else None,
        "_trialConfigJobId": (
            str(trial.config.job_id) if trial.config.job_id is not None else None
        ),
        "_lockCanonical": lock_canonical,
    }
    return record


def load_job_artifact(
    directory: Path,
    *,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
    allow_legacy_identity_alias: bool,
    require_zero_retry_contract: bool = False,
) -> list[dict[str, Any]]:
    config = JobConfig.model_validate_json((directory / "config.json").read_text(encoding="utf-8"))
    job_result = JobResult.model_validate_json((directory / "result.json").read_text(encoding="utf-8"))
    if job_result.finished_at is None:
        raise ValueError(f"Incomplete Harbor job has no finished_at: {directory}")
    paths = sorted(directory.glob("*/result.json"))
    if len(paths) != job_result.n_total_trials:
        raise ValueError(
            f"Incomplete Harbor job {directory}: expected {job_result.n_total_trials} trial results, found {len(paths)}."
        )
    if job_result.stats.n_completed_trials != len(paths):
        raise ValueError(
            f"Incomplete Harbor job {directory}: completed count is {job_result.stats.n_completed_trials}, found {len(paths)} results."
        )
    if job_result.stats.n_pending_trials or job_result.stats.n_running_trials:
        raise ValueError(f"Incomplete Harbor job still has pending or running trials: {directory}")
    parsed_trials = [
        TrialResult.model_validate_json(path.read_text(encoding="utf-8")) for path in paths
    ]
    trial_ids = [str(trial.id) for trial in parsed_trials]
    trial_names = [trial.trial_name for trial in parsed_trials]
    duplicates = sorted(
        item
        for item, count in Counter([*trial_ids, *trial_names]).items()
        if count > 1
    )
    if duplicates:
        raise ValueError(f"Duplicate Harbor trial IDs or names in {directory}: {duplicates}")
    observed_errors = sum(1 for trial in parsed_trials if trial.exception_info is not None)
    if job_result.stats.n_errored_trials != observed_errors:
        raise ValueError(
            f"Harbor job error-count drift in {directory}: stats={job_result.stats.n_errored_trials}, trials={observed_errors}."
        )
    job_lock_path = directory / "lock.json"
    harbor_version: str | None = None
    job_retry: dict[str, Any] | None = None
    if job_lock_path.is_file():
        raw_job_lock = read_json(job_lock_path)
        job_lock = JobLock.model_validate(raw_job_lock)
        harbor_version = job_lock.harbor.version
        if harbor_version is not None and harbor_version != version("harbor"):
            raise ValueError(
                f"Harbor artifact version drift in {directory}: lock={harbor_version}, runtime={version('harbor')}."
            )
        if require_zero_retry_contract:
            job_retry = require_complete_locked_retry(
                raw_job_lock,
                job_lock,
                f"Harbor job lock {job_lock_path}",
            )
            config_retry = require_zero_job_config_retries(
                config,
                f"Harbor artifact config {directory / 'config.json'}",
            )
            if config_retry != job_retry:
                raise ValueError(
                    f"Harbor artifact JobConfig and JobLock retry drift in {directory}."
                )
            if job_result.stats.n_retries != 0:
                raise ValueError(
                    f"Harbor job {directory} reports {job_result.stats.n_retries} "
                    "built-in retries; schemaVersion 2 evaluation requires zero."
                )
    elif require_lock or require_zero_retry_contract:
        raise ValueError(f"Harbor job is missing lock.json: {directory}")
    label = config.job_name or directory.name
    records = [
        normalize_trial(
            trial,
            result_path=path,
            source_label=label,
            harbor_version=harbor_version,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
            required_reward_thresholds=required_reward_thresholds,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
            include_feedback=include_feedback,
            require_lock=require_lock,
            allow_legacy_identity_alias=allow_legacy_identity_alias,
        )
        for trial, path in zip(parsed_trials, paths)
    ]
    if job_retry is not None:
        job_retry_digest = stable_digest(job_retry)
        for record in records:
            record["jobRetry"] = job_retry
            record["jobRetryDigest"] = job_retry_digest
    for record in records:
        record["_jobArtifactDirectory"] = str(directory.resolve())
        record["_jobResultId"] = str(job_result.id)
        record["_jobConfigPath"] = str((directory / "config.json").resolve())
        record["_jobResultPath"] = str((directory / "result.json").resolve())
        record["_jobLockPath"] = (
            str(job_lock_path.resolve()) if job_lock_path.is_file() else None
        )
    return records


def load_trial_artifact(
    directory: Path,
    *,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
    allow_legacy_identity_alias: bool,
    require_zero_retry_contract: bool = False,
) -> list[dict[str, Any]]:
    if require_zero_retry_contract:
        raise ValueError(
            "schemaVersion 2 discovery, candidate development, and holdout require whole "
            f"Harbor job artifacts with a locked zero-retry contract: {directory}"
        )
    path = directory / "result.json"
    trial = TrialResult.model_validate_json(path.read_text(encoding="utf-8"))
    if trial.finished_at is None:
        raise ValueError(f"Incomplete Harbor trial has no finished_at: {directory}")
    records = [
        normalize_trial(
            trial,
            result_path=path,
            source_label=directory.name,
            harbor_version=None,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
            required_reward_thresholds=required_reward_thresholds,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
            include_feedback=include_feedback,
            require_lock=require_lock,
            allow_legacy_identity_alias=allow_legacy_identity_alias,
        )
    ]
    return records


def load_artifacts(
    directories: Iterable[Path],
    *,
    config: dict[str, Any],
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
    allow_legacy_identity_alias: bool = False,
    require_zero_retry_contract: bool = False,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen_directories: set[Path] = set()
    for raw_directory in directories:
        directory = raw_directory.resolve()
        if directory in seen_directories:
            continue
        seen_directories.add(directory)
        if not directory.is_dir():
            raise ValueError(f"Harbor artifact directory does not exist: {directory}")
        raw_result = read_json(directory / "result.json")
        if "n_total_trials" in raw_result and "stats" in raw_result:
            values = load_job_artifact(
                directory,
                reward_key=config["harbor"]["rewardKey"],
                pass_threshold=config["harbor"]["passThreshold"],
                required_reward_thresholds=config["harbor"]["requiredRewards"],
                target_skill_name=config["skillName"],
                expected_skill_digest=expected_skill_digest,
                include_feedback=include_feedback,
                require_lock=require_lock,
                allow_legacy_identity_alias=allow_legacy_identity_alias,
                require_zero_retry_contract=require_zero_retry_contract,
            )
        elif "task_name" in raw_result and "trial_name" in raw_result:
            values = load_trial_artifact(
                directory,
                reward_key=config["harbor"]["rewardKey"],
                pass_threshold=config["harbor"]["passThreshold"],
                required_reward_thresholds=config["harbor"]["requiredRewards"],
                target_skill_name=config["skillName"],
                expected_skill_digest=expected_skill_digest,
                include_feedback=include_feedback,
                require_lock=require_lock,
                allow_legacy_identity_alias=allow_legacy_identity_alias,
                require_zero_retry_contract=require_zero_retry_contract,
            )
        else:
            raise ValueError(f"Not a Harbor job or trial artifact directory: {directory}")
        records.extend(values)
    evidence_ids = [record["evidenceId"] for record in records]
    duplicates = sorted(item for item, count in Counter(evidence_ids).items() if count > 1)
    if duplicates:
        raise ValueError(f"Duplicate Harbor evidence IDs: {duplicates}")
    return records


def public_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if not key.startswith("_")}


def qualification_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "passed": all(record["qualificationPassed"] for record in records),
        "unqualifiedTrials": sum(
            not record["qualificationPassed"] for record in records
        ),
        "erroredTrials": sum(record["error"] is not None for record in records),
        "nonEvaluableTrials": sum(not record["evaluable"] for record in records),
        "providerFailureTrials": sum(
            record["evaluationFailure"] is not None
            and record["evaluationFailure"]["failureDomain"] == "provider"
            for record in records
        ),
        "infrastructureFailureTrials": sum(
            record["evaluationFailure"] is not None
            and record["evaluationFailure"]["failureDomain"]
            in NON_EVALUABLE_FAILURE_DOMAINS
            for record in records
        ),
        "failureDomains": dict(
            sorted(
                Counter(
                    record["evaluationFailure"]["failureDomain"]
                    for record in records
                    if record["evaluationFailure"] is not None
                ).items()
            )
        ),
        "missingPrimaryRewardTrials": sum(
            record["primaryRewardMissing"] for record in records
        ),
        "actionableContextBudgetTrials": sum(
            record["evidenceClass"] == "operational-context-budget"
            for record in records
        ),
        "nonActionableExternalTrials": sum(
            record["evaluationFailure"] is not None
            and record["evaluationFailure"]["failureDomain"]
            in NON_EVALUABLE_FAILURE_DOMAINS
            and not record["evidenceEligible"]
            for record in records
        ),
        "missingRequiredRewards": sum(
            failure["reason"] == "missing"
            for record in records
            for failure in record["qualificationFailures"]
        ),
        "belowThresholdRewards": sum(
            failure["reason"] == "below-threshold"
            for record in records
            for failure in record["qualificationFailures"]
        ),
    }


def build_trace_pool(records: list[dict[str, Any]]) -> dict[str, Any]:
    outcomes = Counter(record["outcome"] for record in records)
    legacy_aliases = sum(
        record["skillIdentity"]["legacyAliasAccepted"] for record in records
    )
    unverified_locks = sum(
        not record["skillIdentity"]["lockVerified"] for record in records
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "phase": "discovery",
        "summary": {
            "uniqueTrials": len({record["trialId"] for record in records}),
            "uniqueTasks": len({record["taskChecksum"] for record in records}),
            "outcomes": dict(sorted(outcomes.items())),
            "qualification": qualification_summary(records),
            "skillIdentity": {
                "legacyAliasTrials": legacy_aliases,
                "unverifiedLockTrials": unverified_locks,
                "promotionEligible": legacy_aliases == 0 and unverified_locks == 0,
            },
        },
        "traces": [public_record(record) for record in records],
    }


def allowed_target(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        return None
    if normalized in ALLOWED_EXACT_TARGETS or normalized.startswith(ALLOWED_TARGET_PREFIXES):
        return normalized
    return None


def load_proposals(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.is_file():
        return []
    raw = load_yaml(path, "proposal file")
    return [require_mapping(item, f"proposals[{index}]") for index, item in enumerate(require_list(raw.get("proposals", []), "proposals"))]


def proposal_state(
    proposals: list[dict[str, Any]],
    records: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    evidence = {record["evidenceId"]: record for record in records}
    staged: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(proposals):
        proposal_id = raw.get("id")
        reasons: list[str] = []
        if not isinstance(proposal_id, str) or not proposal_id.strip():
            proposal_id = f"invalid-{index:04d}"
            reasons.append("missing-id")
        proposal_id = proposal_id.strip()
        if proposal_id in seen_ids:
            reasons.append("duplicate-id")
        seen_ids.add(proposal_id)
        diagnosis = raw.get("diagnosis")
        if not isinstance(diagnosis, str) or not diagnosis.strip():
            reasons.append("missing-diagnosis")
        evidence_ids = raw.get("evidenceIds")
        if not isinstance(evidence_ids, list) or not evidence_ids or any(not isinstance(item, str) for item in evidence_ids):
            reasons.append("missing-evidence")
            evidence_ids = []
        evidence_ids = list(dict.fromkeys(evidence_ids))
        unknown = sorted(item for item in evidence_ids if item not in evidence)
        if unknown:
            reasons.append("unknown-or-holdout-evidence")
        supported = [evidence[item] for item in evidence_ids if item in evidence]
        proposal_domain = raw.get("domain")
        if proposal_domain is not None and (
            not isinstance(proposal_domain, str) or not proposal_domain.strip()
        ):
            reasons.append("invalid-domain")
            proposal_domain = None
        if isinstance(proposal_domain, str):
            proposal_domain = proposal_domain.strip()
        if any(not item["evidenceEligible"] for item in supported):
            reasons.append("ineligible-external-evidence")
        uses_context_budget_evidence = any(
            item["evidenceClass"] == "operational-context-budget"
            for item in supported
        )
        if (
            uses_context_budget_evidence
            and proposal_domain != CONTEXT_BUDGET_DOMAIN
        ):
            reasons.append("operational-evidence-domain-mismatch")
        unique_trials = len({item["trialId"] for item in supported})
        unique_tasks = len({item["taskChecksum"] for item in supported})
        if unique_trials < config["proposals"]["minimumUniqueTrials"]:
            reasons.append("insufficient-unique-trial-support")
        if unique_tasks < config["proposals"]["minimumUniqueTasks"]:
            reasons.append("insufficient-unique-task-support")
        target = allowed_target(raw.get("target"))
        if target is None:
            reasons.append("out-of-scope-target")
        operation = raw.get("operation")
        if operation not in {"append", "replace", "create"}:
            reasons.append("unsupported-operation")
        if not isinstance(raw.get("content"), str) or not raw.get("content"):
            reasons.append("missing-content")
        if operation == "replace" and (not isinstance(raw.get("old"), str) or not raw.get("old")):
            reasons.append("replace-missing-old")
        normalized = {
            "id": proposal_id,
            "diagnosis": diagnosis.strip() if isinstance(diagnosis, str) else "",
            "domain": proposal_domain,
            "evidenceIds": evidence_ids,
            "support": {
                "uniqueTrials": unique_trials,
                "uniqueTasks": unique_tasks,
                "taskChecksums": sorted({item["taskChecksum"] for item in supported}),
                "evidenceClasses": sorted(
                    {item["evidenceClass"] for item in supported}
                ),
            },
            "conflictGroup": str(raw.get("conflictGroup") or proposal_id),
            "target": target or str(raw.get("target") or ""),
            "operation": operation,
            "old": raw.get("old"),
            "content": raw.get("content"),
        }
        if reasons:
            rejected.append({**normalized, "status": "rejected", "reasons": sorted(set(reasons))})
        else:
            staged.append(normalized)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for proposal in staged:
        groups[proposal["conflictGroup"]].append(proposal)
    accepted = []
    for group in sorted(groups):
        ranked = sorted(
            groups[group],
            key=lambda item: (
                -item["support"]["uniqueTasks"],
                -item["support"]["uniqueTrials"],
                item["id"],
            ),
        )
        accepted.append({**ranked[0], "status": "accepted"})
        rejected.extend(
            {**item, "status": "rejected", "reasons": ["conflict-lost"]}
            for item in ranked[1:]
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "phase": "discovery",
        "proposalPath": str(config["proposals"]["path"])
        if config["proposals"]["path"]
        else None,
        "thresholds": {
            "minimumUniqueTrials": config["proposals"]["minimumUniqueTrials"],
            "minimumUniqueTasks": config["proposals"]["minimumUniqueTasks"],
        },
        "accepted": sorted(accepted, key=lambda item: item["id"]),
        "rejected": sorted(rejected, key=lambda item: item["id"]),
    }


def apply_proposal(candidate: Path, proposal: dict[str, Any], skill_name: str) -> None:
    assert_self_contained_bundle(candidate, "candidate skill bundle")
    candidate_root = candidate.resolve(strict=True)
    lexical_target = candidate.joinpath(*PurePosixPath(proposal["target"]).parts)
    target = lexical_target.resolve(strict=False)
    if target != candidate_root and not target.is_relative_to(candidate_root):
        raise ValueError(f"Proposal escaped candidate bundle: {proposal['id']}")
    operation = proposal["operation"]
    if operation == "create":
        if lexical_target.exists() or lexical_target.is_symlink():
            raise ValueError(f"create target already exists: {proposal['target']}")
        lexical_target.parent.mkdir(parents=True, exist_ok=True)
        target = lexical_target.resolve(strict=False)
        if target != candidate_root and not target.is_relative_to(candidate_root):
            raise ValueError(f"Proposal escaped candidate bundle: {proposal['id']}")
        target.write_text(proposal["content"], encoding="utf-8")
    else:
        if not target.is_file():
            raise ValueError(f"patch target does not exist: {proposal['target']}")
        current = target.read_text(encoding="utf-8")
        if operation == "append":
            updated = current + proposal["content"]
        else:
            old = proposal["old"]
            if current.count(old) != 1:
                raise ValueError(
                    f"replace requires exactly one old-text match in {proposal['target']}"
                )
            updated = current.replace(old, proposal["content"], 1)
        target.write_text(updated, encoding="utf-8")
    assert_self_contained_bundle(candidate, "candidate skill bundle")
    skill_path = candidate / "SKILL.md"
    frontmatter = parse_skill_frontmatter(skill_path.read_text(encoding="utf-8"))
    if frontmatter["name"] != skill_name:
        raise ValueError(f"Proposal {proposal['id']} changed the skill name.")
    if len(skill_path.read_text(encoding="utf-8").splitlines()) > 500:
        raise ValueError(f"Proposal {proposal['id']} made SKILL.md exceed 500 lines.")


def materialize_candidate(
    config: dict[str, Any], state: dict[str, Any]
) -> tuple[Path, dict[str, Any]]:
    candidate = installed_skill_path(
        config["outputDirectory"] / "candidate", config["skillName"]
    )
    candidate.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(config["stagedBaselineSkill"], candidate, symlinks=True)
    assert_self_contained_bundle(candidate, "candidate skill bundle")
    applied = []
    apply_rejected = []
    for proposal in state["accepted"]:
        try:
            apply_proposal(candidate, proposal, config["skillName"])
            applied.append(proposal)
        except (OSError, ValueError) as error:
            apply_rejected.append(
                {**proposal, "status": "rejected", "reasons": [f"apply-error: {error}"]}
            )
    if apply_rejected:
        shutil.rmtree(candidate)
        shutil.copytree(config["stagedBaselineSkill"], candidate, symlinks=True)
        assert_self_contained_bundle(candidate, "candidate skill bundle")
        for proposal in applied:
            if proposal["id"] not in {item["id"] for item in apply_rejected}:
                apply_proposal(candidate, proposal, config["skillName"])
    state["accepted"] = [
        proposal
        for proposal in applied
        if proposal["id"] not in {item["id"] for item in apply_rejected}
    ]
    state["rejected"].extend(apply_rejected)
    state["rejected"] = sorted(state["rejected"], key=lambda item: item["id"])
    consolidation = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "baselineSkill": str(config["baselineSkill"]),
        "stagedBaselineSkill": str(config["stagedBaselineSkill"]),
        "baselineDigest": config["baselineDigest"],
        "candidateSkill": str(candidate),
        "candidateDigest": directory_digest(candidate),
        "logicalSkillName": config["skillName"],
        "developmentEvidencePromotionEligible": state[
            "developmentEvidencePromotionEligible"
        ],
        "appliedPatchIds": [item["id"] for item in state["accepted"]],
        "rejectedPatchIds": [item["id"] for item in state["rejected"]],
    }
    return candidate, consolidation


def fairness_cells(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = (
            record["taskName"],
            record["taskChecksum"],
            record["agent"],
            record["agentVersion"],
            record["model"],
        )
        grouped[key].append(record)
    return {
        "|".join(key): {
            "attempts": len(values),
            # Preserve multiplicity. Sets let A,A,B compare equal to A,B,B and
            # therefore hide attempt-level replay drift.
            "lockSignatures": sorted(
                (item["lockSignature"] for item in values),
                key=lambda value: (value is not None, str(value)),
            ),
            "configSignatures": sorted(
                item["configSignature"] for item in values
            ),
            "artifactsSignatures": sorted(
                item["artifactsSignature"] for item in values
            ),
            "jobRetryDigests": sorted(
                (item.get("jobRetryDigest") for item in values),
                key=lambda value: (value is not None, str(value)),
            ),
        }
        for key, values in sorted(grouped.items())
    }


def comparison_cells(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = (
            record["taskName"],
            record["taskChecksum"],
            record["agent"],
            record["agentVersion"],
            record["model"],
        )
        grouped[key].append(record)
    output = {}
    for key, values in sorted(grouped.items()):
        non_evaluable = [item for item in values if not item["evaluable"]]
        scores = [
            0.0 if item["error"] else item["reward"]
            for item in values
            if item["evaluable"]
        ]
        if any(score is None for score in scores):
            raise ValueError(f"Holdout cell has a missing configured reward: {'|'.join(key)}")
        output["|".join(key)] = {
            "taskName": key[0],
            "taskChecksum": key[1],
            "attempts": len(values),
            "evaluable": not non_evaluable,
            "meanReward": (
                sum(float(score) for score in scores) / len(scores)
                if not non_evaluable
                else None
            ),
            "nonEvaluableTrials": len(non_evaluable),
            "errors": sum(1 for item in values if item["error"]),
        }
    return output


def validate_pair_fairness(
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    *,
    phase_label: str,
    expected_baseline_digest: str,
    expected_candidate_digest: str,
    allow_weak_fairness: bool,
    require_job_retry_fairness: bool = False,
) -> tuple[str, str | None]:
    if not baseline or not candidate:
        raise ValueError(f"{phase_label} requires non-empty baseline and candidate evidence.")
    baseline_signature = fairness_cells(baseline)
    candidate_signature = fairness_cells(candidate)
    if set(baseline_signature) != set(candidate_signature):
        raise ValueError(
            f"{phase_label} jobs are not comparable: "
            "task/checksum/agent/version/model cells differ."
        )
    for cell in baseline_signature:
        left = baseline_signature[cell]
        right = candidate_signature[cell]
        if left["attempts"] != right["attempts"]:
            raise ValueError(f"{phase_label} attempt-count drift in cell {cell}.")
        if left["configSignatures"] != right["configSignatures"]:
            raise ValueError(
                f"{phase_label} TrialConfig drift beyond the target skill in cell {cell}."
            )
        if left["artifactsSignatures"] != right["artifactsSignatures"]:
            raise ValueError(
                f"{phase_label} trial artifact-config drift in cell {cell}."
            )
        if require_job_retry_fairness:
            if any(
                digest is None
                for digest in [
                    *left["jobRetryDigests"],
                    *right["jobRetryDigests"],
                ]
            ):
                raise ValueError(
                    f"{phase_label} requires complete JobLock retry digests in cell {cell}."
                )
            if left["jobRetryDigests"] != right["jobRetryDigests"]:
                raise ValueError(
                    f"{phase_label} JobLock retry drift in cell {cell}."
                )

    lock_available = all(item["lockSignature"] for item in baseline + candidate)
    if lock_available:
        for label, values, expected in (
            ("baseline", baseline, expected_baseline_digest),
            ("candidate", candidate, expected_candidate_digest),
        ):
            mismatches = [
                item["evidenceId"]
                for item in values
                if item["targetSkillDigests"] != [expected]
            ]
            if mismatches:
                raise ValueError(
                    f"Locked {label} {phase_label.lower()} trials do not contain "
                    f"exactly the expected target skill digest: {mismatches}"
                )
        for cell in baseline_signature:
            if (
                baseline_signature[cell]["lockSignatures"]
                != candidate_signature[cell]["lockSignatures"]
            ):
                raise ValueError(
                    f"{phase_label} trial-lock drift beyond the target skill in cell {cell}."
                )
        return "trial-lock-and-result", None
    if not allow_weak_fairness:
        if phase_label == "Holdout":
            raise ValueError(
                "Holdout comparison requires trial lock.json files. Set "
                "allowWeakFairness only for explicitly limited legacy evidence."
            )
        raise ValueError(
            f"{phase_label} comparison requires trial lock.json files. "
            "Weak fairness is not permitted for this phase."
        )
    return (
        "trial-result-and-config",
        "Trial locks were unavailable; replay-setting parity could not be fully verified.",
    )


def validate_development_independence(
    discovery: list[dict[str, Any]], candidate: list[dict[str, Any]]
) -> str:
    """Require candidate development to contain genuinely separate attempts."""

    checks = (
        ("job artifact directory", "_jobArtifactDirectory"),
        ("job result identity", "_jobResultId"),
        ("job config path", "_jobConfigPath"),
        ("job result path", "_jobResultPath"),
        ("job lock path", "_jobLockPath"),
        ("evidence ID", "evidenceId"),
        ("trial UUID", "trialId"),
        ("trial result identity", "trialName"),
        ("trial artifact directory", "artifactDirectory"),
        ("trial result path", "resultPath"),
        ("trial lock path", "lockPath"),
        ("trial URI", "_trialUri"),
        ("trial-config job identity", "_trialConfigJobId"),
        ("raw result artifact digest", "_resultArtifactDigest"),
        ("attempt evidence fingerprint", "_attemptFingerprint"),
    )
    for label, key in checks:
        left = {
            str(item[key])
            for item in discovery
            if item.get(key) is not None
        }
        right = {
            str(item[key])
            for item in candidate
            if item.get(key) is not None
        }
        overlap = sorted(left & right)
        if overlap:
            rendered = overlap[:4]
            suffix = "" if len(overlap) <= 4 else f" (+{len(overlap) - 4} more)"
            raise ValueError(
                "Candidate development must use physically and evidentially "
                f"independent attempts; reused {label}: {rendered}{suffix}."
            )
    return stable_digest(
        {
            "discovery": sorted(item["_attemptFingerprint"] for item in discovery),
            "candidate": sorted(item["_attemptFingerprint"] for item in candidate),
        }
    )


def candidate_development_gate(
    discovery: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    independence_signature = validate_development_independence(
        discovery, candidate
    )
    fairness_basis, warning = validate_pair_fairness(
        discovery,
        candidate,
        phase_label="Candidate development",
        expected_baseline_digest=config["baselineDigest"],
        expected_candidate_digest=config["candidateDigest"],
        allow_weak_fairness=False,
        require_job_retry_fairness=True,
    )
    qualification = qualification_summary(candidate)
    evaluable = all(item["evaluable"] for item in candidate)
    passed_trials = sum(item["outcome"] == "success" for item in candidate)
    pass_rate = passed_trials / len(candidate) if evaluable else None
    minimum_pass_rate = config["development"]["minimumPassRate"]
    pass_rate_eligible = pass_rate is not None and pass_rate >= minimum_pass_rate
    candidate_errors = sum(item["error"] is not None for item in candidate)
    required_rewards_complete = qualification["missingRequiredRewards"] == 0
    provenance_verified = all(
        item["skillIdentity"]["promotionEligible"]
        for item in [*discovery, *candidate]
    )
    candidate_qualified = qualification["passed"]
    blockers = []
    if not evaluable:
        blockers.append("candidate-not-evaluable")
    if candidate_errors:
        blockers.append("candidate-errors")
    if not candidate_qualified:
        blockers.append("candidate-unqualified")
    if pass_rate is not None and not pass_rate_eligible:
        blockers.append("development-pass-rate-below-minimum")
    if not provenance_verified:
        blockers.append("unverified-development-provenance")
    passed = not blockers
    evidence_keys = (
        "evidenceId",
        "taskName",
        "taskChecksum",
        "agent",
        "agentVersion",
        "model",
        "reward",
        "reportedReward",
        "primaryRewardMissing",
        "requiredRewards",
        "qualificationPassed",
        "qualificationFailures",
        "evaluable",
        "evaluationFailure",
        "verifierDiagnostics",
        "evidenceClass",
        "actionability",
        "evidenceEligible",
        "outcome",
        "error",
        "usage",
        "artifactDirectory",
        "resultPath",
        "lockPath",
        "jobRetry",
        "jobRetryDigest",
        "skillIdentity",
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "phase": "development",
        "status": "complete",
        "decision": (
            "not-evaluable" if not evaluable else "pass" if passed else "fail"
        ),
        "passed": passed,
        "evaluable": evaluable,
        "fairnessBasis": fairness_basis,
        "warning": warning,
        "attemptIndependenceVerified": True,
        "attemptIndependenceSignature": independence_signature,
        "discoveryReplaySignature": stable_digest(fairness_cells(discovery)),
        "candidateReplaySignature": stable_digest(fairness_cells(candidate)),
        "candidateDigest": config["candidateDigest"],
        "uniqueTrials": len({item["trialId"] for item in candidate}),
        "uniqueTasks": len({item["taskChecksum"] for item in candidate}),
        "passedTrials": passed_trials,
        "candidatePassRate": pass_rate,
        "minimumPassRate": minimum_pass_rate,
        "passRateEligible": pass_rate_eligible,
        "candidateErrors": candidate_errors,
        "candidateQualified": candidate_qualified,
        "requiredRewardsComplete": required_rewards_complete,
        "provenanceVerified": provenance_verified,
        "qualification": qualification,
        "blockers": blockers,
        "candidateEvidence": [
            {key: public_record(item)[key] for key in evidence_keys}
            for item in candidate
        ],
    }


def validate_holdout_isolation(
    discovery: list[dict[str, Any]],
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
) -> None:
    discovery_names = {item["taskName"] for item in discovery}
    discovery_checksums = {item["taskChecksum"] for item in discovery}
    holdout = [*baseline, *candidate]
    overlap_names = sorted(discovery_names & {item["taskName"] for item in holdout})
    overlap_checksums = sorted(
        discovery_checksums & {item["taskChecksum"] for item in holdout}
    )
    if overlap_names or overlap_checksums:
        raise ValueError(
            "Discovery and holdout Harbor tasks overlap: "
            f"names={overlap_names}, checksums={overlap_checksums}."
        )


def validate_phase_profile(
    discovery: list[dict[str, Any]], holdout: list[dict[str, Any]]
) -> None:
    def profiles(records: list[dict[str, Any]]) -> set[tuple[str, str, str]]:
        return {
            (item["agent"], item["agentVersion"], item["model"])
            for item in records
        }

    discovery_profiles = profiles(discovery)
    holdout_profiles = profiles(holdout)
    if discovery_profiles != holdout_profiles:
        raise ValueError(
            "Discovery and holdout evaluation-profile drift: "
            f"discovery={sorted(discovery_profiles)}, holdout={sorted(holdout_profiles)}."
        )


def holdout_gate(
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    expected_candidate_digest = config.get("candidateDigest")
    if expected_candidate_digest is None:
        raise ValueError("Candidate digest is required for a holdout gate.")
    fairness_basis, warning = validate_pair_fairness(
        baseline,
        candidate,
        phase_label="Holdout",
        expected_baseline_digest=config["baselineDigest"],
        expected_candidate_digest=expected_candidate_digest,
        allow_weak_fairness=config["holdout"]["allowWeakFairness"],
        require_job_retry_fairness=config["configSchemaVersion"] == 2,
    )

    baseline_cells = comparison_cells(baseline)
    candidate_cells = comparison_cells(candidate)
    per_cell = []
    regressions = []
    for key in baseline_cells:
        left = baseline_cells[key]
        right = candidate_cells[key]
        cell_evaluable = left["evaluable"] and right["evaluable"]
        delta = (
            right["meanReward"] - left["meanReward"]
            if cell_evaluable
            else None
        )
        if delta is not None and delta < 0:
            regressions.append(key)
        per_cell.append(
            {
                "cell": key,
                "taskName": left["taskName"],
                "taskChecksum": left["taskChecksum"],
                "attempts": left["attempts"],
                "baselineMeanReward": left["meanReward"],
                "candidateMeanReward": right["meanReward"],
                "delta": delta,
                "evaluable": cell_evaluable,
                "baselineNonEvaluableTrials": left["nonEvaluableTrials"],
                "candidateNonEvaluableTrials": right["nonEvaluableTrials"],
                "candidateErrors": right["errors"],
            }
        )
    baseline_evaluable = all(item["evaluable"] for item in baseline)
    candidate_evaluable = all(item["evaluable"] for item in candidate)
    holdout_evaluable = baseline_evaluable and candidate_evaluable
    baseline_scores = [0.0 if item["error"] else item["reward"] for item in baseline]
    candidate_scores = [0.0 if item["error"] else item["reward"] for item in candidate]
    baseline_mean = (
        sum(float(value) for value in baseline_scores) / len(baseline_scores)
        if baseline_evaluable
        else None
    )
    candidate_mean = (
        sum(float(value) for value in candidate_scores) / len(candidate_scores)
        if candidate_evaluable
        else None
    )
    mean_gain = (
        candidate_mean - baseline_mean
        if holdout_evaluable
        else None
    )
    candidate_errors = sum(1 for item in candidate if item["error"])
    baseline_qualification = qualification_summary(baseline)
    candidate_qualification = qualification_summary(candidate)
    required_rewards_complete = (
        baseline_qualification["missingRequiredRewards"] == 0
        and candidate_qualification["missingRequiredRewards"] == 0
    )
    candidate_qualified = candidate_qualification["passed"]
    rules = config["holdout"]
    promoted = (
        holdout_evaluable
        and mean_gain >= rules["minimumMeanGain"]
        and (rules["allowTaskRegressions"] or not regressions)
        and (not rules["requireNoErrors"] or candidate_errors == 0)
        and required_rewards_complete
        and candidate_qualified
        and config.get("developmentEvidencePromotionEligible", False)
        and config.get("candidateDevelopmentPassed", True)
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "status": "complete",
        "decision": (
            "not-evaluable"
            if not holdout_evaluable
            else "promote" if promoted else "keep-baseline"
        ),
        "promoted": promoted,
        "evaluable": holdout_evaluable,
        "baselineEvaluable": baseline_evaluable,
        "candidateEvaluable": candidate_evaluable,
        "reason": (
            None
            if holdout_evaluable
            else "A missing primary reward or provider/infrastructure diagnostic "
            "made at least one holdout trial non-evaluable."
        ),
        "fairnessBasis": fairness_basis,
        "warning": warning,
        **(
            {
                "retryContractVerified": True,
                "baselineRetryPolicyDigests": sorted(
                    {
                        item["jobRetryDigest"]
                        for item in baseline
                        if item.get("jobRetryDigest") is not None
                    }
                ),
                "candidateRetryPolicyDigests": sorted(
                    {
                        item["jobRetryDigest"]
                        for item in candidate
                        if item.get("jobRetryDigest") is not None
                    }
                ),
            }
            if config["configSchemaVersion"] == 2
            else {}
        ),
        "baselineMeanReward": baseline_mean,
        "candidateMeanReward": candidate_mean,
        "meanGain": mean_gain,
        "candidateErrors": candidate_errors,
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        "requiredRewardsComplete": required_rewards_complete,
        "candidateQualified": candidate_qualified,
        "developmentEvidencePromotionEligible": config.get(
            "developmentEvidencePromotionEligible", False
        ),
        "baselineQualified": baseline_qualification["passed"],
        "baselineQualification": baseline_qualification,
        "candidateQualification": candidate_qualification,
        "regressedCells": regressions,
        "perCell": per_cell,
        "promotionRules": {
            "minimumMeanGain": rules["minimumMeanGain"],
            "allowTaskRegressions": rules["allowTaskRegressions"],
            "requireNoErrors": rules["requireNoErrors"],
            "requiredRewards": config["harbor"]["requiredRewards"],
        },
        "baselineEvidence": [
            {
                key: public_record(item)[key]
                for key in (
                    "evidenceId",
                    "taskName",
                    "taskChecksum",
                    "reward",
                    "reportedReward",
                    "primaryRewardMissing",
                    "requiredRewards",
                    "qualificationPassed",
                    "qualificationFailures",
                    "evaluable",
                    "evaluationFailure",
                    "verifierDiagnostics",
                    "evidenceClass",
                    "actionability",
                    "evidenceEligible",
                    "outcome",
                    "error",
                    "skillIdentity",
                )
            }
            for item in baseline
        ],
        "candidateEvidence": [
            {
                key: public_record(item)[key]
                for key in (
                    "evidenceId",
                    "taskName",
                    "taskChecksum",
                    "reward",
                    "reportedReward",
                    "primaryRewardMissing",
                    "requiredRewards",
                    "qualificationPassed",
                    "qualificationFailures",
                    "evaluable",
                    "evaluationFailure",
                    "verifierDiagnostics",
                    "evidenceClass",
                    "actionability",
                    "evidenceEligible",
                    "outcome",
                    "error",
                    "skillIdentity",
                )
            }
            for item in candidate
        ],
    }


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def render_report(run: dict[str, Any]) -> str:
    trace = run["tracePool"]["summary"]
    proposal = run["proposalState"]
    holdout = run["holdoutGate"]
    lines = [
        f"# Harbor Trace Distillation: {run['runId']}",
        "",
        f"Mode: `{run['mode']}`",
        f"Decision: **{holdout['decision']}**",
        "",
        "## Discovery evidence",
        "",
        f"- Unique trials: {trace['uniqueTrials']}",
        f"- Unique task checksums: {trace['uniqueTasks']}",
        f"- Outcomes: `{json.dumps(trace['outcomes'], sort_keys=True)}`",
        "",
        "## Consolidation",
        "",
        f"- Accepted patches: {', '.join(item['id'] for item in proposal['accepted']) or 'none'}",
        f"- Rejected patches: {', '.join(item['id'] for item in proposal['rejected']) or 'none'}",
        f"- Candidate: `{run['consolidation']['candidateSkill']}`",
        f"- Candidate digest: `{run['consolidation']['candidateDigest']}`",
        "",
    ]
    development = run.get("developmentGate")
    if development is not None:
        lines.extend(["## Candidate development gate", ""])
        if development["status"] == "complete":
            pass_rate = development["candidatePassRate"]
            lines.extend(
                [
                    f"- Decision: **{development['decision']}**",
                    f"- Fairness basis: `{development['fairnessBasis']}`",
                    f"- Unique trials: {development['uniqueTrials']}",
                    f"- Unique task checksums: {development['uniqueTasks']}",
                    (
                        f"- Candidate pass rate: {pass_rate:.1%}"
                        if pass_rate is not None
                        else "- Candidate pass rate: null"
                    ),
                    f"- Minimum pass rate: {development['minimumPassRate']:.1%}",
                    f"- Candidate qualified: {'yes' if development['candidateQualified'] else 'no'}",
                    f"- Blockers: {', '.join(development['blockers']) or 'none'}",
                ]
            )
        else:
            lines.append(f"- {development['reason']}")
        lines.append("")
    lines.extend(["## Holdout gate", ""])
    if holdout["status"] == "complete":
        lines.append(f"- Fairness basis: `{holdout['fairnessBasis']}`")
        if holdout.get("evaluable", True):
            lines.extend(
                [
                    f"- Baseline mean reward: {holdout['baselineMeanReward']:.3f}",
                    f"- Candidate mean reward: {holdout['candidateMeanReward']:.3f}",
                    f"- Mean gain: {holdout['meanGain']:+.3f}",
                ]
            )
        else:
            lines.extend(
                [
                    (
                        f"- Baseline mean reward: {holdout['baselineMeanReward']:.3f}"
                        if holdout["baselineEvaluable"]
                        else "- Baseline mean reward: null"
                    ),
                    (
                        f"- Candidate mean reward: {holdout['candidateMeanReward']:.3f}"
                        if holdout["candidateEvaluable"]
                        else "- Candidate mean reward: null"
                    ),
                    "- Mean gain: null",
                    f"- Non-evaluable: {holdout['reason']}",
                ]
            )
        lines.extend(
            [
                f"- Candidate errors: {holdout['candidateErrors']}",
                f"- Candidate qualified: {'yes' if holdout['candidateQualified'] else 'no'}",
                f"- Required rewards complete: {'yes' if holdout['requiredRewardsComplete'] else 'no'}",
            ]
        )
        if holdout.get("warning"):
            lines.append(f"- Limitation: {holdout['warning']}")
    else:
        lines.append(f"- {holdout['reason']}")
    lines.extend(
        [
            "",
            "The source skill was not modified. Review every cited Harbor artifact and validate the candidate bundle before promotion.",
            "",
        ]
    )
    return "\n".join(lines)


def run_distillation(config: dict[str, Any], *, analyze_only: bool) -> dict[str, Any]:
    missing = [name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    output = config["outputDirectory"]
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory must be new or empty: {output}")
    output.mkdir(parents=True, exist_ok=True)
    staged_baseline = stage_skill_bundle(
        config["baselineSkill"], output / "baseline", config["skillName"]
    )
    config["stagedBaselineSkill"] = staged_baseline

    discovery_paths = list(config["discovery"]["artifacts"])
    if not analyze_only and config["discovery"]["jobConfigs"]:
        discovery_paths.extend(
            asyncio.run(
                execute_jobs(
                    config["discovery"]["jobConfigs"],
                    output=output,
                    phase="discovery",
                    baseline_skill=config["baselineSkill"],
                    candidate_skill=staged_baseline,
                    require_zero_retries=config["configSchemaVersion"] == 2,
                )
            )
        )
    if not discovery_paths:
        raise ValueError(
            "No discovery artifacts are available. analyze-only never executes discovery job configs."
        )
    records = load_artifacts(
        discovery_paths,
        config=config,
        expected_skill_digest=config["baselineDigest"],
        include_feedback=True,
        require_lock=config["harbor"]["requireDiscoveryLocks"],
        allow_legacy_identity_alias=analyze_only,
        require_zero_retry_contract=config["configSchemaVersion"] == 2,
    )
    trace_pool = build_trace_pool(records)
    proposals = load_proposals(config["proposals"]["path"])
    state = proposal_state(proposals, records, config)
    state["developmentEvidencePromotionEligible"] = trace_pool["summary"][
        "skillIdentity"
    ]["promotionEligible"]
    config["developmentEvidencePromotionEligible"] = state[
        "developmentEvidencePromotionEligible"
    ]
    candidate, consolidation = materialize_candidate(config, state)
    config["candidateDigest"] = consolidation["candidateDigest"]
    development_records: list[dict[str, Any]] = []
    development_gate: dict[str, Any] | None = None

    if analyze_only:
        if config["configSchemaVersion"] == 2:
            development_gate = {
                "schemaVersion": SCHEMA_VERSION,
                "source": "harbor",
                "phase": "development",
                "status": "not-run",
                "decision": "not-evaluated",
                "passed": False,
                "reason": (
                    "analyze-only excludes candidate development and all holdout "
                    "reads and executions."
                ),
            }
        gate = {
            "schemaVersion": SCHEMA_VERSION,
            "source": "harbor",
            "status": "not-run",
            "decision": "not-evaluated",
            "promoted": False,
            "reason": "analyze-only excludes all holdout reads and executions.",
        }
    else:
        if config["configSchemaVersion"] == 2:
            development_paths = list(
                config["development"]["candidateArtifacts"]
            )
            if config["development"]["candidateJobConfigs"]:
                development_paths.extend(
                    asyncio.run(
                        execute_jobs(
                            config["development"]["candidateJobConfigs"],
                            output=output,
                            phase="development-candidate",
                            baseline_skill=config["baselineSkill"],
                            candidate_skill=candidate,
                            require_zero_retries=True,
                        )
                    )
                )
            development_records = load_artifacts(
                development_paths,
                config=config,
                expected_skill_digest=config["candidateDigest"],
                include_feedback=False,
                require_lock=True,
                require_zero_retry_contract=True,
            )
            development_gate = candidate_development_gate(
                records, development_records, config
            )
            config["candidateDevelopmentPassed"] = development_gate["passed"]
        else:
            config["candidateDevelopmentPassed"] = True

        if config["configSchemaVersion"] == 2 and not config[
            "candidateDevelopmentPassed"
        ]:
            gate = {
                "schemaVersion": SCHEMA_VERSION,
                "source": "harbor",
                "status": "not-run",
                "decision": "not-evaluated",
                "promoted": False,
                "reason": (
                    "Candidate development did not pass; holdout artifacts and "
                    "job configs were not opened."
                ),
                "developmentDecision": development_gate["decision"],
            }
        else:
            baseline_paths = list(config["holdout"]["baselineArtifacts"])
            candidate_paths = list(config["holdout"]["candidateArtifacts"])
            if config["holdout"]["baselineJobConfigs"]:
                baseline_paths.extend(
                    asyncio.run(
                        execute_jobs(
                            config["holdout"]["baselineJobConfigs"],
                            output=output,
                            phase="holdout-baseline",
                            baseline_skill=config["baselineSkill"],
                            candidate_skill=staged_baseline,
                            require_zero_retries=(
                                config["configSchemaVersion"] == 2
                            ),
                        )
                    )
                )
            if config["holdout"]["candidateJobConfigs"]:
                candidate_paths.extend(
                    asyncio.run(
                        execute_jobs(
                            config["holdout"]["candidateJobConfigs"],
                            output=output,
                            phase="holdout-candidate",
                            baseline_skill=config["baselineSkill"],
                            candidate_skill=candidate,
                            require_zero_retries=(
                                config["configSchemaVersion"] == 2
                            ),
                        )
                    )
                )
            if baseline_paths or candidate_paths:
                if not baseline_paths or not candidate_paths:
                    raise ValueError(
                        "Holdout requires both baseline and candidate artifacts or job configs."
                    )
                baseline = load_artifacts(
                    baseline_paths,
                    config=config,
                    expected_skill_digest=config["baselineDigest"],
                    include_feedback=False,
                    require_lock=not config["holdout"]["allowWeakFairness"],
                    require_zero_retry_contract=(
                        config["configSchemaVersion"] == 2
                    ),
                )
                candidate_records = load_artifacts(
                    candidate_paths,
                    config=config,
                    expected_skill_digest=config["candidateDigest"],
                    include_feedback=False,
                    require_lock=not config["holdout"]["allowWeakFairness"],
                    require_zero_retry_contract=(
                        config["configSchemaVersion"] == 2
                    ),
                )
                development_evidence = [*records, *development_records]
                validate_holdout_isolation(
                    development_evidence, baseline, candidate_records
                )
                validate_phase_profile(
                    development_evidence, [*baseline, *candidate_records]
                )
                gate = holdout_gate(baseline, candidate_records, config)
            else:
                gate = {
                    "schemaVersion": SCHEMA_VERSION,
                    "source": "harbor",
                    "status": "not-run",
                    "decision": "not-evaluated",
                    "promoted": False,
                    "reason": "No holdout artifacts or job configs were configured.",
                }

    generated_at = datetime.now(timezone.utc).isoformat()
    run = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "runId": config["runId"],
        "mode": "analyze-only" if analyze_only else "live",
        "generatedAt": generated_at,
        "baselineSkill": str(config["baselineSkill"]),
        "stagedBaselineSkill": str(staged_baseline),
        "baselineDigest": config["baselineDigest"],
        "tracePool": trace_pool,
        "proposalState": state,
        "consolidation": consolidation,
        "holdoutGate": gate,
    }
    if config["configSchemaVersion"] == 2:
        run["configSchemaVersion"] = 2
        run["developmentGate"] = development_gate
    write_json(output / "trace-pool.json", trace_pool)
    write_json(output / "proposal-state.json", state)
    write_json(output / "consolidation.json", consolidation)
    if development_gate is not None:
        write_json(output / "development-gate.json", development_gate)
    write_json(output / "holdout-gate.json", gate)
    write_json(output / "run.json", run)
    (output / "report.md").write_text(render_report(run), encoding="utf-8")
    return run


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path, nargs="?")
    parser.add_argument("--output-dir", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    mode.add_argument("--analyze-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.config is None:
        raise SystemExit("config is required unless --help is used")
    try:
        config = normalize_config(args.config.resolve(), args.output_dir)
        if args.dry_run:
            result = {"mode": "dry-run", **public_plan(config)}
        elif args.doctor:
            result = {"mode": "doctor", **doctor(config)}
        else:
            run = run_distillation(config, analyze_only=args.analyze_only)
            result = {
                "mode": run["mode"],
                "decision": run["holdoutGate"]["decision"],
                "candidateSkill": run["consolidation"]["candidateSkill"],
                "tracePool": str(config["outputDirectory"] / "trace-pool.json"),
                "proposalState": str(config["outputDirectory"] / "proposal-state.json"),
                "holdoutGate": str(config["outputDirectory"] / "holdout-gate.json"),
                "reportMarkdown": str(config["outputDirectory"] / "report.md"),
            }
            if config["configSchemaVersion"] == 2:
                development = run["developmentGate"]
                result.update(
                    {
                        "configSchemaVersion": 2,
                        "candidateDigest": run["consolidation"]["candidateDigest"],
                        "developmentDecision": development["decision"],
                        "developmentGate": str(
                            config["outputDirectory"] / "development-gate.json"
                        ),
                        "developmentDiscoverySignature": development.get(
                            "discoveryReplaySignature"
                        ),
                        "developmentCandidateSignature": development.get(
                            "candidateReplaySignature"
                        ),
                    }
                )
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
