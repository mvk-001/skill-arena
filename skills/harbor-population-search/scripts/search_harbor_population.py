# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Evaluate and rank one skill population with native Harbor jobs."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

import yaml
from harbor.job import Job
from harbor.models.job.config import JobConfig


HARBOR_VERSION = "0.18.0"
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_mapping(path: Path, label: str) -> dict[str, Any]:
    try:
        if path.suffix.lower() == ".json":
            value = json.loads(path.read_text(encoding="utf-8"))
        else:
            value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"{label} does not exist: {path}") from error
    except (json.JSONDecodeError, yaml.YAMLError) as error:
        raise ValueError(f"{label} is not valid JSON/YAML: {path}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a mapping: {path}")
    return value


def read_json_mapping(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"{label} is invalid JSON: {path}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain an object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )


def directory_digest(directory: Path) -> str:
    digest = hashlib.sha256()
    for item in sorted(directory.rglob("*"), key=lambda value: value.as_posix()):
        relative = item.relative_to(directory).as_posix()
        if item.is_symlink():
            digest.update(relative.encode())
            digest.update(b"\0link\0")
            digest.update(str(item.readlink()).encode())
            digest.update(b"\0")
        elif item.is_file():
            digest.update(relative.encode())
            digest.update(b"\0file\0")
            digest.update(item.read_bytes())
            digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def skill_name(skill_directory: Path) -> str:
    skill_file = skill_directory / "SKILL.md"
    if not skill_directory.is_dir() or not skill_file.is_file():
        raise ValueError(f"Skill directory must contain SKILL.md: {skill_directory}")
    text = skill_file.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError(f"SKILL.md lacks YAML frontmatter: {skill_file}")
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise ValueError(
            f"Invalid SKILL.md frontmatter: {skill_file}: {error}"
        ) from error
    if not isinstance(frontmatter, dict):
        raise ValueError(f"SKILL.md frontmatter must be a mapping: {skill_file}")
    name = frontmatter.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"SKILL.md frontmatter.name must be a string: {skill_file}")
    return name.strip()


def preserve_copy(source: Path, destination: Path, label: str) -> str:
    source_digest = directory_digest(source)
    if destination.exists():
        if not destination.is_dir() or directory_digest(destination) != source_digest:
            raise ValueError(
                f"{label} already exists with different content: {destination}"
            )
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination, symlinks=True)
    return source_digest


def parse_assignments(values: list[str], label: str) -> dict[str, Path]:
    parsed: dict[str, Path] = {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"{label} must use ID=PATH: {value}")
        identifier, raw_path = value.split("=", 1)
        identifier = identifier.strip()
        if not IDENTIFIER.fullmatch(identifier):
            raise ValueError(f"Invalid {label} identifier '{identifier}'.")
        if identifier in parsed:
            raise ValueError(f"Duplicate {label} identifier '{identifier}'.")
        parsed[identifier] = Path(raw_path).expanduser().resolve()
    return parsed


def load_job_template(path: Path) -> tuple[dict[str, Any], JobConfig]:
    payload = read_mapping(path, "Harbor job template")
    try:
        config = JobConfig.model_validate(payload)
    except Exception as error:
        raise ValueError(
            f"Invalid native Harbor JobConfig in {path}: {error}"
        ) from error
    if not config.agents:
        raise ValueError("Harbor job template must declare at least one agent.")
    if not config.tasks and not config.datasets:
        raise ValueError("Harbor job template must declare tasks or datasets.")
    return payload, config


