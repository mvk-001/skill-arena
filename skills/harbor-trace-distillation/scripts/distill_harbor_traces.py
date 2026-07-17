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
MAX_TEXT = 6000
ALLOWED_EXACT_TARGETS = {"SKILL.md", "agents/openai.yaml"}
ALLOWED_TARGET_PREFIXES = ("references/", "scripts/")
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
    require_string(result.get("name"), "SKILL.md frontmatter.name")
    require_string(result.get("description"), "SKILL.md frontmatter.description")
    return result


def directory_digest(directory: Path) -> str:
    return compute_skill_digest(directory)


def normalize_config(path: Path, output_override: Path | None = None) -> dict[str, Any]:
    raw = load_yaml(path, "config")
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("schemaVersion must be 1.")
    base = path.resolve().parent
    run = require_mapping(raw.get("run"), "run")
    harbor = require_mapping(raw.get("harbor", {}), "harbor")
    discovery = require_mapping(raw.get("discovery", {}), "discovery")
    proposals = require_mapping(raw.get("proposals", {}), "proposals")
    holdout = require_mapping(raw.get("holdout", {}), "holdout")

    baseline = resolve_path(base, run.get("baselineSkill"), "run.baselineSkill")
    skill_path = baseline / "SKILL.md"
    if not skill_path.is_file():
        raise ValueError(f"Baseline skill has no SKILL.md: {baseline}")
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
    return {
        "configPath": path.resolve(),
        "runId": require_string(run.get("id"), "run.id"),
        "baselineSkill": baseline,
        "baselineDigest": directory_digest(baseline),
        "skillName": baseline_frontmatter["name"],
        "outputDirectory": output,
        "harbor": {
            "rewardKey": require_string(harbor.get("rewardKey", "reward"), "harbor.rewardKey"),
            "passThreshold": float(harbor.get("passThreshold", 1.0)),
            "requiredEnv": required_env,
            "requireDiscoveryLocks": bool(harbor.get("requireDiscoveryLocks", False)),
        },
        "discovery": {
            "artifacts": resolve_path_list(base, discovery.get("artifacts", []), "discovery.artifacts"),
            "jobConfigs": resolve_path_list(base, discovery.get("jobConfigs", []), "discovery.jobConfigs"),
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
            "minimumMeanGain": float(holdout.get("minimumMeanGain", 0.0)),
            "allowTaskRegressions": bool(holdout.get("allowTaskRegressions", False)),
            "requireNoErrors": bool(holdout.get("requireNoErrors", True)),
        },
    }


def public_plan(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "runId": config["runId"],
        "baselineSkill": str(config["baselineSkill"]),
        "baselineDigest": config["baselineDigest"],
        "skillName": config["skillName"],
        "outputDirectory": str(config["outputDirectory"]),
        "harborVersion": version("harbor"),
        "rewardKey": config["harbor"]["rewardKey"],
        "passThreshold": config["harbor"]["passThreshold"],
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


def load_job_config(path: Path) -> JobConfig:
    return JobConfig.model_validate(prepare_job_raw(path))


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
            "Candidate holdout job config does not reference the declared baseline skill."
        )
    return source.model_copy(update={"agents": agents})


