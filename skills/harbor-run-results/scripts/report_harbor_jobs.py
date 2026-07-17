# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0"]
# ///
"""Validate completed Harbor jobs and write a native JSON and Markdown report."""

from __future__ import annotations

import argparse
import copy
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any, Iterable

from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock
from harbor.models.job.result import JobResult
from harbor.models.trial.result import TimingInfo, TrialResult


REPORT_JSON = "final-report.json"
REPORT_MARKDOWN = "final-report.md"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"Required Harbor artifact is missing: {path}") from error


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(read_text(path))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in Harbor artifact {path}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in Harbor artifact: {path}")
    return value


def duration_ms(timing: TimingInfo | None) -> float | None:
    if timing is None or timing.started_at is None or timing.finished_at is None:
        return None
    return (timing.finished_at - timing.started_at).total_seconds() * 1000


def agent_duration_ms(trial: TrialResult) -> float | None:
    if trial.agent_execution is not None:
        return duration_ms(trial.agent_execution)
    if not trial.step_results:
        return None
    timings = [step.agent_execution for step in trial.step_results]
    values = [duration_ms(timing) for timing in timings]
    if not values or any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def model_identifier(trial: TrialResult) -> str:
    model = trial.agent_info.model_info
    if model is None:
        return "unknown"
    return f"{model.provider}/{model.name}" if model.provider else model.name


def exception_message(trial: TrialResult) -> str | None:
    if trial.exception_info is None:
        return None
    details = [
        trial.exception_info.exception_type,
        trial.exception_info.exception_message,
    ]
    return ": ".join(part for part in details if part)


def trial_record(
    trial: TrialResult,
    *,
    result_path: Path,
    reward_key: str,
    pass_threshold: float,
) -> dict[str, Any]:
    rewards = (
        trial.verifier_result.rewards
        if trial.verifier_result and trial.verifier_result.rewards
        else {}
    )
    reward = rewards.get(reward_key)
    error = exception_message(trial)
    passed = (
        error is None and isinstance(reward, (int, float)) and reward >= pass_threshold
    )
    n_input, n_cache, n_output, cost = trial.compute_token_cost_totals()
    total_tokens = (
        n_input + n_output if n_input is not None and n_output is not None else None
    )
    skills = sorted({Path(str(skill)).name for skill in trial.config.agent.skills})
    return {
        "id": str(trial.id),
        "trialName": trial.trial_name,
        "taskName": trial.task_name,
        "taskChecksum": trial.task_checksum,
        "source": trial.source,
        "agent": trial.agent_info.name,
        "agentVersion": trial.agent_info.version,
        "model": model_identifier(trial),
        "skills": skills,
        "reward": reward,
        "rewards": dict(rewards),
        "passed": passed,
        "error": error,
        "tokens": {
            "input": n_input,
            "cachedInput": n_cache,
            "output": n_output,
            "total": total_tokens,
        },
        "costUsd": cost,
        "agentLatencyMs": agent_duration_ms(trial),
        "resultPath": str(result_path.resolve()),
    }


def metric_summary(
    values: Iterable[float | int | None],
) -> dict[str, float | int] | None:
    observed = [
        float(value)
        for value in values
        if value is not None and math.isfinite(float(value))
    ]
    if not observed:
        return None
    total = sum(observed)
    return {
        "count": len(observed),
        "total": total,
        "average": statistics.fmean(observed),
        "stddev": statistics.pstdev(observed),
        "minimum": min(observed),
        "maximum": max(observed),
    }


