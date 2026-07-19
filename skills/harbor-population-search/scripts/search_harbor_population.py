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
import math
import os
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
PORTABLE_SKILL_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
RESERVED_SKILL_NAMES = {
    "aux",
    "con",
    "nul",
    "prn",
    *(f"com{index}" for index in range(1, 10)),
    *(f"lpt{index}" for index in range(1, 10)),
}
INFRASTRUCTURE_FAILURE_DOMAINS = {
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
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
TASK_REGRESSION_EPSILON = 1e-12


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


def write_json_once(path: Path, value: Any, label: str) -> None:
    """Create one immutable JSON artifact and fail rather than overwrite it."""

    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(json.dumps(value, indent=2, sort_keys=False) + "\n")
    except FileExistsError as error:
        raise ValueError(f"{label} already exists and is immutable: {path}") from error


def validate_self_contained_tree(directory: Path, label: str) -> None:
    """Reject bundle links that are broken, cyclic, or escape the bundle root."""

    if not directory.is_dir():
        raise ValueError(f"{label} must be a directory: {directory}")
    root = directory.resolve(strict=True)
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in [*directory_names, *file_names]:
            item = current_path / name
            is_junction = getattr(item, "is_junction", lambda: False)()
            if is_junction:
                raise ValueError(
                    f"{label} contains a directory junction/reparse point, which "
                    f"is not portable: {item}"
                )
            if not item.is_symlink():
                continue
            try:
                target = item.resolve(strict=True)
                target.relative_to(root)
            except (OSError, ValueError) as error:
                raise ValueError(
                    f"{label} contains a symlink that escapes or is broken: {item}"
                ) from error
            if item.is_dir():
                raise ValueError(
                    f"{label} contains a directory symlink, which is not portable: {item}"
                )
            if not target.is_file():
                raise ValueError(
                    f"{label} symlink must resolve to a regular in-bundle file: {item}"
                )


def _digest_with_order(directory: Path, files: list[Path]) -> str:
    digest = hashlib.sha256()
    for item in files:
        relative = item.relative_to(directory).as_posix()
        content_digest = hashlib.sha256(item.read_bytes()).hexdigest()
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(content_digest.encode())
        digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def directory_digest_variants(directory: Path, label: str) -> set[str]:
    validate_self_contained_tree(directory, label)
    files = [path for path in directory.rglob("*") if path.is_file()]
    canonical = sorted(files, key=lambda path: path.relative_to(directory).as_posix())
    native = sorted(files)
    return {
        _digest_with_order(directory, canonical),
        _digest_with_order(directory, native),
    }


def directory_digest(directory: Path, label: str = "Skill bundle") -> str:
    validate_self_contained_tree(directory, label)
    files = sorted(
        (path for path in directory.rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(directory).as_posix(),
    )
    return _digest_with_order(directory, files)


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
    if (
        name != name.strip()
        or not PORTABLE_SKILL_NAME.fullmatch(name)
        or name in RESERVED_SKILL_NAMES
    ):
        raise ValueError(
            "SKILL.md frontmatter.name must be an exact portable skill basename "
            f"(1-64 lowercase letters, digits, or interior hyphens): {skill_file}: "
            f"{name!r}. No fallback name is used because that would change the "
            "skill identity installed by Harbor."
        )
    return name


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


def preserve_copy(source: Path, destination: Path, label: str) -> str:
    source_digest = directory_digest(source, label)
    if destination.exists():
        if (
            not destination.is_dir()
            or directory_digest(destination, label) != source_digest
        ):
            raise ValueError(
                f"{label} already exists with different content: {destination}"
            )
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Safe in-bundle file symlinks are dereferenced so the staged skill no
        # longer depends on the source tree. Directory and escaping symlinks
        # were rejected above.
        shutil.copytree(source, destination, symlinks=False)
        if directory_digest(destination, label) != source_digest:
            raise ValueError(f"{label} changed while it was being staged: {source}")
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


def parse_reward_thresholds(values: list[str]) -> dict[str, float]:
    parsed: dict[str, float] = {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"required-reward must use KEY=MIN: {value}")
        key, raw_threshold = value.split("=", 1)
        key = key.strip()
        if not key or any(character.isspace() for character in key):
            raise ValueError(f"Invalid required-reward key '{key}'.")
        if key in parsed:
            raise ValueError(f"Duplicate required-reward key '{key}'.")
        try:
            threshold = float(raw_threshold)
        except ValueError as error:
            raise ValueError(
                f"required-reward threshold must be numeric: {value}"
            ) from error
        if not math.isfinite(threshold):
            raise ValueError(f"required-reward threshold must be finite: {value}")
        parsed[key] = threshold
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


def preserve_contract(path: Path, expected: dict[str, Any], label: str) -> None:
    if path.is_file():
        actual = read_json_mapping(path, label)
        if actual != expected:
            raise ValueError(
                f"{label} drift detected at {path}; start a new output directory "
                "before changing the benchmark, target, reward rules, or promotion policy."
            )
        return
    write_json(path, expected)


def search_contract(
    args: argparse.Namespace,
    inputs: dict[str, Any],
    baseline_digest: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "harborVersion": HARBOR_VERSION,
        "skillName": inputs["skillName"],
        "baselineDigest": baseline_digest,
        "developmentConfigFingerprint": config_fingerprint(inputs["templatePayload"]),
        "rewardKey": args.reward_key,
        "passThreshold": args.pass_threshold,
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "requiredRewardThresholds": dict(
            sorted(inputs["requiredRewardThresholds"].items())
        ),
        "minimumHoldoutGain": args.minimum_holdout_gain,
        "allowTaskRegressions": args.allow_task_regressions,
    }


def holdout_contract(inputs: dict[str, Any]) -> dict[str, Any] | None:
    if inputs["holdoutPayload"] is None:
        return None
    return {
        "schemaVersion": 1,
        "harborVersion": HARBOR_VERSION,
        "holdoutConfigFingerprint": config_fingerprint(inputs["holdoutPayload"]),
    }


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


def normalized_skill_source(value: str) -> str:
    raw = value.strip()
    path = Path(raw).expanduser()
    if path.exists():
        return os.path.normcase(str(path.resolve()))
    return raw.replace("\\", "/").rstrip("/")


def agent_skill_source(agent: Any, label: str) -> str:
    if not isinstance(agent, dict):
        raise ValueError(f"{label} agent must be a mapping.")
    skills = agent.get("skills")
    if (
        not isinstance(skills, list)
        or len(skills) != 1
        or not isinstance(skills[0], str)
        or not skills[0].strip()
    ):
        raise ValueError(f"{label} must install exactly one local candidate skill.")
    return skills[0]


def job_skill_source(config: dict[str, Any], label: str) -> str:
    agents = config.get("agents")
    if not isinstance(agents, list) or not agents:
        raise ValueError(f"{label} must contain agents.")
    sources = [agent_skill_source(agent, label) for agent in agents]
    normalized = {normalized_skill_source(source) for source in sources}
    if len(normalized) != 1:
        raise ValueError(f"{label} agents do not install one identical skill source.")
    return sources[0]


def locked_skill_record(lock: dict[str, Any], label: str) -> dict[str, str] | None:
    if "skills" not in lock:
        return None
    skills = lock["skills"]
    if not isinstance(skills, list) or len(skills) != 1:
        raise ValueError(f"{label}.skills must contain exactly one locked skill.")
    row = skills[0]
    if not isinstance(row, dict):
        raise ValueError(f"{label}.skills[0] must be a mapping.")
    name = row.get("name")
    source = row.get("source")
    digest = row.get("digest")
    if not isinstance(name, str) or not name:
        raise ValueError(f"{label}.skills[0].name must be non-empty text.")
    if not isinstance(source, str) or not source:
        raise ValueError(f"{label}.skills[0].source must be non-empty text.")
    if not isinstance(digest, str) or not DIGEST_PATTERN.fullmatch(digest):
        raise ValueError(f"{label}.skills[0].digest must be lowercase SHA-256.")
    return {"name": name, "source": source, "digest": digest}


def root_locked_skill_records(
    lock: dict[str, Any] | None, label: str
) -> list[dict[str, str]]:
    if lock is None:
        return []
    trials = lock.get("trials")
    if not isinstance(trials, list):
        record = locked_skill_record(lock, label)
        return [record] if record is not None else []
    records = []
    for index, trial in enumerate(trials):
        if not isinstance(trial, dict):
            raise ValueError(f"{label}.trials[{index}] must be a mapping.")
        record = locked_skill_record(trial, f"{label}.trials[{index}]")
        if record is not None:
            records.append(record)
    return records


def provenance_summary(
    *,
    analyze_only: bool,
    expected_name: str,
    expected_digests: set[str],
    expected_source: Path,
    root_config_source: str,
    root_lock_records: list[dict[str, str]],
    trials: list[dict[str, Any]],
) -> dict[str, Any]:
    configured_sources = [root_config_source]
    locked_records = list(root_lock_records)
    for trial in trials:
        configured_sources.extend(trial["configuredSkillSources"])
        if trial["lockedSkill"] is not None:
            locked_records.append(trial["lockedSkill"])

    normalized_configured = {
        normalized_skill_source(source) for source in configured_sources
    }
    if len(normalized_configured) != 1:
        raise ValueError(
            "Harbor candidate provenance mismatch: root and trial JobConfigs "
            "install different skill sources."
        )
    configured_source = configured_sources[0]
    normalized_configured_source = normalized_skill_source(configured_source)

    locked_names = sorted({row["name"] for row in locked_records})
    locked_sources = sorted(
        {normalized_skill_source(row["source"]) for row in locked_records}
    )
    locked_digests = sorted({row["digest"] for row in locked_records})
    if len(locked_names) > 1 or len(locked_sources) > 1 or len(locked_digests) > 1:
        raise ValueError(
            "Harbor candidate provenance mismatch: lock skill records disagree "
            "across trials."
        )
    if locked_sources and locked_sources[0] != normalized_configured_source:
        raise ValueError(
            "Harbor candidate provenance mismatch: JobConfig skill source differs "
            "from lock skill source."
        )
    if locked_digests and locked_digests[0] not in expected_digests:
        raise ValueError(
            "Harbor candidate provenance mismatch: locked skill digest does not "
            "match the supplied candidate bundle."
        )

    trial_count = len(trials)
    root_complete = len(root_lock_records) == trial_count
    side_complete = (
        sum(trial["lockedSkill"] is not None for trial in trials) == trial_count
    )
    lock_complete = root_complete or side_complete
    reasons: list[str] = []
    alias = None
    if not lock_complete:
        reasons.append("missing-lock-skill-records")
    if locked_names and locked_names[0] != expected_name:
        alias = locked_names[0]
        reasons.append("legacy-installed-skill-alias")
    if not locked_names:
        reasons.append("missing-locked-skill-name")
    if not locked_digests:
        reasons.append("missing-locked-skill-digest")

    if reasons and not analyze_only:
        raise ValueError(
            "Live Harbor job lacks exact candidate provenance: " + ", ".join(reasons)
        )
    verified = not reasons
    return {
        "status": "verified" if verified else "exploratory",
        "verified": verified,
        "exploratory": not verified,
        "promotionEligible": verified,
        "reasons": reasons,
        "expectedSkillName": expected_name,
        "lockedSkillName": locked_names[0] if len(locked_names) == 1 else None,
        "legacyAlias": alias,
        "expectedSkillDigests": sorted(expected_digests),
        "lockedSkillDigest": (locked_digests[0] if len(locked_digests) == 1 else None),
        "configuredSkillSource": configured_source,
        "lockedSkillSource": (locked_records[0]["source"] if locked_records else None),
        "sourceMatchesExpected": (
            normalized_configured_source
            == normalized_skill_source(str(expected_source))
        ),
    }


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


def normalize_failure_signal(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def failure_domain_from_signal(value: Any) -> str | None:
    signal = normalize_failure_signal(value)
    if not signal:
        return None
    for domain in sorted(INFRASTRUCTURE_FAILURE_DOMAINS):
        if (
            signal == domain
            or signal.startswith(f"{domain}-")
            or signal.endswith(f"-{domain}")
            or f"-{domain}-" in signal
        ):
            return domain
    for domain, aliases in FAILURE_SIGNAL_ALIASES.items():
        if any(
            signal == alias.rstrip("-") or signal.startswith(alias) for alias in aliases
        ):
            return domain
    return None


def diagnostic_failure_domain(fields: dict[str, Any]) -> str | None:
    explicit = normalize_failure_signal(fields.get("failureDomain"))
    if explicit in INFRASTRUCTURE_FAILURE_DOMAINS:
        return explicit
    aliased_explicit = failure_domain_from_signal(fields.get("failureDomain"))
    if aliased_explicit is not None:
        return aliased_explicit
    for key in ("status", "terminalOutcome", "errorCode"):
        domain = failure_domain_from_signal(fields.get(key))
        if domain is not None:
            return domain
    return None


def optional_evaluation_diagnostics(
    trial_directory: Path, job_directory: Path
) -> dict[str, Any]:
    verifier_directory = trial_directory / "verifier"
    paths = (
        sorted(verifier_directory.rglob("diagnostics.json"))
        if verifier_directory.is_dir()
        else []
    )
    observations: list[dict[str, Any]] = []
    for path in paths:
        payload = read_json_mapping(path, "verifier diagnostics.json")
        fields = {
            "status": payload.get("status"),
            "failureDomain": payload.get("failure_domain"),
            "terminalOutcome": payload.get("terminal_outcome"),
            "errorCode": payload.get("error_code"),
        }
        if not any(isinstance(value, str) and value for value in fields.values()):
            continue
        observation = {
            "path": path.relative_to(job_directory).as_posix(),
            **{
                key: value
                for key, value in fields.items()
                if isinstance(value, str) and value
            },
        }
        failure_domain = diagnostic_failure_domain(observation)
        if failure_domain is not None:
            observation["classifiedFailureDomain"] = failure_domain
        observations.append(observation)
    statuses = sorted({row["status"] for row in observations if "status" in row})
    domains = sorted(
        {row["failureDomain"] for row in observations if "failureDomain" in row}
    )
    outcomes = sorted(
        {row["terminalOutcome"] for row in observations if "terminalOutcome" in row}
    )
    classified_domains = sorted(
        {
            row["classifiedFailureDomain"]
            for row in observations
            if "classifiedFailureDomain" in row
        }
    )
    provider_failure = "provider" in classified_domains
    infrastructure_failure = bool(classified_domains)
    return {
        "evaluationDiagnostics": observations,
        "evaluationStatuses": statuses,
        "failureDomains": domains,
        "classifiedFailureDomains": classified_domains,
        "terminalOutcomes": outcomes,
        "providerFailure": provider_failure,
        "infrastructureFailure": infrastructure_failure,
    }


def numeric_field(value: Any, location: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be numeric.")
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ValueError(f"{location} must be finite.")
    return numeric


def parse_trial(
    trial_directory: Path,
    job_directory: Path,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
) -> dict[str, Any]:
    result_path = trial_directory / "result.json"
    result = read_json_mapping(result_path, "Harbor trial result.json")
    embedded_config = result.get("config")
    if not isinstance(embedded_config, dict):
        raise ValueError(f"Trial result lacks config metadata: {result_path}")
    embedded_skill_source = agent_skill_source(
        embedded_config.get("agent"), f"Trial embedded config in {result_path}"
    )
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
    evaluation_diagnostics = optional_evaluation_diagnostics(
        trial_directory, job_directory
    )
    raw_reward = rewards.get(reward_key) if isinstance(rewards, dict) else None
    reported_reward = (
        numeric_field(raw_reward, f"{result_path}: reward '{reward_key}'")
        if raw_reward is not None
        else None
    )
    # External diagnostics take precedence over reward availability. A provider
    # can terminate before emitting a verifier reward; that remains a provider
    # failure rather than being relabeled as a missing-primary evaluator error.
    missing_primary_reward = (
        exception_info is None
        and not evaluation_diagnostics["infrastructureFailure"]
        and reported_reward is None
    )
    reward = (
        None
        if evaluation_diagnostics["infrastructureFailure"]
        else reported_reward
        if reported_reward is not None
        else 0.0
        if exception_info is not None
        else None
    )

    required_rewards: dict[str, float | None] = {}
    qualification_failures: list[dict[str, Any]] = []
    for key, threshold in sorted(required_reward_thresholds.items()):
        raw_value = rewards.get(key) if isinstance(rewards, dict) else None
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
        actual = numeric_field(raw_value, f"{result_path}: required reward '{key}'")
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

    configured_skill_sources = [embedded_skill_source]
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
        side_skill_source = agent_skill_source(
            trial_config["agent"], f"Trial config.json in {trial_config_path}"
        )
        if normalized_skill_source(side_skill_source) != normalized_skill_source(
            embedded_skill_source
        ):
            raise ValueError(
                f"Trial skill source drift between result.json and config.json: "
                f"{trial_directory}"
            )
        configured_skill_sources.append(side_skill_source)

    trial_lock_path = trial_directory / "lock.json"
    locked_skill = None
    if trial_lock_path.is_file():
        trial_lock = validate_lock(trial_lock_path, None, "Harbor trial lock.json")
        locked_skill = locked_skill_record(trial_lock, "Harbor trial lock.json")

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
        "reportedReward": reported_reward,
        "missingPrimaryReward": missing_primary_reward,
        "passed": (
            exception_info is None
            and not evaluation_diagnostics["infrastructureFailure"]
            and reward is not None
            and reward >= pass_threshold
        ),
        "requiredRewards": required_rewards,
        "qualificationPassed": (
            exception_info is None
            and not evaluation_diagnostics["infrastructureFailure"]
            and not missing_primary_reward
            and not qualification_failures
        ),
        "qualificationFailures": qualification_failures,
        "exceptionInfo": exception_info,
        "configuredSkillSources": configured_skill_sources,
        "lockedSkill": locked_skill,
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
        **evaluation_diagnostics,
        **optional_feedback_paths(trial_directory, job_directory),
    }


def parse_harbor_job(
    job_directory: Path,
    reward_key: str,
    pass_threshold: float,
    required_reward_thresholds: dict[str, float],
    expected_config_fingerprint: str,
    expected_skill_name: str,
    expected_skill_digests: set[str],
    expected_skill_source: Path,
    analyze_only: bool,
) -> dict[str, Any]:
    if not job_directory.is_dir():
        raise ValueError(f"Harbor job directory does not exist: {job_directory}")
    config_path = job_directory / "config.json"
    config_payload = read_json_mapping(config_path, "Harbor job config.json")
    root_config_skill_source = job_skill_source(
        config_payload, "Harbor job config.json"
    )
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
    root_lock = None
    if root_lock_path.is_file():
        root_lock = validate_lock(root_lock_path, total, "Harbor job lock.json")

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
        parse_trial(
            directory,
            job_directory,
            reward_key,
            pass_threshold,
            required_reward_thresholds,
        )
        for directory in trial_directories
    ]
    provenance = provenance_summary(
        analyze_only=analyze_only,
        expected_name=expected_skill_name,
        expected_digests=expected_skill_digests,
        expected_source=expected_skill_source,
        root_config_source=root_config_skill_source,
        root_lock_records=root_locked_skill_records(root_lock, "Harbor job lock.json"),
        trials=trials,
    )
    errored = sum(trial["exceptionInfo"] is not None for trial in trials)
    declared_errors = stats.get("n_errored_trials")
    if isinstance(declared_errors, int) and declared_errors != errored:
        raise ValueError(
            f"Harbor error count mismatch: root={declared_errors}, trials={errored}: "
            f"{job_directory}"
        )
    reported_rewards = [
        trial["reportedReward"]
        for trial in trials
        if trial["reportedReward"] is not None
    ]
    mean_reward = (
        sum(reported_rewards) / len(reported_rewards) if reported_rewards else None
    )
    passed = sum(trial["passed"] for trial in trials)
    unqualified = sum(not trial["qualificationPassed"] for trial in trials)
    missing_required = sum(
        failure["reason"] == "missing"
        for trial in trials
        for failure in trial["qualificationFailures"]
    )
    below_threshold = sum(
        failure["reason"] == "below-threshold"
        for trial in trials
        for failure in trial["qualificationFailures"]
    )
    provider_failures = sum(trial["providerFailure"] for trial in trials)
    infrastructure_failures = sum(trial["infrastructureFailure"] for trial in trials)
    missing_primary_rewards = sum(trial["missingPrimaryReward"] for trial in trials)
    evaluable_rewards = [
        trial["reward"]
        for trial in trials
        if not trial["infrastructureFailure"] and trial["reward"] is not None
    ]
    evaluable_mean_reward = (
        sum(evaluable_rewards) / len(evaluable_rewards) if evaluable_rewards else None
    )
    qualification_passed = (
        errored == 0 and unqualified == 0 and missing_primary_rewards == 0
    )
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
        "requiredRewardThresholds": required_reward_thresholds,
        "provenance": provenance,
        "fitness": (
            None
            if infrastructure_failures or missing_primary_rewards
            else mean_reward
            if qualification_passed
            else 0.0
        ),
        "qualification": {
            "passed": qualification_passed,
            "unqualifiedTrials": unqualified,
            "missingRequiredRewards": missing_required,
            "belowThresholdRewards": below_threshold,
            "providerFailureTrials": provider_failures,
            "infrastructureFailureTrials": infrastructure_failures,
            "missingPrimaryRewards": missing_primary_rewards,
        },
        "summary": {
            "expectedTrials": total,
            "completedTrials": completed,
            "erroredTrials": errored,
            "passedTrials": passed,
            "meanReward": mean_reward,
            "evaluableTrials": len(evaluable_rewards),
            "evaluableMeanReward": evaluable_mean_reward,
            "providerFailureTrials": provider_failures,
            "infrastructureFailureTrials": infrastructure_failures,
            "missingPrimaryRewards": missing_primary_rewards,
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
    holdout_attempt = entry.get("holdoutAttempt")
    holdout_attempts = existing.get("holdoutAttempts", [])
    if not isinstance(holdout_attempts, list):
        raise ValueError(f"Invalid holdoutAttempts array in {path}")
    if isinstance(holdout_attempt, dict):
        attempt_key = (
            holdout_attempt.get("generation"),
            holdout_attempt.get("attempt"),
        )
        if any(
            isinstance(item, dict)
            and (item.get("generation"), item.get("attempt")) == attempt_key
            for item in holdout_attempts
        ):
            raise ValueError(
                "Population search log already records holdout attempt "
                f"generation={attempt_key[0]} attempt={attempt_key[1]}."
            )
        holdout_attempts = [*holdout_attempts, holdout_attempt]
    existing["holdoutAttempts"] = sorted(
        holdout_attempts,
        key=lambda item: (item["generation"], item["attempt"]),
    )
    write_json(path, existing)


def next_holdout_attempt_index(output: Path, generation: int) -> int:
    generation_root = output / "holdout" / f"generation-{generation:03d}"
    if not generation_root.exists():
        return 0
    if not generation_root.is_dir():
        raise ValueError(f"Holdout generation path is not a directory: {generation_root}")
    indexes = []
    for child in generation_root.iterdir():
        match = re.fullmatch(r"attempt-(\d+)", child.name)
        if match is not None:
            if not child.is_dir():
                raise ValueError(f"Holdout attempt path is not a directory: {child}")
            indexes.append(int(match.group(1)))
    return max(indexes, default=-1) + 1


def allocate_holdout_attempt(
    output: Path,
    generation: int,
    manifest: dict[str, Any],
) -> tuple[int, Path, Path]:
    """Allocate and seal the next append-only holdout attempt directory."""

    generation_root = output / "holdout" / f"generation-{generation:03d}"
    generation_root.mkdir(parents=True, exist_ok=True)
    attempt = next_holdout_attempt_index(output, generation)
    attempt_directory = generation_root / f"attempt-{attempt:03d}"
    try:
        attempt_directory.mkdir()
    except FileExistsError as error:
        raise ValueError(
            f"Holdout attempt allocation collided at {attempt_directory}; rerun safely."
        ) from error
    manifest_path = attempt_directory / "attempt.json"
    write_json_once(
        manifest_path,
        {
            **manifest,
            "attempt": attempt,
            "attemptDirectory": str(attempt_directory),
        },
        "Holdout attempt manifest",
    )
    return attempt, attempt_directory, manifest_path


def write_report(path: Path, run: dict[str, Any]) -> None:
    ranking = run["ranking"]
    selected_winner = run["selectedWinner"] or "none"
    lines = [
        "# Harbor Population Search",
        "",
        f"- Generation: {run['generation']}",
        f"- Baseline: {run['baselineCandidate']}",
        f"- Logical skill: {run['skillName']}",
        f"- Selected winner: {selected_winner}",
        (f"- Minimum development pass rate: {run['minimumDevelopmentPassRate']:.1%}"),
        "- Selection evidence: native Harbor development jobs only",
        "",
        (
            "| Rank | Candidate | Qualified | Winner eligible | Provenance | "
            "Fitness | Mean reward | Pass rate | Errors |"
        ),
        "| ---: | --- | :---: | :---: | --- | ---: | ---: | ---: | ---: |",
    ]
    for row in ranking:
        fitness = "n/a" if row["fitness"] is None else f"{row['fitness']:.6g}"
        mean_reward = "n/a" if row["meanReward"] is None else f"{row['meanReward']:.6g}"
        lines.append(
            f"| {row['rank']} | {row['candidateId']} | "
            f"{'yes' if row['qualified'] else 'no'} | "
            f"{'yes' if row['winnerEligible'] else 'no'} | "
            f"{row['provenanceStatus']} | {fitness} | "
            f"{mean_reward} | {row['passRate']:.1%} | {row['erroredTrials']} |"
        )
    holdout = run["holdout"]
    lines.extend(["", "## Holdout", "", f"- Status: {holdout['status']}"])
    if holdout.get("evaluable"):
        lines.extend(
            [
                f"- Baseline mean reward: {holdout['baselineMeanReward']:.6g}",
                f"- Winner mean reward: {holdout['winnerMeanReward']:.6g}",
                f"- Winner qualified: {'yes' if holdout['winnerQualified'] else 'no'}",
                f"- Provenance verified: {'yes' if holdout['provenanceVerified'] else 'no'}",
                f"- Regressed task signatures: {holdout['taskRegressionCount']}",
                f"- Promoted: {'yes' if holdout['promoted'] else 'no'}",
            ]
        )
        if holdout["promotionBlockers"]:
            lines.append(
                "- Promotion blockers: " + ", ".join(holdout["promotionBlockers"])
            )
        lines.extend(
            [
                "",
                "### Per-task reward comparison",
                "",
                "| Task | Baseline | Winner | Gain | Regressed |",
                "| --- | ---: | ---: | ---: | :---: |",
            ]
        )
        for row in holdout["taskComparisons"]:
            baseline = (
                "n/a"
                if row["baselineMeanReward"] is None
                else f"{row['baselineMeanReward']:.6g}"
            )
            winner = (
                "n/a"
                if row["winnerMeanReward"] is None
                else f"{row['winnerMeanReward']:.6g}"
            )
            gain = "n/a" if row["gain"] is None else f"{row['gain']:.6g}"
            lines.append(
                f"| {row['taskName']}@{row['taskChecksum']} | {baseline} | "
                f"{winner} | {gain} | {'yes' if row['regressed'] else 'no'} |"
            )
    else:
        if holdout.get("promotionBlockers"):
            lines.append(
                "- Promotion blockers: "
                + ", ".join(holdout["promotionBlockers"])
            )
        lines.append(f"- Next step: {holdout.get('nextStep')}")
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
    parser.add_argument(
        "--minimum-development-pass-rate",
        type=float,
        default=0.0,
        help=(
            "Require a development candidate's selected-reward pass rate to be "
            "at least this value before it can become the winner or enter holdout. "
            "Survivor selection remains fitness-based."
        ),
    )
    parser.add_argument(
        "--required-reward",
        action="append",
        default=[],
        metavar="KEY=MIN",
        help=(
            "Require every non-errored trial to report KEY at or above MIN. "
            "Repeat for non-compensating qualification gates."
        ),
    )
    parser.add_argument("--job", action="append", default=[], metavar="ID=JOB_DIR")
    parser.add_argument("--holdout-template", type=Path)
    parser.add_argument(
        "--holdout-job", action="append", default=[], metavar="ROLE=JOB_DIR"
    )
    parser.add_argument("--minimum-holdout-gain", type=float, default=0.0)
    parser.add_argument(
        "--allow-task-regressions",
        action="store_true",
        help=(
            "Permit holdout promotion when mean reward passes even though one or "
            "more matched task signatures regress. Disabled by default."
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    mode.add_argument("--analyze-only", action="store_true")
    args = parser.parse_args(argv)
    if args.generation < 0:
        parser.error("--generation must be zero or greater")
    if not math.isfinite(args.pass_threshold):
        parser.error("--pass-threshold must be finite")
    if not math.isfinite(args.minimum_holdout_gain):
        parser.error("--minimum-holdout-gain must be finite")
    if not isinstance(args.reward_key, str) or not args.reward_key.strip():
        parser.error("--reward-key must be non-empty")
    if (
        not math.isfinite(args.minimum_development_pass_rate)
        or not 0.0 <= args.minimum_development_pass_rate <= 1.0
    ):
        parser.error("--minimum-development-pass-rate must be between 0 and 1")
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
    names = {}
    for identifier, path in candidates.items():
        validate_self_contained_tree(path, f"Candidate {identifier}")
        names[identifier] = skill_name(path)
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
    required_reward_thresholds = parse_reward_thresholds(args.required_reward)
    return {
        "candidates": candidates,
        "skillName": next(iter(names.values())),
        "jobs": jobs,
        "holdoutJobs": holdout_jobs,
        "templatePayload": template_payload,
        "template": template,
        "holdoutPayload": holdout_payload,
        "holdoutTemplate": holdout_template,
        "requiredRewardThresholds": required_reward_thresholds,
    }


def plan(args: argparse.Namespace, inputs: dict[str, Any]) -> dict[str, Any]:
    output = args.output.resolve()
    generation_directory = output / f"generation-{args.generation:03d}"
    logical_name = inputs["skillName"]
    rows = []
    for candidate_id, source in sorted(inputs["candidates"].items()):
        candidate_root = generation_directory / "candidates" / candidate_id
        frozen_skill = installed_skill_path(candidate_root, logical_name)
        name = job_name(args.generation, candidate_id)
        rows.append(
            {
                "candidateId": candidate_id,
                "skillName": logical_name,
                "sourceSkill": str(source),
                "frozenSkill": str(frozen_skill),
                "jobName": name,
                "jobDirectory": str(candidate_root / "harbor-jobs" / name),
            }
        )
    holdout_attempt = (
        next_holdout_attempt_index(output, args.generation)
        if inputs["holdoutTemplate"] is not None
        else None
    )
    holdout_attempt_root = (
        output
        / "holdout"
        / f"generation-{args.generation:03d}"
        / f"attempt-{holdout_attempt:03d}"
        if holdout_attempt is not None
        else None
    )
    holdout_skills = (
        {
            role: str(installed_skill_path(holdout_attempt_root / role, logical_name))
            for role in ("baseline", "winner")
        }
        if holdout_attempt_root is not None
        else None
    )
    return {
        "mode": "doctor" if args.doctor else "dry-run",
        "harborVersion": version("harbor"),
        "generation": args.generation,
        "baselineCandidate": args.baseline,
        "skillName": logical_name,
        "nativeJobTemplate": str(args.job_template.resolve()),
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "minimumHoldoutGain": args.minimum_holdout_gain,
        "allowTaskRegressions": args.allow_task_regressions,
        "requiredRewardThresholds": inputs["requiredRewardThresholds"],
        "candidates": rows,
        "holdoutTemplate": (
            str(args.holdout_template.resolve())
            if args.holdout_template is not None
            else None
        ),
        "holdoutAttempt": holdout_attempt,
        "holdoutAttemptDirectory": (
            str(holdout_attempt_root) if holdout_attempt_root is not None else None
        ),
        "holdoutSkills": holdout_skills,
        "writesOutput": False,
    }


def task_reward_means(
    result: dict[str, Any],
) -> dict[tuple[str, str, str, str | None], float | None]:
    grouped: dict[tuple[str, str, str, str | None], list[float | None]] = {}
    for trial in result["trials"]:
        key = (
            trial["taskName"],
            trial["taskChecksum"],
            trial["agent"],
            trial["model"],
        )
        grouped.setdefault(key, []).append(trial["reportedReward"])
    return {
        key: (
            sum(value for value in values if value is not None) / len(values)
            if all(value is not None for value in values)
            else None
        )
        for key, values in grouped.items()
    }


def task_reward_comparisons(
    baseline_result: dict[str, Any], winner_result: dict[str, Any]
) -> list[dict[str, Any]]:
    baseline = task_reward_means(baseline_result)
    winner = task_reward_means(winner_result)
    if set(baseline) != set(winner):
        raise ValueError(
            "Harbor holdout task signatures differ after comparability check."
        )
    rows = []
    for key in sorted(baseline):
        baseline_mean = baseline[key]
        winner_mean = winner[key]
        gain = (
            winner_mean - baseline_mean
            if baseline_mean is not None and winner_mean is not None
            else None
        )
        rows.append(
            {
                "taskName": key[0],
                "taskChecksum": key[1],
                "agent": key[2],
                "model": key[3],
                "baselineMeanReward": baseline_mean,
                "winnerMeanReward": winner_mean,
                "gain": gain,
                "regressed": (gain is not None and gain < -TASK_REGRESSION_EPSILON),
            }
        )
    return rows


def holdout_gate(
    development_results: dict[str, dict[str, Any]],
    winner_id: str,
    baseline_result: dict[str, Any],
    winner_result: dict[str, Any],
    minimum_development_pass_rate: float,
    minimum_gain: float,
    allow_task_regressions: bool,
    skill_changed: bool,
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
    error_free = (
        development_results[winner_id]["summary"]["erroredTrials"] == 0
        and baseline_result["summary"]["erroredTrials"] == 0
        and winner_result["summary"]["erroredTrials"] == 0
    )
    infrastructure_free = (
        development_results[winner_id]["summary"]["infrastructureFailureTrials"] == 0
        and baseline_result["summary"]["infrastructureFailureTrials"] == 0
        and winner_result["summary"]["infrastructureFailureTrials"] == 0
    )
    required_rewards_complete = all(
        result["qualification"]["missingRequiredRewards"] == 0
        for result in (baseline_result, winner_result)
    )
    primary_rewards_complete = all(
        result["qualification"]["missingPrimaryRewards"] == 0
        for result in (baseline_result, winner_result)
    )
    holdout_evaluable = (
        infrastructure_free
        and primary_rewards_complete
        and baseline_mean is not None
        and winner_mean is not None
    )
    gain = winner_mean - baseline_mean if holdout_evaluable else None
    winner_qualified = (
        development_results[winner_id]["qualification"]["passed"]
        and winner_result["qualification"]["passed"]
    )
    development_pass_rate = development_results[winner_id]["summary"]["passRate"]
    development_pass_rate_eligible = (
        development_pass_rate >= minimum_development_pass_rate
    )
    task_comparisons = task_reward_comparisons(baseline_result, winner_result)
    regressed_tasks = [row for row in task_comparisons if row["regressed"]]
    task_regression_eligible = allow_task_regressions or not regressed_tasks
    provenance_verified = all(
        result["provenance"]["verified"]
        for result in (
            development_results[winner_id],
            baseline_result,
            winner_result,
        )
    )
    promotion_blockers = []
    if not error_free:
        promotion_blockers.append("execution-errors")
    if not infrastructure_free:
        promotion_blockers.append("infrastructure-failure")
    if not required_rewards_complete:
        promotion_blockers.append("missing-required-reward")
    if not primary_rewards_complete:
        promotion_blockers.append("missing-primary-reward")
    if not winner_qualified:
        promotion_blockers.append("winner-unqualified")
    if not development_pass_rate_eligible:
        promotion_blockers.append("development-pass-rate-below-minimum")
    if gain is None or gain < minimum_gain:
        promotion_blockers.append("mean-gain-below-minimum")
    if not task_regression_eligible:
        promotion_blockers.append("task-regression")
    if not provenance_verified:
        promotion_blockers.append("exploratory-provenance")
    if not skill_changed:
        promotion_blockers.append("no-skill-change")
    promoted = not promotion_blockers
    status = (
        "baseline-retained"
        if not skill_changed
        else "complete"
        if holdout_evaluable
        else "non-evaluable"
    )
    if skill_changed and holdout_evaluable and not provenance_verified:
        status = "complete-exploratory"
    return {
        "status": status,
        "evaluable": holdout_evaluable,
        "nextStep": (
            None
            if holdout_evaluable
            else "At least one holdout job lacks an evaluable primary reward. Repair or rerun the external/provider failure before promotion."
        ),
        "baselineMeanReward": baseline_mean,
        "winnerMeanReward": winner_mean,
        "gain": gain,
        "minimumGain": minimum_gain,
        "errorFree": error_free,
        "infrastructureFree": infrastructure_free,
        "requiredRewardsComplete": required_rewards_complete,
        "primaryRewardsComplete": primary_rewards_complete,
        "winnerQualified": winner_qualified,
        "baselineQualified": baseline_result["qualification"]["passed"],
        "developmentPassRate": development_pass_rate,
        "minimumDevelopmentPassRate": minimum_development_pass_rate,
        "developmentPassRateEligible": development_pass_rate_eligible,
        "allowTaskRegressions": allow_task_regressions,
        "taskComparisons": task_comparisons,
        "regressedTasks": regressed_tasks,
        "taskRegressionCount": len(regressed_tasks),
        "taskRegressionFree": not regressed_tasks,
        "taskRegressionEligible": task_regression_eligible,
        "provenanceVerified": provenance_verified,
        "exploratory": not provenance_verified,
        "skillChanged": skill_changed,
        "promotionBlockers": promotion_blockers,
        "promoted": promoted,
        "baselineJobDirectory": baseline_result["jobDirectory"],
        "winnerJobDirectory": winner_result["jobDirectory"],
    }


def run_search(args: argparse.Namespace, inputs: dict[str, Any]) -> dict[str, Any]:
    output = args.output.resolve()
    generation_directory = output / f"generation-{args.generation:03d}"
    logical_name = inputs["skillName"]
    baseline_source = inputs["candidates"][args.baseline]
    baseline_digest = directory_digest(baseline_source, "Incoming baseline")
    preserve_contract(
        output / "search-contract.json",
        search_contract(args, inputs, baseline_digest),
        "Population search contract",
    )
    frozen_holdout_contract = holdout_contract(inputs)
    if frozen_holdout_contract is not None:
        preserve_contract(
            output / "holdout-contract.json",
            frozen_holdout_contract,
            "Population holdout contract",
        )
    baseline_snapshot = installed_skill_path(output / "baseline-skill", logical_name)
    copied_baseline_digest = preserve_copy(
        baseline_source, baseline_snapshot, "Preserved baseline"
    )
    if copied_baseline_digest != baseline_digest:
        raise ValueError("Incoming baseline changed while the search was starting.")
    expected_fingerprint = config_fingerprint(inputs["templatePayload"])

    candidate_states: list[dict[str, Any]] = []
    development_results: dict[str, dict[str, Any]] = {}
    frozen_skills: dict[str, Path] = {}
    candidate_digests: dict[str, str] = {}
    for candidate_id, source in sorted(inputs["candidates"].items()):
        candidate_root = generation_directory / "candidates" / candidate_id
        frozen_skill = installed_skill_path(candidate_root, logical_name)
        digest = preserve_copy(source, frozen_skill, f"Frozen candidate {candidate_id}")
        frozen_skills[candidate_id] = frozen_skill
        candidate_digests[candidate_id] = digest
        digest_variants = directory_digest_variants(
            frozen_skill, f"Frozen candidate {candidate_id}"
        )
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
            inputs["requiredRewardThresholds"],
            expected_fingerprint,
            logical_name,
            digest_variants,
            frozen_skill if not args.analyze_only else source,
            args.analyze_only,
        )
        result["candidateId"] = candidate_id
        result_path = candidate_root / "candidate-result.json"
        write_json(result_path, result)
        development_results[candidate_id] = result
        candidate_state = {
            "candidateId": candidate_id,
            "skillName": logical_name,
            "sourceSkill": str(source),
            "frozenSkill": str(frozen_skill),
            "skillDigest": digest,
            "acceptedSkillDigests": sorted(digest_variants),
            "isBaseline": candidate_id == args.baseline,
            "nativeJobConfig": str(config_path),
            "nativeJobDirectory": str(job_directory),
            "result": str(result_path),
        }
        write_json(candidate_root / "candidate.json", candidate_state)
        candidate_states.append(candidate_state)

    validate_comparable(development_results, "development")
    preserve_contract(
        output / "development-signatures.json",
        {
            "schemaVersion": 1,
            "taskSignatures": development_results[args.baseline]["taskSignatures"],
        },
        "Development task signature contract",
    )
    ranking_rows = []
    for candidate_id, result in development_results.items():
        fitness = result["fitness"]
        qualified = result["qualification"]["passed"]
        pass_rate = result["summary"]["passRate"]
        ineligibility_reasons = []
        if fitness is None:
            ineligibility_reasons.append("non-evaluable")
        if not qualified:
            ineligibility_reasons.append("qualification-gates-failed")
        if pass_rate < args.minimum_development_pass_rate:
            ineligibility_reasons.append("development-pass-rate-below-minimum")
        passed_required_rewards = sorted(
            key
            for key, threshold in result["requiredRewardThresholds"].items()
            if all(
                trial["requiredRewards"].get(key) is not None
                and trial["requiredRewards"][key] >= threshold
                for trial in result["trials"]
            )
        )
        ranking_rows.append(
            {
                "candidateId": candidate_id,
                "skillDigest": candidate_digests[candidate_id],
                "sameAsBaseline": candidate_digests[candidate_id] == baseline_digest,
                "fitness": fitness,
                "qualified": qualified,
                "meanReward": result["summary"]["meanReward"],
                "passRate": pass_rate,
                "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
                "winnerEligible": not ineligibility_reasons,
                "winnerIneligibilityReasons": ineligibility_reasons,
                "provenanceVerified": result["provenance"]["verified"],
                "provenanceStatus": result["provenance"]["status"],
                "promotionProvenanceEligible": result["provenance"][
                    "promotionEligible"
                ],
                "provenanceReasons": result["provenance"]["reasons"],
                "passedRequiredRewards": passed_required_rewards,
                "requiredRewardPassCount": len(passed_required_rewards),
                "erroredTrials": result["summary"]["erroredTrials"],
                "providerFailureTrials": result["summary"]["providerFailureTrials"],
                "infrastructureFailureTrials": result["summary"][
                    "infrastructureFailureTrials"
                ],
            }
        )
    ranking = sorted(
        ranking_rows,
        key=lambda row: (
            row["fitness"] is None,
            -(row["fitness"] if row["fitness"] is not None else 0.0),
            row["candidateId"],
        ),
    )
    for index, row in enumerate(ranking, start=1):
        row["rank"] = index
    evaluable_ranking = [row for row in ranking if row["fitness"] is not None]
    winner_eligible_ranking = [row for row in ranking if row["winnerEligible"]]
    survivors = [row["candidateId"] for row in evaluable_ranking[:2]]
    winner = (
        winner_eligible_ranking[0]["candidateId"] if winner_eligible_ranking else None
    )
    winner_digest = candidate_digests[winner] if winner is not None else None
    skill_changed = winner_digest is not None and winner_digest != baseline_digest
    if winner is not None and winner not in survivors:
        survivors = [winner] + [
            row["candidateId"]
            for row in evaluable_ranking
            if row["candidateId"] != winner
        ][:1]
    if winner is None and evaluable_ranking:
        remaining = list(evaluable_ranking)
        repair_rows = []
        covered_required_rewards: set[str] = set()
        while remaining and len(repair_rows) < 2:
            remaining.sort(
                key=lambda row: (
                    -len(set(row["passedRequiredRewards"]) - covered_required_rewards),
                    -row["requiredRewardPassCount"],
                    -(row["passRate"]),
                    -(row["meanReward"] if row["meanReward"] is not None else 0.0),
                    row["candidateId"],
                )
            )
            selected = remaining.pop(0)
            repair_rows.append(selected)
            covered_required_rewards.update(selected["passedRequiredRewards"])
        repair_parents = [row["candidateId"] for row in repair_rows]
    else:
        repair_parents = survivors
    if not repair_parents:
        repair_parents = [args.baseline]
    best_evolvable = repair_parents[0] if evaluable_ranking else None

    generation_state = {
        "schemaVersion": 1,
        "generation": args.generation,
        "createdAt": utc_now(),
        "mode": "analyze-only" if args.analyze_only else "live",
        "baselineCandidate": args.baseline,
        "skillName": logical_name,
        "baselineSnapshot": str(baseline_snapshot),
        "baselineDigest": baseline_digest,
        "selectionSplit": "development",
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "candidates": candidate_states,
    }
    write_json(generation_directory / "generation.json", generation_state)
    ranking_state = {
        "schemaVersion": 1,
        "generation": args.generation,
        "selectionSplit": "development",
        "ranking": ranking,
        "survivors": survivors,
        "repairParents": repair_parents,
        "bestEvolvableCandidate": best_evolvable,
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "selectedWinner": winner,
    }
    write_json(generation_directory / "ranking.json", ranking_state)

    holdout_attempt_record = None
    if winner is None:
        holdout = {
            "status": "not-eligible",
            "promoted": False,
            "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
            "candidateReasons": {
                row["candidateId"]: row["winnerIneligibilityReasons"] for row in ranking
            },
            "nextStep": (
                "No development candidate met winner eligibility: evaluable, "
                "qualification-gate passing, and development pass rate at least "
                f"{args.minimum_development_pass_rate:.6g}. Use the recorded "
                "candidate reasons and frozen diagnostics to create a focused "
                "repair generation before opening holdout."
            ),
        }
    elif not skill_changed:
        holdout = {
            "status": "baseline-retained",
            "promoted": False,
            "skillChanged": False,
            "baselineDigest": baseline_digest,
            "winnerDigest": winner_digest,
            "promotionBlockers": ["no-skill-change"],
            "nextStep": (
                "The selected development winner is the baseline bundle or has "
                "identical skill content. Retain the baseline without opening "
                "holdout, then create a content-changing repair generation."
            ),
        }
    elif inputs["holdoutTemplate"] is None:
        development_provenance_verified = development_results[winner]["provenance"][
            "verified"
        ]
        holdout = {
            "status": "staged",
            "promoted": False,
            "skillChanged": True,
            "provenanceVerified": development_provenance_verified,
            "exploratory": not development_provenance_verified,
            "promotionBlockers": (
                [] if development_provenance_verified else ["exploratory-provenance"]
            ),
            "nextStep": (
                "Create a disjoint native Harbor holdout job template. Evaluate the "
                "preserved baseline and selected winner, then rerun with "
                "--holdout-template and --holdout-job baseline=.../winner=... in "
                "--analyze-only mode, or supply --holdout-template during a live run."
            ),
        }
    else:
        holdout_fingerprint = config_fingerprint(inputs["holdoutPayload"])
        attempt, attempt_directory, attempt_manifest_path = allocate_holdout_attempt(
            output,
            args.generation,
            {
                "schemaVersion": 1,
                "createdAt": utc_now(),
                "generation": args.generation,
                "mode": "analyze-only" if args.analyze_only else "live",
                "skillName": logical_name,
                "baselineCandidate": args.baseline,
                "baselineDigest": baseline_digest,
                "winnerCandidate": winner,
                "winnerDigest": winner_digest,
                "providedHoldoutJobDirectories": (
                    {
                        role: str(job_directory)
                        for role, job_directory in sorted(
                            inputs["holdoutJobs"].items()
                        )
                    }
                    if inputs["holdoutJobs"]
                    else None
                ),
                "developmentConfigFingerprint": expected_fingerprint,
                "holdoutConfigFingerprint": holdout_fingerprint,
                "rewardKey": args.reward_key,
                "passThreshold": args.pass_threshold,
                "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
                "minimumHoldoutGain": args.minimum_holdout_gain,
                "requiredRewardThresholds": inputs["requiredRewardThresholds"],
                "allowTaskRegressions": args.allow_task_regressions,
            },
        )
        holdout_results: dict[str, dict[str, Any]] = {}
        stage_holdout_only = args.analyze_only and not inputs["holdoutJobs"]
        holdout_sources = {
            "baseline": baseline_snapshot,
            "winner": frozen_skills[winner],
        }
        holdout_skill_paths: dict[str, str] = {}
        for role, source_skill_directory in holdout_sources.items():
            role_root = attempt_directory / role
            skill_directory = installed_skill_path(role_root, logical_name)
            preserve_copy(
                source_skill_directory,
                skill_directory,
                f"Frozen holdout {role}",
            )
            holdout_skill_paths[role] = str(skill_directory)
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
                inputs["requiredRewardThresholds"],
                holdout_fingerprint,
                logical_name,
                directory_digest_variants(skill_directory, f"Frozen holdout {role}"),
                skill_directory if not args.analyze_only else source_skill_directory,
                args.analyze_only,
            )
            write_json(role_root / "candidate-result.json", result)
            holdout_results[role] = result
        if stage_holdout_only:
            holdout = {
                "status": "staged",
                "promoted": False,
                "skillChanged": True,
                "provenanceVerified": development_results[winner]["provenance"][
                    "verified"
                ],
                "exploratory": not development_results[winner]["provenance"][
                    "verified"
                ],
                "promotionBlockers": (
                    []
                    if development_results[winner]["provenance"]["verified"]
                    else ["exploratory-provenance"]
                ),
                "nextStep": (
                    f"Run {attempt_directory / 'baseline' / 'harbor-job.yaml'} and "
                    f"{attempt_directory / 'winner' / 'harbor-job.yaml'} with "
                    "Harbor, then rerun "
                    "--analyze-only with --holdout-job baseline=JOB_DIR and "
                    "--holdout-job winner=JOB_DIR."
                ),
            }
        else:
            preserve_contract(
                output / "holdout-signatures.json",
                {
                    "schemaVersion": 1,
                    "taskSignatures": holdout_results["baseline"]["taskSignatures"],
                },
                "Holdout task signature contract",
            )
            holdout = holdout_gate(
                development_results,
                winner,
                holdout_results["baseline"],
                holdout_results["winner"],
                args.minimum_development_pass_rate,
                args.minimum_holdout_gain,
                args.allow_task_regressions,
                skill_changed,
            )
        holdout["candidateSkills"] = holdout_skill_paths
        attempt_result_path = attempt_directory / "result.json"
        holdout["attempt"] = {
            "generation": args.generation,
            "attempt": attempt,
            "directory": str(attempt_directory),
            "manifest": str(attempt_manifest_path),
            "result": str(attempt_result_path),
            "winnerCandidate": winner,
            "winnerDigest": winner_digest,
            "baselineDigest": baseline_digest,
        }
        write_json_once(attempt_result_path, holdout, "Holdout attempt result")
        holdout_attempt_record = {
            **holdout["attempt"],
            "status": holdout["status"],
            "promoted": holdout["promoted"],
        }

    run = {
        "schemaVersion": 1,
        "source": "harbor",
        "completedAt": utc_now(),
        "mode": "analyze-only" if args.analyze_only else "live",
        "generation": args.generation,
        "baselineCandidate": args.baseline,
        "skillName": logical_name,
        "selectedWinner": winner,
        "bestEvolvableCandidate": best_evolvable,
        "survivors": survivors,
        "repairParents": repair_parents,
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "minimumHoldoutGain": args.minimum_holdout_gain,
        "allowTaskRegressions": args.allow_task_regressions,
        "requiredRewardThresholds": inputs["requiredRewardThresholds"],
        "provenance": {
            candidate_id: result["provenance"]
            for candidate_id, result in sorted(development_results.items())
        },
        "ranking": ranking,
        "holdout": holdout,
        "nextGeneration": {
            "status": "requires-agent-mutation",
            "parents": repair_parents,
            "instruction": (
                "Keep the original baseline candidate unchanged, create focused "
                "mutation or crossover skill directories from the listed parents, "
                "and use infrastructure diagnostics only for operational repairs; "
                f"then rerun this script with --generation {args.generation + 1}."
            ),
        },
        "artifacts": {
            "generation": str(generation_directory / "generation.json"),
            "ranking": str(generation_directory / "ranking.json"),
            "log": str(output / "population-search-log.json"),
            "report": str(output / "report.md"),
            "searchContract": str(output / "search-contract.json"),
            "holdoutContract": (
                str(output / "holdout-contract.json")
                if frozen_holdout_contract is not None
                else None
            ),
            "developmentSignatures": str(output / "development-signatures.json"),
            "holdoutSignatures": (
                str(output / "holdout-signatures.json")
                if (output / "holdout-signatures.json").is_file()
                else None
            ),
            "holdoutHistory": (
                str(output / "holdout") if (output / "holdout").is_dir() else None
            ),
            "holdoutAttempt": (
                holdout_attempt_record["directory"]
                if holdout_attempt_record is not None
                else None
            ),
        },
    }
    log_entry = {
        "generation": args.generation,
        "recordedAt": utc_now(),
        "baselineCandidate": args.baseline,
        "skillName": logical_name,
        "selectedWinner": winner,
        "bestEvolvableCandidate": best_evolvable,
        "survivors": survivors,
        "repairParents": repair_parents,
        "minimumDevelopmentPassRate": args.minimum_development_pass_rate,
        "ranking": ranking,
        "holdout": holdout,
        "holdoutAttempt": holdout_attempt_record,
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
