# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Run and analyze Harbor-native reflective Pareto skill search."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

import yaml
from harbor.job import Job
from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock
from harbor.models.job.result import JobResult
from harbor.models.trial.result import TrialResult
from harbor.skills import compute_skill_digest


MAX_EXCERPT_CHARS = 2400
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


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


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Required Harbor artifact is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in Harbor artifact {path}: {error}") from error
    return require_mapping(value, str(path))


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Search config does not exist: {path}") from error
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML in search config {path}: {error}") from error
    return require_mapping(value, "config")


def parse_skill_name(skill: Path) -> str:
    skill_file = skill / "SKILL.md"
    if not skill_file.is_file():
        raise ValueError(f"Skill directory has no SKILL.md: {skill}")
    text = skill_file.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError(f"SKILL.md must begin with YAML frontmatter: {skill_file}")
    frontmatter = require_mapping(yaml.safe_load(match.group(1)), str(skill_file))
    return require_string(frontmatter.get("name"), f"{skill_file} frontmatter.name")


def candidate_complexity(skill: Path) -> int:
    return len((skill / "SKILL.md").read_text(encoding="utf-8").splitlines())


def normalize_config(config_path: Path) -> dict[str, Any]:
    raw = load_yaml(config_path)
    if raw.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1.")
    base = config_path.resolve().parent
    search = require_mapping(raw.get("search"), "search")
    harbor = require_mapping(raw.get("harbor"), "harbor")
    promotion = require_mapping(raw.get("promotion", {}), "promotion")

    search_id = require_string(search.get("id"), "search.id")
    if not ID_PATTERN.fullmatch(search_id):
        raise ValueError("search.id must use lowercase letters, digits, and hyphens.")
    baseline_skill = resolve_path(base, search.get("baselineSkill"), "search.baselineSkill")
    baseline_name = parse_skill_name(baseline_skill)
    output_dir = resolve_path(base, search.get("outputDir"), "search.outputDir")
    generation = int(search.get("generation", 0))
    if generation < 0:
        raise ValueError("search.generation must be non-negative.")

    development_job = resolve_path(
        base, harbor.get("developmentJob"), "harbor.developmentJob"
    )
    if not development_job.is_file():
        raise ValueError(f"Harbor development job config does not exist: {development_job}")
    holdout_job = (
        resolve_path(base, harbor["holdoutJob"], "harbor.holdoutJob")
        if harbor.get("holdoutJob")
        else None
    )
    if holdout_job is not None and not holdout_job.is_file():
        raise ValueError(f"Harbor holdout job config does not exist: {holdout_job}")

    required_env = harbor.get("requiredEnv", [])
    if not isinstance(required_env, list) or any(
        not isinstance(name, str)
        or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name)
        for name in required_env
    ):
        raise ValueError(
            "harbor.requiredEnv must contain portable environment variable names."
        )

    raw_candidates = raw.get("candidates")
    if not isinstance(raw_candidates, list) or not raw_candidates:
        raise ValueError("candidates must be a non-empty list.")
    candidates: list[dict[str, Any]] = []
    ids: set[str] = set()
    for index, raw_candidate in enumerate(raw_candidates):
        item = require_mapping(raw_candidate, f"candidates[{index}]")
        candidate_id = require_string(item.get("id"), f"candidates[{index}].id")
        if not ID_PATTERN.fullmatch(candidate_id):
            raise ValueError(
                f"candidates[{index}].id must use lowercase letters, digits, and hyphens."
            )
        if candidate_id in ids:
            raise ValueError(f"Duplicate candidate id: {candidate_id}")
        ids.add(candidate_id)
        skill = resolve_path(base, item.get("skill"), f"candidates[{index}].skill")
        skill_name = parse_skill_name(skill)
        if skill_name != baseline_name:
            raise ValueError(
                f"Candidate {candidate_id} changed skill name from "
                f"'{baseline_name}' to '{skill_name}'."
            )
        parents = item.get("parents", [])
        if not isinstance(parents, list) or any(not isinstance(value, str) for value in parents):
            raise ValueError(f"candidates[{index}].parents must be a list of ids.")
        candidates.append(
            {
                "id": candidate_id,
                "skill": skill,
                "parents": parents,
                "rationale": str(item.get("rationale", "")).strip(),
                "jobDirectory": (
                    resolve_path(
                        base,
                        item["jobDirectory"],
                        f"candidates[{index}].jobDirectory",
                    )
                    if item.get("jobDirectory")
                    else None
                ),
                "holdoutJobDirectory": (
                    resolve_path(
                        base,
                        item["holdoutJobDirectory"],
                        f"candidates[{index}].holdoutJobDirectory",
                    )
                    if item.get("holdoutJobDirectory")
                    else None
                ),
            }
        )

    baseline_id = require_string(search.get("baselineCandidate", "baseline"), "search.baselineCandidate")
    if baseline_id not in ids:
        raise ValueError(f"Baseline candidate '{baseline_id}' is not declared.")
    baseline_candidate = next(item for item in candidates if item["id"] == baseline_id)
    if baseline_candidate["skill"] != baseline_skill:
        raise ValueError("The baseline candidate skill must equal search.baselineSkill.")
    selected_id = search.get("selectedCandidate")
    if selected_id is not None:
        selected_id = require_string(selected_id, "search.selectedCandidate")
        if selected_id not in ids:
            raise ValueError(f"Selected candidate '{selected_id}' is not declared.")
    development_archive = (
        resolve_path(base, search["developmentArchive"], "search.developmentArchive")
        if search.get("developmentArchive")
        else None
    )

    reward_key = require_string(harbor.get("rewardKey", "reward"), "harbor.rewardKey")
    pass_threshold = float(harbor.get("passThreshold", 1))
    config = {
        "id": search_id,
        "baselineSkill": baseline_skill,
        "baselineName": baseline_name,
        "baselineCandidate": baseline_id,
        "selectedCandidate": selected_id,
        "developmentArchive": development_archive,
        "outputDir": output_dir,
        "generation": generation,
        "developmentJob": development_job,
        "holdoutJob": holdout_job,
        "requiredEnv": required_env,
        "rewardKey": reward_key,
        "passThreshold": pass_threshold,
        "candidates": candidates,
        "promotion": {
            "minimumMeanGain": float(promotion.get("minimumMeanGain", 0)),
            "allowCaseRegressions": bool(
                promotion.get("allowCaseRegressions", False)
            ),
            "requireNoErrors": bool(promotion.get("requireNoErrors", True)),
        },
    }
    output = output_dir.resolve()
    for candidate in candidates:
        skill = candidate["skill"].resolve()
        if output == skill or output.is_relative_to(skill):
            raise ValueError("search.outputDir must not be inside a candidate skill.")
    return config