def aggregate_trials(records: list[dict[str, Any]], requested: int) -> dict[str, Any]:
    passed = sum(1 for record in records if record["passed"])
    errors = sum(1 for record in records if record["error"] is not None)
    verifier_failures = sum(
        1 for record in records if record["error"] is None and not record["passed"]
    )
    return {
        "requestedTrials": requested,
        "completedTrials": len(records),
        "passedTrials": passed,
        "verifierFailedTrials": verifier_failures,
        "erroredTrials": errors,
        "passRate": passed / len(records) if records else 0,
        "reward": metric_summary(record["reward"] for record in records),
        "totalTokens": metric_summary(record["tokens"]["total"] for record in records),
        "agentLatencyMs": metric_summary(
            record["agentLatencyMs"] for record in records
        ),
        "costUsd": metric_summary(record["costUsd"] for record in records),
    }


def summarize_breakdowns(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = (
            record["taskName"],
            record["taskChecksum"],
            record["agent"],
            record["model"],
        )
        grouped[key].append(record)
    output = []
    for (task_name, checksum, agent, model), group in sorted(grouped.items()):
        output.append(
            {
                "taskName": task_name,
                "taskChecksum": checksum,
                "agent": agent,
                "model": model,
                **aggregate_trials(group, len(group)),
            }
        )
    return output


def load_optional_lock(
    job_directory: Path,
) -> tuple[JobLock | None, dict[str, Any] | None]:
    lock_path = job_directory / "lock.json"
    if not lock_path.is_file():
        return None, None
    raw = read_json(lock_path)
    return JobLock.model_validate(raw), raw


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
            (TrialResult.model_validate_json(read_text(path)), path) for path in paths
        ]
    return [
        (trial, job_directory / trial.trial_name / "result.json")
        for trial in job_result.trial_results
    ]


def completeness_problems(job_result: JobResult, trial_count: int) -> list[str]:
    problems: list[str] = []
    stats = job_result.stats
    if job_result.finished_at is None:
        problems.append("job has no finished_at timestamp")
    if job_result.n_total_trials != trial_count:
        problems.append(
            f"job declares {job_result.n_total_trials} trials but {trial_count} trial results exist"
        )
    if stats.n_completed_trials != trial_count:
        problems.append(
            f"job stats declare {stats.n_completed_trials} completed trials but {trial_count} results exist"
        )
    if stats.n_running_trials:
        problems.append(f"job still has {stats.n_running_trials} running trials")
    if stats.n_pending_trials:
        problems.append(f"job still has {stats.n_pending_trials} pending trials")
    return problems


def load_job(
    job_directory: Path,
    *,
    reward_key: str,
    pass_threshold: float,
    allow_incomplete: bool,
) -> dict[str, Any]:
    directory = job_directory.resolve()
    config_path = directory / "config.json"
    result_path = directory / "result.json"
    config = JobConfig.model_validate_json(read_text(config_path))
    job_result = JobResult.model_validate_json(read_text(result_path))
    loaded_trials = load_trials(directory, job_result)

    ids = [str(trial.id) for trial, _ in loaded_trials]
    names = [trial.trial_name for trial, _ in loaded_trials]
    duplicate_ids = [value for value, count in Counter(ids).items() if count > 1]
    duplicate_names = [value for value, count in Counter(names).items() if count > 1]
    duplicates = sorted(set(duplicate_ids + duplicate_names))
    if duplicates:
        raise ValueError(
            f"Duplicate Harbor trial ids or names in {directory}: {duplicates}"
        )

    problems = completeness_problems(job_result, len(loaded_trials))
    records = [
        trial_record(
            trial,
            result_path=path,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
        )
        for trial, path in loaded_trials
    ]
    missing_rewards = [
        record["trialName"]
        for record in records
        if record["reward"] is None and record["error"] is None
    ]
    if missing_rewards:
        problems.append(
            f"{len(missing_rewards)} trials have no '{reward_key}' reward: {missing_rewards}"
        )
    if problems and not allow_incomplete:
        raise ValueError(f"Incomplete Harbor job {directory}: " + "; ".join(problems))

    lock, raw_lock = load_optional_lock(directory)
    label = config.job_name or directory.name
    skill_provenance = summarize_skill_provenance(lock, records)
    return {
        "label": label,
        "jobDirectory": str(directory),
        "jobId": str(job_result.id),
        "startedAt": job_result.started_at.isoformat(),
        "finishedAt": job_result.finished_at.isoformat()
        if job_result.finished_at
        else None,
        "harborVersion": lock.harbor.version if lock else version("harbor"),
        "complete": not problems,
        "completenessProblems": problems,
        "skillProvenance": skill_provenance,
        "summary": aggregate_trials(records, job_result.n_total_trials),
        "breakdowns": summarize_breakdowns(records),
        "trials": records,
        "_lock": raw_lock,
    }


