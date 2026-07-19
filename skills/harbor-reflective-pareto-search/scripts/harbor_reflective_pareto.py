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
import math
import os
import re
import shutil
import stat
import subprocess
from collections import Counter, defaultdict
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


def finite_number(value: Any, location: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be numeric.")
    normalized = float(value)
    if not math.isfinite(normalized):
        raise ValueError(f"{location} must be finite.")
    return normalized


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
    name = frontmatter.get("name")
    if not isinstance(name, str) or not name:
        raise ValueError(f"{skill_file} frontmatter.name must be a string.")
    if (
        name != name.strip()
        or not PORTABLE_SKILL_NAME.fullmatch(name)
        or name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(
            "SKILL.md frontmatter.name must be an exact portable skill basename "
            "(1-64 lowercase letters, digits, or interior hyphens): "
            f"{skill_file}: {name!r}. No fallback name is used because that "
            "would change the skill identity installed by Harbor."
        )
    return name


def candidate_complexity(skill: Path) -> int:
    return len((skill / "SKILL.md").read_text(encoding="utf-8").splitlines())


def staged_skill_path(container: Path, logical_name: str) -> Path:
    """Return a confined path whose basename is the validated skill identity."""

    if (
        not PORTABLE_SKILL_NAME.fullmatch(logical_name)
        or logical_name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(f"Unsafe logical skill name: {logical_name!r}")
    skills_directory = container.resolve() / "skills"
    destination = skills_directory / logical_name
    if destination.parent != skills_directory or destination.name != logical_name:
        raise ValueError(
            f"Logical skill name escapes its staging directory: {logical_name!r}"
        )
    return destination


def stage_skill_for_evaluation(
    source: Path, container: Path, logical_name: str
) -> tuple[Path, str]:
    """Freeze one candidate at a name-preserving path before Harbor sees it."""

    assert_self_contained_bundle(source, "source candidate skill")
    destination = staged_skill_path(container, logical_name)
    if destination.exists():
        raise ValueError(f"Candidate staging destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_digest = compute_skill_digest(source)
    shutil.copytree(source, destination, symlinks=True)
    assert_self_contained_bundle(destination, "staged candidate skill")
    staged_digest = compute_skill_digest(destination)
    if staged_digest != source_digest:
        raise ValueError(
            "Staged candidate skill digest differs from its source: "
            f"{source_digest} != {staged_digest}: {destination}"
        )
    if parse_skill_name(destination) != logical_name:
        raise ValueError(
            f"Staged candidate changed logical skill identity: {destination}"
        )
    return destination, source_digest


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
    baseline_skill = resolve_bundle_path(
        base, search.get("baselineSkill"), "search.baselineSkill"
    )
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
        skill = resolve_bundle_path(
            base, item.get("skill"), f"candidates[{index}].skill"
        )
        assert_self_contained_bundle(skill, f"candidates[{index}].skill")
        skill_name = parse_skill_name(skill)
        if skill_name != baseline_name:
            raise ValueError(
                f"Candidate {candidate_id} changed skill name from "
                f"'{baseline_name}' to '{skill_name}'."
            )
        parents = item.get("parents", [])
        if (
            not isinstance(parents, list)
            or any(not isinstance(value, str) or not value.strip() for value in parents)
            or len(parents) != len(set(parents))
        ):
            raise ValueError(f"candidates[{index}].parents must be a list of ids.")
        candidates.append(
            {
                "id": candidate_id,
                "skill": skill,
                "skillName": skill_name,
                "parents": [value.strip() for value in parents],
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
    if baseline_candidate["parents"]:
        raise ValueError("The baseline candidate must not declare parents.")
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
    previous_generation_log = (
        resolve_path(
            base,
            search["previousGenerationLog"],
            "search.previousGenerationLog",
        )
        if search.get("previousGenerationLog")
        else None
    )
    if generation == 0 and previous_generation_log is not None:
        raise ValueError(
            "Generation zero must not declare search.previousGenerationLog."
        )
    if generation > 0 and previous_generation_log is None:
        raise ValueError(
            "search.previousGenerationLog is required after generation zero."
        )
    if generation == 0:
        unknown_parents = sorted(
            {
                parent
                for candidate in candidates
                for parent in candidate["parents"]
                if parent not in ids
            }
        )
        if unknown_parents:
            raise ValueError(
                "Generation-zero candidate parents must be declared candidates: "
                + ", ".join(unknown_parents)
            )
    parents_by_id = {item["id"]: item["parents"] for item in candidates}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(candidate_id: str) -> None:
        if candidate_id in visiting:
            raise ValueError(
                f"Candidate parent lineage contains a cycle at {candidate_id}."
            )
        if candidate_id in visited:
            return
        visiting.add(candidate_id)
        for parent_id in parents_by_id[candidate_id]:
            if parent_id in parents_by_id:
                visit(parent_id)
        visiting.remove(candidate_id)
        visited.add(candidate_id)

    for candidate_id in sorted(ids):
        visit(candidate_id)

    reward_key = require_string(harbor.get("rewardKey", "reward"), "harbor.rewardKey")
    pass_threshold = finite_number(harbor.get("passThreshold", 1), "harbor.passThreshold")
    raw_required_rewards = require_mapping(
        harbor.get("requiredRewards", {}), "harbor.requiredRewards"
    )
    required_rewards: dict[str, float] = {}
    for raw_key, raw_threshold in raw_required_rewards.items():
        key = require_string(raw_key, "harbor.requiredRewards key")
        if isinstance(raw_threshold, bool) or not isinstance(
            raw_threshold, (int, float)
        ):
            raise ValueError(f"harbor.requiredRewards.{key} must be numeric.")
        threshold = float(raw_threshold)
        if not math.isfinite(threshold):
            raise ValueError(f"harbor.requiredRewards.{key} must be finite.")
        required_rewards[key] = threshold
    config = {
        "id": search_id,
        "baselineSkill": baseline_skill,
        "baselineName": baseline_name,
        "baselineCandidate": baseline_id,
        "selectedCandidate": selected_id,
        "developmentArchive": development_archive,
        "previousGenerationLog": previous_generation_log,
        "outputDir": output_dir,
        "generation": generation,
        "developmentJob": development_job,
        "holdoutJob": holdout_job,
        "requiredEnv": required_env,
        "rewardKey": reward_key,
        "passThreshold": pass_threshold,
        "requiredRewards": required_rewards,
        "candidates": candidates,
        "promotion": {
            "minimumMeanGain": finite_number(
                promotion.get("minimumMeanGain", 0), "promotion.minimumMeanGain"
            ),
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
    retry = value.get("retry")
    if isinstance(retry, dict):
        # Harbor models retry filters as unique sets. Canonicalize them so a
        # development profile remains stable across separate CLI processes.
        for key in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(key), list):
                retry[key] = sorted(retry[key])
    for agent in value.get("agents", []):
        agent["skills"] = ["<candidate-skill>"]
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def configured_agent_profile(agent: Any) -> tuple[str, str]:
    return str(agent.name), str(agent.model_name or "")


def observed_trial_profile(trial: TrialResult) -> tuple[str, str, str]:
    model = ""
    if trial.agent_info.model_info is not None:
        info = trial.agent_info.model_info
        model = "/".join(
            part for part in (str(info.provider or ""), str(info.name or "")) if part
        )
    return trial.agent_info.name, trial.agent_info.version, model


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


def observed_profiles(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {"agent": agent, "agentVersion": agent_version, "model": model}
        for agent, agent_version, model in sorted(
            {
                (trial["agent"], trial["agentVersion"], trial["model"])
                for record in records
                for trial in record["trials"]
            }
        )
    ]


def locked_task_digest(value: str) -> str:
    if re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        return value
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_json_digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def archive_seal_payload(archive: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": archive.get("schemaVersion"),
        "source": archive.get("source"),
        "strategy": archive.get("strategy"),
        "searchId": archive.get("searchId"),
        "generation": archive.get("generation"),
        "previousGenerationSeal": archive.get("previousGenerationSeal"),
        "developmentProfileDigest": archive.get("developmentProfileDigest"),
        "caseNames": archive.get("caseNames"),
        "caseChecksums": archive.get("caseChecksums"),
        "candidateResults": archive.get("candidateResults"),
        "archive": archive.get("archive"),
    }


def development_case_identities(
    records: list[dict[str, Any]],
) -> tuple[list[str], list[str]]:
    if not records:
        raise ValueError("Development archive has no candidate results.")
    identities = [
        {
            (str(case["taskName"]), str(case["taskChecksum"]))
            for case in record.get("cases", [])
        }
        for record in records
    ]
    if not identities[0] or any(value != identities[0] for value in identities[1:]):
        raise ValueError(
            "Development candidate results disagree on task names or checksums."
        )
    return (
        sorted({name for name, _ in identities[0]}),
        sorted({checksum for _, checksum in identities[0]}),
    )


def validate_archive_seal(archive: dict[str, Any], label: str) -> None:
    seal = require_string(archive.get("generationSeal"), f"{label}.generationSeal")
    if seal != canonical_json_digest(archive_seal_payload(archive)):
        raise ValueError(f"{label} generation seal is invalid.")


def development_profile(
    config: dict[str, Any],
    harbor_version: str,
    observed_job_signature: str,
    observed_evaluation_profiles: list[dict[str, str]],
) -> dict[str, Any]:
    holdout_signature = (
        job_signature(load_job_template(config["holdoutJob"]))
        if config["holdoutJob"] is not None
        else None
    )
    declared_development_signature = job_signature(
        load_job_template(config["developmentJob"])
    )
    return {
        "schemaVersion": 1,
        "harborVersion": harbor_version,
        "declaredDevelopmentJobSignature": declared_development_signature,
        "observedDevelopmentJobSignature": observed_job_signature,
        "observedEvaluationProfiles": observed_evaluation_profiles,
        "declaredObservedDevelopmentMatch": (
            declared_development_signature == observed_job_signature
        ),
        "holdoutJobSignature": holdout_signature,
        "rewardKey": config["rewardKey"],
        "passThreshold": config["passThreshold"],
        "requiredRewardThresholds": config["requiredRewards"],
        "baselineCandidate": config["baselineCandidate"],
        "baselineSkillName": config["baselineName"],
        "baselineSkillDigest": compute_skill_digest(config["baselineSkill"]),
        "promotionRules": config["promotion"],
    }


def validate_previous_generation_archive(
    config: dict[str, Any], current_profile: dict[str, Any]
) -> str | None:
    path = config["previousGenerationLog"]
    if path is None:
        return None
    previous = read_json(path)
    if (
        previous.get("schemaVersion") != 1
        or previous.get("source") != "harbor"
        or previous.get("strategy") != "reflective-pareto-search"
    ):
        raise ValueError("Previous generation archive has the wrong schema or source.")
    if previous.get("searchId") != config["id"]:
        raise ValueError("Previous generation archive belongs to another searchId.")
    if previous.get("generation") != config["generation"] - 1:
        raise ValueError(
            "Previous generation archive is not the immediate predecessor."
        )
    validate_archive_seal(previous, "previousGenerationLog")
    previous_profile = require_mapping(
        previous.get("developmentProfile"),
        "previousGenerationLog.developmentProfile",
    )
    previous_profile_digest = require_string(
        previous.get("developmentProfileDigest"),
        "previousGenerationLog.developmentProfileDigest",
    )
    if previous_profile_digest != canonical_json_digest(previous_profile):
        raise ValueError("Previous generation development profile digest is invalid.")
    if previous_profile != current_profile:
        raise ValueError(
            "Current Pareto generation evaluation/promotion profile drifted from "
            "the previous generation."
        )
    previous_parent_ids = {
        str(item.get("candidateId"))
        for item in require_list(
            previous.get("archive"), "previousGenerationLog.archive"
        )
        if isinstance(item, dict) and item.get("candidateId") is not None
    }
    current_ids = {item["id"] for item in config["candidates"]}
    lineage_links = 0
    for candidate in config["candidates"]:
        for parent in candidate["parents"]:
            if parent not in previous_parent_ids and parent not in current_ids:
                raise ValueError(
                    f"Candidate {candidate['id']} references parent {parent!r} that "
                    "is neither current nor in the previous Pareto archive."
                )
            if parent in previous_parent_ids:
                lineage_links += 1
    if lineage_links == 0:
        raise ValueError(
            "A post-zero Pareto generation must cite at least one parent from the "
            "previous Pareto archive."
        )
    return str(previous["generationSeal"])


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


def optional_diagnostic_value(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list)):
        return None
    rendered = str(value).strip()
    return rendered[:300] if rendered else None


def collect_verifier_diagnostics(trial_dir: Path) -> list[dict[str, Any]]:
    verifier_dir = trial_dir / "verifier"
    paths = (
        sorted(verifier_dir.rglob("diagnostics.json"))
        if verifier_dir.is_dir()
        else []
    )
    diagnostics = []
    for path in paths:
        payload = read_json(path)
        diagnostics.append(
            {
                "path": path.relative_to(trial_dir).as_posix(),
                "status": optional_diagnostic_value(payload.get("status")),
                "failureDomain": optional_diagnostic_value(
                    payload.get("failure_domain")
                ),
                "terminalOutcome": optional_diagnostic_value(
                    payload.get("terminal_outcome")
                ),
                "errorCode": optional_diagnostic_value(payload.get("error_code")),
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


def external_evaluation_failure(
    diagnostics: list[dict[str, Any]],
) -> dict[str, Any] | None:
    for diagnostic in diagnostics:
        failure_domain = failure_domain_from_signal(diagnostic["failureDomain"])
        if failure_domain is None:
            for key in ("status", "terminalOutcome", "errorCode"):
                failure_domain = failure_domain_from_signal(diagnostic[key])
                if failure_domain is not None:
                    break
        if failure_domain is not None:
            return {
                "failureDomain": failure_domain,
                "status": diagnostic["status"],
                "terminalOutcome": diagnostic["terminalOutcome"],
                "errorCode": diagnostic["errorCode"],
                "diagnosticsPath": diagnostic["path"],
            }
    return None


def diagnostic_summary(diagnostics: list[dict[str, Any]]) -> dict[str, Any]:
    failure = external_evaluation_failure(diagnostics)

    def values(key: str) -> list[str]:
        return sorted({row[key] for row in diagnostics if row[key] is not None})

    statuses = values("status")
    domains = values("failureDomain")
    outcomes = values("terminalOutcome")
    error_codes = values("errorCode")
    classification = "unavailable"
    if failure is not None:
        classification = f"{failure['failureDomain']}-failure"
    elif diagnostics:
        classification = "available"
    return {
        "verifierDiagnostics": diagnostics,
        "diagnosticsAvailable": bool(diagnostics),
        "diagnosticsFileCount": len(diagnostics),
        "diagnosticsStatus": statuses[0] if len(statuses) == 1 else None,
        "failureDomain": domains[0] if len(domains) == 1 else None,
        "terminalOutcome": outcomes[0] if len(outcomes) == 1 else None,
        "errorCode": error_codes[0] if len(error_codes) == 1 else None,
        "diagnosticsClassification": classification,
        "providerFailure": (
            failure is not None and failure["failureDomain"] == "provider"
        ),
        "infrastructureFailure": failure is not None,
        "infrastructureFailureDomain": (
            failure["failureDomain"] if failure is not None else None
        ),
        "evaluationFailure": failure,
    }


def trial_record(
    trial: TrialResult,
    result_path: Path,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
) -> dict[str, Any]:
    rewards = trial.verifier_result.rewards if trial.verifier_result else {}
    reward_value = rewards.get(reward_key) if rewards else None
    error = (
        trial.exception_info.model_dump(mode="json")
        if trial.exception_info is not None
        else None
    )
    trial_dir = result_path.parent
    diagnostics = diagnostic_summary(collect_verifier_diagnostics(trial_dir))
    if (
        reward_value is None
        and error is None
        and not diagnostics["infrastructureFailure"]
    ):
        raise ValueError(
            f"Trial {trial.trial_name} has no '{reward_key}' reward and no exception."
        )
    reported_reward = float(reward_value) if reward_value is not None else None
    if reported_reward is not None and not math.isfinite(reported_reward):
        raise ValueError(f"Trial {trial.trial_name} has a non-finite reward.")
    reward = (
        None
        if diagnostics["infrastructureFailure"]
        else reported_reward if reported_reward is not None else 0.0
    )
    reported_required_rewards: dict[str, float | None] = {}
    qualification_failures: list[dict[str, Any]] = []
    for key, threshold in sorted(required_reward_thresholds.items()):
        raw_value = rewards.get(key) if rewards else None
        if raw_value is None:
            reported_required_rewards[key] = None
            qualification_failures.append(
                {"key": key, "threshold": threshold, "actual": None, "reason": "missing"}
            )
            continue
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
            raise ValueError(
                f"Trial {trial.trial_name} required reward '{key}' must be numeric."
            )
        actual = float(raw_value)
        if not math.isfinite(actual):
            raise ValueError(
                f"Trial {trial.trial_name} required reward '{key}' must be finite."
            )
        reported_required_rewards[key] = actual
        if actual < threshold:
            qualification_failures.append(
                {
                    "key": key,
                    "threshold": threshold,
                    "actual": actual,
                    "reason": "below-threshold",
                }
            )
    required_rewards = (
        {key: None for key in reported_required_rewards}
        if diagnostics["infrastructureFailure"]
        else dict(reported_required_rewards)
    )
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
        "reportedReward": reported_reward,
        "passed": (
            error is None
            and not diagnostics["infrastructureFailure"]
            and reward is not None
            and reward >= pass_threshold
        ),
        "evaluable": not diagnostics["infrastructureFailure"],
        "requiredRewards": required_rewards,
        "reportedRequiredRewards": reported_required_rewards,
        "qualificationPassed": (
            error is None
            and not diagnostics["infrastructureFailure"]
            and not qualification_failures
        ),
        "qualificationFailures": qualification_failures,
        "error": error,
        "resultPath": str(result_path),
        "trajectoryPath": str(trajectory_paths[0]) if trajectory_paths else None,
        "verifierFiles": [str(path) for path in verifier_paths],
        "agentOutputFiles": [str(path) for path in agent_output_paths],
        "verifierExcerpt": bounded_excerpt(verifier_paths),
        "trajectoryExcerpt": bounded_excerpt(trajectory_paths),
        "agentOutputExcerpt": bounded_excerpt(agent_output_paths),
        **diagnostics,
    }


def load_native_job(
    directory: Path,
    *,
    candidate: dict[str, Any],
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
) -> dict[str, Any]:
    directory = directory.resolve()
    live_evaluation = "evaluatedSkill" in candidate
    source_digest = compute_skill_digest(candidate["skill"])
    if candidate.get("sourceSkillDigest", source_digest) != source_digest:
        raise ValueError(
            f"Source skill changed after staging candidate {candidate['id']}."
        )
    job_config = JobConfig.model_validate_json(
        (directory / "config.json").read_text(encoding="utf-8")
    )
    observed_skill_lists = [
        [Path(str(skill)).expanduser().resolve() for skill in agent.skills]
        for agent in job_config.agents
    ]
    expected_evaluated_skill = (
        candidate["evaluatedSkill"].resolve()
        if live_evaluation
        else candidate["skill"]
    )
    config_source_matches = bool(observed_skill_lists) and all(
        skills == [expected_evaluated_skill] for skills in observed_skill_lists
    )
    if live_evaluation and not config_source_matches:
        raise ValueError(
            f"Live Harbor job skill path mismatch for candidate {candidate['id']}: "
            f"expected only {expected_evaluated_skill}, observed {observed_skill_lists}."
        )
    evaluated_skill = expected_evaluated_skill
    assert_self_contained_bundle(evaluated_skill, "evaluated candidate skill")
    evaluated_digest = compute_skill_digest(evaluated_skill)
    if evaluated_digest != source_digest:
        raise ValueError(
            f"Evaluated skill digest mismatch for candidate {candidate['id']}: "
            f"source {source_digest}, evaluated {evaluated_digest}."
        )
    if live_evaluation:
        identity_mode = "canonical-live"
        promotion_eligible_provenance = True
        identity_reason = None
    elif config_source_matches and evaluated_skill.name == candidate["skillName"]:
        identity_mode = "canonical-analyze"
        promotion_eligible_provenance = True
        identity_reason = None
    elif config_source_matches:
        identity_mode = "legacy-alias"
        promotion_eligible_provenance = False
        identity_reason = (
            f"Evaluated source basename {evaluated_skill.name!r} differs from logical "
            f"name {candidate['skillName']!r}."
        )
    else:
        identity_mode = "source-mismatch"
        promotion_eligible_provenance = False
        identity_reason = (
            "Analyze-only job config does not install exactly the declared candidate "
            f"source {candidate['skill']}."
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
    if not trials:
        raise ValueError(f"Completed Harbor job contains no trials: {directory}")
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

    declared_agent_profiles = {
        configured_agent_profile(agent) for agent in job_config.agents
    }
    for trial in trials:
        if trial.config.trial_name != trial.trial_name:
            raise ValueError(
                f"TrialResult.config trial_name differs from trial_name for "
                f"{trial.trial_name} in {directory}."
            )
        task_id = trial.task_id.model_dump(mode="json", exclude_none=True)
        configured_task = trial.config.task.model_dump(mode="json", exclude_none=True)
        if (
            task_id.get("path") is not None
            and normalized_path_value(task_id.get("path"))
            != normalized_path_value(configured_task.get("path"))
        ):
            raise ValueError(
                f"TrialResult.config task differs from task_id for "
                f"{trial.trial_name} in {directory}."
            )
        trial_skills = [
            Path(str(skill)).expanduser().resolve()
            for skill in trial.config.agent.skills
        ]
        if trial_skills != [evaluated_skill]:
            raise ValueError(
                f"Trial {trial.trial_name} does not install exactly candidate "
                f"{candidate['id']} at {evaluated_skill}."
            )
        trial_declared_profile = configured_agent_profile(trial.config.agent)
        if trial_declared_profile not in declared_agent_profiles:
            raise ValueError(
                f"Trial {trial.trial_name} agent/model profile differs from the "
                f"declared job config in {directory}."
            )
        observed_agent, _, observed_model = observed_trial_profile(trial)
        if (observed_agent, observed_model) != trial_declared_profile:
            raise ValueError(
                f"Trial {trial.trial_name} observed agent/model profile differs "
                f"from TrialResult.config in {directory}."
            )

    attempt_cells = Counter(
        (
            trial.task_name,
            trial.task_checksum,
            trial.agent_info.name,
            observed_trial_profile(trial)[2],
        )
        for trial in trials
    )
    unexpected_attempts = {
        "|".join(cell): count
        for cell, count in attempt_cells.items()
        if count != job_config.n_attempts
    }
    if unexpected_attempts:
        raise ValueError(
            f"Observed trial attempts differ from declared n_attempts="
            f"{job_config.n_attempts} in {directory}: {unexpected_attempts}"
        )

    records = [
        trial_record(
            trial,
            path,
            reward_key,
            pass_threshold,
            required_reward_thresholds,
        )
        for trial, path in zip(trials, trial_paths, strict=True)
    ]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["caseKey"]].append(record)
    cases = []
    for case_key in sorted(grouped):
        attempts = grouped[case_key]
        observed_rewards = [
            item["reportedReward"]
            for item in attempts
            if item["reportedReward"] is not None
        ]
        evaluable_rewards = [
            item["reward"]
            for item in attempts
            if item["evaluable"] and item["reward"] is not None
        ]
        fully_evaluable = len(evaluable_rewards) == len(attempts)
        cases.append(
            {
                "caseKey": case_key,
                "taskName": attempts[0]["taskName"],
                "taskChecksum": attempts[0]["taskChecksum"],
                "agent": attempts[0]["agent"],
                "model": attempts[0]["model"],
                "attempts": len(attempts),
                "meanReward": (
                    sum(evaluable_rewards) / len(evaluable_rewards)
                    if fully_evaluable
                    else None
                ),
                "observedMeanReward": (
                    sum(observed_rewards) / len(observed_rewards)
                    if observed_rewards
                    else None
                ),
                "evaluableMeanReward": (
                    sum(evaluable_rewards) / len(evaluable_rewards)
                    if evaluable_rewards
                    else None
                ),
                "evaluable": fully_evaluable,
                "evaluableAttempts": len(evaluable_rewards),
                "passRate": sum(1 for item in attempts if item["passed"]) / len(attempts),
                "errorCount": sum(1 for item in attempts if item["error"] is not None),
                "diagnosticsAvailableAttempts": sum(
                    item["diagnosticsAvailable"] for item in attempts
                ),
                "providerFailureAttempts": sum(
                    item["providerFailure"] for item in attempts
                ),
                "infrastructureFailureAttempts": sum(
                    item["infrastructureFailure"] for item in attempts
                ),
                "qualificationPassRate": (
                    sum(1 for item in attempts if item["qualificationPassed"])
                    / len(attempts)
                ),
            }
        )

    lock_path = directory / "lock.json"
    lock_signature = None
    provenance: list[dict[str, Any]] = []
    harbor_version = version("harbor")
    if lock_path.is_file():
        lock = JobLock.model_validate_json(lock_path.read_text(encoding="utf-8"))
        if lock.harbor.version and lock.harbor.version != version("harbor"):
            raise ValueError(
                f"Harbor artifact version drift in {directory}: "
                f"lock={lock.harbor.version}, runtime={version('harbor')}."
            )
        if len(lock.trials) != len(trials):
            raise ValueError(
                f"Harbor lock/result trial-count drift in {directory}: "
                f"locks={len(lock.trials)}, results={len(trials)}."
            )
        lock_signature, provenance = canonical_lock(lock)
        harbor_version = lock.harbor.version or harbor_version
        expected_digest = evaluated_digest
        observed = {(item["name"], item["digest"]) for item in provenance}
        expected = {(candidate["skillName"], expected_digest)}
        if observed != expected:
            raise ValueError(
                f"Harbor lock skill digest mismatch or identity mismatch for candidate "
                f"{candidate['id']}: expected {sorted(expected)}, "
                f"observed {sorted(observed)}"
            )
        locked_sources = {
            Path(str(item["source"])).expanduser().resolve()
            for item in provenance
        }
        if locked_sources != {evaluated_skill.resolve()}:
            raise ValueError(
                f"Harbor lock skill source mismatch for candidate "
                f"{candidate['id']}: expected {evaluated_skill.resolve()}, "
                f"observed {sorted(str(path) for path in locked_sources)}"
            )
        for index, trial_lock in enumerate(lock.trials):
            if len(trial_lock.skills) != 1 or len(trial_lock.agent.skills) != 1:
                raise ValueError(
                    f"Trial lock {index + 1} in {directory} must contain exactly "
                    "one candidate skill and one agent skill reference."
                )
            locked_skill = trial_lock.skills[0]
            locked_source = Path(str(locked_skill.source)).expanduser().resolve()
            locked_agent_source = Path(
                str(trial_lock.agent.skills[0])
            ).expanduser().resolve()
            if (
                locked_skill.name != candidate["skillName"]
                or locked_skill.digest != evaluated_digest
                or locked_source != evaluated_skill
                or locked_agent_source != evaluated_skill
            ):
                raise ValueError(
                    f"Trial lock {index + 1} candidate provenance mismatch in "
                    f"{directory}."
                )
        result_lock_cells = Counter(
            (
                locked_task_digest(trial.task_checksum),
                trial.agent_info.name,
                observed_trial_profile(trial)[2],
            )
            for trial in trials
        )
        lock_cells = Counter(
            (
                trial_lock.task.digest,
                trial_lock.agent.name,
                str(trial_lock.agent.model_name or ""),
            )
            for trial_lock in lock.trials
        )
        if result_lock_cells != lock_cells:
            raise ValueError(
                f"Harbor lock/result task, agent, model, or attempt drift in "
                f"{directory}."
            )
        result_runtime_cells = Counter(
            json.dumps(
                trial_runtime_projection(trial.config, lock=False),
                sort_keys=True,
                separators=(",", ":"),
            )
            for trial in trials
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
    promotion_eligible_provenance = (
        promotion_eligible_provenance and lock_path.is_file()
    )

    error_count = sum(1 for item in records if item["error"] is not None)
    unqualified_count = sum(not item["qualificationPassed"] for item in records)
    diagnostics_available = sum(item["diagnosticsAvailable"] for item in records)
    provider_failures = sum(item["providerFailure"] for item in records)
    infrastructure_failures = sum(
        item["infrastructureFailure"] for item in records
    )
    evaluable_rewards = [
        item["reward"]
        for item in records
        if item["evaluable"] and item["reward"] is not None
    ]
    observed_rewards = [
        item["reportedReward"]
        for item in records
        if item["reportedReward"] is not None
    ]
    missing_required = sum(
        failure["reason"] == "missing"
        for item in records
        for failure in item["qualificationFailures"]
    )
    below_threshold = sum(
        failure["reason"] == "below-threshold"
        for item in records
        for failure in item["qualificationFailures"]
    )
    evaluable = infrastructure_failures == 0
    qualification_passed = (
        evaluable and error_count == 0 and unqualified_count == 0
    )
    return {
        "candidateId": candidate["id"],
        "skill": str(candidate["skill"]),
        "evaluatedSkill": str(evaluated_skill),
        "skillDigest": evaluated_digest,
        "sourceSkillDigest": source_digest,
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
        "identityMode": identity_mode,
        "identityReason": identity_reason,
        "promotionEligibleProvenance": promotion_eligible_provenance,
        "exploratory": not promotion_eligible_provenance,
        "requiredRewardThresholds": required_reward_thresholds,
        "evaluable": evaluable,
        "qualification": {
            "passed": qualification_passed,
            "unqualifiedTrials": unqualified_count,
            "missingRequiredRewards": missing_required,
            "belowThresholdRewards": below_threshold,
            "providerFailureTrials": provider_failures,
            "infrastructureFailureTrials": infrastructure_failures,
        },
        "summary": {
            "expectedTrials": job_result.n_total_trials,
            "completedTrials": len(records),
            "errorCount": error_count,
            "meanReward": (
                sum(evaluable_rewards) / len(evaluable_rewards)
                if evaluable and evaluable_rewards
                else None
            ),
            "observedMeanReward": (
                sum(observed_rewards) / len(observed_rewards)
                if observed_rewards
                else None
            ),
            "evaluableMeanReward": (
                sum(evaluable_rewards) / len(evaluable_rewards)
                if evaluable_rewards
                else None
            ),
            "evaluableTrials": len(evaluable_rewards),
            "nonEvaluableTrials": infrastructure_failures,
            "diagnosticsAvailableTrials": diagnostics_available,
            "diagnosticsUnavailableTrials": len(records) - diagnostics_available,
            "providerFailureTrials": provider_failures,
            "infrastructureFailureTrials": infrastructure_failures,
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
    harbor_versions = {item["harborVersion"] for item in records}
    if len(harbor_versions) != 1:
        raise ValueError("Candidate Harbor jobs use different Harbor versions.")
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
    profile = development_profile(
        config,
        records[0]["harborVersion"],
        records[0]["jobSignature"],
        observed_profiles(records),
    )
    vectors: dict[str, list[float]] = {}
    cases_by_candidate: dict[str, dict[str, dict[str, Any]]] = {}
    by_id = {record["candidateId"]: record for record in records}
    for record in records:
        cases = {row["caseKey"]: row for row in record["cases"]}
        cases_by_candidate[record["candidateId"]] = cases
        vectors[record["candidateId"]] = [
            cases[case_key]["meanReward"] for case_key in case_keys
        ]

    qualified_ids = {
        record["candidateId"]
        for record in records
        if record["evaluable"] and record["qualification"]["passed"]
    }
    representatives: list[str] = []
    for vector in sorted(
        {
            tuple(value)
            for candidate_id, value in vectors.items()
            if candidate_id in qualified_ids
        }
    ):
        tied = [
            record
            for record in records
            if record["candidateId"] in qualified_ids
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
                "qualified": True,
                "evaluable": True,
                "promotionEligibleProvenance": record[
                    "promotionEligibleProvenance"
                ],
                "identityMode": record["identityMode"],
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
    case_names, case_checksums = development_case_identities(records)
    previous_generation_seal = validate_previous_generation_archive(config, profile)
    result = {
        "schemaVersion": 1,
        "source": "harbor",
        "strategy": "reflective-pareto-search",
        "searchId": config["id"],
        "generation": config["generation"],
        "previousGenerationSeal": previous_generation_seal,
        "previousGenerationLog": (
            str(config["previousGenerationLog"])
            if config["previousGenerationLog"] is not None
            else None
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "harborVersion": records[0]["harborVersion"],
        "developmentProfile": profile,
        "developmentProfileDigest": canonical_json_digest(profile),
        "rewardKey": config["rewardKey"],
        "passThreshold": config["passThreshold"],
        "requiredRewardThresholds": config["requiredRewards"],
        "holdoutDataUsed": False,
        "promotionEligibleProfile": profile[
            "declaredObservedDevelopmentMatch"
        ],
        "caseKeys": case_keys,
        "caseNames": case_names,
        "caseChecksums": case_checksums,
        "evaluationCounts": {
            "candidateCount": len(records),
            "evaluableCandidates": sum(record["evaluable"] for record in records),
            "nonEvaluableCandidates": sum(
                not record["evaluable"] for record in records
            ),
            "trialCount": sum(
                record["summary"]["completedTrials"] for record in records
            ),
            "diagnosticsAvailableTrials": sum(
                record["summary"]["diagnosticsAvailableTrials"]
                for record in records
            ),
            "diagnosticsUnavailableTrials": sum(
                record["summary"]["diagnosticsUnavailableTrials"]
                for record in records
            ),
            "providerFailureTrials": sum(
                record["summary"]["providerFailureTrials"] for record in records
            ),
            "infrastructureFailureTrials": sum(
                record["summary"]["infrastructureFailureTrials"]
                for record in records
            ),
        },
        "candidateResults": records,
        "archive": archive,
        "bestAggregateCandidate": archive[0]["candidateId"] if archive else None,
        "reflectionPlans": reflections,
        "mergePlans": merge_plans,
        "limitations": (
            []
            if records[0]["lockPresent"]
            else ["Legacy jobs have no lock.json; comparability used config and observed cases."]
        ),
    }
    result["generationSeal"] = canonical_json_digest(archive_seal_payload(result))
    return result


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
        evaluated_candidate = candidate
        if analyze_only:
            job_dir = candidate[job_field]
            if job_dir is None:
                raise ValueError(
                    f"Candidate {candidate_id} must declare {job_field} for --analyze-only."
                )
        else:
            prefix = f"g{config['generation']:03d}-" if phase == "development" else ""
            job_name = f"{config['id']}-{prefix}{phase}-{candidate_id}"
            staging_container = generation_dir / "candidate-staging" / candidate_id
            staged_skill, source_digest = stage_skill_for_evaluation(
                candidate["skill"], staging_container, config["baselineName"]
            )
            evaluated_candidate = {
                **candidate,
                "evaluatedSkill": staged_skill,
                "sourceSkillDigest": source_digest,
            }
            job_dir = asyncio.run(
                execute_job(template, staged_skill, jobs_dir, job_name)
            )
        records.append(
            load_native_job(
                job_dir,
                candidate=evaluated_candidate,
                reward_key=config["rewardKey"],
                pass_threshold=config["passThreshold"],
                required_reward_thresholds=config["requiredRewards"],
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
        json.dumps(archive, indent=2, allow_nan=False) + "\n", encoding="utf-8"
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
        json.dumps(reflection, indent=2, allow_nan=False) + "\n", encoding="utf-8"
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
    *,
    profile_matches_declared: bool,
) -> dict[str, Any]:
    validate_comparable([baseline, candidate])
    baseline_cases = {row["caseKey"]: row for row in baseline["cases"]}
    candidate_cases = {row["caseKey"]: row for row in candidate["cases"]}
    per_case = []
    regressions = []
    for case_key in sorted(baseline_cases):
        left = baseline_cases[case_key]
        right = candidate_cases[case_key]
        case_evaluable = left["evaluable"] and right["evaluable"]
        delta = (
            right["meanReward"] - left["meanReward"]
            if case_evaluable
            else None
        )
        observed_delta = (
            right["observedMeanReward"] - left["observedMeanReward"]
            if left["observedMeanReward"] is not None
            and right["observedMeanReward"] is not None
            else None
        )
        if delta is not None and delta < 0:
            regressions.append(case_key)
        per_case.append(
            {
                "caseKey": case_key,
                "taskName": left["taskName"],
                "agent": left["agent"],
                "model": left["model"],
                "evaluable": case_evaluable,
                "baselineMeanReward": left["meanReward"],
                "candidateMeanReward": right["meanReward"],
                "delta": delta,
                "observedBaselineMeanReward": left["observedMeanReward"],
                "observedCandidateMeanReward": right["observedMeanReward"],
                "observedDelta": observed_delta,
                "baselineInfrastructureFailureAttempts": left[
                    "infrastructureFailureAttempts"
                ],
                "candidateInfrastructureFailureAttempts": right[
                    "infrastructureFailureAttempts"
                ],
            }
        )
    baseline_mean = baseline["summary"]["meanReward"]
    candidate_mean = candidate["summary"]["meanReward"]
    mean_gain = (
        candidate_mean - baseline_mean
        if baseline_mean is not None and candidate_mean is not None
        else None
    )
    holdout_evaluable = baseline["evaluable"] and candidate["evaluable"]
    rules = config["promotion"]
    promoted = (
        holdout_evaluable
        and profile_matches_declared
        and baseline["promotionEligibleProvenance"]
        and candidate["promotionEligibleProvenance"]
        and mean_gain is not None
        and mean_gain >= rules["minimumMeanGain"]
        and (rules["allowCaseRegressions"] or not regressions)
        and candidate["qualification"]["passed"]
        and baseline["qualification"]["missingRequiredRewards"] == 0
        and candidate["qualification"]["missingRequiredRewards"] == 0
        and (
            not rules["requireNoErrors"]
            or candidate["summary"]["errorCount"] == 0
        )
    )
    return {
        "status": "complete" if holdout_evaluable else "non-evaluable",
        "evaluable": holdout_evaluable,
        "blocked": not holdout_evaluable,
        "blockReason": (
            None if holdout_evaluable else "provider-or-infrastructure-failure"
        ),
        "baselineCandidate": baseline["candidateId"],
        "selectedCandidate": candidate["candidateId"],
        "baselineMeanReward": baseline_mean,
        "candidateMeanReward": candidate_mean,
        "meanGain": mean_gain,
        "observedBaselineMeanReward": baseline["summary"]["observedMeanReward"],
        "observedCandidateMeanReward": candidate["summary"]["observedMeanReward"],
        "candidateErrors": candidate["summary"]["errorCount"],
        "baselineEvaluable": baseline["evaluable"],
        "candidateEvaluable": candidate["evaluable"],
        "baselineQualified": baseline["qualification"]["passed"],
        "candidateQualified": candidate["qualification"]["passed"],
        "profileMatchesDeclared": profile_matches_declared,
        "baselinePromotionEligibleProvenance": baseline[
            "promotionEligibleProvenance"
        ],
        "candidatePromotionEligibleProvenance": candidate[
            "promotionEligibleProvenance"
        ],
        "diagnosticsCounts": {
            "baseline": {
                "available": baseline["summary"]["diagnosticsAvailableTrials"],
                "unavailable": baseline["summary"]["diagnosticsUnavailableTrials"],
                "providerFailures": baseline["summary"]["providerFailureTrials"],
                "infrastructureFailures": baseline["summary"][
                    "infrastructureFailureTrials"
                ],
            },
            "candidate": {
                "available": candidate["summary"]["diagnosticsAvailableTrials"],
                "unavailable": candidate["summary"]["diagnosticsUnavailableTrials"],
                "providerFailures": candidate["summary"]["providerFailureTrials"],
                "infrastructureFailures": candidate["summary"][
                    "infrastructureFailureTrials"
                ],
            },
        },
        "requiredRewardsComplete": (
            baseline["qualification"]["missingRequiredRewards"] == 0
            and candidate["qualification"]["missingRequiredRewards"] == 0
        ),
        "regressedCases": regressions,
        "perCase": per_case,
        "promotionRules": rules,
        "promoted": promoted,
    }


def render_holdout_report(run: dict[str, Any]) -> str:
    result = run["holdout"]
    decision = "PROMOTE" if result["promoted"] else "KEEP BASELINE"

    def metric(value: float | None, *, signed: bool = False) -> str:
        if value is None:
            return "not available"
        return f"{value:+.3f}" if signed else f"{value:.3f}"

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
            f"{metric(row['baselineMeanReward'])} | "
            f"{metric(row['candidateMeanReward'])} | "
            f"{metric(row['delta'], signed=True)} |"
        )
    lines.extend(
        [
            "",
            f"Holdout evaluable: {'yes' if result['evaluable'] else 'no'}",
            f"Block reason: {result['blockReason'] or 'none'}",
            f"Overall baseline: {metric(result['baselineMeanReward'])}",
            f"Overall candidate: {metric(result['candidateMeanReward'])}",
            f"Mean gain: {metric(result['meanGain'], signed=True)}",
            f"Observed candidate reward: "
            f"{metric(result['observedCandidateMeanReward'])}",
            f"Candidate errors: {result['candidateErrors']}",
            f"Candidate qualified: {'yes' if result['candidateQualified'] else 'no'}",
            f"Regressed cases: {len(result['regressedCases'])}",
            "",
            "The source skill was not modified. Review the copied candidate and "
            "native Harbor artifacts before installing it.",
            "",
        ]
    )
    return "\n".join(lines)


def validate_development_archive_binding(
    config: dict[str, Any], archive: dict[str, Any]
) -> tuple[dict[str, Any], str]:
    if archive.get("schemaVersion") != 1:
        raise ValueError("Development archive schemaVersion must be 1.")
    if archive.get("source") != "harbor" or archive.get("strategy") != (
        "reflective-pareto-search"
    ):
        raise ValueError(
            "Development archive must be a Harbor reflective Pareto archive."
        )
    if archive.get("holdoutDataUsed") is not False:
        raise ValueError("Development archive must explicitly state holdoutDataUsed: false.")
    if archive.get("searchId") != config["id"]:
        raise ValueError(
            "Development archive searchId does not match the current search."
        )
    if archive.get("generation") != config["generation"]:
        raise ValueError(
            "Development archive generation does not match the current search."
        )

    raw_results = archive.get("candidateResults")
    if not isinstance(raw_results, list):
        raise ValueError("Development archive candidateResults must be a list.")
    candidate_results = [
        require_mapping(item, f"developmentArchive.candidateResults[{index}]")
        for index, item in enumerate(raw_results)
    ]
    validate_archive_seal(archive, "developmentArchive")
    derived_names, derived_checksums = development_case_identities(candidate_results)
    if archive.get("caseNames") != derived_names or archive.get(
        "caseChecksums"
    ) != derived_checksums:
        raise ValueError(
            "Development archive task names/checksums do not match candidateResults."
        )

    profile = require_mapping(
        archive.get("developmentProfile"), "developmentArchive.developmentProfile"
    )
    if archive.get("harborVersion") != profile.get("harborVersion"):
        raise ValueError(
            "Development archive Harbor version disagrees with its profile."
        )
    profile_digest = require_string(
        archive.get("developmentProfileDigest"),
        "developmentArchive.developmentProfileDigest",
    )
    observed_profile_digest = canonical_json_digest(profile)
    if profile_digest != observed_profile_digest:
        raise ValueError(
            "Development archive profile digest does not match its profile payload."
        )
    observed_job_signature = require_string(
        profile.get("observedDevelopmentJobSignature"),
        "developmentArchive.developmentProfile.observedDevelopmentJobSignature",
    )
    expected_profile = development_profile(
        config,
        version("harbor"),
        observed_job_signature,
        observed_profiles(candidate_results),
    )
    if profile != expected_profile:
        drift = sorted(
            key
            for key in set(profile) | set(expected_profile)
            if profile.get(key) != expected_profile.get(key)
        )
        raise ValueError(
            "Development archive profile does not match the current search config: "
            + ", ".join(drift)
        )
    if profile.get("declaredObservedDevelopmentMatch") is not True:
        raise ValueError(
            "Development archive observed job profile does not match the declared "
            "developmentJob profile; it is exploratory and cannot open holdout."
        )

    raw_entries = archive.get("archive")
    if not isinstance(raw_entries, list):
        raise ValueError("Development archive archive must be a list.")
    entries = [
        require_mapping(item, f"developmentArchive.archive[{index}]")
        for index, item in enumerate(raw_entries)
    ]
    selected_entries = [
        item
        for item in entries
        if item.get("candidateId") == config["selectedCandidate"]
    ]
    if len(selected_entries) != 1:
        raise ValueError(
            "Selected candidate must occur exactly once in the development Pareto archive."
        )
    selected_entry = selected_entries[0]
    if selected_entry.get("qualified") is not True or selected_entry.get(
        "evaluable"
    ) is not True:
        raise ValueError(
            "Selected development archive candidate must be qualified and evaluable."
        )
    if selected_entry.get("promotionEligibleProvenance") is not True:
        raise ValueError(
            "Selected development archive candidate lacks canonical locked provenance."
        )
    selected_digest = require_string(
        selected_entry.get("skillDigest"),
        "selected development archive skillDigest",
    )
    selected = next(
        item for item in config["candidates"] if item["id"] == config["selectedCandidate"]
    )
    current_digest = compute_skill_digest(selected["skill"])
    if selected_digest != current_digest:
        raise ValueError(
            "Selected candidate skillDigest drifted after development: "
            f"archive {selected_digest}, current {current_digest}."
        )

    if not candidate_results or {
        item.get("jobSignature") for item in candidate_results
    } != {observed_job_signature}:
        raise ValueError(
            "Development archive candidate results do not match its observed profile."
        )
    selected_results = [
        item
        for item in candidate_results
        if item.get("candidateId") == config["selectedCandidate"]
    ]
    if len(selected_results) != 1 or selected_results[0].get("skillDigest") != (
        selected_digest
    ):
        raise ValueError(
            "Selected candidate digest is inconsistent inside the development archive."
        )
    selected_qualification = selected_results[0].get("qualification")
    if (
        selected_results[0].get("evaluable") is not True
        or not isinstance(selected_qualification, dict)
        or selected_qualification.get("passed") is not True
        or selected_results[0].get("lockPresent") is not True
        or selected_results[0].get("promotionEligibleProvenance") is not True
    ):
        raise ValueError(
            "Selected development candidate result must be qualified, evaluable, "
            "and backed by canonical locked provenance."
        )
    return selected_entry, selected_digest


def holdout(config: dict[str, Any], analyze_only: bool) -> dict[str, Any]:
    if config["selectedCandidate"] is None:
        raise ValueError("search.selectedCandidate is required for the holdout phase.")
    if config["developmentArchive"] is None:
        raise ValueError("search.developmentArchive is required for the holdout phase.")
    archive = read_json(config["developmentArchive"])
    _, selected_digest = validate_development_archive_binding(config, archive)
    ids = [config["baselineCandidate"], config["selectedCandidate"]]
    records = run_candidate_jobs(
        config,
        phase="holdout",
        analyze_only=analyze_only,
        candidate_ids=ids,
    )
    development_names = set(archive["caseNames"])
    development_checksums = set(archive["caseChecksums"])
    holdout_names = {
        row["taskName"] for record in records for row in record["cases"]
    }
    holdout_checksums = {
        row["taskChecksum"] for record in records for row in record["cases"]
    }
    overlapping_names = sorted(development_names & holdout_names)
    overlapping_checksums = sorted(development_checksums & holdout_checksums)
    if overlapping_names or overlapping_checksums:
        raise ValueError(
            "Development and holdout Harbor tasks overlap by name or checksum: "
            f"names={overlapping_names}, checksums={overlapping_checksums}."
        )
    declared_holdout_signature = archive["developmentProfile"][
        "holdoutJobSignature"
    ]
    observed_holdout_signatures = {record["jobSignature"] for record in records}
    profile_matches_declared = (
        declared_holdout_signature is not None
        and observed_holdout_signatures == {declared_holdout_signature}
    )
    if not profile_matches_declared:
        raise ValueError(
            "Observed holdout job profile differs from the declared and sealed "
            "holdoutJob profile."
        )
    development_observed_profiles = archive["developmentProfile"][
        "observedEvaluationProfiles"
    ]
    holdout_observed_profiles = observed_profiles(records)
    if holdout_observed_profiles != development_observed_profiles:
        raise ValueError(
            "Holdout observed agent/version/model profile differs from development: "
            f"development={development_observed_profiles}, "
            f"holdout={holdout_observed_profiles}."
        )
    summary = summarize_holdout(
        records[0],
        records[1],
        config,
        profile_matches_declared=profile_matches_declared,
    )
    if any(
        record["harborVersion"] != archive["developmentProfile"]["harborVersion"]
        for record in records
    ):
        raise ValueError(
            "Holdout Harbor version does not match the bound development profile."
        )
    selected = next(
        item for item in config["candidates"] if item["id"] == config["selectedCandidate"]
    )
    current_selected_digest = compute_skill_digest(selected["skill"])
    if current_selected_digest != selected_digest:
        raise ValueError(
            "Selected candidate skillDigest changed during holdout execution."
        )
    output = config["outputDir"] / "holdout"
    candidate_output = output / "candidate-skill"
    if candidate_output.exists():
        raise ValueError(f"Candidate output already exists: {candidate_output}")
    shutil.copytree(selected["skill"], candidate_output, symlinks=True)
    assert_self_contained_bundle(candidate_output, "holdout candidate output")
    if compute_skill_digest(candidate_output) != selected_digest:
        raise ValueError("Copied holdout candidate skillDigest does not match development.")
    run = {
        "schemaVersion": 1,
        "source": "harbor",
        "strategy": "reflective-pareto-search",
        "searchId": config["id"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "harborVersion": records[0]["harborVersion"],
        "developmentArchive": str(config["developmentArchive"]),
        "developmentProfileDigest": archive["developmentProfileDigest"],
        "selectedSkillDigest": selected_digest,
        "candidateSkill": str(candidate_output),
        "holdoutChecksums": sorted(holdout_checksums),
        "holdout": summary,
        "jobs": {
            "baseline": records[0]["jobDirectory"],
            "candidate": records[1]["jobDirectory"],
        },
    }
    (output / "promotion.json").write_text(
        json.dumps(run, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    (output / "report.md").write_text(render_holdout_report(run), encoding="utf-8")
    decision = "keep-baseline"
    if summary["blocked"]:
        decision = "blocked-non-evaluable"
    elif summary["promoted"]:
        decision = "promote"
    return {
        "mode": "holdout-analyze" if analyze_only else "holdout-live",
        "decision": decision,
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
    generation_dir = (
        config["outputDir"]
        / "development"
        / f"generation-{config['generation']:03d}"
        if phase == "development"
        else config["outputDir"] / "holdout"
    )
    return {
        "mode": "dry-run",
        "phase": phase,
        "searchId": config["id"],
        "generation": config["generation"],
        "previousGenerationLog": (
            str(config["previousGenerationLog"])
            if config["previousGenerationLog"] is not None
            else None
        ),
        "harborVersion": version("harbor"),
        "jobTemplate": str(template),
        "jobSignature": job_signature(loaded),
        "baselineSkill": str(config["baselineSkill"]),
        "outputDir": str(config["outputDir"]),
        "candidates": [
            {
                "id": item["id"],
                "skillName": config["baselineName"],
                "sourceSkill": str(item["skill"]),
                "stagedSkill": str(
                    staged_skill_path(
                        generation_dir / "candidate-staging" / item["id"],
                        config["baselineName"],
                    )
                ),
            }
            for item in config["candidates"]
        ],
        "rewardKey": config["rewardKey"],
        "passThreshold": config["passThreshold"],
        "requiredRewardThresholds": config["requiredRewards"],
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