def load_job_template(path: Path) -> JobConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    config = JobConfig.model_validate(require_mapping(raw, str(path)))
    if not config.agents:
        raise ValueError(f"Harbor job must declare at least one agent: {path}")
    if not config.datasets and not config.tasks:
        raise ValueError(f"Harbor job must declare datasets or tasks: {path}")
    if config.n_attempts < 1:
        raise ValueError(f"Harbor job n_attempts must be positive: {path}")
    if config.retry.max_retries != 0:
        raise ValueError(
            "Evolution jobs must set retry.max_retries to 0 so retries do not "
            "distort case support or candidate fitness."
        )
    root = path.resolve().parent
    for dataset in config.datasets:
        for field in ("path", "registry_path", "download_dir"):
            value = getattr(dataset, field)
            if value is not None and not value.is_absolute():
                setattr(dataset, field, (root / value).resolve())
    for task in config.tasks:
        for field in ("path", "download_dir"):
            value = getattr(task, field)
            if value is not None and not value.is_absolute():
                setattr(task, field, (root / value).resolve())
    config.extra_instruction_paths = [
        value if value.is_absolute() else (root / value).resolve()
        for value in config.extra_instruction_paths
    ]
    return config


def job_signature(config: JobConfig) -> str:
    value = config.model_dump(mode="json", exclude_defaults=False)
    value["job_name"] = "<candidate>"
    value["jobs_dir"] = "<jobs>"
    value["quiet"] = False
    for agent in value.get("agents", []):
        agent["skills"] = ["<candidate-skill>"]
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_lock(lock: JobLock) -> tuple[str, list[dict[str, Any]]]:
    value = lock.model_dump(mode="json", exclude={"created_at"})
    value.pop("harbor", None)
    retry = value.get("retry")
    if isinstance(retry, dict) and isinstance(
        retry.get("exclude_exceptions"), list
    ):
        # Harbor models this field as a unique set, but its JSON order can vary
        # across otherwise identical processes. Do not normalize other arrays:
        # instruction and compose-file order can affect execution semantics.
        retry["exclude_exceptions"] = sorted(retry["exclude_exceptions"])
    provenance: dict[tuple[str, str], dict[str, Any]] = {}
    trials = []
    for trial in value.get("trials", []):
        for skill in trial.get("skills", []):
            provenance[(skill["name"], skill["digest"])] = skill
        trial["skills"] = []
        trial.get("agent", {})["skills"] = ["<candidate-skill>"]
        trials.append(trial)
    value["trials"] = sorted(
        trials, key=lambda item: json.dumps(item, sort_keys=True, separators=(",", ":"))
    )
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"))
    signature = "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return signature, [provenance[key] for key in sorted(provenance)]


