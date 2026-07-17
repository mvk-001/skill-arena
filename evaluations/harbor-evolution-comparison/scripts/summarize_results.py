# /// script
# requires-python = ">=3.12"
# dependencies = ["PyYAML>=6,<7"]
# ///
"""Validate and summarize the frozen Harbor evolver comparison results."""

from __future__ import annotations

import argparse
import json
import math
import tomllib
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any

import yaml

from protocol_gate import (
    file_sha256,
    frontmatter_name,
    resolve_path,
    resource_digest,
    tree_digest,
)


RESULT_SCHEMA_VERSION = "1"


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return payload


def read_yaml(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a YAML mapping: {path}")
    return payload


def portable_path(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def assert_digest(path: Path, expected: dict[str, Any], label: str) -> None:
    actual = resource_digest(path)
    expected_digest = {key: expected.get(key) for key in actual}
    if actual != expected_digest:
        raise ValueError(f"{label} digest mismatch: {path}")


def job_score(
    job_path: Path,
    *,
    expected_trials: int,
    runtime: dict[str, Any],
    repo_root: Path,
    expected_job_digest: dict[str, Any] | None = None,
    expected_skill_sha256: str | None = None,
    expected_skill_path: Path | None = None,
    expected_harbor_skill_digest: str | None = None,
    expected_logical_skill_name: str,
    expected_network_mode: str,
    expected_dataset: Path,
) -> dict[str, Any]:
    job_digest = tree_digest(job_path)
    if expected_job_digest is not None and job_digest != expected_job_digest:
        raise ValueError(f"Completed development job digest mismatch: {job_path}")
    config = read_json(job_path / "config.json")
    raw_lock = read_json(job_path / "lock.json")
    result = read_json(job_path / "result.json")
    agents = config.get("agents")
    if not isinstance(agents, list) or len(agents) != 1:
        raise ValueError(f"Expected exactly one agent: {job_path}")
    agent = agents[0]
    expected_agent = runtime["agent"]
    if agent.get("name") != expected_agent["name"]:
        raise ValueError(f"Agent mismatch: {job_path}")
    if agent.get("model_name") != expected_agent["model_name"]:
        raise ValueError(f"Model mismatch: {job_path}")
    if agent.get("kwargs", {}) != expected_agent["kwargs"]:
        raise ValueError(f"Agent kwargs mismatch: {job_path}")
    if config.get("n_attempts") != runtime["attempts_per_task"]:
        raise ValueError(f"Attempt count mismatch: {job_path}")
    config_environment = config.get("environment")
    config_environment_type = (
        "docker"
        if config_environment is None
        else config_environment.get("type")
        if isinstance(config_environment, dict)
        else None
    )
    if config_environment_type != runtime["environment"]:
        raise ValueError(f"Environment type mismatch: {job_path}")

    skills = agent.get("skills")
    if not isinstance(skills, list) or len(skills) != 1:
        raise ValueError(f"Expected exactly one loaded skill: {job_path}")
    skill_path = resolve_path(job_path, skills[0])
    if expected_skill_path is not None and skill_path != expected_skill_path.resolve():
        raise ValueError(f"Configured candidate skill path mismatch: {job_path}")
    if expected_skill_sha256 is not None:
        actual_skill_sha256 = tree_digest(skill_path)["sha256"]
        if actual_skill_sha256 != expected_skill_sha256:
            raise ValueError(f"Loaded skill digest mismatch: {job_path}")

    datasets = config.get("datasets")
    if not isinstance(datasets, list) or len(datasets) != 1:
        raise ValueError(f"Expected exactly one dataset: {job_path}")
    dataset = datasets[0]
    if not isinstance(dataset, dict) or "path" not in dataset:
        raise ValueError(f"Dataset path is missing: {job_path}")
    if resolve_path(job_path, dataset["path"]) != expected_dataset.resolve():
        raise ValueError(f"Dataset mismatch: {job_path}")

    if raw_lock.get("harbor", {}).get("version") != str(runtime["harbor_version"]):
        raise ValueError(f"Harbor version mismatch: {job_path}")
    retry = raw_lock.get("retry", {})
    if retry.get("max_retries") != runtime["max_retries"]:
        raise ValueError(f"Retry policy mismatch: {job_path}")
    locked_trials = raw_lock.get("trials")
    if not isinstance(locked_trials, list) or len(locked_trials) != expected_trials:
        raise ValueError(f"Locked trial count mismatch: {job_path}")
    configured_skill_path = skill_path.resolve()
    locked_skill_pairs: set[tuple[str, str]] = set()
    for trial in locked_trials:
        locked_skills = trial.get("skills") if isinstance(trial, dict) else None
        if not isinstance(locked_skills, list) or len(locked_skills) != 1:
            raise ValueError(f"Each locked trial must contain one skill: {job_path}")
        locked_skill = locked_skills[0]
        if not isinstance(locked_skill.get("name"), str) or not isinstance(
            locked_skill.get("digest"), str
        ):
            raise ValueError(f"Locked skill identity is incomplete: {job_path}")
        if resolve_path(job_path, locked_skill.get("source")) != configured_skill_path:
            raise ValueError(f"Locked skill source mismatch: {job_path}")
        locked_skill_pairs.add((locked_skill.get("name"), locked_skill.get("digest")))
    if len(locked_skill_pairs) != 1:
        raise ValueError(f"Locked skill provenance drifts across trials: {job_path}")
    locked_skill_name, locked_skill_digest = next(iter(locked_skill_pairs))
    if locked_skill_name not in {
        expected_logical_skill_name,
        configured_skill_path.name,
    }:
        raise ValueError(f"Harbor skill name does not identify the bundle: {job_path}")
    if (
        expected_harbor_skill_digest is not None
        and locked_skill_digest != expected_harbor_skill_digest
    ):
        raise ValueError(f"Harbor skill digest mismatch: {job_path}")

    stats = result.get("stats", {})
    if result.get("n_total_trials") != expected_trials:
        raise ValueError(f"Trial count mismatch: {job_path}")
    if stats.get("n_completed_trials") != expected_trials:
        raise ValueError(f"Incomplete result: {job_path}")
    if stats.get("n_errored_trials") != 0 or stats.get("n_retries") != 0:
        raise ValueError(f"Errored or retried result: {job_path}")
    if any(
        stats.get(key, 0) != 0
        for key in ("n_running_trials", "n_pending_trials", "n_cancelled_trials")
    ):
        raise ValueError(f"Non-terminal result: {job_path}")

    rewards: list[float] = []
    task_observations: dict[tuple[str, str, str], int] = {}
    trial_usage = {
        "input_tokens": 0,
        "cache_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0.0,
    }
    for child in sorted(job_path.iterdir()):
        trial_path = child / "result.json"
        if not child.is_dir() or not trial_path.is_file():
            continue
        trial = read_json(trial_path)
        if trial.get("exception_info") is not None:
            raise ValueError(f"Trial exception: {trial_path}")
        verifier = trial.get("verifier_result")
        reward = (
            verifier.get("rewards", {}).get("reward")
            if isinstance(verifier, dict)
            else None
        )
        if (
            not isinstance(reward, (int, float))
            or isinstance(reward, bool)
            or not math.isfinite(float(reward))
        ):
            raise ValueError(f"Missing numeric trial reward: {trial_path}")
        rewards.append(float(reward))
        trial_agent = trial.get("config", {}).get("agent", {})
        if trial_agent.get("name") != expected_agent["name"]:
            raise ValueError(f"Trial agent mismatch: {trial_path}")
        if trial_agent.get("model_name") != expected_agent["model_name"]:
            raise ValueError(f"Trial model mismatch: {trial_path}")
        if trial_agent.get("kwargs", {}) != expected_agent["kwargs"]:
            raise ValueError(f"Trial agent kwargs mismatch: {trial_path}")
        trial_skill_paths = trial_agent.get("skills")
        if not isinstance(trial_skill_paths, list) or len(trial_skill_paths) != 1:
            raise ValueError(f"Trial must configure exactly one skill: {trial_path}")
        if resolve_path(child, trial_skill_paths[0]) != configured_skill_path:
            raise ValueError(f"Trial configured skill mismatch: {trial_path}")
        trial_environment = trial.get("config", {}).get("environment", {})
        if trial_environment.get("type") != runtime["environment"]:
            raise ValueError(f"Trial environment type mismatch: {trial_path}")

        task_id = trial.get("task_id", {})
        task_path = resolve_path(child, task_id.get("path"))
        try:
            task_path.relative_to(expected_dataset.resolve())
        except ValueError as error:
            raise ValueError(f"Trial task is outside the dataset: {trial_path}") from error
        task_name = trial.get("task_name")
        task_checksum = trial.get("task_checksum")
        if not isinstance(task_name, str) or not isinstance(task_checksum, str):
            raise ValueError(f"Trial task identity is incomplete: {trial_path}")
        task_key = (task_name, task_checksum, task_path.as_posix())
        task_observations[task_key] = task_observations.get(task_key, 0) + 1

        trial_lock_path = child / "lock.json"
        if not trial_lock_path.is_file():
            raise ValueError(f"Trial lock is missing: {trial_path}")
        trial_lock = read_json(trial_lock_path)
        trial_lock_skills = trial_lock.get("skills")
        if not isinstance(trial_lock_skills, list) or len(trial_lock_skills) != 1:
            raise ValueError(f"Trial lock must contain exactly one skill: {trial_path}")
        trial_locked_skill = trial_lock_skills[0]
        if (
            trial_locked_skill.get("name") != locked_skill_name
            or trial_locked_skill.get("digest") != locked_skill_digest
            or resolve_path(child, trial_locked_skill.get("source"))
            != configured_skill_path
        ):
            raise ValueError(f"Trial lock skill provenance mismatch: {trial_path}")
        trial_lock_agent = trial_lock.get("agent", {})
        if trial_lock_agent.get("name") != expected_agent["name"]:
            raise ValueError(f"Trial lock agent mismatch: {trial_path}")
        if trial_lock_agent.get("model_name") != expected_agent["model_name"]:
            raise ValueError(f"Trial lock model mismatch: {trial_path}")
        if trial_lock_agent.get("kwargs", {}) != expected_agent["kwargs"]:
            raise ValueError(f"Trial lock agent kwargs mismatch: {trial_path}")
        trial_lock_agent_skills = trial_lock_agent.get("skills")
        if (
            not isinstance(trial_lock_agent_skills, list)
            or len(trial_lock_agent_skills) != 1
            or resolve_path(child, trial_lock_agent_skills[0])
            != configured_skill_path
        ):
            raise ValueError(f"Trial lock configured skill mismatch: {trial_path}")
        if trial_lock.get("environment", {}).get("type") != runtime["environment"]:
            raise ValueError(f"Trial lock environment mismatch: {trial_path}")
        locked_task_matches = [
            item["task"]
            for item in locked_trials
            if resolve_path(job_path, item["task"]["path"]) == task_path
        ]
        locked_task_digests = {item.get("digest") for item in locked_task_matches}
        trial_locked_task = trial_lock.get("task", {})
        if (
            len(locked_task_digests) != 1
            or trial_locked_task.get("digest") not in locked_task_digests
            or resolve_path(child, trial_locked_task.get("path")) != task_path
        ):
            raise ValueError(f"Trial lock task provenance mismatch: {trial_path}")

        agent_result = trial.get("agent_result")
        if not isinstance(agent_result, dict):
            raise ValueError(f"Trial usage is missing: {trial_path}")
        for key in ("n_input_tokens", "n_cache_tokens", "n_output_tokens"):
            value = agent_result.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise ValueError(f"Invalid {key} in {trial_path}")
        cost = agent_result.get("cost_usd")
        if (
            not isinstance(cost, (int, float))
            or isinstance(cost, bool)
            or not math.isfinite(float(cost))
            or cost < 0
        ):
            raise ValueError(f"Invalid cost_usd in {trial_path}")
        trial_usage["input_tokens"] += agent_result["n_input_tokens"]
        trial_usage["cache_tokens"] += agent_result["n_cache_tokens"]
        trial_usage["output_tokens"] += agent_result["n_output_tokens"]
        trial_usage["cost_usd"] += float(cost)
    if len(rewards) != expected_trials:
        raise ValueError(f"Incomplete trial artifacts: {job_path}")

    expected_task_paths = {
        child.resolve()
        for child in expected_dataset.iterdir()
        if child.is_dir() and (child / "task.toml").is_file()
    }
    for task_path in expected_task_paths:
        task_manifest = tomllib.loads(
            (task_path / "task.toml").read_text(encoding="utf-8")
        )
        environment_network = task_manifest.get("environment", {}).get("network_mode")
        agent_network = task_manifest.get("agent", {}).get("network_mode")
        if environment_network != expected_network_mode:
            raise ValueError(f"Task environment network mode mismatch: {task_path}")
        if agent_network is not None and agent_network != expected_network_mode:
            raise ValueError(f"Task agent network mode mismatch: {task_path}")
    observed_task_paths = {Path(key[2]) for key in task_observations}
    if observed_task_paths != expected_task_paths:
        raise ValueError(f"Job task set differs from its dataset: {job_path}")
    if any(count != runtime["attempts_per_task"] for count in task_observations.values()):
        raise ValueError(f"Per-task attempt count mismatch: {job_path}")
    if len(task_observations) * runtime["attempts_per_task"] != expected_trials:
        raise ValueError(f"Task-cell count mismatch: {job_path}")

    locked_task_observations: dict[tuple[str, str, str], int] = {}
    for trial in locked_trials:
        locked_task = trial.get("task") if isinstance(trial, dict) else None
        if not isinstance(locked_task, dict):
            raise ValueError(f"Locked task identity is missing: {job_path}")
        locked_name = locked_task.get("name") or ""
        locked_digest = locked_task.get("digest")
        locked_path_value = locked_task.get("path")
        if not isinstance(locked_digest, str) or not isinstance(locked_path_value, str):
            raise ValueError(f"Locked task identity is incomplete: {job_path}")
        locked_path = resolve_path(job_path, locked_path_value)
        key = (locked_name, locked_digest, locked_path.as_posix())
        locked_task_observations[key] = locked_task_observations.get(key, 0) + 1
    if {Path(key[2]) for key in locked_task_observations} != expected_task_paths:
        raise ValueError(f"Locked task set differs from its dataset: {job_path}")
    if any(
        count != runtime["attempts_per_task"]
        for count in locked_task_observations.values()
    ):
        raise ValueError(f"Locked per-task attempt count mismatch: {job_path}")

    aggregate_usage = {
        "input_tokens": stats.get("n_input_tokens"),
        "cache_tokens": stats.get("n_cache_tokens"),
        "output_tokens": stats.get("n_output_tokens"),
        "cost_usd": stats.get("cost_usd"),
    }
    for key in ("input_tokens", "cache_tokens", "output_tokens"):
        if aggregate_usage[key] != trial_usage[key]:
            raise ValueError(f"Aggregate {key} differs from trial totals: {job_path}")
    if not math.isclose(
        float(aggregate_usage["cost_usd"]),
        trial_usage["cost_usd"],
        rel_tol=0.0,
        abs_tol=1e-12,
    ):
        raise ValueError(f"Aggregate cost differs from trial totals: {job_path}")

    started_at = datetime.fromisoformat(result["started_at"])
    finished_at = datetime.fromisoformat(result["finished_at"])
    return {
        "job": portable_path(job_path, repo_root),
        "job_digest": job_digest,
        "harbor_skill": {
            "name": locked_skill_name,
            "digest": locked_skill_digest,
            "source": portable_path(configured_skill_path, repo_root),
        },
        "trials": expected_trials,
        "errors": 0,
        "retries": 0,
        "rewards": rewards,
        "mean_reward": mean(rewards),
        "worst_case_reward": min(rewards),
        "task_cells": [
            {
                "task_name": name,
                "task_checksum": checksum,
                "task_path": portable_path(Path(path), repo_root),
                "attempts": count,
            }
            for (name, checksum, path), count in sorted(task_observations.items())
        ],
        "locked_task_cells": [
            {
                "task_name": name,
                "task_digest": digest,
                "task_path": portable_path(Path(path), repo_root),
                "attempts": count,
            }
            for (name, digest, path), count in sorted(
                locked_task_observations.items()
            )
        ],
        "duration_seconds": (finished_at - started_at).total_seconds(),
        "input_tokens": int(stats.get("n_input_tokens", 0)),
        "cache_tokens": int(stats.get("n_cache_tokens", 0)),
        "output_tokens": int(stats.get("n_output_tokens", 0)),
        "cost_usd": float(stats.get("cost_usd", 0.0)),
    }


def assert_locked_score(actual: dict[str, Any], expected: dict[str, Any]) -> None:
    comparable = {
        "errors": expected["n_errors"],
        "rewards": expected["trial_rewards"],
        "mean_reward": expected["mean_reward"],
        "worst_case_reward": expected["worst_case_reward"],
    }
    for key, value in comparable.items():
        if actual[key] != value:
            raise ValueError(
                f"Development score differs from candidate lock for {actual['job']}: "
                f"{key} expected {value!r}, got {actual[key]!r}"
            )


def validate_candidate_decision(
    *,
    locked: dict[str, Any],
    source_digest: dict[str, Any],
    candidate_development: dict[str, Any],
    baseline_development: dict[str, Any],
    subject: str,
    strategy: str,
) -> str:
    """Recompute the frozen selection fields from validated development evidence."""
    label = f"{subject}/{strategy}"
    if locked.get("score", {}).get("eligible") is not True:
        raise ValueError(
            f"Current result is complete but candidate lock marks it ineligible: {label}"
        )

    actual_changed = locked["candidate"]["sha256"] != source_digest["sha256"]
    if locked["changed_from_baseline"] != actual_changed:
        raise ValueError(f"changed_from_baseline is incorrect: {label}")

    child_rank = (
        candidate_development["mean_reward"],
        candidate_development["worst_case_reward"],
    )
    baseline_rank = (
        baseline_development["mean_reward"],
        baseline_development["worst_case_reward"],
    )
    expected_selection = "child" if child_rank > baseline_rank else "baseline"
    if locked["selection"] != expected_selection:
        raise ValueError(f"Frozen selection violates the protocol order: {label}")

    expected_selected_sha256 = (
        locked["candidate"]["sha256"]
        if expected_selection == "child"
        else source_digest["sha256"]
    )
    if locked["selected_sha256"] != expected_selected_sha256:
        raise ValueError(f"selected_sha256 is incorrect: {label}")
    return expected_selection


def usage_summary(jobs: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "jobs": len(jobs),
        "trials": sum(job["trials"] for job in jobs),
        "duration_seconds": sum(job["duration_seconds"] for job in jobs),
        "input_tokens": sum(job["input_tokens"] for job in jobs),
        "cache_tokens": sum(job["cache_tokens"] for job in jobs),
        "output_tokens": sum(job["output_tokens"] for job in jobs),
        "cost_usd": sum(job["cost_usd"] for job in jobs),
    }


def assert_unique_jobs(jobs: list[dict[str, Any]], label: str) -> None:
    paths = [job["job"] for job in jobs]
    if len(paths) != len(set(paths)):
        raise ValueError(f"{label} contains duplicate physical job paths.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--corpus-lock", type=Path, required=True)
    parser.add_argument("--candidate-lock", type=Path, required=True)
    parser.add_argument("--release-lock", type=Path, required=True)
    parser.add_argument("--jobs-root", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    protocol_path = args.protocol.resolve()
    protocol = read_yaml(protocol_path)
    corpus_lock = read_json(args.corpus_lock.resolve())
    candidate_lock_path = args.candidate_lock.resolve()
    candidate_lock = read_json(candidate_lock_path)
    release_lock_path = args.release_lock.resolve()
    release_lock = read_json(release_lock_path)
    jobs_root = args.jobs_root.resolve()
    protocol_base = protocol_path.parent
    run_id = protocol["study_id"].rsplit("-", 1)[-1]

    if not (
        protocol["study_id"]
        == corpus_lock["study_id"]
        == candidate_lock["study_id"]
        == release_lock["study_id"]
    ):
        raise ValueError("Study ids differ across the frozen artifacts.")
    if file_sha256(protocol_path) != release_lock["protocol_sha256"]:
        raise ValueError("Protocol digest differs from the holdout release lock.")
    if file_sha256(args.corpus_lock.resolve()) != release_lock["corpus_lock_sha256"]:
        raise ValueError("Corpus lock digest differs from the holdout release lock.")
    if file_sha256(candidate_lock_path) != release_lock["candidate_lock_sha256"]:
        raise ValueError("Candidate lock digest differs from the holdout release lock.")

    strategies = [entry["id"] for entry in protocol["strategies"]]
    subjects: dict[str, Any] = {}
    physical_development_jobs: list[dict[str, Any]] = []
    physical_holdout_jobs: list[dict[str, Any]] = []

    for subject in sorted(protocol["subjects"]):
        subject_protocol = protocol["subjects"][subject]
        subject_corpus = corpus_lock["subjects"][subject]
        baseline_lock = candidate_lock["baselines"][subject]
        if baseline_lock.get("score", {}).get("eligible") is not True:
            raise ValueError(f"Frozen baseline is not eligible: {subject}")
        source_digest = subject_corpus["source_skill"]
        source_skill = resolve_path(protocol_base, subject_protocol["source_skill"])
        development_dataset = resolve_path(
            protocol_base, subject_protocol["development"]["dataset"]
        )
        development_config = resolve_path(
            protocol_base, subject_protocol["development"]["config"]
        )
        source_holdout_dataset = resolve_path(
            protocol_base, subject_protocol["holdout"]["dataset"]
        )
        source_holdout_config = resolve_path(
            protocol_base, subject_protocol["holdout"]["config"]
        )
        for resource_path, resource_lock, label in (
            (source_skill, source_digest, "source skill"),
            (
                development_dataset,
                subject_corpus["development_dataset"],
                "development dataset",
            ),
            (
                development_config,
                subject_corpus["development_config"],
                "development config",
            ),
            (
                source_holdout_dataset,
                subject_corpus["holdout_dataset"],
                "source holdout dataset",
            ),
            (
                source_holdout_config,
                subject_corpus["holdout_config"],
                "source holdout config",
            ),
        ):
            assert_digest(resource_path, resource_lock, f"{subject} {label}")
        expected_network_mode = subject_protocol["task_network_mode"].split(
            "-with-", 1
        )[0]
        baseline_harbor_skill_digest = subject_protocol[
            "expected_harbor_skill_digest"
        ]
        logical_skill_name = frontmatter_name(source_skill)
        baseline_development_path = resolve_path(
            protocol_base, baseline_lock["development_job"]
        )
        baseline_development = job_score(
            baseline_development_path,
            expected_trials=protocol["budget"][
                "shared_baseline_development_trials_per_subject"
            ],
            runtime=protocol["runtime"],
            repo_root=repo_root,
            expected_job_digest=baseline_lock["development_job_digest"],
            expected_skill_sha256=source_digest["sha256"],
            expected_harbor_skill_digest=baseline_harbor_skill_digest,
            expected_logical_skill_name=logical_skill_name,
            expected_network_mode=expected_network_mode,
            expected_dataset=development_dataset,
        )
        assert_locked_score(baseline_development, baseline_lock["score"])
        physical_development_jobs.append(baseline_development)

        baseline_holdout_path = (
            jobs_root
            / subject
            / "holdout"
            / f"{run_id}-{subject}-baseline-holdout"
        )
        released_dataset = release_lock_path.parent / subject / "dataset"
        released_config = release_lock_path.parent / subject / "holdout.yaml"
        released_subject = release_lock["subjects"][subject]
        if released_subject.get("source_holdout_sha256") != corpus_lock["subjects"][
            subject
        ]["holdout_dataset"]["sha256"]:
            raise ValueError(f"Released holdout source digest mismatch: {subject}")
        assert_digest(
            released_dataset,
            released_subject["dataset"],
            f"{subject} released holdout dataset",
        )
        assert_digest(
            released_config,
            released_subject["config"],
            f"{subject} released holdout config",
        )
        expected_selections = {
            strategy: candidate_lock["candidates"][subject][strategy]["selection"]
            for strategy in strategies
        }
        if released_subject.get("selected_winners") != expected_selections:
            raise ValueError(f"Released selections differ from candidate lock: {subject}")
        baseline_holdout = job_score(
            baseline_holdout_path,
            expected_trials=protocol["budget"][
                "shared_baseline_holdout_trials_per_subject"
            ],
            runtime=protocol["runtime"],
            repo_root=repo_root,
            expected_skill_sha256=source_digest["sha256"],
            expected_harbor_skill_digest=baseline_harbor_skill_digest,
            expected_logical_skill_name=logical_skill_name,
            expected_network_mode=expected_network_mode,
            expected_dataset=released_dataset,
        )
        if baseline_holdout["harbor_skill"]["name"] != baseline_development[
            "harbor_skill"
        ]["name"]:
            raise ValueError(f"Baseline Harbor skill name drifts on holdout: {subject}")
        physical_holdout_jobs.append(baseline_holdout)

        strategy_results: dict[str, Any] = {}
        for strategy in strategies:
            locked = candidate_lock["candidates"][subject][strategy]
            development_path = resolve_path(protocol_base, locked["development_job"])
            candidate_path = resolve_path(protocol_base, locked["path"])
            assert_digest(
                candidate_path,
                locked["candidate"],
                f"{subject}/{strategy} candidate bundle",
            )
            if frontmatter_name(candidate_path) != logical_skill_name:
                raise ValueError(
                    f"Candidate changed the logical skill name: {subject}/{strategy}"
                )
            candidate_development = job_score(
                development_path,
                expected_trials=protocol["budget"][
                    "development_trials_per_submitted_child"
                ],
                runtime=protocol["runtime"],
                repo_root=repo_root,
                expected_job_digest=locked["development_job_digest"],
                expected_skill_sha256=locked["candidate"]["sha256"],
                expected_skill_path=candidate_path,
                expected_logical_skill_name=logical_skill_name,
                expected_network_mode=expected_network_mode,
                expected_dataset=development_dataset,
            )
            assert_locked_score(candidate_development, locked["score"])
            validate_candidate_decision(
                locked=locked,
                source_digest=source_digest,
                candidate_development=candidate_development,
                baseline_development=baseline_development,
                subject=subject,
                strategy=strategy,
            )
            if candidate_development["task_cells"] != baseline_development["task_cells"]:
                raise ValueError(
                    f"Development task cells differ from baseline: {subject}/{strategy}"
                )
            if (
                candidate_development["locked_task_cells"]
                != baseline_development["locked_task_cells"]
            ):
                raise ValueError(
                    f"Development locked task cells differ from baseline: "
                    f"{subject}/{strategy}"
                )
            physical_development_jobs.append(candidate_development)

            if locked["selection"] == "child":
                holdout_path = (
                    jobs_root
                    / subject
                    / "holdout"
                    / f"{run_id}-{subject}-{strategy.replace('_', '-')}-holdout"
                )
                selected_skill_sha256 = locked["candidate"]["sha256"]
                selected_skill_path = candidate_path
                selected_harbor_skill_digest = candidate_development[
                    "harbor_skill"
                ]["digest"]
                selected_development = candidate_development
            else:
                holdout_path = baseline_holdout_path
                selected_skill_sha256 = source_digest["sha256"]
                selected_skill_path = None
                selected_harbor_skill_digest = baseline_harbor_skill_digest
                selected_development = baseline_development

            selected_holdout = job_score(
                holdout_path,
                expected_trials=protocol["budget"]["holdout_trials_per_selected_winner"],
                runtime=protocol["runtime"],
                repo_root=repo_root,
                expected_skill_sha256=selected_skill_sha256,
                expected_skill_path=selected_skill_path,
                expected_harbor_skill_digest=selected_harbor_skill_digest,
                expected_logical_skill_name=logical_skill_name,
                expected_network_mode=expected_network_mode,
                expected_dataset=released_dataset,
            )
            if selected_holdout["task_cells"] != baseline_holdout["task_cells"]:
                raise ValueError(
                    f"Holdout task cells differ from baseline: {subject}/{strategy}"
                )
            if locked["selection"] == "child" and selected_holdout[
                "harbor_skill"
            ]["name"] != candidate_development["harbor_skill"]["name"]:
                raise ValueError(
                    f"Candidate Harbor skill name drifts on holdout: "
                    f"{subject}/{strategy}"
                )
            if (
                selected_holdout["locked_task_cells"]
                != baseline_holdout["locked_task_cells"]
            ):
                raise ValueError(
                    f"Holdout locked task cells differ from baseline: "
                    f"{subject}/{strategy}"
                )
            if locked["selection"] == "child":
                physical_holdout_jobs.append(selected_holdout)

            strategy_results[strategy] = {
                "selection": locked["selection"],
                "changed_from_baseline": locked["changed_from_baseline"],
                "candidate_bundle_byte_delta": (
                    locked["candidate"]["total_bytes"] - source_digest["total_bytes"]
                ),
                "candidate_bundle_file_delta": (
                    locked["candidate"]["file_count"] - source_digest["file_count"]
                ),
                "candidate_development": candidate_development,
                "candidate_development_delta_mean": (
                    candidate_development["mean_reward"]
                    - baseline_development["mean_reward"]
                ),
                "selected_development": selected_development,
                "selected_holdout": selected_holdout,
                "selected_holdout_delta_mean": (
                    selected_holdout["mean_reward"] - baseline_holdout["mean_reward"]
                ),
            }

        subjects[subject] = {
            "baseline": {
                "bundle": source_digest,
                "development": baseline_development,
                "holdout": baseline_holdout,
            },
            "strategies": strategy_results,
        }

    baseline_development_mean = mean(
        entry["baseline"]["development"]["mean_reward"] for entry in subjects.values()
    )
    baseline_holdout_mean = mean(
        entry["baseline"]["holdout"]["mean_reward"] for entry in subjects.values()
    )
    strategy_aggregates: dict[str, Any] = {}
    for strategy in strategies:
        rows = [entry["strategies"][strategy] for entry in subjects.values()]
        development_deltas = [row["candidate_development_delta_mean"] for row in rows]
        holdout_deltas = [row["selected_holdout_delta_mean"] for row in rows]
        strategy_aggregates[strategy] = {
            "selected_children": sum(row["selection"] == "child" for row in rows),
            "candidate_development_mean": mean(
                row["candidate_development"]["mean_reward"] for row in rows
            ),
            "selected_development_mean": mean(
                row["selected_development"]["mean_reward"] for row in rows
            ),
            "selected_development_delta_mean": (
                mean(row["selected_development"]["mean_reward"] for row in rows)
                - baseline_development_mean
            ),
            "selected_holdout_mean": mean(
                row["selected_holdout"]["mean_reward"] for row in rows
            ),
            "selected_holdout_delta_mean": (
                mean(row["selected_holdout"]["mean_reward"] for row in rows)
                - baseline_holdout_mean
            ),
            "development_improved_subjects": sum(delta > 0 for delta in development_deltas),
            "development_tied_subjects": sum(delta == 0 for delta in development_deltas),
            "development_regressed_subjects": sum(delta < 0 for delta in development_deltas),
            "holdout_improved_subjects": sum(delta > 0 for delta in holdout_deltas),
            "holdout_tied_subjects": sum(delta == 0 for delta in holdout_deltas),
            "holdout_regressed_subjects": sum(delta < 0 for delta in holdout_deltas),
            "mean_candidate_bundle_byte_delta": mean(
                row["candidate_bundle_byte_delta"] for row in rows
            ),
            "candidate_development_usage": usage_summary(
                [row["candidate_development"] for row in rows]
            ),
            "selected_holdout_result_usage": usage_summary(
                [row["selected_holdout"] for row in rows]
            ),
        }

    development_usage = usage_summary(physical_development_jobs)
    holdout_usage = usage_summary(physical_holdout_jobs)
    assert_unique_jobs(physical_development_jobs, "Development evidence")
    assert_unique_jobs(physical_holdout_jobs, "Holdout evidence")
    assert_unique_jobs(
        physical_development_jobs + physical_holdout_jobs,
        "Combined physical evidence",
    )
    payload = {
        "schema_version": RESULT_SCHEMA_VERSION,
        "kind": "harbor-evolver-comparison-results",
        "study_id": protocol["study_id"],
        "locks": {
            "protocol_sha256": file_sha256(protocol_path),
            "corpus_lock_sha256": file_sha256(args.corpus_lock.resolve()),
            "candidate_lock_sha256": file_sha256(candidate_lock_path),
            "release_lock_sha256": file_sha256(release_lock_path),
        },
        "runtime_declared": protocol["runtime"],
        "runtime_validated_from_jobs": {
            "harbor_version": protocol["runtime"]["harbor_version"],
            "environment": protocol["runtime"]["environment"],
            "agent": protocol["runtime"]["agent"],
            "attempts_per_task": protocol["runtime"]["attempts_per_task"],
            "max_retries": protocol["runtime"]["max_retries"],
            "task_network_modes": {
                subject: protocol["subjects"][subject]["task_network_mode"].split(
                    "-with-", 1
                )[0]
                for subject in sorted(protocol["subjects"])
            },
        },
        "physical_evidence": {
            "development": development_usage,
            "holdout": holdout_usage,
            "total": usage_summary(physical_development_jobs + physical_holdout_jobs),
        },
        "baseline_aggregates": {
            "development_mean": baseline_development_mean,
            "holdout_mean": baseline_holdout_mean,
        },
        "strategy_aggregates": strategy_aggregates,
        "subjects": subjects,
    }

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
