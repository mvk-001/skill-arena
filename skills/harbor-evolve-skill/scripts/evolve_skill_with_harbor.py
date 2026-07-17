# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "gepa==0.1.2"]
# ///
"""Evolve one SKILL.md with Harbor trials and GEPA, then gate on holdout."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import itertools
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from gepa.optimize_anything import (
    EngineConfig,
    GEPAConfig,
    ReflectionConfig,
    optimize_anything,
)
from harbor import TrialQueue
from harbor.models.task.task import Task
from harbor.models.trial.config import (
    AgentConfig,
    EnvironmentConfig,
    TaskConfig,
    TrialConfig,
    VerifierConfig,
)


REFLECTION_PROMPT = """I am evolving a complete SKILL.md file for an agent.
The current SKILL.md is:
<curr_param>

The following Harbor trial evidence contains rewards, verifier diagnostics,
agent trajectories, and execution errors from development tasks:
<side_info>

Propose a drop-in replacement for the complete SKILL.md. Preserve its YAML
frontmatter name exactly. Generalize from recurring evidence, preserve behavior
that passed, avoid task-specific answers, and do not refer to hidden holdout
cases. Return only the complete SKILL.md inside one fenced block.
"""


@dataclass(frozen=True)
class HarborTaskExample:
    task_id: str
    task_name: str
    path: Path
    digest: str


@dataclass
class Runtime:
    baseline_skill: Path
    skill_name: str
    output_directory: Path
    agent_name: str
    model_name: str
    environment_type: str
    agent_kwargs: dict[str, Any]
    reward_key: str
    concurrency: int
    queue: TrialQueue
    counter: Any


_RUNTIME: Runtime | None = None


def require_mapping(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{location} must be a mapping.")
    return value


def require_string(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{location} must be a non-empty string.")
    return value.strip()


def resolve_path(base: Path, value: Any, location: str) -> Path:
    raw = Path(require_string(value, location)).expanduser()
    return raw.resolve() if raw.is_absolute() else (base / raw).resolve()


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Evolution config does not exist: {path}") from error
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML in evolution config {path}: {error}") from error
    return require_mapping(value, "config")


def directory_digest(directory: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in directory.rglob("*") if item.is_file()):
        relative = path.relative_to(directory).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def parse_skill_frontmatter(text: str) -> dict[str, Any]:
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError("SKILL.md must begin with YAML frontmatter.")
    try:
        value = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise ValueError(f"SKILL.md frontmatter is invalid YAML: {error}") from error
    frontmatter = require_mapping(value, "SKILL.md frontmatter")
    require_string(frontmatter.get("name"), "SKILL.md frontmatter.name")
    require_string(frontmatter.get("description"), "SKILL.md frontmatter.description")
    return frontmatter


def validate_candidate(text: str, expected_name: str) -> None:
    frontmatter = parse_skill_frontmatter(text)
    if frontmatter["name"] != expected_name:
        raise ValueError(
            f"Candidate changed skill name from '{expected_name}' to '{frontmatter['name']}'."
        )
    if len(text.splitlines()) > 500:
        raise ValueError(
            "Candidate SKILL.md exceeds the 500-line progressive-disclosure limit."
        )


def discover_task_directories(path: Path) -> list[Path]:
    if (path / "task.toml").is_file():
        return [path]
    if not path.is_dir():
        raise ValueError(f"Harbor task or dataset path does not exist: {path}")
    tasks = sorted(
        child.resolve()
        for child in path.iterdir()
        if child.is_dir() and (child / "task.toml").is_file()
    )
    if not tasks:
        raise ValueError(f"No Harbor tasks found directly under dataset path: {path}")
    return tasks


def load_split(
    config_directory: Path, values: Any, location: str
) -> list[HarborTaskExample]:
    if not isinstance(values, list) or not values:
        raise ValueError(
            f"{location} must be a non-empty list of task or dataset paths."
        )
    directories: list[Path] = []
    for index, value in enumerate(values):
        path = resolve_path(config_directory, value, f"{location}[{index}]")
        directories.extend(discover_task_directories(path))
    unique_directories = list(dict.fromkeys(directories))
    examples = []
    for directory in unique_directories:
        if not Task.is_valid_dir(directory):
            raise ValueError(f"Invalid Harbor task directory: {directory}")
        task = Task(directory)
        examples.append(
            HarborTaskExample(
                task_id=directory.name,
                task_name=task.name,
                path=directory,
                digest=directory_digest(directory),
            )
        )
    names = [example.task_name for example in examples]
    if len(names) != len(set(names)):
        raise ValueError(f"Duplicate Harbor task names inside {location}: {names}")
    return examples


def validate_disjoint_splits(splits: dict[str, list[HarborTaskExample]]) -> None:
    seen_names: dict[str, str] = {}
    seen_digests: dict[str, str] = {}
    for split_name, examples in splits.items():
        for example in examples:
            prior_name = seen_names.get(example.task_name)
            if prior_name:
                raise ValueError(
                    f"Task '{example.task_name}' occurs in both {prior_name} and {split_name}."
                )
            prior_digest = seen_digests.get(example.digest)
            if prior_digest:
                raise ValueError(
                    f"Identical task content occurs in both {prior_digest} and {split_name}: "
                    f"{example.path}"
                )
            seen_names[example.task_name] = split_name
            seen_digests[example.digest] = split_name


def normalize_config(
    config_path: Path, output_override: Path | None = None
) -> dict[str, Any]:
    raw = load_yaml(config_path)
    if raw.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1.")
    directory = config_path.resolve().parent
    evolution = require_mapping(raw.get("evolution"), "evolution")
    harbor = require_mapping(raw.get("harbor"), "harbor")
    agent = require_mapping(harbor.get("agent"), "harbor.agent")
    splits_raw = require_mapping(raw.get("splits"), "splits")
    gepa = require_mapping(raw.get("gepa", {}), "gepa")
    promotion = require_mapping(raw.get("promotion", {}), "promotion")

    baseline_skill = resolve_path(
        directory,
        evolution.get("baselineSkill"),
        "evolution.baselineSkill",
    )
    skill_path = baseline_skill / "SKILL.md"
    if not skill_path.is_file():
        raise ValueError(f"Baseline skill has no SKILL.md: {baseline_skill}")
    baseline_text = skill_path.read_text(encoding="utf-8")
    frontmatter = parse_skill_frontmatter(baseline_text)

    splits = {
        name: load_split(directory, splits_raw.get(name), f"splits.{name}")
        for name in ("train", "validation", "holdout")
    }
    validate_disjoint_splits(splits)

    output_directory = (
        output_override.resolve()
        if output_override
        else resolve_path(directory, evolution.get("outputDir"), "evolution.outputDir")
    )
    required_env = harbor.get("requiredEnv", [])
    if not isinstance(required_env, list) or any(
        not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name)
        for name in required_env
    ):
        raise ValueError(
            "harbor.requiredEnv must contain portable environment variable names."
        )
    agent_kwargs = agent.get("kwargs", {})
    require_mapping(agent_kwargs, "harbor.agent.kwargs")

    normalized = {
        "id": require_string(evolution.get("id"), "evolution.id"),
        "objective": require_string(evolution.get("objective"), "evolution.objective"),
        "background": str(evolution.get("background", "")).strip(),
        "baselineSkill": baseline_skill,
        "baselineText": baseline_text,
        "skillName": frontmatter["name"],
        "outputDirectory": output_directory,
        "splits": splits,
        "harbor": {
            "agentName": require_string(agent.get("name"), "harbor.agent.name"),
            "modelName": require_string(agent.get("model"), "harbor.agent.model"),
            "agentKwargs": agent_kwargs,
            "environment": require_string(
                harbor.get("environment", "docker"), "harbor.environment"
            ),
            "concurrency": int(harbor.get("concurrency", 4)),
            "rewardKey": require_string(
                harbor.get("rewardKey", "reward"), "harbor.rewardKey"
            ),
            "requiredEnv": required_env,
            "holdoutAttempts": int(harbor.get("holdoutAttempts", 2)),
        },
        "gepa": {
            "maxMetricCalls": int(gepa.get("maxMetricCalls", 100)),
            "maxCandidateProposals": (
                int(gepa["maxCandidateProposals"])
                if gepa.get("maxCandidateProposals") is not None
                else None
            ),
            "reflectionMinibatchSize": int(gepa.get("reflectionMinibatchSize", 3)),
            "reflectionModel": require_string(
                gepa.get("reflectionModel", "openai/gpt-5.1"),
                "gepa.reflectionModel",
            ),
            "seed": int(gepa.get("seed", 0)),
        },
        "promotion": {
            "minimumMeanGain": float(promotion.get("minimumMeanGain", 0)),
            "allowTaskRegressions": bool(promotion.get("allowTaskRegressions", False)),
            "requireNoErrors": bool(promotion.get("requireNoErrors", True)),
        },
    }
    if normalized["harbor"]["concurrency"] < 1:
        raise ValueError("harbor.concurrency must be at least 1.")
    if normalized["harbor"]["holdoutAttempts"] < 1:
        raise ValueError("harbor.holdoutAttempts must be at least 1.")
    if normalized["gepa"]["maxMetricCalls"] < 1:
        raise ValueError("gepa.maxMetricCalls must be at least 1.")
    if output_directory == baseline_skill or output_directory.is_relative_to(
        baseline_skill
    ):
        raise ValueError("evolution.outputDir must not be inside the baseline skill.")
    for examples in splits.values():
        for example in examples:
            if output_directory == example.path or output_directory.is_relative_to(
                example.path
            ):
                raise ValueError(
                    "evolution.outputDir must not be inside a Harbor task input."
                )
    return normalized


def public_plan(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "evolutionId": config["id"],
        "baselineSkill": str(config["baselineSkill"]),
        "baselineDigest": directory_digest(config["baselineSkill"]),
        "skillName": config["skillName"],
        "outputDirectory": str(config["outputDirectory"]),
        "harborVersion": version("harbor"),
        "gepaVersion": version("gepa"),
        "agent": config["harbor"]["agentName"],
        "model": config["harbor"]["modelName"],
        "environment": config["harbor"]["environment"],
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredEnv": config["harbor"]["requiredEnv"],
        "missingRequiredEnv": [
            name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
        ],
        "splits": {
            name: [
                {
                    "taskName": example.task_name,
                    "path": str(example.path),
                    "digest": example.digest,
                }
                for example in examples
            ]
            for name, examples in config["splits"].items()
        },
        "budget": {
            "maxMetricCalls": config["gepa"]["maxMetricCalls"],
            "maxCandidateProposals": config["gepa"]["maxCandidateProposals"],
            "holdoutAttemptsPerCandidatePerTask": config["harbor"]["holdoutAttempts"],
        },
    }


def doctor(config: dict[str, Any]) -> dict[str, Any]:
    plan = public_plan(config)
    missing = plan["missingRequiredEnv"]
    if missing:
        raise ValueError(
            "Missing required environment variables: " + ", ".join(missing)
        )
    checks: dict[str, Any] = {"credentials": "declared variables present"}
    if config["harbor"]["environment"] == "docker":
        checks["docker"] = run_check(
            ["docker", "info", "--format", "server={{.ServerVersion}}"]
        )
        checks["dockerCompose"] = run_check(["docker", "compose", "version", "--short"])
    else:
        checks["docker"] = "not required for selected environment"
        checks["dockerCompose"] = "not required for selected environment"
    plan["checks"] = checks
    return plan


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


def create_candidate_bundle(
    candidate: str, destination: Path, runtime: Runtime
) -> Path:
    validate_candidate(candidate, runtime.skill_name)
    shutil.copytree(runtime.baseline_skill, destination)
    (destination / "SKILL.md").write_text(candidate, encoding="utf-8")
    return destination


def read_first(paths: list[Path], limit: int = 6000) -> str:
    for path in paths:
        if path.is_file():
            text = path.read_text(encoding="utf-8", errors="replace")
            return (
                text
                if len(text) <= limit
                else text[:limit] + f"\n... truncated ({len(text)} chars)"
            )
    return ""


def collect_trial_evidence(trials_directory: Path, agent_name: str) -> dict[str, str]:
    if not trials_directory.is_dir():
        return {"agentTrajectory": "", "agentOutput": "", "verifierOutput": ""}
    trial_directories = sorted(
        path for path in trials_directory.iterdir() if path.is_dir()
    )
    if not trial_directories:
        return {"agentTrajectory": "", "agentOutput": "", "verifierOutput": ""}
    trial = trial_directories[0]
    return {
        "agentTrajectory": read_first(
            [
                trial / "agent" / "trajectory.json",
                trial / "agent" / agent_name / "trajectory.json",
            ]
        ),
        "agentOutput": read_first(
            [
                trial / "agent" / f"{agent_name}.txt",
                trial / "agent" / "output.txt",
            ]
        ),
        "verifierOutput": read_first(
            [
                trial / "verifier" / "test-output.txt",
                trial / "verifier" / "test-stdout.txt",
                trial / "verifier" / "test-stderr.txt",
            ]
        ),
    }


async def run_candidate_trial(
    candidate: str,
    example: HarborTaskExample,
    *,
    phase: str,
) -> dict[str, Any]:
    runtime = _RUNTIME
    if runtime is None:
        raise RuntimeError("Harbor evolution runtime is not initialized.")
    sequence = next(runtime.counter)
    candidate_digest = hashlib.sha256(candidate.encode("utf-8")).hexdigest()[:12]
    evaluation_directory = (
        runtime.output_directory
        / "harbor-trials"
        / phase
        / f"{sequence:05d}-{candidate_digest}-{example.task_id}-{uuid4().hex[:8]}"
    )
    evaluation_directory.mkdir(parents=True)
    candidate_directory = evaluation_directory / "skill"
    trials_directory = evaluation_directory / "trials"
    try:
        create_candidate_bundle(candidate, candidate_directory, runtime)
    except ValueError as error:
        evidence = {
            "taskId": example.task_id,
            "taskName": example.task_name,
            "reward": 0.0,
            "error": str(error),
            "agentTrajectory": "",
            "agentOutput": "",
            "verifierOutput": "",
            "artifactDirectory": str(evaluation_directory),
        }
        (evaluation_directory / "evaluation.json").write_text(
            json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
        )
        return evidence

    config = TrialConfig(
        task=TaskConfig(path=example.path),
        trials_dir=trials_directory,
        agent=AgentConfig(
            name=runtime.agent_name,
            model_name=runtime.model_name,
            skills=[candidate_directory],
            kwargs=runtime.agent_kwargs,
        ),
        environment=EnvironmentConfig(type=runtime.environment_type),
        verifier=VerifierConfig(),
    )
    fatal_error: RuntimeError | None = None
    try:
        result = await runtime.queue.submit(config)
        rewards = (
            result.verifier_result.rewards
            if result.verifier_result and result.verifier_result.rewards
            else {}
        )
        reward = float(rewards.get(runtime.reward_key, 0))
        error = (
            f"{result.exception_info.exception_type}: {result.exception_info.exception_message}"
            if result.exception_info
            else None
        )
        evidence = {
            "taskId": example.task_id,
            "taskName": example.task_name,
            "reward": reward,
            "error": error,
            **collect_trial_evidence(trials_directory, runtime.agent_name),
            "artifactDirectory": str(evaluation_directory),
        }
        if error and is_infrastructure_error(error):
            fatal_error = RuntimeError(
                f"Harbor infrastructure or credential failure on {example.task_name}: {error}"
            )
    except Exception as error:
        evidence = {
            "taskId": example.task_id,
            "taskName": example.task_name,
            "reward": 0.0,
            "error": f"{type(error).__name__}: {error}",
            "agentTrajectory": "",
            "agentOutput": "",
            "verifierOutput": "",
            "artifactDirectory": str(evaluation_directory),
        }
        fatal_error = RuntimeError(
            f"Harbor could not execute {example.task_name}: {type(error).__name__}: {error}"
        )
    (evaluation_directory / "evaluation.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )
    if fatal_error is not None:
        raise fatal_error
    return evidence


def is_infrastructure_error(message: str) -> bool:
    normalized = message.casefold()
    indicators = (
        "authentication",
        "credential",
        "unauthorized",
        "invalid api key",
        "docker",
        "environment setup",
        "image build",
        "rate limit",
        "model not found",
        "unsupported model",
    )
    return any(indicator in normalized for indicator in indicators)


async def gepa_evaluator(candidate: str, example: HarborTaskExample):
    evidence = await run_candidate_trial(candidate, example, phase="development")
    return evidence["reward"], {
        "Task": evidence["taskName"],
        "Verifier": evidence["verifierOutput"],
        "Agent Trajectory": evidence["agentTrajectory"],
        "Agent Output": evidence["agentOutput"],
        "Error": evidence["error"] or "",
    }


async def evaluate_holdout(
    candidate: str,
    examples: list[HarborTaskExample],
    attempts: int,
    phase: str,
) -> list[dict[str, Any]]:
    coroutines = [
        run_candidate_trial(candidate, example, phase=phase)
        for example in examples
        for _ in range(attempts)
    ]
    return list(await asyncio.gather(*coroutines))


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def summarize_holdout(
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    baseline_by_task: dict[str, list[float]] = {}
    candidate_by_task: dict[str, list[float]] = {}
    for task_name in sorted({item["taskName"] for item in baseline + candidate}):
        baseline_by_task[task_name] = [
            item["reward"] for item in baseline if item["taskName"] == task_name
        ]
        candidate_by_task[task_name] = [
            item["reward"] for item in candidate if item["taskName"] == task_name
        ]
    per_task = []
    regressions = []
    for task_name in baseline_by_task:
        baseline_mean = mean(baseline_by_task[task_name])
        candidate_mean = mean(candidate_by_task[task_name])
        delta = candidate_mean - baseline_mean
        if delta < 0:
            regressions.append(task_name)
        per_task.append(
            {
                "taskName": task_name,
                "baselineMeanReward": baseline_mean,
                "candidateMeanReward": candidate_mean,
                "delta": delta,
            }
        )
    baseline_mean = mean([item["reward"] for item in baseline])
    candidate_mean = mean([item["reward"] for item in candidate])
    candidate_errors = sum(1 for item in candidate if item["error"])
    rules = config["promotion"]
    promoted = (
        candidate_mean - baseline_mean >= rules["minimumMeanGain"]
        and (rules["allowTaskRegressions"] or not regressions)
        and (not rules["requireNoErrors"] or candidate_errors == 0)
    )
    return {
        "baselineMeanReward": baseline_mean,
        "candidateMeanReward": candidate_mean,
        "meanGain": candidate_mean - baseline_mean,
        "candidateErrors": candidate_errors,
        "regressedTasks": regressions,
        "perTask": per_task,
        "promotionRules": rules,
        "promoted": promoted,
    }


def render_report(run: dict[str, Any]) -> str:
    holdout = run["holdout"]
    decision = "PROMOTE" if holdout["promoted"] else "KEEP BASELINE"
    lines = [
        f"# Harbor Skill Evolution: {run['evolutionId']}",
        "",
        f"Decision: **{decision}**",
        "",
        "## Evidence",
        "",
        f"- Baseline skill: `{run['baselineSkill']}`",
        f"- Candidate skill: `{run['candidateSkill']}`",
        f"- Harbor: `{run['harborVersion']}`",
        f"- GEPA: `{run['gepaVersion']}`",
        f"- Agent/model: `{run['agent']}` / `{run['model']}`",
        f"- GEPA candidates: {run['gepa']['candidateCount']}",
        f"- GEPA metric calls: {run['gepa']['metricCalls']}",
        f"- Best validation score: {run['gepa']['bestValidationScore']:.3f}",
        "",
        "## Holdout gate",
        "",
        "| Task | Baseline mean | Candidate mean | Delta |",
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
            f"Overall baseline: {holdout['baselineMeanReward']:.3f}",
            f"Overall candidate: {holdout['candidateMeanReward']:.3f}",
            f"Mean gain: {holdout['meanGain']:+.3f}",
            f"Candidate errors: {holdout['candidateErrors']}",
            f"Regressed tasks: {', '.join(holdout['regressedTasks']) or 'none'}",
            "",
            "The source skill was not modified. Promote the candidate bundle only after reviewing this report and its preserved Harbor trial artifacts.",
            "",
        ]
    )
    return "\n".join(lines)


def initialize_runtime(config: dict[str, Any]) -> Runtime:
    return Runtime(
        baseline_skill=config["baselineSkill"],
        skill_name=config["skillName"],
        output_directory=config["outputDirectory"],
        agent_name=config["harbor"]["agentName"],
        model_name=config["harbor"]["modelName"],
        environment_type=config["harbor"]["environment"],
        agent_kwargs=config["harbor"]["agentKwargs"],
        reward_key=config["harbor"]["rewardKey"],
        concurrency=config["harbor"]["concurrency"],
        queue=TrialQueue(n_concurrent=config["harbor"]["concurrency"]),
        counter=itertools.count(1),
    )


def run_evolution(config: dict[str, Any]) -> dict[str, Any]:
    global _RUNTIME
    missing = [
        name for name in config["harbor"]["requiredEnv"] if not os.environ.get(name)
    ]
    if missing:
        raise ValueError(
            "Missing required environment variables: " + ", ".join(missing)
        )
    output = config["outputDirectory"]
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory must be new or empty: {output}")
    output.mkdir(parents=True, exist_ok=True)
    _RUNTIME = initialize_runtime(config)

    gepa_directory = output / "gepa"
    result = optimize_anything(
        seed_candidate=config["baselineText"],
        evaluator=gepa_evaluator,
        dataset=config["splits"]["train"],
        valset=config["splits"]["validation"],
        objective=config["objective"],
        background=config["background"],
        config=GEPAConfig(
            engine=EngineConfig(
                run_dir=str(gepa_directory),
                seed=config["gepa"]["seed"],
                max_metric_calls=config["gepa"]["maxMetricCalls"],
                max_candidate_proposals=config["gepa"]["maxCandidateProposals"],
                candidate_selection_strategy="pareto",
                acceptance_criterion="strict_improvement",
                max_workers=config["harbor"]["concurrency"],
                parallel=True,
                cache_evaluation=False,
                display_progress_bar=False,
            ),
            reflection=ReflectionConfig(
                reflection_lm=config["gepa"]["reflectionModel"],
                reflection_minibatch_size=config["gepa"]["reflectionMinibatchSize"],
                reflection_prompt_template=REFLECTION_PROMPT,
            ),
        ),
    )
    candidate = result.best_candidate
    if not isinstance(candidate, str):
        raise ValueError("GEPA returned a non-text candidate for a text SKILL.md seed.")
    validate_candidate(candidate, config["skillName"])
    candidate_directory = output / "candidate-skill"
    create_candidate_bundle(candidate, candidate_directory, _RUNTIME)

    _RUNTIME.queue = TrialQueue(n_concurrent=config["harbor"]["concurrency"])
    holdout = config["splits"]["holdout"]
    attempts = config["harbor"]["holdoutAttempts"]
    baseline_results = asyncio.run(
        evaluate_holdout(config["baselineText"], holdout, attempts, "holdout-baseline")
    )
    _RUNTIME.queue = TrialQueue(n_concurrent=config["harbor"]["concurrency"])
    candidate_results = asyncio.run(
        evaluate_holdout(candidate, holdout, attempts, "holdout-candidate")
    )
    holdout_summary = summarize_holdout(baseline_results, candidate_results, config)
    generated_at = datetime.now(timezone.utc).isoformat()
    run = {
        "schemaVersion": 1,
        "source": "harbor-gepa",
        "evolutionId": config["id"],
        "generatedAt": generated_at,
        "baselineSkill": str(config["baselineSkill"]),
        "baselineDigest": directory_digest(config["baselineSkill"]),
        "candidateSkill": str(candidate_directory),
        "candidateDigest": directory_digest(candidate_directory),
        "harborVersion": version("harbor"),
        "gepaVersion": version("gepa"),
        "agent": config["harbor"]["agentName"],
        "model": config["harbor"]["modelName"],
        "splits": {
            name: [example.task_name for example in examples]
            for name, examples in config["splits"].items()
        },
        "gepa": {
            "candidateCount": result.num_candidates,
            "metricCalls": result.total_metric_calls,
            "bestIndex": result.best_idx,
            "bestValidationScore": result.val_aggregate_scores[result.best_idx],
            "runDirectory": result.run_dir,
        },
        "holdout": holdout_summary,
        "holdoutTrials": {
            "baseline": baseline_results,
            "candidate": candidate_results,
        },
    }
    (output / "run.json").write_text(json.dumps(run, indent=2) + "\n", encoding="utf-8")
    (output / "report.md").write_text(render_report(run), encoding="utf-8")
    return run


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--output-dir", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        config = normalize_config(args.config.resolve(), args.output_dir)
        if args.dry_run:
            result = {"mode": "dry-run", **public_plan(config)}
        elif args.doctor:
            result = {"mode": "doctor", **doctor(config)}
        else:
            run = run_evolution(config)
            result = {
                "mode": "live",
                "decision": "promote"
                if run["holdout"]["promoted"]
                else "keep-baseline",
                "candidateSkill": run["candidateSkill"],
                "runJson": str(config["outputDirectory"] / "run.json"),
                "reportMarkdown": str(config["outputDirectory"] / "report.md"),
            }
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