def first_path(paths: list[Path]) -> Path | None:
    return next((path for path in paths if path.is_file()), None)


def bounded_excerpt(paths: list[Path]) -> str:
    path = first_path(paths)
    if path is None:
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if len(text) > MAX_EXCERPT_CHARS:
        return text[:MAX_EXCERPT_CHARS] + f"\n... truncated ({len(text)} chars)"
    return text


def trial_record(
    trial: TrialResult,
    result_path: Path,
    reward_key: str,
    pass_threshold: float,
) -> dict[str, Any]:
    rewards = trial.verifier_result.rewards if trial.verifier_result else {}
    reward_value = rewards.get(reward_key) if rewards else None
    error = (
        trial.exception_info.model_dump(mode="json")
        if trial.exception_info is not None
        else None
    )
    if reward_value is None and error is None:
        raise ValueError(
            f"Trial {trial.trial_name} has no '{reward_key}' reward and no exception."
        )
    reward = float(reward_value) if reward_value is not None else 0.0
    trial_dir = result_path.parent
    trajectory_paths = sorted((trial_dir / "agent").glob("**/trajectory.json"))
    verifier_paths = sorted(
        path for path in (trial_dir / "verifier").glob("**/*") if path.is_file()
    )
    agent_output_paths = sorted(
        path for path in (trial_dir / "agent").glob("**/*.txt") if path.is_file()
    )
    model = ""
    if trial.agent_info.model_info is not None:
        info = trial.agent_info.model_info
        model = "/".join(
            part for part in (str(info.provider or ""), str(info.name or "")) if part
        )
    case_key = "|".join(
        (trial.task_checksum, trial.agent_info.name, model or "<unknown-model>")
    )
    return {
        "trialId": str(trial.id),
        "trialName": trial.trial_name,
        "taskName": trial.task_name,
        "taskChecksum": trial.task_checksum,
        "caseKey": case_key,
        "agent": trial.agent_info.name,
        "agentVersion": trial.agent_info.version,
        "model": model,
        "reward": reward,
        "passed": error is None and reward >= pass_threshold,
        "error": error,
        "resultPath": str(result_path),
        "trajectoryPath": str(trajectory_paths[0]) if trajectory_paths else None,
        "verifierFiles": [str(path) for path in verifier_paths],
        "agentOutputFiles": [str(path) for path in agent_output_paths],
        "verifierExcerpt": bounded_excerpt(verifier_paths),
        "trajectoryExcerpt": bounded_excerpt(trajectory_paths),
        "agentOutputExcerpt": bounded_excerpt(agent_output_paths),
    }


