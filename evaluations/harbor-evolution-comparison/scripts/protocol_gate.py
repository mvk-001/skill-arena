# /// script
# requires-python = ">=3.12"
# dependencies = ["PyYAML>=6,<7"]
# ///
"""Freeze comparison inputs and gate holdout release on immutable candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any

import yaml


LOCK_SCHEMA_VERSION = "1"


def read_yaml(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a YAML mapping: {path}")
    return payload


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return payload


def tree_digest(path: Path) -> dict[str, Any]:
    if not path.is_dir():
        raise ValueError(f"Expected a directory: {path}")
    digest = hashlib.sha256()
    file_count = 0
    total_bytes = 0
    entries: list[tuple[str, Path]] = []
    for candidate in path.rglob("*"):
        if candidate.is_symlink():
            raise ValueError(f"Symlinks are not permitted in frozen resources: {candidate}")
        if candidate.is_file():
            relative = candidate.relative_to(path).as_posix()
            entries.append((relative, candidate))

    for relative, candidate in sorted(entries):
        data = candidate.read_bytes()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(data)).encode("ascii"))
        digest.update(b"\0")
        digest.update(data)
        digest.update(b"\0")
        file_count += 1
        total_bytes += len(data)

    return {
        "kind": "directory",
        "sha256": digest.hexdigest(),
        "file_count": file_count,
        "total_bytes": total_bytes,
    }


def resource_digest(path: Path) -> dict[str, Any]:
    if path.is_dir():
        return tree_digest(path)
    if path.is_file():
        return {
            "kind": "file",
            "sha256": file_sha256(path),
            "file_count": 1,
            "total_bytes": path.stat().st_size,
        }
    raise FileNotFoundError(path)


def resolve_path(base: Path, value: Any) -> Path:
    path = Path(str(value)).expanduser()
    return path.resolve() if path.is_absolute() else (base / path).resolve()


def portable_path(path: Path, base: Path) -> str:
    return Path(os.path.relpath(path.resolve(), base.resolve())).as_posix()


def write_json_once(path: Path, payload: dict[str, Any]) -> None:
    if path.exists():
        raise FileExistsError(f"Refusing to replace immutable lock: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def load_protocol(path: Path) -> tuple[dict[str, Any], Path]:
    resolved = path.resolve()
    protocol = read_yaml(resolved)
    if protocol.get("kind") != "harbor-evolver-comparison-protocol":
        raise ValueError("Unexpected protocol kind.")
    if protocol.get("schema_version") != LOCK_SCHEMA_VERSION:
        raise ValueError("Unsupported protocol schema version.")
    subjects = protocol.get("subjects")
    strategies = protocol.get("strategies")
    if not isinstance(subjects, dict) or len(subjects) != 3:
        raise ValueError("The frozen protocol requires exactly three subjects.")
    if not isinstance(strategies, list) or len(strategies) != 4:
        raise ValueError("The frozen protocol requires exactly four strategies.")
    return protocol, resolved


def subject_resources(protocol: dict[str, Any]) -> dict[str, dict[str, str]]:
    resources: dict[str, dict[str, str]] = {}
    for subject, spec in protocol["subjects"].items():
        if not isinstance(spec, dict):
            raise ValueError(f"Invalid subject mapping: {subject}")
        development = spec.get("development")
        holdout = spec.get("holdout")
        if not isinstance(development, dict) or not isinstance(holdout, dict):
            raise ValueError(f"Subject {subject} must define development and holdout.")
        resources[subject] = {
            "source_skill": str(spec["source_skill"]),
            "development_dataset": str(development["dataset"]),
            "development_config": str(development["config"]),
            "holdout_dataset": str(holdout["dataset"]),
            "holdout_config": str(holdout["config"]),
        }
    return resources


def create_corpus_lock(protocol_path: Path) -> dict[str, Any]:
    protocol, resolved = load_protocol(protocol_path)
    base = resolved.parent
    subjects: dict[str, Any] = {}
    for subject, resources in subject_resources(protocol).items():
        locked: dict[str, Any] = {}
        for role, value in resources.items():
            path = resolve_path(base, value)
            locked[role] = {"path": value, **resource_digest(path)}
        subjects[subject] = locked
    return {
        "schema_version": LOCK_SCHEMA_VERSION,
        "kind": "harbor-evolver-corpus-lock",
        "study_id": protocol["study_id"],
        "protocol": {
            "path": resolved.name,
            "sha256": file_sha256(resolved),
        },
        "subjects": subjects,
    }


def verify_corpus_lock(protocol_path: Path, lock_path: Path) -> dict[str, Any]:
    expected = json.loads(lock_path.read_text(encoding="utf-8"))
    actual = create_corpus_lock(protocol_path)
    if expected != actual:
        raise ValueError(
            "Corpus lock mismatch: the protocol, baseline skill, JobConfig, or task corpus changed."
        )
    return expected


def frontmatter_name(skill_dir: Path) -> str:
    skill_path = skill_dir / "SKILL.md"
    if not skill_path.is_file():
        raise ValueError(f"Candidate has no SKILL.md: {skill_dir}")
    text = skill_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"SKILL.md has no YAML frontmatter: {skill_path}")
    try:
        end = next(index for index, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration as exc:
        raise ValueError(f"SKILL.md has unterminated YAML frontmatter: {skill_path}") from exc
    frontmatter = yaml.safe_load("\n".join(lines[1:end]))
    if not isinstance(frontmatter, dict) or not isinstance(frontmatter.get("name"), str):
        raise ValueError(f"SKILL.md frontmatter requires a string name: {skill_path}")
    return frontmatter["name"]


def expected_strategy_ids(protocol: dict[str, Any]) -> list[str]:
    identifiers: list[str] = []
    for strategy in protocol["strategies"]:
        if not isinstance(strategy, dict) or not isinstance(strategy.get("id"), str):
            raise ValueError("Each strategy requires a string id.")
        identifiers.append(strategy["id"])
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Strategy ids must be unique.")
    return identifiers


def validate_development_job(
    job_path: Path,
    protocol: dict[str, Any],
    protocol_base: Path,
    subject: str,
    *,
    expected_skill_path: Path | None = None,
    expected_harbor_digest: str | None = None,
) -> dict[str, Any]:
    if not job_path.is_dir():
        raise ValueError(f"Completed native development job is missing: {job_path}")
    config = read_json(job_path / "config.json")
    lock = read_json(job_path / "lock.json")
    result = read_json(job_path / "result.json")
    runtime = protocol["runtime"]
    agents = config.get("agents")
    if not isinstance(agents, list) or len(agents) != 1:
        raise ValueError(f"Development job must contain one agent: {job_path}")
    agent = agents[0]
    if agent.get("name") != runtime["agent"]["name"]:
        raise ValueError(f"Development job agent mismatch: {job_path}")
    if agent.get("model_name") != runtime["agent"]["model_name"]:
        raise ValueError(f"Development job model mismatch: {job_path}")
    if agent.get("kwargs", {}) != runtime["agent"]["kwargs"]:
        raise ValueError(f"Development job reasoning kwargs mismatch: {job_path}")
    if expected_skill_path is not None:
        configured_skills = agent.get("skills")
        if not isinstance(configured_skills, list) or len(configured_skills) != 1:
            raise ValueError(f"Development job must load exactly one skill: {job_path}")
        if resolve_path(job_path, configured_skills[0]) != expected_skill_path.resolve():
            raise ValueError(f"Development job does not load its submitted child: {job_path}")

    if lock.get("harbor", {}).get("version") != str(runtime["harbor_version"]):
        raise ValueError(f"Development job Harbor version mismatch: {job_path}")
    if lock.get("retry", {}).get("max_retries") != runtime["max_retries"]:
        raise ValueError(f"Development job retry budget mismatch: {job_path}")
    trials = lock.get("trials")
    attempts_per_task = protocol["runtime"]["attempts_per_task"]
    expected_task_count = protocol["budget"]["development_tasks_per_subject"]
    expected_trial_count = expected_task_count * attempts_per_task
    if not isinstance(trials, list) or len(trials) != expected_trial_count:
        raise ValueError(f"Development job trial budget mismatch: {job_path}")
    development_dataset = resolve_path(
        protocol_base,
        protocol["subjects"][subject]["development"]["dataset"],
    )
    expected_tasks = {
        child.resolve()
        for child in development_dataset.iterdir()
        if child.is_dir() and (child / "task.toml").is_file()
    }
    locked_tasks = {resolve_path(job_path, trial["task"]["path"]) for trial in trials}
    if locked_tasks != expected_tasks:
        raise ValueError(f"Development job task set mismatch: {job_path}")
    locked_task_counts = {
        task: sum(
            resolve_path(job_path, trial["task"]["path"]) == task
            for trial in trials
        )
        for task in expected_tasks
    }
    if any(count != attempts_per_task for count in locked_task_counts.values()):
        raise ValueError(f"Development job repetition budget mismatch: {job_path}")
    for trial in trials:
        trial_agent = trial.get("agent", {})
        if trial_agent.get("model_name") != runtime["agent"]["model_name"]:
            raise ValueError(f"Trial model mismatch: {job_path}")
        if trial_agent.get("kwargs", {}) != runtime["agent"]["kwargs"]:
            raise ValueError(f"Trial reasoning kwargs mismatch: {job_path}")
        skills = trial.get("skills")
        if not isinstance(skills, list) or len(skills) != 1:
            raise ValueError(f"Trial must lock exactly one skill: {job_path}")
        if expected_skill_path is not None:
            skill_source = skills[0].get("source")
            if resolve_path(job_path, skill_source) != expected_skill_path.resolve():
                raise ValueError(f"Trial skill source mismatch: {job_path}")
        if expected_harbor_digest is not None and skills[0].get("digest") != expected_harbor_digest:
            raise ValueError(f"Baseline Harbor skill digest mismatch: {job_path}")

    stats = result.get("stats", {})
    if result.get("n_total_trials") != expected_trial_count:
        raise ValueError(f"Development result trial count mismatch: {job_path}")
    if stats.get("n_retries") != 0:
        raise ValueError(f"Development job used retries: {job_path}")
    if any(stats.get(key, 0) != 0 for key in ("n_running_trials", "n_pending_trials", "n_cancelled_trials")):
        raise ValueError(f"Development job is not terminal: {job_path}")

    trial_results = []
    for child in sorted(job_path.iterdir()):
        result_path = child / "result.json"
        if child.is_dir() and result_path.is_file():
            trial_results.append(read_json(result_path))
    if len(trial_results) != expected_trial_count:
        raise ValueError(f"Development job has incomplete trial artifacts: {job_path}")
    result_tasks = {resolve_path(job_path, item["task_id"]["path"]) for item in trial_results}
    if result_tasks != expected_tasks:
        raise ValueError(f"Development result task set mismatch: {job_path}")
    result_task_counts = {
        task: sum(
            resolve_path(job_path, item["task_id"]["path"]) == task
            for item in trial_results
        )
        for task in expected_tasks
    }
    if any(count != attempts_per_task for count in result_task_counts.values()):
        raise ValueError(f"Development result repetition mismatch: {job_path}")

    rewards: list[float] = []
    n_errors = 0
    for item in trial_results:
        verifier_result = item.get("verifier_result")
        verifier_rewards = (
            verifier_result.get("rewards", {})
            if isinstance(verifier_result, dict)
            else {}
        )
        reward = verifier_rewards.get("reward")
        if item.get("exception_info") is not None or not isinstance(reward, (int, float)):
            n_errors += 1
            continue
        rewards.append(float(reward))
    eligible = n_errors == 0 and len(rewards) == expected_trial_count
    return {
        "eligible": eligible,
        "n_errors": n_errors,
        "trial_rewards": rewards,
        "mean_reward": sum(rewards) / len(rewards) if eligible else None,
        "worst_case_reward": min(rewards) if eligible else None,
    }


def create_candidate_lock(
    protocol_path: Path,
    corpus_lock_path: Path,
    registry_path: Path,
) -> dict[str, Any]:
    protocol, resolved = load_protocol(protocol_path)
    protocol_base = resolved.parent
    corpus_lock = verify_corpus_lock(resolved, corpus_lock_path.resolve())
    registry_resolved = registry_path.resolve()
    registry = read_yaml(registry_resolved)
    if registry.get("study_id") != protocol["study_id"]:
        raise ValueError("Candidate registry study_id does not match the protocol.")
    candidates = registry.get("candidates")
    if not isinstance(candidates, dict):
        raise ValueError("Candidate registry requires a candidates mapping.")
    expected_subjects = set(protocol["subjects"])
    if set(candidates) != expected_subjects:
        raise ValueError("Candidate registry subjects do not match the protocol.")
    baseline_jobs = registry.get("baseline_development_jobs")
    if not isinstance(baseline_jobs, dict) or set(baseline_jobs) != expected_subjects:
        raise ValueError("Candidate registry baseline jobs do not match the protocol.")
    strategies = expected_strategy_ids(protocol)
    registry_base = registry_resolved.parent
    locked_candidates: dict[str, Any] = {}
    locked_baselines: dict[str, Any] = {}

    for subject in sorted(expected_subjects):
        entries = candidates[subject]
        if not isinstance(entries, dict) or set(entries) != set(strategies):
            raise ValueError(f"Candidate strategies do not match the protocol for {subject}.")
        source_value = protocol["subjects"][subject]["source_skill"]
        source_path = resolve_path(protocol_base, source_value)
        baseline_name = frontmatter_name(source_path)
        baseline_digest = corpus_lock["subjects"][subject]["source_skill"]
        baseline_job_path = resolve_path(registry_base, baseline_jobs[subject])
        baseline_score = validate_development_job(
            baseline_job_path,
            protocol,
            protocol_base,
            subject,
            expected_harbor_digest=protocol["subjects"][subject][
                "expected_harbor_skill_digest"
            ],
        )
        if not baseline_score["eligible"]:
            raise ValueError(f"Shared baseline development job is ineligible: {subject}")
        locked_baselines[subject] = {
            "development_job": portable_path(baseline_job_path, protocol_base),
            "development_job_digest": tree_digest(baseline_job_path),
            "score": baseline_score,
        }
        holdout_path = resolve_path(
            protocol_base,
            protocol["subjects"][subject]["holdout"]["dataset"],
        )
        locked_entries: dict[str, Any] = {}

        for strategy in strategies:
            entry = entries[strategy]
            if not isinstance(entry, dict):
                raise ValueError(f"Invalid candidate entry: {subject}/{strategy}")
            selection = entry.get("selection")
            if selection not in {"baseline", "child"}:
                raise ValueError(
                    f"selection must be baseline or child: {subject}/{strategy}"
                )
            candidate_path = resolve_path(registry_base, entry.get("path"))
            development_job = resolve_path(registry_base, entry.get("development_job"))
            if candidate_path == source_path:
                raise ValueError(f"Submitted child aliases the source baseline: {subject}/{strategy}")
            if candidate_path == holdout_path or holdout_path in candidate_path.parents:
                raise ValueError(f"Candidate path overlaps the hidden holdout: {subject}/{strategy}")
            if frontmatter_name(candidate_path) != baseline_name:
                raise ValueError(f"Candidate changed the skill name: {subject}/{strategy}")
            candidate_digest = tree_digest(candidate_path)
            candidate_score = validate_development_job(
                development_job,
                protocol,
                protocol_base,
                subject,
                expected_skill_path=candidate_path,
            )
            child_wins = candidate_score["eligible"] and (
                candidate_score["mean_reward"],
                candidate_score["worst_case_reward"],
            ) > (
                baseline_score["mean_reward"],
                baseline_score["worst_case_reward"],
            )
            expected_selection = "child" if child_wins else "baseline"
            if selection != expected_selection:
                raise ValueError(
                    f"Selection rule mismatch for {subject}/{strategy}: "
                    f"expected {expected_selection}, found {selection}"
                )
            job_digest = tree_digest(development_job)
            selected_digest = (
                candidate_digest["sha256"]
                if selection == "child"
                else baseline_digest["sha256"]
            )
            locked_entries[strategy] = {
                "path": portable_path(candidate_path, protocol_base),
                "development_job": portable_path(development_job, protocol_base),
                "selection": selection,
                "selected_sha256": selected_digest,
                "changed_from_baseline": candidate_digest["sha256"]
                != baseline_digest["sha256"],
                "candidate": candidate_digest,
                "development_job_digest": job_digest,
                "score": candidate_score,
            }
        locked_candidates[subject] = locked_entries

    return {
        "schema_version": LOCK_SCHEMA_VERSION,
        "kind": "harbor-evolver-candidate-lock",
        "study_id": protocol["study_id"],
        "protocol_sha256": file_sha256(resolved),
        "corpus_lock_sha256": file_sha256(corpus_lock_path.resolve()),
        "registry_sha256": file_sha256(registry_resolved),
        "baselines": locked_baselines,
        "candidates": locked_candidates,
    }


def verify_candidate_lock(
    protocol_path: Path,
    corpus_lock_path: Path,
    candidate_lock_path: Path,
) -> dict[str, Any]:
    protocol, resolved = load_protocol(protocol_path)
    protocol_base = resolved.parent
    verify_corpus_lock(resolved, corpus_lock_path.resolve())
    lock = json.loads(candidate_lock_path.read_text(encoding="utf-8"))
    if lock.get("kind") != "harbor-evolver-candidate-lock":
        raise ValueError("Unexpected candidate lock kind.")
    if lock.get("study_id") != protocol["study_id"]:
        raise ValueError("Candidate lock study_id does not match the protocol.")
    if lock.get("protocol_sha256") != file_sha256(resolved):
        raise ValueError("Protocol changed after candidate freeze.")
    if lock.get("corpus_lock_sha256") != file_sha256(corpus_lock_path.resolve()):
        raise ValueError("Corpus lock changed after candidate freeze.")

    expected_subjects = set(protocol["subjects"])
    strategies = set(expected_strategy_ids(protocol))
    candidates = lock.get("candidates")
    if not isinstance(candidates, dict) or set(candidates) != expected_subjects:
        raise ValueError("Candidate lock subjects do not match the protocol.")
    baselines = lock.get("baselines")
    if not isinstance(baselines, dict) or set(baselines) != expected_subjects:
        raise ValueError("Candidate lock baseline jobs do not match the protocol.")
    for subject in expected_subjects:
        baseline_job_path = resolve_path(protocol_base, baselines[subject]["development_job"])
        if tree_digest(baseline_job_path) != baselines[subject]["development_job_digest"]:
            raise ValueError(f"Baseline development job changed after freeze: {subject}")
        entries = candidates[subject]
        if not isinstance(entries, dict) or set(entries) != strategies:
            raise ValueError(f"Candidate lock strategies are incomplete for {subject}.")
        for strategy, entry in entries.items():
            candidate_path = resolve_path(protocol_base, entry["path"])
            job_path = resolve_path(protocol_base, entry["development_job"])
            if tree_digest(candidate_path) != entry["candidate"]:
                raise ValueError(f"Candidate changed after freeze: {subject}/{strategy}")
            if tree_digest(job_path) != entry["development_job_digest"]:
                raise ValueError(f"Development job changed after freeze: {subject}/{strategy}")
    return lock


def release_holdout(
    protocol_path: Path,
    corpus_lock_path: Path,
    candidate_lock_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    protocol, resolved = load_protocol(protocol_path)
    base = resolved.parent
    corpus_lock = verify_corpus_lock(resolved, corpus_lock_path.resolve())
    candidate_lock = verify_candidate_lock(
        resolved,
        corpus_lock_path.resolve(),
        candidate_lock_path.resolve(),
    )
    destination = output_dir.resolve()
    if destination.exists():
        raise FileExistsError(f"Refusing to replace an existing holdout release: {destination}")
    destination.mkdir(parents=True)
    released: dict[str, Any] = {}

    for subject, spec in protocol["subjects"].items():
        subject_dir = destination / subject
        dataset_destination = subject_dir / "dataset"
        source_dataset = resolve_path(base, spec["holdout"]["dataset"])
        shutil.copytree(source_dataset, dataset_destination)

        config = read_yaml(resolve_path(base, spec["holdout"]["config"]))
        config["datasets"] = [{"path": "dataset"}]
        config_destination = subject_dir / "holdout.yaml"
        config_destination.write_text(
            yaml.safe_dump(config, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        released[subject] = {
            "source_holdout_sha256": corpus_lock["subjects"][subject]["holdout_dataset"][
                "sha256"
            ],
            "dataset": tree_digest(dataset_destination),
            "config": resource_digest(config_destination),
            "selected_winners": {
                strategy: entry["selection"]
                for strategy, entry in candidate_lock["candidates"][subject].items()
            },
        }

    release_lock = {
        "schema_version": LOCK_SCHEMA_VERSION,
        "kind": "harbor-evolver-holdout-release",
        "study_id": protocol["study_id"],
        "protocol_sha256": file_sha256(resolved),
        "corpus_lock_sha256": file_sha256(corpus_lock_path.resolve()),
        "candidate_lock_sha256": file_sha256(candidate_lock_path.resolve()),
        "subjects": released,
    }
    write_json_once(destination / "release-lock.json", release_lock)
    return release_lock


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    freeze_corpora = subparsers.add_parser("freeze-corpora")
    freeze_corpora.add_argument("--protocol", type=Path, required=True)
    freeze_corpora.add_argument("--output", type=Path, required=True)

    verify_corpora = subparsers.add_parser("verify-corpora")
    verify_corpora.add_argument("--protocol", type=Path, required=True)
    verify_corpora.add_argument("--corpus-lock", type=Path, required=True)

    freeze_candidates = subparsers.add_parser("freeze-candidates")
    freeze_candidates.add_argument("--protocol", type=Path, required=True)
    freeze_candidates.add_argument("--corpus-lock", type=Path, required=True)
    freeze_candidates.add_argument("--registry", type=Path, required=True)
    freeze_candidates.add_argument("--output", type=Path, required=True)

    release = subparsers.add_parser("release-holdout")
    release.add_argument("--protocol", type=Path, required=True)
    release.add_argument("--corpus-lock", type=Path, required=True)
    release.add_argument("--candidate-lock", type=Path, required=True)
    release.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "freeze-corpora":
        lock = create_corpus_lock(args.protocol)
        write_json_once(args.output.resolve(), lock)
        print(args.output.resolve())
    elif args.command == "verify-corpora":
        verify_corpus_lock(args.protocol, args.corpus_lock)
        print("corpus lock verified")
    elif args.command == "freeze-candidates":
        lock = create_candidate_lock(args.protocol, args.corpus_lock, args.registry)
        write_json_once(args.output.resolve(), lock)
        print(args.output.resolve())
    elif args.command == "release-holdout":
        release_holdout(
            args.protocol,
            args.corpus_lock,
            args.candidate_lock,
            args.output_dir,
        )
        print(args.output_dir.resolve())
    else:  # pragma: no cover - argparse enforces the command set.
        raise AssertionError(args.command)


if __name__ == "__main__":
    main()