def summarize_skill_provenance(
    lock: JobLock | None,
    records: list[dict[str, Any]],
) -> list[dict[str, str | None]]:
    if lock is not None:
        unique: dict[tuple[str, str], dict[str, str | None]] = {}
        for trial in lock.trials:
            for skill in trial.skills:
                unique[(skill.name, skill.digest)] = {
                    "name": skill.name,
                    "digest": skill.digest,
                    "gitUrl": skill.git_url,
                    "gitCommitId": skill.git_commit_id,
                }
        return [unique[key] for key in sorted(unique)]
    names = sorted({name for record in records for name in record["skills"]})
    return [
        {"name": name, "digest": None, "gitUrl": None, "gitCommitId": None}
        for name in names
    ]


def canonical_lock(raw_lock: dict[str, Any]) -> dict[str, Any]:
    value = copy.deepcopy(raw_lock)
    value.pop("created_at", None)
    retry = value.get("retry")
    if isinstance(retry, dict):
        for field in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(field), list):
                retry[field] = sorted(retry[field])
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
        key=lambda trial: json.dumps(trial, sort_keys=True, separators=(",", ":")),
    )
    return value


def fairness_signature(job: dict[str, Any]) -> dict[str, Any]:
    cells: dict[tuple[str, str, str], dict[str, Any]] = {}
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for trial in job["trials"]:
        grouped[(trial["taskName"], trial["agent"], trial["model"])].append(trial)
    for key, records in grouped.items():
        cells[key] = {
            "attempts": len(records),
            "checksums": sorted({record["taskChecksum"] for record in records}),
            "agentVersions": sorted({record["agentVersion"] for record in records}),
        }
    return {"cells": {"|".join(key): value for key, value in sorted(cells.items())}}


def validate_comparison(jobs: list[dict[str, Any]]) -> dict[str, Any]:
    baseline = jobs[0]
    baseline_signature = fairness_signature(baseline)
    for job in jobs[1:]:
        if fairness_signature(job) != baseline_signature:
            raise ValueError(
                f"Harbor jobs '{baseline['label']}' and '{job['label']}' are not comparable: "
                "task checksums, agents, models, versions, or attempt counts differ."
            )

    locks = [job["_lock"] for job in jobs]
    if all(lock is not None for lock in locks):
        baseline_lock = canonical_lock(locks[0])
        for job, lock in zip(jobs[1:], locks[1:]):
            if canonical_lock(lock) != baseline_lock:
                raise ValueError(
                    f"Harbor lock drift between '{baseline['label']}' and '{job['label']}'. "
                    "Only skill provenance may differ in a fair skill comparison."
                )
        basis = "lock-and-trial-results"
        warning = None
    elif any(lock is not None for lock in locks):
        raise ValueError(
            "Comparison requires lock.json for every Harbor job or for none of them."
        )
    else:
        basis = "trial-results"
        warning = (
            "No lock.json files were available; comparability covers observed task checksums, "
            "agents, models, versions, and attempts but not every resolved job setting."
        )

    baseline_summary = baseline["summary"]
    deltas = []
    for job in jobs[1:]:
        summary = job["summary"]
        deltas.append(
            {
                "baseline": baseline["label"],
                "candidate": job["label"],
                "passRateDelta": summary["passRate"] - baseline_summary["passRate"],
                "averageRewardDelta": difference(
                    summary["reward"], baseline_summary["reward"]
                ),
                "averageTotalTokensDelta": difference(
                    summary["totalTokens"], baseline_summary["totalTokens"]
                ),
                "averageAgentLatencyMsDelta": difference(
                    summary["agentLatencyMs"], baseline_summary["agentLatencyMs"]
                ),
            }
        )
    return {
        "enabled": True,
        "baseline": baseline["label"],
        "fairnessBasis": basis,
        "warning": warning,
        "deltas": deltas,
    }