def load_native_job(
    directory: Path,
    *,
    candidate: dict[str, Any],
    reward_key: str,
    pass_threshold: float,
) -> dict[str, Any]:
    directory = directory.resolve()
    job_config = JobConfig.model_validate_json(
        (directory / "config.json").read_text(encoding="utf-8")
    )
    job_result = JobResult.model_validate_json(
        (directory / "result.json").read_text(encoding="utf-8")
    )
    trial_paths = sorted(
        path
        for path in directory.glob("*/result.json")
        if path.parent != directory
    )
    trials = [
        TrialResult.model_validate_json(path.read_text(encoding="utf-8"))
        for path in trial_paths
    ]
    names = [trial.trial_name for trial in trials]
    ids = [str(trial.id) for trial in trials]
    if len(names) != len(set(names)) or len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate Harbor trial ids or names in {directory}.")
    problems: list[str] = []
    stats = job_result.stats
    if job_result.finished_at is None:
        problems.append("job has no finished_at timestamp")
    if job_result.n_total_trials != len(trials):
        problems.append(
            f"job declares {job_result.n_total_trials} trials but "
            f"{len(trials)} trial results exist"
        )
    if stats.n_completed_trials != len(trials):
        problems.append(
            f"job stats declare {stats.n_completed_trials} completed trials but "
            f"{len(trials)} results exist"
        )
    if stats.n_running_trials or stats.n_pending_trials or stats.n_cancelled_trials:
        problems.append("job still contains running, pending, or cancelled trials")
    if problems:
        raise ValueError(f"Incomplete Harbor job {directory}: " + "; ".join(problems))

    records = [
        trial_record(trial, path, reward_key, pass_threshold)
        for trial, path in zip(trials, trial_paths, strict=True)
    ]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["caseKey"]].append(record)
    cases = []
    for case_key in sorted(grouped):
        attempts = grouped[case_key]
        cases.append(
            {
                "caseKey": case_key,
                "taskName": attempts[0]["taskName"],
                "taskChecksum": attempts[0]["taskChecksum"],
                "agent": attempts[0]["agent"],
                "model": attempts[0]["model"],
                "attempts": len(attempts),
                "meanReward": sum(item["reward"] for item in attempts) / len(attempts),
                "passRate": sum(1 for item in attempts if item["passed"]) / len(attempts),
                "errorCount": sum(1 for item in attempts if item["error"] is not None),
            }
        )

    lock_path = directory / "lock.json"
    lock_signature = None
    provenance: list[dict[str, Any]] = []
    harbor_version = version("harbor")
    if lock_path.is_file():
        lock = JobLock.model_validate_json(lock_path.read_text(encoding="utf-8"))
        lock_signature, provenance = canonical_lock(lock)
        harbor_version = lock.harbor.version or harbor_version
        expected_digest = compute_skill_digest(candidate["skill"])
        observed = {item["digest"] for item in provenance}
        if observed != {expected_digest}:
            raise ValueError(
                f"Harbor lock skill digest mismatch for candidate {candidate['id']}: "
                f"expected {expected_digest}, observed {sorted(observed)}"
            )

    return {
        "candidateId": candidate["id"],
        "skill": str(candidate["skill"]),
        "skillDigest": compute_skill_digest(candidate["skill"]),
        "skillLines": candidate_complexity(candidate["skill"]),
        "parents": candidate["parents"],
        "rationale": candidate["rationale"],
        "jobDirectory": str(directory),
        "jobId": str(job_result.id),
        "harborVersion": harbor_version,
        "jobSignature": job_signature(job_config),
        "lockPresent": lock_path.is_file(),
        "lockSignature": lock_signature,
        "skillProvenance": provenance,
        "summary": {
            "expectedTrials": job_result.n_total_trials,
            "completedTrials": len(records),
            "errorCount": sum(1 for item in records if item["error"] is not None),
            "meanReward": sum(item["reward"] for item in records) / len(records),
            "passRate": sum(1 for item in records if item["passed"]) / len(records),
        },
        "cases": cases,
        "trials": records,
    }


def validate_comparable(records: list[dict[str, Any]]) -> list[str]:
    if not records:
        raise ValueError("At least one Harbor candidate result is required.")
    job_signatures = {item["jobSignature"] for item in records}
    if len(job_signatures) != 1:
        raise ValueError("Candidate Harbor jobs are not comparable: job config drift.")
    lock_presence = {item["lockPresent"] for item in records}
    if len(lock_presence) != 1:
        raise ValueError("Candidate jobs must either all contain lock.json or all omit it.")
    if True in lock_presence:
        lock_signatures = {item["lockSignature"] for item in records}
        if len(lock_signatures) != 1:
            raise ValueError(
                "Candidate Harbor locks drift after removing only skill provenance."
            )
    baseline_cases = {
        row["caseKey"]: row["attempts"] for row in records[0]["cases"]
    }
    for record in records[1:]:
        cases = {row["caseKey"]: row["attempts"] for row in record["cases"]}
        if cases != baseline_cases:
            raise ValueError(
                f"Candidate {record['candidateId']} has task, agent, model, "
                "or attempt drift."
            )
    return sorted(baseline_cases)