def normalized_config(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        config = JobConfig.model_validate(payload)
    except Exception as error:
        raise ValueError(f"Invalid Harbor config.json: {error}") from error
    normalized = config.model_dump(
        mode="json", exclude_defaults=True, exclude_none=True
    )
    normalized.pop("job_name", None)
    normalized.pop("jobs_dir", None)
    for agent in normalized.get("agents", []):
        if isinstance(agent, dict):
            agent.pop("skills", None)
    return normalized


def config_fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(
        normalized_config(payload), sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(encoded.encode()).hexdigest()


def native_candidate_config(
    template: JobConfig,
    skill_directory: Path,
    job_name: str,
    jobs_directory: Path,
) -> tuple[dict[str, Any], JobConfig]:
    payload = template.model_dump(mode="json", exclude_none=True)
    payload["job_name"] = job_name
    payload["jobs_dir"] = str(jobs_directory)
    agents = payload.get("agents")
    if not isinstance(agents, list) or not agents:
        raise ValueError("Harbor job template must contain agents.")
    for agent in agents:
        if not isinstance(agent, dict):
            raise ValueError("Harbor agents must be mappings.")
        agent["skills"] = [str(skill_directory)]
    try:
        config = JobConfig.model_validate(payload)
    except Exception as error:
        raise ValueError(f"Generated Harbor JobConfig is invalid: {error}") from error
    return config.model_dump(mode="json", exclude_none=True), config


def validate_lock(
    path: Path, expected_trials: int | None, label: str
) -> dict[str, Any]:
    lock = read_json_mapping(path, label)
    schema_version = lock.get("schema_version")
    if not isinstance(schema_version, int) or schema_version < 1:
        raise ValueError(f"{label} has an invalid schema_version: {path}")
    if "trials" in lock:
        trials = lock["trials"]
        if not isinstance(trials, list):
            raise ValueError(f"{label}.trials must be an array: {path}")
        if expected_trials is not None and len(trials) != expected_trials:
            raise ValueError(
                f"{label} describes {len(trials)} trials; expected {expected_trials}: {path}"
            )
        for index, trial in enumerate(trials):
            if not isinstance(trial, dict) or not isinstance(trial.get("task"), dict):
                raise ValueError(f"{label}.trials[{index}] lacks task metadata: {path}")
            if not isinstance(trial.get("agent"), dict):
                raise ValueError(
                    f"{label}.trials[{index}] lacks agent metadata: {path}"
                )
    elif not isinstance(lock.get("task"), dict) or not isinstance(
        lock.get("agent"), dict
    ):
        raise ValueError(f"{label} lacks task/agent metadata: {path}")
    return lock


def optional_feedback_paths(
    trial_directory: Path, job_directory: Path
) -> dict[str, Any]:
    agent_directory = trial_directory / "agent"
    verifier_directory = trial_directory / "verifier"
    trajectory = agent_directory / "trajectory.json"
    verifier_files = (
        sorted(path for path in verifier_directory.rglob("*") if path.is_file())
        if verifier_directory.is_dir()
        else []
    )
    agent_files = (
        sorted(
            path
            for path in agent_directory.rglob("*")
            if path.is_file() and path != trajectory
        )
        if agent_directory.is_dir()
        else []
    )

    def relative(path: Path) -> str:
        return path.relative_to(job_directory).as_posix()

    artifact_manifest = trial_directory / "artifacts" / "manifest.json"
    trial_log = trial_directory / "trial.log"
    return {
        "trajectoryPath": relative(trajectory) if trajectory.is_file() else None,
        "verifierFiles": [relative(path) for path in verifier_files],
        "agentOutputFiles": [relative(path) for path in agent_files],
        "artifactManifestPath": (
            relative(artifact_manifest) if artifact_manifest.is_file() else None
        ),
        "trialLogPath": relative(trial_log) if trial_log.is_file() else None,
    }


def numeric_field(value: Any, location: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be numeric.")
    return float(value)


def parse_trial(
    trial_directory: Path,
    job_directory: Path,
    reward_key: str,
    pass_threshold: float,
) -> dict[str, Any]:
    result_path = trial_directory / "result.json"
    result = read_json_mapping(result_path, "Harbor trial result.json")
    embedded_config = result.get("config")
    if not isinstance(embedded_config, dict):
        raise ValueError(f"Trial result lacks config metadata: {result_path}")
    task_name = result.get("task_name")
    task_checksum = result.get("task_checksum")
    trial_id = result.get("id")
    trial_name = result.get("trial_name")
    if not all(
        isinstance(value, str) and value
        for value in (
            task_name,
            task_checksum,
            trial_id,
            trial_name,
        )
    ):
        raise ValueError(f"Trial result lacks identity/checksum fields: {result_path}")

    agent_info = result.get("agent_info")
    if not isinstance(agent_info, dict) or not isinstance(agent_info.get("name"), str):
        raise ValueError(f"Trial result lacks agent_info.name: {result_path}")
    model_info = agent_info.get("model_info")
    model_name = (
        model_info.get("name")
        if isinstance(model_info, dict) and isinstance(model_info.get("name"), str)
        else None
    )
    if model_name is None:
        agent_config = embedded_config.get("agent")
        if isinstance(agent_config, dict) and isinstance(
            agent_config.get("model_name"), str
        ):
            model_name = agent_config["model_name"]

    exception_info = result.get("exception_info")
    if exception_info is not None and not isinstance(exception_info, dict):
        raise ValueError(
            f"Trial exception_info must be an object or null: {result_path}"
        )

    verifier_result = result.get("verifier_result")
    rewards = (
        verifier_result.get("rewards") if isinstance(verifier_result, dict) else None
    )
    raw_reward = rewards.get(reward_key) if isinstance(rewards, dict) else None
    if exception_info is None:
        reward = numeric_field(raw_reward, f"{result_path}: reward '{reward_key}'")
    else:
        reward = (
            numeric_field(raw_reward, f"{result_path}: reward '{reward_key}'")
            if raw_reward is not None
            else 0.0
        )

    trial_config_path = trial_directory / "config.json"
    if trial_config_path.is_file():
        trial_config = read_json_mapping(trial_config_path, "Harbor trial config.json")
        if not isinstance(trial_config.get("task"), dict):
            raise ValueError(
                f"Trial config.json lacks task metadata: {trial_config_path}"
            )
        if not isinstance(trial_config.get("agent"), dict):
            raise ValueError(
                f"Trial config.json lacks agent metadata: {trial_config_path}"
            )

    trial_lock_path = trial_directory / "lock.json"
    if trial_lock_path.is_file():
        validate_lock(trial_lock_path, None, "Harbor trial lock.json")

    agent_result = result.get("agent_result")
    return {
        "id": trial_id,
        "trialName": trial_name,
        "taskName": task_name,
        "taskChecksum": task_checksum,
        "agent": agent_info["name"],
        "agentVersion": agent_info.get("version"),
        "model": model_name,
        "reward": reward,
        "passed": exception_info is None and reward >= pass_threshold,
        "exceptionInfo": exception_info,
        "resultPath": result_path.relative_to(job_directory).as_posix(),
        "inputTokens": (
            agent_result.get("n_input_tokens")
            if isinstance(agent_result, dict)
            else None
        ),
        "cacheTokens": (
            agent_result.get("n_cache_tokens")
            if isinstance(agent_result, dict)
            else None
        ),
        "outputTokens": (
            agent_result.get("n_output_tokens")
            if isinstance(agent_result, dict)
            else None
        ),
        "costUsd": (
            agent_result.get("cost_usd") if isinstance(agent_result, dict) else None
        ),
        **optional_feedback_paths(trial_directory, job_directory),
    }


def parse_harbor_job(
    job_directory: Path,
    reward_key: str,
    pass_threshold: float,
    expected_config_fingerprint: str,
) -> dict[str, Any]:
    if not job_directory.is_dir():
        raise ValueError(f"Harbor job directory does not exist: {job_directory}")
    config_path = job_directory / "config.json"
    config_payload = read_json_mapping(config_path, "Harbor job config.json")
    actual_fingerprint = config_fingerprint(config_payload)
    if actual_fingerprint != expected_config_fingerprint:
        raise ValueError(
            f"Harbor job config drift detected in {job_directory}; only job identity "
            "and agent skill paths may differ from the native template."
        )

    root_result_path = job_directory / "result.json"
    root_result = read_json_mapping(root_result_path, "Harbor job result.json")
    total = root_result.get("n_total_trials")
    stats = root_result.get("stats")
    if not isinstance(total, int) or total < 1 or not isinstance(stats, dict):
        raise ValueError(
            f"Harbor root result lacks valid trial counts: {root_result_path}"
        )
    completed = stats.get("n_completed_trials")
    running = stats.get("n_running_trials")
    pending = stats.get("n_pending_trials")
    cancelled = stats.get("n_cancelled_trials")
    if root_result.get("finished_at") is None:
        raise ValueError(
            f"Incomplete Harbor job (finished_at is null): {job_directory}"
        )
    if completed != total or running != 0 or pending != 0 or cancelled != 0:
        raise ValueError(
            f"Incomplete Harbor job: expected {total} terminal trials, got "
            f"completed={completed}, running={running}, pending={pending}, "
            f"cancelled={cancelled}: {job_directory}"
        )

    root_lock_path = job_directory / "lock.json"
    if root_lock_path.is_file():
        validate_lock(root_lock_path, total, "Harbor job lock.json")

    trial_directories = sorted(
        child
        for child in job_directory.iterdir()
        if child.is_dir() and (child / "result.json").is_file()
    )
    if len(trial_directories) != total:
        raise ValueError(
            f"Incomplete Harbor job: found {len(trial_directories)} trial result.json "
            f"files but root result expects {total}: {job_directory}"
        )

    trials = [
        parse_trial(directory, job_directory, reward_key, pass_threshold)
        for directory in trial_directories
    ]
    errored = sum(trial["exceptionInfo"] is not None for trial in trials)
    declared_errors = stats.get("n_errored_trials")
    if isinstance(declared_errors, int) and declared_errors != errored:
        raise ValueError(
            f"Harbor error count mismatch: root={declared_errors}, trials={errored}: "
            f"{job_directory}"
        )
    rewards = [trial["reward"] for trial in trials]
    mean_reward = sum(rewards) / len(rewards)
    passed = sum(trial["passed"] for trial in trials)
    task_signatures = Counter(
        (
            trial["taskName"],
            trial["taskChecksum"],
            trial["agent"],
            trial["model"],
        )
        for trial in trials
    )
    signature_rows = [
        {
            "taskName": key[0],
            "taskChecksum": key[1],
            "agent": key[2],
            "model": key[3],
            "attempts": count,
        }
        for key, count in sorted(task_signatures.items())
    ]
    return {
        "schemaVersion": 1,
        "source": "harbor",
        "jobDirectory": str(job_directory),
        "jobId": root_result.get("id"),
        "rewardKey": reward_key,
        "passThreshold": pass_threshold,
        "fitness": 0.0 if errored else mean_reward,
        "summary": {
            "expectedTrials": total,
            "completedTrials": completed,
            "erroredTrials": errored,
            "passedTrials": passed,
            "meanReward": mean_reward,
            "passRate": passed / total,
            "retries": stats.get("n_retries", 0),
            "inputTokens": stats.get("n_input_tokens"),
            "cacheTokens": stats.get("n_cache_tokens"),
            "outputTokens": stats.get("n_output_tokens"),
            "costUsd": stats.get("cost_usd"),
        },
        "taskSignatures": signature_rows,
        "trials": trials,
    }


def signature_key(summary: dict[str, Any]) -> str:
    return json.dumps(summary["taskSignatures"], sort_keys=True, separators=(",", ":"))


def validate_comparable(
    results: dict[str, dict[str, Any]],
    comparison_label: str,
) -> None:
    signatures = {
        identifier: signature_key(result) for identifier, result in results.items()
    }
    if len(set(signatures.values())) > 1:
        raise ValueError(
            f"Harbor {comparison_label} task/agent drift detected across jobs: "
            + ", ".join(sorted(signatures))
        )


def job_task_keys(result: dict[str, Any]) -> set[tuple[str, str]]:
    return {(trial["taskName"], trial["taskChecksum"]) for trial in result["trials"]}


async def execute_job(config: JobConfig) -> Path:
    job = await Job.create(config)
    await job.run()
    return Path(job.job_dir).resolve()


def job_name(generation: int, candidate_id: str, prefix: str = "harbor-pop") -> str:
    return f"{prefix}-g{generation:03d}-{candidate_id}"


def append_log(path: Path, entry: dict[str, Any]) -> None:
    if path.is_file():
        existing = read_json_mapping(path, "population-search-log.json")
    else:
        existing = {"schemaVersion": 1, "generations": []}
    generations = existing.get("generations")
    if not isinstance(generations, list):
        raise ValueError(f"Invalid generations array in {path}")
    existing["generations"] = sorted(
        [
            item
            for item in generations
            if isinstance(item, dict) and item.get("generation") != entry["generation"]
        ]
        + [entry],
        key=lambda item: item["generation"],
    )
    write_json(path, existing)


def write_report(path: Path, run: dict[str, Any]) -> None:
    ranking = run["ranking"]
    lines = [
        "# Harbor Population Search",
        "",
        f"- Generation: {run['generation']}",
        f"- Baseline: {run['baselineCandidate']}",
        f"- Selected winner: {run['selectedWinner']}",
        "- Selection evidence: native Harbor development jobs only",
        "",
        "| Rank | Candidate | Fitness | Mean reward | Pass rate | Errors |",
        "| ---: | --- | ---: | ---: | ---: | ---: |",
    ]
    for row in ranking:
        lines.append(
            f"| {row['rank']} | {row['candidateId']} | {row['fitness']:.6g} | "
            f"{row['meanReward']:.6g} | {row['passRate']:.1%} | {row['erroredTrials']} |"
        )
    holdout = run["holdout"]
    lines.extend(["", "## Holdout", "", f"- Status: {holdout['status']}"])
    if holdout["status"] == "complete":
        lines.extend(
            [
                f"- Baseline mean reward: {holdout['baselineMeanReward']:.6g}",
                f"- Winner mean reward: {holdout['winnerMeanReward']:.6g}",
                f"- Promoted: {'yes' if holdout['promoted'] else 'no'}",
            ]
        )
    else:
        lines.append(f"- Next step: {holdout['nextStep']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate one candidate generation with native Harbor jobs."
    )
    parser.add_argument("--job-template", required=True, type=Path)
    parser.add_argument("--candidate", action="append", default=[], metavar="ID=PATH")
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--generation", type=int, default=0)
    parser.add_argument("--reward-key", default="reward")
    parser.add_argument("--pass-threshold", type=float, default=1.0)
    parser.add_argument("--job", action="append", default=[], metavar="ID=JOB_DIR")
    parser.add_argument("--holdout-template", type=Path)
    parser.add_argument(
        "--holdout-job", action="append", default=[], metavar="ROLE=JOB_DIR"
    )
    parser.add_argument("--minimum-holdout-gain", type=float, default=0.0)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    mode.add_argument("--analyze-only", action="store_true")
    args = parser.parse_args(argv)
    if args.generation < 0:
        parser.error("--generation must be zero or greater")
    if not args.candidate:
        parser.error("at least one --candidate ID=PATH is required")
    return args


def validate_inputs(args: argparse.Namespace) -> dict[str, Any]:
    candidates = parse_assignments(args.candidate, "candidate")
    if len(candidates) < 2:
        raise ValueError("Population search requires at least two candidates.")
    if args.baseline not in candidates:
        raise ValueError("--baseline must identify one of the candidates.")
    output = args.output.expanduser().resolve()
    for identifier, candidate_path in candidates.items():
        if output == candidate_path or output.is_relative_to(candidate_path):
            raise ValueError(
                f"Output directory must not be inside candidate '{identifier}': {output}"
            )
    names = {identifier: skill_name(path) for identifier, path in candidates.items()}
    if len(set(names.values())) != 1:
        raise ValueError(f"All candidates must preserve one skill name: {names}")
    jobs = parse_assignments(args.job, "job")
    unknown_jobs = sorted(set(jobs) - set(candidates))
    if unknown_jobs:
        raise ValueError(f"--job contains unknown candidate ids: {unknown_jobs}")
    if args.analyze_only and set(jobs) != set(candidates):
        missing = sorted(set(candidates) - set(jobs))
        raise ValueError(
            f"--analyze-only requires --job for every candidate: {missing}"
        )
    if not args.analyze_only and jobs:
        raise ValueError("--job is valid only with --analyze-only.")
    holdout_jobs = parse_assignments(args.holdout_job, "holdout-job")
    if holdout_jobs and set(holdout_jobs) != {"baseline", "winner"}:
        raise ValueError(
            "--holdout-job must provide exactly baseline=PATH and winner=PATH."
        )
    if holdout_jobs and not args.analyze_only:
        raise ValueError("--holdout-job is valid only with --analyze-only.")
    if holdout_jobs and args.holdout_template is None:
        raise ValueError("--holdout-job requires --holdout-template.")

    template_payload, template = load_job_template(args.job_template.resolve())
    holdout_payload = None
    holdout_template = None
    if args.holdout_template is not None:
        holdout_payload, holdout_template = load_job_template(
            args.holdout_template.resolve()
        )
    return {
        "candidates": candidates,
        "skillName": next(iter(names.values())),
        "jobs": jobs,
        "holdoutJobs": holdout_jobs,
        "templatePayload": template_payload,
        "template": template,
        "holdoutPayload": holdout_payload,
        "holdoutTemplate": holdout_template,
    }


def plan(args: argparse.Namespace, inputs: dict[str, Any]) -> dict[str, Any]:
    output = args.output.resolve()
    generation_directory = output / f"generation-{args.generation:03d}"
    rows = []
    for candidate_id, source in sorted(inputs["candidates"].items()):
        candidate_root = generation_directory / "candidates" / candidate_id
        name = job_name(args.generation, candidate_id)
        rows.append(
            {
                "candidateId": candidate_id,
                "sourceSkill": str(source),
                "frozenSkill": str(candidate_root / "skill"),
                "jobName": name,
                "jobDirectory": str(candidate_root / "harbor-jobs" / name),
            }
        )
    return {
        "mode": "doctor" if args.doctor else "dry-run",
        "harborVersion": version("harbor"),
        "generation": args.generation,
        "baselineCandidate": args.baseline,
        "nativeJobTemplate": str(args.job_template.resolve()),
        "candidates": rows,
        "holdoutTemplate": (
            str(args.holdout_template.resolve())
            if args.holdout_template is not None
            else None
        ),
        "writesOutput": False,
    }


def holdout_gate(
    development_results: dict[str, dict[str, Any]],
    winner_id: str,
    baseline_result: dict[str, Any],
    winner_result: dict[str, Any],
    minimum_gain: float,
) -> dict[str, Any]:
    validate_comparable(
        {"baseline": baseline_result, "winner": winner_result}, "holdout"
    )
    development_keys = set().union(
        *(job_task_keys(result) for result in development_results.values())
    )
    overlap = development_keys & job_task_keys(baseline_result)
    if overlap:
        rendered = ", ".join(f"{name}@{checksum}" for name, checksum in sorted(overlap))
        raise ValueError(
            f"Holdout leakage: tasks also occurred in development: {rendered}"
        )
    baseline_mean = baseline_result["summary"]["meanReward"]
    winner_mean = winner_result["summary"]["meanReward"]
    gain = winner_mean - baseline_mean
    error_free = (
        development_results[winner_id]["summary"]["erroredTrials"] == 0
        and baseline_result["summary"]["erroredTrials"] == 0
        and winner_result["summary"]["erroredTrials"] == 0
    )
    return {
        "status": "complete",
        "baselineMeanReward": baseline_mean,
        "winnerMeanReward": winner_mean,
        "gain": gain,
        "minimumGain": minimum_gain,
        "errorFree": error_free,
        "promoted": error_free and gain >= minimum_gain,
        "baselineJobDirectory": baseline_result["jobDirectory"],
        "winnerJobDirectory": winner_result["jobDirectory"],
    }


def run_search(args: argparse.Namespace, inputs: dict[str, Any]) -> dict[str, Any]:
    output = args.output.resolve()
    generation_directory = output / f"generation-{args.generation:03d}"
    baseline_source = inputs["candidates"][args.baseline]
    baseline_snapshot = output / "baseline-skill"
    baseline_digest = preserve_copy(
        baseline_source, baseline_snapshot, "Preserved baseline"
    )
    expected_fingerprint = config_fingerprint(inputs["templatePayload"])

    candidate_states: list[dict[str, Any]] = []
    development_results: dict[str, dict[str, Any]] = {}
    frozen_skills: dict[str, Path] = {}
    for candidate_id, source in sorted(inputs["candidates"].items()):
        candidate_root = generation_directory / "candidates" / candidate_id
        frozen_skill = candidate_root / "skill"
        digest = preserve_copy(source, frozen_skill, f"Frozen candidate {candidate_id}")
        frozen_skills[candidate_id] = frozen_skill
        name = job_name(args.generation, candidate_id)
        jobs_directory = candidate_root / "harbor-jobs"
        payload, native_config = native_candidate_config(
            inputs["template"], frozen_skill, name, jobs_directory
        )
        config_path = candidate_root / "harbor-job.yaml"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            yaml.safe_dump(payload, sort_keys=False), encoding="utf-8"
        )

        if args.analyze_only:
            job_directory = inputs["jobs"][candidate_id]
        else:
            job_directory = asyncio.run(execute_job(native_config))
        result = parse_harbor_job(
            job_directory,
            args.reward_key,
            args.pass_threshold,
            expected_fingerprint,
        )
        result["candidateId"] = candidate_id
        result_path = candidate_root / "candidate-result.json"
        write_json(result_path, result)
        development_results[candidate_id] = result
        candidate_state = {
            "candidateId": candidate_id,
            "sourceSkill": str(source),
            "frozenSkill": str(frozen_skill),
            "skillDigest": digest,
            "isBaseline": candidate_id == args.baseline,
            "nativeJobConfig": str(config_path),
            "nativeJobDirectory": str(job_directory),
            "result": str(result_path),
        }
        write_json(candidate_root / "candidate.json", candidate_state)
        candidate_states.append(candidate_state)

    validate_comparable(development_results, "development")
    ranking = sorted(
        (
            {
                "candidateId": candidate_id,
                "fitness": result["fitness"],
                "meanReward": result["summary"]["meanReward"],
                "passRate": result["summary"]["passRate"],
                "erroredTrials": result["summary"]["erroredTrials"],
            }
            for candidate_id, result in development_results.items()
        ),
        key=lambda row: (-row["fitness"], row["candidateId"]),
    )
    for index, row in enumerate(ranking, start=1):
        row["rank"] = index
    survivors = [row["candidateId"] for row in ranking[:2]]
    winner = ranking[0]["candidateId"]

    generation_state = {
        "schemaVersion": 1,
        "generation": args.generation,
        "createdAt": utc_now(),
        "mode": "analyze-only" if args.analyze_only else "live",
        "baselineCandidate": args.baseline,
        "baselineSnapshot": str(baseline_snapshot),
        "baselineDigest": baseline_digest,
        "selectionSplit": "development",
        "candidates": candidate_states,
    }
    write_json(generation_directory / "generation.json", generation_state)
    ranking_state = {
        "schemaVersion": 1,
        "generation": args.generation,
        "selectionSplit": "development",
        "ranking": ranking,
        "survivors": survivors,
        "selectedWinner": winner,
    }
    write_json(generation_directory / "ranking.json", ranking_state)

    if inputs["holdoutTemplate"] is None:
        holdout = {
            "status": "staged",
            "promoted": False,
            "nextStep": (
                "Create a disjoint native Harbor holdout job template. Evaluate the "
                "preserved baseline and selected winner, then rerun with "
                "--holdout-template and --holdout-job baseline=.../winner=... in "
                "--analyze-only mode, or supply --holdout-template during a live run."
            ),
        }
    else:
        holdout_fingerprint = config_fingerprint(inputs["holdoutPayload"])
        holdout_results: dict[str, dict[str, Any]] = {}
        stage_holdout_only = args.analyze_only and not inputs["holdoutJobs"]
        holdout_sources = {
            "baseline": baseline_snapshot,
            "winner": frozen_skills[winner],
        }
        for role, skill_directory in holdout_sources.items():
            role_root = output / "holdout" / role
            name = job_name(args.generation, role, prefix="harbor-holdout")
            jobs_directory = role_root / "harbor-jobs"
            payload, native_config = native_candidate_config(
                inputs["holdoutTemplate"],
                skill_directory,
                name,
                jobs_directory,
            )
            role_root.mkdir(parents=True, exist_ok=True)
            (role_root / "harbor-job.yaml").write_text(
                yaml.safe_dump(payload, sort_keys=False), encoding="utf-8"
            )
            if stage_holdout_only:
                continue
            if args.analyze_only:
                job_directory = inputs["holdoutJobs"][role]
            else:
                job_directory = asyncio.run(execute_job(native_config))
            result = parse_harbor_job(
                job_directory,
                args.reward_key,
                args.pass_threshold,
                holdout_fingerprint,
            )
            write_json(role_root / "candidate-result.json", result)
            holdout_results[role] = result
        if stage_holdout_only:
            holdout = {
                "status": "staged",
                "promoted": False,
                "nextStep": (
                    "Run holdout/baseline/harbor-job.yaml and "
                    "holdout/winner/harbor-job.yaml with Harbor, then rerun "
                    "--analyze-only with --holdout-job baseline=JOB_DIR and "
                    "--holdout-job winner=JOB_DIR."
                ),
            }
        else:
            holdout = holdout_gate(
                development_results,
                winner,
                holdout_results["baseline"],
                holdout_results["winner"],
                args.minimum_holdout_gain,
            )

    run = {
        "schemaVersion": 1,
        "source": "harbor",
        "completedAt": utc_now(),
        "mode": "analyze-only" if args.analyze_only else "live",
        "generation": args.generation,
        "baselineCandidate": args.baseline,
        "selectedWinner": winner,
        "survivors": survivors,
        "ranking": ranking,
        "holdout": holdout,
        "nextGeneration": {
            "status": "requires-agent-mutation",
            "parents": survivors,
            "instruction": (
                "Keep the original baseline candidate unchanged, create focused "
                "mutation or crossover skill directories from the two survivors, "
                f"then rerun this script with --generation {args.generation + 1}."
            ),
        },
        "artifacts": {
            "generation": str(generation_directory / "generation.json"),
            "ranking": str(generation_directory / "ranking.json"),
            "log": str(output / "population-search-log.json"),
            "report": str(output / "report.md"),
        },
    }
    log_entry = {
        "generation": args.generation,
        "recordedAt": utc_now(),
        "baselineCandidate": args.baseline,
        "selectedWinner": winner,
        "survivors": survivors,
        "ranking": ranking,
        "holdout": holdout,
    }
    append_log(output / "population-search-log.json", log_entry)
    write_json(output / "run.json", run)
    write_report(output / "report.md", run)
    return run


def main(argv: list[str] | None = None) -> int:
    args = parse_arguments(sys.argv[1:] if argv is None else argv)
    try:
        inputs = validate_inputs(args)
        if version("harbor") != HARBOR_VERSION:
            raise ValueError(
                f"Expected harbor=={HARBOR_VERSION}, found {version('harbor')}."
            )
        if args.doctor or args.dry_run:
            print(json.dumps(plan(args, inputs), indent=2))
            return 0
        result = run_search(args, inputs)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