async def execute_jobs(
    paths: list[Path],
    *,
    output: Path,
    phase: str,
    baseline_skill: Path,
    candidate_skill: Path | None = None,
) -> list[Path]:
    job_directories: list[Path] = []
    for index, path in enumerate(paths, start=1):
        config = load_job_config(path)
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
    job_paths = [
        *config["discovery"]["jobConfigs"],
        *config["holdout"]["baselineJobConfigs"],
        *config["holdout"]["candidateJobConfigs"],
    ]
    job_configs = [load_job_config(path) for path in job_paths]
    uses_docker = any(str(job.environment.type or "docker") == "docker" for job in job_configs)
    checks: dict[str, Any] = {
        "credentials": "declared variables present",
        "jobConfigs": len(job_configs),
    }
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
) -> Any:
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
    if target.name not in {target_skill_name, source_basename}:
        raise ValueError(
            f"Locked target skill name {target.name!r} matches neither the expected "
            f"frontmatter name {target_skill_name!r} nor its source basename "
            f"{source_basename!r} in Harbor trial {trial_directory}."
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
    return target


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


def normalize_trial(
    trial: TrialResult,
    *,
    result_path: Path,
    source_label: str,
    harbor_version: str | None,
    reward_key: str,
    pass_threshold: float,
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
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
    raw_reward = rewards.get(reward_key)
    reward = (
        float(raw_reward)
        if isinstance(raw_reward, (int, float)) and math.isfinite(float(raw_reward))
        else None
    )
    error = None
    if trial.exception_info is not None:
        error = {
            "type": trial.exception_info.exception_type,
            "message": sanitize_text(trial.exception_info.exception_message, 1500),
        }
        outcome = "error"
    elif reward is None:
        outcome = "missing-reward"
    elif reward >= pass_threshold:
        outcome = "success"
    else:
        outcome = "verifier-failure"

    locked_target = (
        resolve_locked_target_skill(
            lock,
            trial.config,
            trial_directory=trial_directory,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
        )
        if lock
        else None
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
        "rewards": dict(rewards),
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
        "configSignature": stable_digest(config_canonical),
        "artifactsSignature": artifacts_signature,
        "feedback": collect_feedback(trial_directory, trial.agent_info.name)
        if include_feedback
        else None,
        "_lockCanonical": lock_canonical,
    }
    return record


def load_job_artifact(
    directory: Path,
    *,
    reward_key: str,
    pass_threshold: float,
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
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
    if job_lock_path.is_file():
        job_lock = JobLock.model_validate_json(job_lock_path.read_text(encoding="utf-8"))
        harbor_version = job_lock.harbor.version
        if harbor_version is not None and harbor_version != version("harbor"):
            raise ValueError(
                f"Harbor artifact version drift in {directory}: lock={harbor_version}, runtime={version('harbor')}."
            )
    elif require_lock:
        raise ValueError(f"Harbor job is missing lock.json: {directory}")
    label = config.job_name or directory.name
    return [
        normalize_trial(
            trial,
            result_path=path,
            source_label=label,
            harbor_version=harbor_version,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
            include_feedback=include_feedback,
            require_lock=require_lock,
        )
        for trial, path in zip(parsed_trials, paths)
    ]


def load_trial_artifact(
    directory: Path,
    *,
    reward_key: str,
    pass_threshold: float,
    target_skill_name: str,
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
) -> list[dict[str, Any]]:
    path = directory / "result.json"
    trial = TrialResult.model_validate_json(path.read_text(encoding="utf-8"))
    if trial.finished_at is None:
        raise ValueError(f"Incomplete Harbor trial has no finished_at: {directory}")
    return [
        normalize_trial(
            trial,
            result_path=path,
            source_label=directory.name,
            harbor_version=None,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
            target_skill_name=target_skill_name,
            expected_skill_digest=expected_skill_digest,
            include_feedback=include_feedback,
            require_lock=require_lock,
        )
    ]


def load_artifacts(
    directories: Iterable[Path],
    *,
    config: dict[str, Any],
    expected_skill_digest: str,
    include_feedback: bool,
    require_lock: bool,
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
                target_skill_name=config["skillName"],
                expected_skill_digest=expected_skill_digest,
                include_feedback=include_feedback,
                require_lock=require_lock,
            )
        elif "task_name" in raw_result and "trial_name" in raw_result:
            values = load_trial_artifact(
                directory,
                reward_key=config["harbor"]["rewardKey"],
                pass_threshold=config["harbor"]["passThreshold"],
                target_skill_name=config["skillName"],
                expected_skill_digest=expected_skill_digest,
                include_feedback=include_feedback,
                require_lock=require_lock,
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


def build_trace_pool(records: list[dict[str, Any]]) -> dict[str, Any]:
    outcomes = Counter(record["outcome"] for record in records)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "phase": "discovery",
        "summary": {
            "uniqueTrials": len({record["trialId"] for record in records}),
            "uniqueTasks": len({record["taskChecksum"] for record in records}),
            "outcomes": dict(sorted(outcomes.items())),
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
            "evidenceIds": evidence_ids,
            "support": {
                "uniqueTrials": unique_trials,
                "uniqueTasks": unique_tasks,
                "taskChecksums": sorted({item["taskChecksum"] for item in supported}),
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
    target = candidate.joinpath(*PurePosixPath(proposal["target"]).parts)
    if target != candidate and not target.is_relative_to(candidate):
        raise ValueError(f"Proposal escaped candidate bundle: {proposal['id']}")
    operation = proposal["operation"]
    if operation == "create":
        if target.exists():
            raise ValueError(f"create target already exists: {proposal['target']}")
        target.parent.mkdir(parents=True, exist_ok=True)
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
    skill_path = candidate / "SKILL.md"
    frontmatter = parse_skill_frontmatter(skill_path.read_text(encoding="utf-8"))
    if frontmatter["name"] != skill_name:
        raise ValueError(f"Proposal {proposal['id']} changed the skill name.")
    if len(skill_path.read_text(encoding="utf-8").splitlines()) > 500:
        raise ValueError(f"Proposal {proposal['id']} made SKILL.md exceed 500 lines.")


def materialize_candidate(
    config: dict[str, Any], state: dict[str, Any]
) -> tuple[Path, dict[str, Any]]:
    candidate = config["outputDirectory"] / "candidate-skill"
    shutil.copytree(config["baselineSkill"], candidate)
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
        shutil.copytree(config["baselineSkill"], candidate)
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
        "baselineDigest": config["baselineDigest"],
        "candidateSkill": str(candidate),
        "candidateDigest": directory_digest(candidate),
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
            "lockSignatures": sorted({item["lockSignature"] for item in values}),
            "configSignatures": sorted({item["configSignature"] for item in values}),
            "artifactsSignatures": sorted({item["artifactsSignature"] for item in values}),
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
        scores = [0.0 if item["error"] else item["reward"] for item in values]
        if any(score is None for score in scores):
            raise ValueError(f"Holdout cell has a missing configured reward: {'|'.join(key)}")
        output["|".join(key)] = {
            "taskName": key[0],
            "taskChecksum": key[1],
            "attempts": len(values),
            "meanReward": sum(float(score) for score in scores) / len(scores),
            "errors": sum(1 for item in values if item["error"]),
        }
    return output


def holdout_gate(
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    baseline_signature = fairness_cells(baseline)
    candidate_signature = fairness_cells(candidate)
    if set(baseline_signature) != set(candidate_signature):
        raise ValueError(
            "Holdout jobs are not comparable: task/checksum/agent/version/model cells differ."
        )
    for cell in baseline_signature:
        left = baseline_signature[cell]
        right = candidate_signature[cell]
        if left["attempts"] != right["attempts"]:
            raise ValueError(f"Holdout attempt-count drift in cell {cell}.")
        if left["configSignatures"] != right["configSignatures"]:
            raise ValueError(f"Holdout TrialConfig drift beyond the target skill in cell {cell}.")
        if left["artifactsSignatures"] != right["artifactsSignatures"]:
            raise ValueError(f"Holdout trial artifact-config drift in cell {cell}.")

    lock_available = all(item["lockSignature"] for item in baseline + candidate)
    if lock_available:
        expected_baseline_digest = directory_digest(config["baselineSkill"])
        expected_candidate_digest = config.get("candidateDigest")
        if expected_candidate_digest is None:
            raise ValueError("Candidate digest is required for a locked holdout gate.")
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
                    f"Locked {label} holdout trials do not contain exactly the expected target skill digest: {mismatches}"
                )
        for cell in baseline_signature:
            if baseline_signature[cell]["lockSignatures"] != candidate_signature[cell]["lockSignatures"]:
                raise ValueError(f"Holdout trial-lock drift beyond the target skill in cell {cell}.")
        fairness_basis = "trial-lock-and-result"
        warning = None
    elif not config["holdout"]["allowWeakFairness"]:
        raise ValueError(
            "Holdout comparison requires trial lock.json files. Set allowWeakFairness only for explicitly limited legacy evidence."
        )
    else:
        fairness_basis = "trial-result-and-config"
        warning = "Trial locks were unavailable; replay-setting parity could not be fully verified."

    baseline_cells = comparison_cells(baseline)
    candidate_cells = comparison_cells(candidate)
    per_cell = []
    regressions = []
    for key in baseline_cells:
        left = baseline_cells[key]
        right = candidate_cells[key]
        delta = right["meanReward"] - left["meanReward"]
        if delta < 0:
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
                "candidateErrors": right["errors"],
            }
        )
    baseline_scores = [0.0 if item["error"] else item["reward"] for item in baseline]
    candidate_scores = [0.0 if item["error"] else item["reward"] for item in candidate]
    baseline_mean = sum(float(value) for value in baseline_scores) / len(baseline_scores)
    candidate_mean = sum(float(value) for value in candidate_scores) / len(candidate_scores)
    candidate_errors = sum(1 for item in candidate if item["error"])
    rules = config["holdout"]
    promoted = (
        candidate_mean - baseline_mean >= rules["minimumMeanGain"]
        and (rules["allowTaskRegressions"] or not regressions)
        and (not rules["requireNoErrors"] or candidate_errors == 0)
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harbor",
        "status": "complete",
        "decision": "promote" if promoted else "keep-baseline",
        "promoted": promoted,
        "fairnessBasis": fairness_basis,
        "warning": warning,
        "baselineMeanReward": baseline_mean,
        "candidateMeanReward": candidate_mean,
        "meanGain": candidate_mean - baseline_mean,
        "candidateErrors": candidate_errors,
        "regressedCells": regressions,
        "perCell": per_cell,
        "promotionRules": {
            "minimumMeanGain": rules["minimumMeanGain"],
            "allowTaskRegressions": rules["allowTaskRegressions"],
            "requireNoErrors": rules["requireNoErrors"],
        },
        "baselineEvidence": [
            {key: public_record(item)[key] for key in ("evidenceId", "taskName", "taskChecksum", "reward", "outcome", "error")}
            for item in baseline
        ],
        "candidateEvidence": [
            {key: public_record(item)[key] for key in ("evidenceId", "taskName", "taskChecksum", "reward", "outcome", "error")}
            for item in candidate
        ],
    }


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=False) + "\n", encoding="utf-8")


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
        "## Holdout gate",
        "",
    ]
    if holdout["status"] == "complete":
        lines.extend(
            [
                f"- Fairness basis: `{holdout['fairnessBasis']}`",
                f"- Baseline mean reward: {holdout['baselineMeanReward']:.3f}",
                f"- Candidate mean reward: {holdout['candidateMeanReward']:.3f}",
                f"- Mean gain: {holdout['meanGain']:+.3f}",
                f"- Candidate errors: {holdout['candidateErrors']}",
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

    discovery_paths = list(config["discovery"]["artifacts"])
    if not analyze_only and config["discovery"]["jobConfigs"]:
        discovery_paths.extend(
            asyncio.run(
                execute_jobs(
                    config["discovery"]["jobConfigs"],
                    output=output,
                    phase="discovery",
                    baseline_skill=config["baselineSkill"],
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
    )
    trace_pool = build_trace_pool(records)
    proposals = load_proposals(config["proposals"]["path"])
    state = proposal_state(proposals, records, config)
    candidate, consolidation = materialize_candidate(config, state)
    config["candidateDigest"] = consolidation["candidateDigest"]

    if analyze_only:
        gate = {
            "schemaVersion": SCHEMA_VERSION,
            "source": "harbor",
            "status": "not-run",
            "decision": "not-evaluated",
            "promoted": False,
            "reason": "analyze-only excludes all holdout reads and executions.",
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
                    )
                )
            )
        if baseline_paths or candidate_paths:
            if not baseline_paths or not candidate_paths:
                raise ValueError("Holdout requires both baseline and candidate artifacts or job configs.")
            baseline = load_artifacts(
                baseline_paths,
                config=config,
                expected_skill_digest=config["baselineDigest"],
                include_feedback=False,
                require_lock=not config["holdout"]["allowWeakFairness"],
            )
            candidate_records = load_artifacts(
                candidate_paths,
                config=config,
                expected_skill_digest=config["candidateDigest"],
                include_feedback=False,
                require_lock=not config["holdout"]["allowWeakFairness"],
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
        "baselineDigest": config["baselineDigest"],
        "tracePool": trace_pool,
        "proposalState": state,
        "consolidation": consolidation,
        "holdoutGate": gate,
    }
    write_json(output / "trace-pool.json", trace_pool)
    write_json(output / "proposal-state.json", state)
    write_json(output / "consolidation.json", consolidation)
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
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