def dominates(left: list[float], right: list[float]) -> bool:
    return all(a >= b for a, b in zip(left, right, strict=True)) and any(
        a > b for a, b in zip(left, right, strict=True)
    )


def build_pareto_archive(
    records: list[dict[str, Any]], config: dict[str, Any]
) -> dict[str, Any]:
    case_keys = validate_comparable(records)
    vectors: dict[str, list[float]] = {}
    cases_by_candidate: dict[str, dict[str, dict[str, Any]]] = {}
    by_id = {record["candidateId"]: record for record in records}
    for record in records:
        cases = {row["caseKey"]: row for row in record["cases"]}
        cases_by_candidate[record["candidateId"]] = cases
        vectors[record["candidateId"]] = [
            cases[case_key]["meanReward"] for case_key in case_keys
        ]

    representatives: list[str] = []
    for vector in sorted({tuple(value) for value in vectors.values()}):
        tied = [
            record
            for record in records
            if tuple(vectors[record["candidateId"]]) == vector
        ]
        tied.sort(
            key=lambda item: (
                item["summary"]["errorCount"],
                item["skillLines"],
                item["candidateId"],
            )
        )
        representatives.append(tied[0]["candidateId"])

    archive_ids = [
        candidate_id
        for candidate_id in representatives
        if not any(
            other_id != candidate_id
            and dominates(vectors[other_id], vectors[candidate_id])
            for other_id in representatives
        )
    ]
    archive_ids.sort(
        key=lambda candidate_id: (
            -sum(vectors[candidate_id]) / len(case_keys),
            by_id[candidate_id]["summary"]["errorCount"],
            by_id[candidate_id]["skillLines"],
            candidate_id,
        )
    )
    archive = []
    for candidate_id in archive_ids:
        record = by_id[candidate_id]
        archive.append(
            {
                "candidateId": candidate_id,
                "skill": record["skill"],
                "skillDigest": record["skillDigest"],
                "aggregateMean": sum(vectors[candidate_id]) / len(case_keys),
                "errorCount": record["summary"]["errorCount"],
                "skillLines": record["skillLines"],
                "parents": record["parents"],
                "vector": [
                    {
                        "caseKey": case_key,
                        "meanReward": cases_by_candidate[candidate_id][case_key][
                            "meanReward"
                        ],
                    }
                    for case_key in case_keys
                ],
            }
        )

    reflections = []
    for candidate_id in archive_ids:
        record = by_id[candidate_id]
        weakest = sorted(
            record["cases"],
            key=lambda row: (row["meanReward"], -row["errorCount"], row["caseKey"]),
        )[:2]
        targets = []
        for case in weakest:
            trial_options = [
                trial for trial in record["trials"] if trial["caseKey"] == case["caseKey"]
            ]
            trial_options.sort(
                key=lambda trial: (
                    trial["reward"],
                    trial["error"] is None,
                    trial["trialName"],
                )
            )
            evidence = trial_options[0]
            targets.append(
                {
                    **case,
                    "trialName": evidence["trialName"],
                    "error": evidence["error"],
                    "verifierExcerpt": evidence["verifierExcerpt"],
                    "trajectoryExcerpt": evidence["trajectoryExcerpt"],
                    "agentOutputExcerpt": evidence["agentOutputExcerpt"],
                    "artifactPaths": {
                        "result": evidence["resultPath"],
                        "trajectory": evidence["trajectoryPath"],
                        "verifier": evidence["verifierFiles"],
                        "agentOutput": evidence["agentOutputFiles"],
                    },
                }
            )
        reflections.append(
            {
                "candidateId": candidate_id,
                "skill": record["skill"],
                "targets": targets,
                "instruction": (
                    "Create a copied child skill that addresses only evidence-backed "
                    "recurring causes, preserves passing behavior, and does not add "
                    "task answers or holdout facts."
                ),
            }
        )

    merge_plans = []
    for left_index, left_id in enumerate(archive_ids):
        for right_id in archive_ids[left_index + 1 :]:
            left = vectors[left_id]
            right = vectors[right_id]
            left_wins = [key for key, a, b in zip(case_keys, left, right, strict=True) if a > b]
            right_wins = [key for key, a, b in zip(case_keys, left, right, strict=True) if b > a]
            if left_wins and right_wins:
                merge_plans.append(
                    {
                        "parentIds": [left_id, right_id],
                        "leftStrengths": left_wins,
                        "rightStrengths": right_wins,
                        "instruction": (
                            "Merge only compatible, evidence-backed mechanisms from "
                            "both parents into a new copied child, then evaluate it in "
                            "a fresh Harbor job."
                        ),
                    }
                )
    return {
        "schemaVersion": 1,
        "source": "harbor",
        "strategy": "reflective-pareto-search",
        "searchId": config["id"],
        "generation": config["generation"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "harborVersion": records[0]["harborVersion"],
        "rewardKey": config["rewardKey"],
        "passThreshold": config["passThreshold"],
        "holdoutDataUsed": False,
        "caseKeys": case_keys,
        "caseChecksums": sorted(
            {row["taskChecksum"] for row in records[0]["cases"]}
        ),
        "candidateResults": records,
        "archive": archive,
        "bestAggregateCandidate": archive[0]["candidateId"],
        "reflectionPlans": reflections,
        "mergePlans": merge_plans,
        "limitations": (
            []
            if records[0]["lockPresent"]
            else ["Legacy jobs have no lock.json; comparability used config and observed cases."]
        ),
    }


async def execute_job(
    template_path: Path,
    skill: Path,
    jobs_dir: Path,
    job_name: str,
) -> Path:
    config = load_job_template(template_path).model_copy(deep=True)
    config.job_name = job_name
    config.jobs_dir = jobs_dir
    config.quiet = True
    for agent in config.agents:
        agent.skills = [skill]
    destination = jobs_dir / job_name
    if destination.exists():
        raise ValueError(f"Harbor job destination already exists: {destination}")
    job = await Job.create(config)
    await job.run()
    return job.job_dir.resolve()


def run_candidate_jobs(
    config: dict[str, Any],
    *,
    phase: str,
    analyze_only: bool,
    candidate_ids: list[str],
) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in config["candidates"]}
    records = []
    if phase == "development":
        template = config["developmentJob"]
        generation_dir = (
            config["outputDir"]
            / "development"
            / f"generation-{config['generation']:03d}"
        )
        jobs_dir = generation_dir / "harbor-jobs"
        job_field = "jobDirectory"
    else:
        if config["holdoutJob"] is None:
            raise ValueError("harbor.holdoutJob is required for the holdout phase.")
        template = config["holdoutJob"]
        generation_dir = config["outputDir"] / "holdout"
        jobs_dir = generation_dir / "harbor-jobs"
        job_field = "holdoutJobDirectory"
    generation_dir.mkdir(parents=True, exist_ok=True)
    jobs_dir.mkdir(parents=True, exist_ok=True)

    for candidate_id in candidate_ids:
        candidate = by_id[candidate_id]
        if analyze_only:
            job_dir = candidate[job_field]
            if job_dir is None:
                raise ValueError(
                    f"Candidate {candidate_id} must declare {job_field} for --analyze-only."
                )
        else:
            prefix = f"g{config['generation']:03d}-" if phase == "development" else ""
            job_name = f"{config['id']}-{prefix}{phase}-{candidate_id}"
            job_dir = asyncio.run(
                execute_job(template, candidate["skill"], jobs_dir, job_name)
            )
        records.append(
            load_native_job(
                job_dir,
                candidate=candidate,
                reward_key=config["rewardKey"],
                pass_threshold=config["passThreshold"],
            )
        )
    return records