def difference(
    current: dict[str, Any] | None, baseline: dict[str, Any] | None
) -> float | None:
    if current is None or baseline is None:
        return None
    return current["average"] - baseline["average"]


def percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def number(value: float | int | None, digits: int = 1) -> str:
    if value is None:
        return "n/a"
    return f"{value:,.{digits}f}"


def average(metric: dict[str, Any] | None) -> float | None:
    return metric["average"] if metric else None


def markdown_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def skill_label(job: dict[str, Any]) -> str:
    skills = job["skillProvenance"]
    if not skills:
        return "none"
    return ", ".join(
        f"{skill['name']}@{skill['digest'][:15]}" if skill["digest"] else skill["name"]
        for skill in skills
    )


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# {report['title']}",
        "",
        f"Generated: {report['generatedAt']}",
        f"Reward gate: `{report['rewardKey']}` >= {report['passThreshold']}",
        "",
        "## Outcome",
        "",
        "| Job | Skills | Trials | Passed | Verifier failed | Errors | Pass rate | Reward avg | Tokens avg | Agent time avg | Cost |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for job in report["jobs"]:
        summary = job["summary"]
        lines.append(
            "| "
            + " | ".join(
                [
                    markdown_cell(job["label"]),
                    markdown_cell(skill_label(job)),
                    f"{summary['completedTrials']}/{summary['requestedTrials']}",
                    str(summary["passedTrials"]),
                    str(summary["verifierFailedTrials"]),
                    str(summary["erroredTrials"]),
                    percent(summary["passRate"]),
                    number(average(summary["reward"]), 3),
                    number(average(summary["totalTokens"]), 1),
                    number(average(summary["agentLatencyMs"]), 1) + " ms",
                    "$"
                    + number(
                        summary["costUsd"]["total"] if summary["costUsd"] else None, 4
                    ),
                ]
            )
            + " |"
        )

    comparison = report["comparison"]
    if comparison["enabled"]:
        lines.extend(
            [
                "",
                "## Comparison",
                "",
                f"Baseline: `{comparison['baseline']}`. Fairness basis: `{comparison['fairnessBasis']}`.",
            ]
        )
        if comparison["warning"]:
            lines.extend(["", f"Warning: {comparison['warning']}"])
        lines.extend(
            [
                "",
                "| Candidate | Pass-rate delta | Reward delta | Token delta | Agent-time delta |",
                "| --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for delta in comparison["deltas"]:
            latency_delta = delta["averageAgentLatencyMsDelta"]
            lines.append(
                "| "
                + " | ".join(
                    [
                        markdown_cell(delta["candidate"]),
                        f"{delta['passRateDelta'] * 100:+.1f} points",
                        number(delta["averageRewardDelta"], 3),
                        number(delta["averageTotalTokensDelta"], 1),
                        number(latency_delta, 1) + " ms",
                    ]
                )
                + " |"
            )

    lines.extend(
        [
            "",
            "## Task and agent breakdown",
            "",
            "| Job | Task | Agent | Model | Passed | Errors | Reward avg | Tokens avg | Agent time avg |",
            "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for job in report["jobs"]:
        for row in job["breakdowns"]:
            lines.append(
                "| "
                + " | ".join(
                    [
                        markdown_cell(job["label"]),
                        markdown_cell(row["taskName"]),
                        markdown_cell(row["agent"]),
                        markdown_cell(row["model"]),
                        f"{row['passedTrials']}/{row['completedTrials']}",
                        str(row["erroredTrials"]),
                        number(average(row["reward"]), 3),
                        number(average(row["totalTokens"]), 1),
                        number(average(row["agentLatencyMs"]), 1) + " ms",
                    ]
                )
                + " |"
            )

    lines.extend(["", "## Failures and errors", ""])
    failure_count = 0
    for job in report["jobs"]:
        for trial in job["trials"]:
            if trial["passed"]:
                continue
            failure_count += 1
            outcome = trial["error"] or f"reward={trial['reward']}"
            lines.append(
                f"- `{job['label']}/{trial['trialName']}`: {markdown_cell(outcome)[:300]}"
            )
    if failure_count == 0:
        lines.append("No failed or errored trials.")

    lines.extend(["", "## Harbor artifacts", ""])
    for job in report["jobs"]:
        lines.append(f"- `{job['label']}`: `{job['jobDirectory']}`")
    return "\n".join(lines) + "\n"


def build_report(
    job_directories: list[Path],
    *,
    title: str,
    reward_key: str,
    pass_threshold: float,
    compare: bool,
    allow_incomplete: bool,
    generated_at: str | None,
) -> dict[str, Any]:
    jobs = [
        load_job(
            directory,
            reward_key=reward_key,
            pass_threshold=pass_threshold,
            allow_incomplete=allow_incomplete,
        )
        for directory in job_directories
    ]
    labels = [job["label"] for job in jobs]
    if len(set(labels)) != len(labels):
        raise ValueError(f"Harbor job labels must be unique: {labels}")
    if compare and len(jobs) < 2:
        raise ValueError("--compare requires at least two Harbor job directories.")
    comparison = (
        validate_comparison(jobs)
        if compare
        else {
            "enabled": False,
            "baseline": None,
            "fairnessBasis": None,
            "warning": None,
            "deltas": [],
        }
    )
    for job in jobs:
        job.pop("_lock", None)
    timestamp = generated_at or datetime.now(timezone.utc).isoformat()
    return {
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "title": title,
        "generatedAt": timestamp,
        "rewardKey": reward_key,
        "passThreshold": pass_threshold,
        "comparison": comparison,
        "jobs": jobs,
    }


def write_report(
    report: dict[str, Any], output_directory: Path, overwrite: bool
) -> tuple[Path, Path]:
    directory = output_directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    json_path = directory / REPORT_JSON
    markdown_path = directory / REPORT_MARKDOWN
    existing = [path for path in (json_path, markdown_path) if path.exists()]
    if existing and not overwrite:
        raise ValueError(
            "Refusing to overwrite existing report artifacts: "
            + ", ".join(str(path) for path in existing)
        )
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return json_path, markdown_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job_directories", nargs="+", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("harbor-report"))
    parser.add_argument("--title", default="Harbor Final Evaluation Report")
    parser.add_argument("--reward-key", default="reward")
    parser.add_argument("--pass-threshold", type=float, default=1.0)
    parser.add_argument("--compare", action="store_true")
    parser.add_argument("--allow-incomplete", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--generated-at", help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        report = build_report(
            args.job_directories,
            title=args.title,
            reward_key=args.reward_key,
            pass_threshold=args.pass_threshold,
            compare=args.compare,
            allow_incomplete=args.allow_incomplete,
            generated_at=args.generated_at,
        )
        json_path, markdown_path = write_report(report, args.output_dir, args.overwrite)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(
        json.dumps(
            {
                "reportJson": str(json_path),
                "reportMarkdown": str(markdown_path),
                "jobs": [
                    {
                        "label": job["label"],
                        "passed": job["summary"]["passedTrials"],
                        "completed": job["summary"]["completedTrials"],
                        "errors": job["summary"]["erroredTrials"],
                    }
                    for job in report["jobs"]
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