def development(config: dict[str, Any], analyze_only: bool) -> dict[str, Any]:
    records = run_candidate_jobs(
        config,
        phase="development",
        analyze_only=analyze_only,
        candidate_ids=[item["id"] for item in config["candidates"]],
    )
    archive = build_pareto_archive(records, config)
    output = (
        config["outputDir"]
        / "development"
        / f"generation-{config['generation']:03d}"
    )
    (output / "pareto-archive.json").write_text(
        json.dumps(archive, indent=2) + "\n", encoding="utf-8"
    )
    reflection = {
        "schemaVersion": 1,
        "searchId": config["id"],
        "generation": config["generation"],
        "holdoutDataUsed": False,
        "reflectionPlans": archive["reflectionPlans"],
        "mergePlans": archive["mergePlans"],
    }
    (output / "reflection-plan.json").write_text(
        json.dumps(reflection, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "mode": "development-analyze" if analyze_only else "development-live",
        "archive": str(output / "pareto-archive.json"),
        "reflectionPlan": str(output / "reflection-plan.json"),
        "archiveSize": len(archive["archive"]),
        "bestAggregateCandidate": archive["bestAggregateCandidate"],
    }


def summarize_holdout(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    validate_comparable([baseline, candidate])
    baseline_cases = {row["caseKey"]: row for row in baseline["cases"]}
    candidate_cases = {row["caseKey"]: row for row in candidate["cases"]}
    per_case = []
    regressions = []
    for case_key in sorted(baseline_cases):
        left = baseline_cases[case_key]
        right = candidate_cases[case_key]
        delta = right["meanReward"] - left["meanReward"]
        if delta < 0:
            regressions.append(case_key)
        per_case.append(
            {
                "caseKey": case_key,
                "taskName": left["taskName"],
                "agent": left["agent"],
                "model": left["model"],
                "baselineMeanReward": left["meanReward"],
                "candidateMeanReward": right["meanReward"],
                "delta": delta,
            }
        )
    baseline_mean = baseline["summary"]["meanReward"]
    candidate_mean = candidate["summary"]["meanReward"]
    rules = config["promotion"]
    promoted = (
        candidate_mean - baseline_mean >= rules["minimumMeanGain"]
        and (rules["allowCaseRegressions"] or not regressions)
        and (
            not rules["requireNoErrors"]
            or candidate["summary"]["errorCount"] == 0
        )
    )
    return {
        "baselineCandidate": baseline["candidateId"],
        "selectedCandidate": candidate["candidateId"],
        "baselineMeanReward": baseline_mean,
        "candidateMeanReward": candidate_mean,
        "meanGain": candidate_mean - baseline_mean,
        "candidateErrors": candidate["summary"]["errorCount"],
        "regressedCases": regressions,
        "perCase": per_case,
        "promotionRules": rules,
        "promoted": promoted,
    }


def render_holdout_report(run: dict[str, Any]) -> str:
    result = run["holdout"]
    decision = "PROMOTE" if result["promoted"] else "KEEP BASELINE"
    lines = [
        f"# Harbor Reflective Pareto Search: {run['searchId']}",
        "",
        f"Decision: **{decision}**",
        "",
        "| Case | Baseline | Candidate | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in result["perCase"]:
        lines.append(
            f"| {row['taskName']} / {row['agent']} | "
            f"{row['baselineMeanReward']:.3f} | "
            f"{row['candidateMeanReward']:.3f} | {row['delta']:+.3f} |"
        )
    lines.extend(
        [
            "",
            f"Overall baseline: {result['baselineMeanReward']:.3f}",
            f"Overall candidate: {result['candidateMeanReward']:.3f}",
            f"Mean gain: {result['meanGain']:+.3f}",
            f"Candidate errors: {result['candidateErrors']}",
            f"Regressed cases: {len(result['regressedCases'])}",
            "",
            "The source skill was not modified. Review the copied candidate and "
            "native Harbor artifacts before installing it.",
            "",
        ]
    )
    return "\n".join(lines)


def holdout(config: dict[str, Any], analyze_only: bool) -> dict[str, Any]:
    if config["selectedCandidate"] is None:
        raise ValueError("search.selectedCandidate is required for the holdout phase.")
    if config["developmentArchive"] is None:
        raise ValueError("search.developmentArchive is required for the holdout phase.")
    archive = read_json(config["developmentArchive"])
    if archive.get("holdoutDataUsed") is not False:
        raise ValueError("Development archive must explicitly state holdoutDataUsed: false.")
    eligible = {item["candidateId"] for item in archive.get("archive", [])}
    if config["selectedCandidate"] not in eligible:
        raise ValueError("Selected candidate must belong to the development Pareto archive.")
    ids = [config["baselineCandidate"], config["selectedCandidate"]]
    records = run_candidate_jobs(
        config,
        phase="holdout",
        analyze_only=analyze_only,
        candidate_ids=ids,
    )
    development_checksums = set(archive.get("caseChecksums", []))
    holdout_checksums = {
        row["taskChecksum"] for record in records for row in record["cases"]
    }
    overlap = sorted(development_checksums & holdout_checksums)
    if overlap:
        raise ValueError(
            "Development and holdout Harbor tasks overlap by checksum: "
            + ", ".join(overlap)
        )
    summary = summarize_holdout(records[0], records[1], config)
    output = config["outputDir"] / "holdout"
    candidate_output = output / "candidate-skill"
    if candidate_output.exists():
        raise ValueError(f"Candidate output already exists: {candidate_output}")
    selected = next(
        item for item in config["candidates"] if item["id"] == config["selectedCandidate"]
    )
    shutil.copytree(selected["skill"], candidate_output)
    run = {
        "schemaVersion": 1,
        "source": "harbor",
        "strategy": "reflective-pareto-search",
        "searchId": config["id"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "harborVersion": records[0]["harborVersion"],
        "developmentArchive": str(config["developmentArchive"]),
        "candidateSkill": str(candidate_output),
        "holdoutChecksums": sorted(holdout_checksums),
        "holdout": summary,
        "jobs": {
            "baseline": records[0]["jobDirectory"],
            "candidate": records[1]["jobDirectory"],
        },
    }
    (output / "promotion.json").write_text(
        json.dumps(run, indent=2) + "\n", encoding="utf-8"
    )
    (output / "report.md").write_text(render_holdout_report(run), encoding="utf-8")
    return {
        "mode": "holdout-analyze" if analyze_only else "holdout-live",
        "decision": "promote" if summary["promoted"] else "keep-baseline",
        "candidateSkill": str(candidate_output),
        "promotion": str(output / "promotion.json"),
        "report": str(output / "report.md"),
    }


def public_plan(config: dict[str, Any], phase: str) -> dict[str, Any]:
    template = (
        config["developmentJob"]
        if phase == "development"
        else config["holdoutJob"]
    )
    if template is None:
        raise ValueError("harbor.holdoutJob is required for the holdout phase.")
    loaded = load_job_template(template)
    return {
        "mode": "dry-run",
        "phase": phase,
        "searchId": config["id"],
        "generation": config["generation"],
        "harborVersion": version("harbor"),
        "jobTemplate": str(template),
        "jobSignature": job_signature(loaded),
        "baselineSkill": str(config["baselineSkill"]),
        "outputDir": str(config["outputDir"]),
        "candidates": [
            {"id": item["id"], "skill": str(item["skill"])}
            for item in config["candidates"]
        ],
        "rewardKey": config["rewardKey"],
        "passThreshold": config["passThreshold"],
        "requiredEnv": config["requiredEnv"],
        "missingRequiredEnv": [
            name for name in config["requiredEnv"] if not os.environ.get(name)
        ],
        "holdoutVisibleToSelection": False,
    }


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


def doctor(config: dict[str, Any], phase: str) -> dict[str, Any]:
    plan = public_plan(config, phase)
    missing = plan["missingRequiredEnv"]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    template_path = (
        config["developmentJob"] if phase == "development" else config["holdoutJob"]
    )
    template = load_job_template(template_path)
    environment_type = str(template.environment.type or "")
    checks: dict[str, str] = {"credentials": "declared variables present"}
    if environment_type == "docker":
        checks["docker"] = run_check(
            ["docker", "info", "--format", "server={{.ServerVersion}}"]
        )
        checks["dockerCompose"] = run_check(
            ["docker", "compose", "version", "--short"]
        )
    else:
        checks["docker"] = "not required for selected environment"
        checks["dockerCompose"] = "not required for selected environment"
    plan["mode"] = "doctor"
    plan["checks"] = checks
    return plan


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument(
        "--phase", choices=("development", "holdout"), default="development"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    mode.add_argument("--analyze-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        config = normalize_config(args.config.resolve())
        if args.dry_run:
            result = public_plan(config, args.phase)
        elif args.doctor:
            result = doctor(config, args.phase)
        elif args.phase == "development":
            result = development(config, args.analyze_only)
        else:
            result = holdout(config, args.analyze_only)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
