# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Fail-closed, lineage-preserving retries for external Harbor failures."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import secrets
import shutil
import stat
import subprocess
import sys
from collections import Counter
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

import yaml
from dirhash import dirhash
from harbor.job import Job
from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock
from harbor.models.job.result import JobResult, JobStats
from harbor.models.trial.config import TrialConfig
from harbor.models.trial.result import TrialResult
from harbor.publisher.packager import Packager


HARBOR_VERSION = "0.18.0"
SCHEMA_VERSION = 1
PORTABLE_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
RESERVED_NAMES = {
    "aux",
    "con",
    "nul",
    "prn",
    *(f"com{index}" for index in range(1, 10)),
    *(f"lpt{index}" for index in range(1, 10)),
}

# Exact, reviewable evidence vocabulary. Messages and substring guesses never count.
EXCEPTION_TYPES: dict[str, str] = {
    "AuthenticationError": "authentication",
    "CredentialError": "authentication",
    "EnvironmentSetupError": "environment",
    "ContainerStartupError": "environment",
    "DockerUnavailableError": "environment",
    "EvaluatorError": "evaluator",
    "VerifierError": "evaluator",
    "InfrastructureError": "infrastructure",
    "PlatformUnavailableError": "infrastructure",
    "ProviderUnavailableError": "provider",
    "RateLimitError": "provider",
    "ApiUsageLimitError": "provider",
}
ERROR_CODES: dict[str, str] = {
    "authentication-failed": "authentication",
    "invalid-api-key": "authentication",
    "missing-api-key": "authentication",
    "container-startup-failed": "environment",
    "docker-unavailable": "environment",
    "environment-setup-failed": "environment",
    "evaluator-unavailable": "evaluator",
    "verifier-error": "evaluator",
    "infrastructure-unavailable": "infrastructure",
    "platform-unavailable": "infrastructure",
    "api-overloaded": "provider",
    "provider-unavailable": "provider",
    "rate-limit-exceeded": "provider",
    "service-unavailable": "provider",
}
STRUCTURED_SIGNALS: dict[str, str] = {
    **ERROR_CODES,
    "authentication": "authentication",
    "authentication-failure": "authentication",
    "environment": "environment",
    "environment-failure": "environment",
    "evaluator": "evaluator",
    "evaluator-failure": "evaluator",
    "infrastructure": "infrastructure",
    "infrastructure-failure": "infrastructure",
    "provider": "provider",
    "provider-failure": "provider",
    "provider-5xx": "provider",
}
ABSOLUTE_DENY_SIGNALS = {
    "agent-timeout",
    "agent-timeout-error",
    "agent-token-budget-exhausted",
    "budget-exhausted",
    "cancelled-by-agent",
    "candidate-cancelled",
    "candidate-caused-cancellation",
    "context-length-exceeded",
    "context-length-limit",
    "context-limit",
    "context-window-exceeded",
    "provider-context-limit",
    "token-budget-exhausted",
}
ABSOLUTE_DENY_EXCEPTION_TYPES = {
    "AgentTimeoutError",
    "ContextLengthExceededError",
    "ContextWindowExceededError",
    "TokenBudgetExceededError",
}
SEMANTIC_SIGNALS = {
    "answer-emitted",
    "contract-failed",
    "contract-violation",
    "gate-failed",
    "invalid-evidence",
    "invalid-response",
    "scored-response",
    "semantic-failure",
    "verifier-rejected",
}
DIAGNOSTIC_KEYS = ("failure_domain", "status", "terminal_outcome", "error_code")
SHA256_VALUE = re.compile(r"^sha256:[0-9a-f]{64}$")
PROVIDER_TRANSIENT_SIGNALS = {
    "api-overloaded",
    "http-5xx",
    "provider-5xx",
    "provider-unavailable",
    "rate-limit",
    "rate-limit-exceeded",
    "service-unavailable",
}
ATTEMPT_TERMINAL_STATUSES = {
    "completed",
    "failed-execution",
    "failed-setup",
}

SIGTERM_PRE_AGENT_CONTRACT = (
    "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1"
)
OPT_IN_FAILURE_CONTRACTS: dict[str, dict[str, Any]] = {
    SIGTERM_PRE_AGENT_CONTRACT: {
        "domain": "infrastructure",
        "requiresRemediation": True,
        "maximumExternalRetries": 1,
        "rootEnvelope": {
            "finishedAt": None,
            "totalTrials": 1,
            "completedTrials": 1,
            "erroredTrials": 1,
            "cancelledTrials": 1,
            "runningTrials": 0,
            "pendingTrials": 0,
            "harborRetries": 0,
            "jobTokensAndCost": None,
        },
        "trialEnvelope": {
            "exceptionType": "CancelledError",
            "phase": "agent-setup",
            "agentExecution": None,
            "agentResult": None,
            "verifier": None,
            "verifierResult": None,
            "stepResults": None,
            "agentLogArtifact": "failed-and-absent",
        },
    },
}
SIGTERM_REQUIRED_TRACE_MARKERS = (
    "harbor/cli/jobs.py",
    "in _handle_sigterm",
    "raise KeyboardInterrupt",
    "harbor/trial/trial.py",
    "in _prepare",
    "in _setup_agent",
    "harbor/agents/installed/pi.py",
    "in install",
    "asyncio.exceptions.CancelledError",
)
SIGTERM_FORBIDDEN_TRACE_MARKERS = (
    "in _run_agent_phase",
    "await self.agent.run(",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def reject_unknown(mapping: dict[str, Any], allowed: set[str], location: str) -> None:
    unknown = sorted(set(mapping) - allowed)
    if unknown:
        raise ValueError(f"{location} has unknown keys: {', '.join(unknown)}")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_value(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode()).hexdigest()


def digest_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_digest(value: Any) -> str:
    text = require_string(value, "digest").casefold()
    return text.removeprefix("sha256:")


def exact_sha256(value: Any, location: str) -> str:
    text = require_string(value, location).casefold()
    if not SHA256_VALUE.fullmatch(text):
        raise ValueError(f"{location} must be exactly sha256:<64 lowercase hex characters>.")
    return text


def read_mapping(path: Path, label: str) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
        value = json.loads(text) if path.suffix.casefold() == ".json" else yaml.safe_load(text)
    except FileNotFoundError as error:
        raise ValueError(f"Required {label} is missing: {path}") from error
    except (json.JSONDecodeError, yaml.YAMLError) as error:
        raise ValueError(f"Invalid {label} at {path}: {error}") from error
    return require_mapping(value, label)


def atomic_json(path: Path, value: Any) -> None:
    validate_write_destination(path, f"write destination {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    validate_directory_node(path.parent, f"write parent {path.parent}")
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(16)}.tmp")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, flags, 0o600)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"Atomic JSON temporary is not a regular file: {temporary}")
        payload = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        if is_reparse(temporary):
            raise ValueError(f"Atomic JSON temporary became a link or reparse point: {temporary}")
        validate_path_chain(path.parent, f"write parent {path.parent}")
        os.replace(temporary, path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            if os.path.lexists(temporary):
                if is_reparse(temporary):
                    raise ValueError(f"Refusing to remove unsafe atomic temporary: {temporary}")
                temporary.unlink()
        except FileNotFoundError:
            pass


def atomic_text(path: Path, value: str) -> None:
    validate_write_destination(path, f"write destination {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    validate_directory_node(path.parent, f"write parent {path.parent}")
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(16)}.tmp")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, flags, 0o600)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"Atomic text temporary is not a regular file: {temporary}")
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(value.encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        if is_reparse(temporary):
            raise ValueError(f"Atomic text temporary became a link or reparse point: {temporary}")
        validate_path_chain(path.parent, f"write parent {path.parent}")
        os.replace(temporary, path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if os.path.lexists(temporary):
            if is_reparse(temporary):
                raise ValueError(f"Refusing to remove unsafe atomic temporary: {temporary}")
            temporary.unlink()


def operation_lock_path(output: Path) -> Path:
    return output.with_name(f".{output.name}.resume-operation.lock")


@contextmanager
def exclusive_operation_lock(output: Path):
    """Serialize all mutating modes; an orphaned O_EXCL lock fails closed."""

    lock_path = operation_lock_path(output)
    validate_write_destination(lock_path, "resume operation lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    validate_directory_node(lock_path.parent, "resume operation lock parent")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except FileExistsError as error:
        raise ValueError(
            f"A resume operation lock already exists (active or stale); fail closed and audit it: {lock_path}"
        ) from error
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", closefd=True) as stream:
            stream.write(json.dumps({"pid": os.getpid(), "createdAt": utc_now()}) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        if is_reparse(lock_path):
            raise ValueError(f"Resume operation lock became a link or reparse point: {lock_path}")
        yield lock_path
    finally:
        if os.path.lexists(lock_path):
            if is_reparse(lock_path):
                raise ValueError(f"Refusing to remove unsafe resume operation lock: {lock_path}")
            lock_path.unlink()


def resolve_config_path(base: Path, value: Any, location: str) -> Path:
    path = Path(require_string(value, location)).expanduser()
    candidate = path if path.is_absolute() else base / path
    return Path(os.path.abspath(os.fspath(candidate)))


def is_reparse(path: Path) -> bool:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise ValueError(f"Cannot inspect path {path}: {error}") from error
    flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return bool(
        path.is_symlink()
        or getattr(path, "is_junction", lambda: False)()
        or getattr(metadata, "st_file_attributes", 0) & flag
    )


def validate_path_chain(path: Path, label: str) -> None:
    """Reject links/reparse points in every existing lexical path component."""

    absolute = Path(os.path.abspath(os.fspath(path)))
    parts = absolute.parts
    if not parts:
        raise ValueError(f"{label} has no absolute path components: {path}")
    current = Path(parts[0])
    for part in parts[1:]:
        current /= part
        if not os.path.lexists(current):
            break
        if is_reparse(current):
            raise ValueError(
                f"{label} contains a symlink, junction, or reparse point in its path chain: {current}"
            )


def validate_write_destination(path: Path, label: str) -> None:
    validate_path_chain(path.parent, label)
    if os.path.lexists(path) and is_reparse(path):
        raise ValueError(f"{label} cannot be a symlink, junction, or reparse point: {path}")


def validate_directory_node(path: Path, label: str) -> None:
    validate_path_chain(path, label)
    if not path.is_dir() or is_reparse(path):
        raise ValueError(f"{label} must be a real directory: {path}")


def validate_tree(directory: Path, label: str) -> Path:
    validate_path_chain(directory, label)
    if is_reparse(directory):
        raise ValueError(f"{label} cannot be a symlink, junction, or reparse point: {directory}")
    try:
        root = directory.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError(f"{label} does not exist: {directory}") from error
    if not root.is_dir():
        raise ValueError(f"{label} must be a directory: {directory}")
    for current, directories, files in os.walk(root, followlinks=False):
        for name in [*directories, *files]:
            item = Path(current) / name
            if is_reparse(item):
                raise ValueError(
                    f"{label} must be self-contained; links and junctions are forbidden: {item}"
                )
            try:
                item.resolve(strict=True).relative_to(root)
            except (FileNotFoundError, ValueError) as error:
                raise ValueError(f"{label} entry escapes its root: {item}") from error
    return root


def parse_skill_name(skill: Path) -> str:
    skill_file = skill / "SKILL.md"
    try:
        text = skill_file.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"Skill has no SKILL.md: {skill}") from error
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError(f"SKILL.md must start with YAML frontmatter: {skill_file}")
    frontmatter = require_mapping(yaml.safe_load(match.group(1)), str(skill_file))
    name = require_string(frontmatter.get("name"), f"{skill_file} frontmatter.name")
    if not PORTABLE_NAME.fullmatch(name) or name.casefold() in RESERVED_NAMES:
        raise ValueError(
            f"Skill frontmatter.name must be a portable non-reserved name: {skill}"
        )
    return name


def skill_digest(skill: Path) -> str:
    validate_tree(skill, "skill bundle")
    hasher = hashlib.sha256()
    files = sorted(
        (path for path in skill.rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(skill).as_posix(),
    )
    for path in files:
        relative = path.relative_to(skill).as_posix()
        content = hashlib.sha256(path.read_bytes()).hexdigest()
        hasher.update(relative.encode())
        hasher.update(b"\0")
        hasher.update(content.encode())
        hasher.update(b"\0")
    return "sha256:" + hasher.hexdigest()


def finite_reward(value: Any, location: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be numeric.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{location} must be finite.")
    return result


def validate_finite_tree(value: Any, location: str) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{location} contains NaN or Infinity.")
    if isinstance(value, dict):
        for key, child in value.items():
            validate_finite_tree(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            validate_finite_tree(child, f"{location}[{index}]")


def normalize_signal(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    separated = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    return re.sub(r"[^a-z0-9]+", "-", separated.casefold()).strip("-")


def reward_values(result: dict[str, Any]) -> dict[str, float]:
    verifier = result.get("verifier_result")
    if verifier is None:
        return {}
    verifier = require_mapping(verifier, "trial verifier_result")
    rewards = verifier.get("rewards") or {}
    rewards = require_mapping(rewards, "trial verifier_result.rewards")
    return {key: finite_reward(value, f"reward {key}") for key, value in rewards.items()}


def collect_diagnostics(
    trial_directory: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[Path]]:
    paths = []
    for path in trial_directory.rglob("diagnostics.json"):
        relative = path.relative_to(trial_directory)
        parts = relative.parts
        root_verifier = len(parts) >= 2 and parts[0] == "verifier"
        step_verifier = (
            len(parts) >= 4 and parts[0] == "steps" and parts[2] == "verifier"
        )
        if path.is_file() and (root_verifier or step_verifier):
            paths.append(path)
    paths.sort(key=lambda path: path.relative_to(trial_directory).as_posix())
    diagnostics: list[dict[str, Any]] = []
    values: list[dict[str, str]] = []

    def visit(payload: Any, relative: str, location: str = "$") -> None:
        if isinstance(payload, dict):
            for key, child in payload.items():
                child_location = f"{location}.{key}"
                if key in DIAGNOSTIC_KEYS:
                    if isinstance(child, (dict, list)):
                        raise ValueError(
                            f"Structured verifier field {child_location} must be scalar: {relative}"
                        )
                    normalized = normalize_signal(str(child)) if child is not None else ""
                    values.append({
                        "path": f"{relative}#{child_location}",
                        "key": key,
                        "value": normalized,
                    })
                elif isinstance(child, (dict, list)):
                    visit(child, relative, child_location)
        elif isinstance(payload, list):
            for index, child in enumerate(payload):
                if isinstance(child, (dict, list)):
                    visit(child, relative, f"{location}[{index}]")

    for path in paths:
        if is_reparse(path):
            raise ValueError(f"Verifier diagnostic cannot be a link: {path}")
        payload = read_mapping(path, "verifier-owned diagnostics")
        validate_finite_tree(payload, str(path))
        relative = path.relative_to(trial_directory).as_posix()
        before = len(values)
        visit(payload, relative)
        row_values = {
            item["path"] + ":" + item["key"]: item["value"]
            for item in values[before:]
        }
        diagnostics.append(
            {
                "path": relative,
                "sha256": digest_file(path),
                "signals": row_values,
            }
        )
    return diagnostics, values, paths


def required_regular_file(path: Path, label: str) -> Path:
    validate_path_chain(path, label)
    if not path.is_file() or is_reparse(path):
        raise ValueError(f"{label} must be a real regular file: {path}")
    return path


def require_completed_timing(result: dict[str, Any], field: str) -> None:
    timing = require_mapping(result.get(field), f"cancelled TrialResult.{field}")
    require_string(timing.get("started_at"), f"cancelled TrialResult.{field}.started_at")
    require_string(timing.get("finished_at"), f"cancelled TrialResult.{field}.finished_at")


def classify_sigterm_pre_agent_failure(
    job_directory: Path,
    raw_job_result: dict[str, Any],
    trial_directory: Path,
    result: dict[str, Any],
) -> tuple[dict[str, Any], list[Path]]:
    """Verify the one opt-in Harbor 0.18.0 pre-agent SIGTERM contract."""

    for field in (
        "agent_execution",
        "agent_result",
        "verifier",
        "verifier_result",
        "step_results",
    ):
        if field not in result or result[field] is not None:
            raise ValueError(
                f"{SIGTERM_PRE_AGENT_CONTRACT} requires explicit {field}=null."
            )
    require_string(result.get("started_at"), "cancelled TrialResult.started_at")
    require_string(result.get("finished_at"), "cancelled TrialResult.finished_at")
    require_completed_timing(result, "environment_setup")
    require_completed_timing(result, "agent_setup")

    info = require_mapping(result.get("exception_info"), "cancelled TrialResult.exception_info")
    if info.get("exception_type") != "CancelledError":
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} requires exception_type=CancelledError."
        )
    if info.get("exception_message") != "":
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} requires the native empty cancellation message."
        )
    trace = info.get("exception_traceback")
    if not isinstance(trace, str) or not trace.strip():
        raise ValueError(
            "cancelled TrialResult.exception_info.exception_traceback must be a non-empty string."
        )
    missing_markers = [marker for marker in SIGTERM_REQUIRED_TRACE_MARKERS if marker not in trace]
    forbidden_markers = [marker for marker in SIGTERM_FORBIDDEN_TRACE_MARKERS if marker in trace]
    if missing_markers or forbidden_markers:
        details = []
        if missing_markers:
            details.append("missing=" + ",".join(missing_markers))
        if forbidden_markers:
            details.append("forbidden=" + ",".join(forbidden_markers))
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} traceback does not verify: " + "; ".join(details)
        )

    stats = require_mapping(raw_job_result.get("stats"), "cancelled JobResult.stats")
    evals = require_mapping(stats.get("evals"), "cancelled JobResult.stats.evals")
    if len(evals) != 1:
        raise ValueError(f"{SIGTERM_PRE_AGENT_CONTRACT} requires exactly one eval stats row.")
    eval_stats = require_mapping(next(iter(evals.values())), "cancelled eval stats")
    if eval_stats.get("n_trials") != 0 or eval_stats.get("n_errors") != 1:
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} requires n_trials=0 and n_errors=1."
        )
    expected_exceptions = {"CancelledError": [result.get("trial_name")]}
    if canonical_json(eval_stats.get("exception_stats") or {}) != canonical_json(expected_exceptions):
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} exception_stats do not name the cancelled trial exactly."
        )

    job_log = required_regular_file(job_directory / "job.log", "cancelled Harbor job log")
    trial_log = required_regular_file(trial_directory / "trial.log", "cancelled Harbor trial log")
    exception_path = required_regular_file(
        trial_directory / "exception.txt", "cancelled Harbor exception artifact"
    )
    manifest_path = required_regular_file(
        trial_directory / "artifacts" / "manifest.json",
        "cancelled Harbor artifact manifest",
    )
    if digest_file(job_log) != digest_file(trial_log):
        raise ValueError(f"{SIGTERM_PRE_AGENT_CONTRACT} job.log and trial.log differ.")
    if exception_path.read_text(encoding="utf-8") != trace:
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} exception.txt differs from exception_info traceback."
        )

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid cancelled Harbor artifact manifest: {error}") from error
    rows = require_list(manifest, "cancelled Harbor artifact manifest")
    failed_agent_log = [
        require_mapping(row, "cancelled Harbor artifact manifest row")
        for row in rows
        if isinstance(row, dict)
        and row.get("source") == "/logs/agent/pi.txt"
        and row.get("destination") == "artifacts/pi.jsonl"
        and row.get("type") == "file"
        and row.get("status") == "failed"
        and row.get("service") is None
    ]
    if len(failed_agent_log) != 1:
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} requires one failed native pi log artifact row."
        )
    if os.path.lexists(trial_directory / "artifacts" / "pi.jsonl"):
        raise ValueError(
            f"{SIGTERM_PRE_AGENT_CONTRACT} requires artifacts/pi.jsonl to be absent."
        )

    agent_directory = validate_tree(trial_directory / "agent", "cancelled agent directory")
    verifier_directory = validate_tree(
        trial_directory / "verifier", "cancelled verifier directory"
    )
    if any(path.is_file() for path in agent_directory.rglob("*")):
        raise ValueError(f"{SIGTERM_PRE_AGENT_CONTRACT} requires no agent output files.")
    if any(path.is_file() for path in verifier_directory.rglob("*")):
        raise ValueError(f"{SIGTERM_PRE_AGENT_CONTRACT} requires no verifier output files.")

    artifacts = [job_log, trial_log, exception_path, manifest_path]
    evidence_artifacts = [
        {
            "path": path.relative_to(job_directory).as_posix(),
            "sha256": digest_file(path),
        }
        for path in artifacts
    ]
    return (
        {
            "kind": "external",
            "domain": "infrastructure",
            "eligible": True,
            "reason": "allowlisted-opt-in-failure-contract",
            "evidence": [
                f"failure-contract={SIGTERM_PRE_AGENT_CONTRACT}",
                "root.finished_at=null",
                "root.cancelled=1,errored=1,running=0,pending=0,retries=0",
                "trial.agent_execution=null",
                "trial.agent_result=null",
                "trial.verifier=null",
                "trial.verifier_result=null",
                "trial.step_results=null",
                "trial.exception=CancelledError-from-_handle_sigterm-during-_setup_agent",
                "trial.agent-log=failed-and-absent",
            ],
            "evidenceArtifacts": evidence_artifacts,
            "observedExternalDomains": ["infrastructure"],
            "failureContract": SIGTERM_PRE_AGENT_CONTRACT,
            "requiresRemediation": True,
        },
        artifacts,
    )


def exception_evidence(result: dict[str, Any]) -> tuple[str | None, str | None]:
    raw = result.get("exception_info")
    if raw is None:
        return None, None
    info = require_mapping(raw, "trial exception_info")
    type_values = [str(info[key]).strip() for key in ("exception_type", "type") if info.get(key)]
    code_values = [normalize_signal(info[key]) for key in ("error_code", "code") if info.get(key)]
    if len(set(type_values)) > 1:
        raise ValueError("Trial exception_info contains conflicting exception types.")
    if len(set(code_values)) > 1:
        raise ValueError("Trial exception_info contains conflicting error codes.")
    exception_type = type_values[0] if type_values else None
    error_code = code_values[0] if code_values else None
    return (
        exception_type,
        error_code,
    )


def is_absolute_deny_signal(signal: str) -> bool:
    return signal in ABSOLUTE_DENY_SIGNALS or any(
        token in signal
        for token in (
            "context-length",
            "context-limit",
            "context-window",
            "agent-timeout",
            "token-budget-exhaust",
            "budget-exhaust",
            "candidate-caused-cancell",
            "cancelled-by-agent",
        )
    )


def is_semantic_signal(signal: str) -> bool:
    return signal in SEMANTIC_SIGNALS or (
        signal.startswith("answer-emitted")
        or "invalid-evidence" in signal
        or "invalid-response" in signal
        or "contract-" in signal
        or signal.endswith("-contract")
        or "gate-failed" in signal
        or "coverage-below-minimum" in signal
    )


def classify_failure(
    result: dict[str, Any], diagnostic_values: list[dict[str, str]], reward_key: str
) -> dict[str, Any]:
    exception_type, exception_code = exception_evidence(result)
    signals = {item["value"] for item in diagnostic_values if item["value"]}
    if exception_code:
        signals.add(exception_code)
    denies = sorted(signal for signal in signals if is_absolute_deny_signal(signal))
    if exception_type in ABSOLUTE_DENY_EXCEPTION_TYPES:
        denies.append(normalize_signal(exception_type))
    semantic = sorted(signal for signal in signals if is_semantic_signal(signal))

    domains: set[str] = set()
    evidence: list[str] = []
    for item in diagnostic_values:
        key, value = item["key"], item["value"]
        domain = STRUCTURED_SIGNALS.get(value)
        if domain:
            domains.add(domain)
            evidence.append(f"{item['path']}:{key}={value}")
    if exception_type in EXCEPTION_TYPES:
        domains.add(EXCEPTION_TYPES[exception_type])
        evidence.append(f"exception.type={exception_type}")
    if exception_code in ERROR_CODES:
        domains.add(ERROR_CODES[exception_code])
        evidence.append(f"exception.code={exception_code}")

    rewards = reward_values(result)
    nonzero_rewards = sorted(key for key, value in rewards.items() if value != 0.0)
    gate_failures = sorted(
        key
        for key, value in rewards.items()
        if (key.casefold().endswith("_gate") or key.casefold().endswith("-gate"))
        and value < 1.0
    )
    observed_domains = sorted(domains)
    if denies:
        return {
            "kind": "denied",
            "domain": None,
            "eligible": False,
            "reason": "absolute-deny:" + ",".join(sorted(set(denies))),
            "evidence": sorted(evidence),
            "observedExternalDomains": observed_domains,
        }
    if semantic and domains:
        return {
            "kind": "conflict",
            "domain": None,
            "eligible": False,
            "reason": "conflicting-external-and-semantic-signals",
            "evidence": sorted(evidence + semantic),
            "observedExternalDomains": observed_domains,
        }
    known_signals = set(STRUCTURED_SIGNALS) | ABSOLUTE_DENY_SIGNALS | SEMANTIC_SIGNALS
    unknown_signals = sorted(
        signal
        for signal in signals
        if signal not in known_signals
        and not is_absolute_deny_signal(signal)
        and not is_semantic_signal(signal)
    )
    if domains and nonzero_rewards:
        return {
            "kind": "conflict",
            "domain": None,
            "eligible": False,
            "reason": "conflicting-external-and-nonzero-semantic-reward",
            "evidence": sorted(evidence + [f"nonzero-reward:{key}" for key in nonzero_rewards]),
            "observedExternalDomains": observed_domains,
        }
    if domains and unknown_signals:
        return {
            "kind": "conflict",
            "domain": None,
            "eligible": False,
            "reason": "unrecognized-structured-signals:" + ",".join(unknown_signals),
            "evidence": sorted(evidence + unknown_signals),
            "observedExternalDomains": observed_domains,
        }
    if semantic:
        return {
            "kind": "semantic",
            "domain": None,
            "eligible": False,
            "reason": "semantic-outcome:" + ",".join(sorted(set(semantic))),
            "evidence": [],
            "observedExternalDomains": observed_domains,
        }
    if len(domains) > 1:
        return {
            "kind": "conflict",
            "domain": None,
            "eligible": False,
            "reason": "conflicting-external-domains:" + ",".join(sorted(domains)),
            "evidence": sorted(evidence),
            "observedExternalDomains": observed_domains,
        }
    provider_exception_is_transient = exception_type in {
        "ProviderUnavailableError",
        "RateLimitError",
        "ApiUsageLimitError",
    }
    if domains == {"provider"} and not (
        signals & PROVIDER_TRANSIENT_SIGNALS or provider_exception_is_transient
    ):
        return {
            "kind": "ambiguous",
            "domain": None,
            "eligible": False,
            "reason": "provider-failure-lacks-exact-transient-signal",
            "evidence": sorted(evidence),
            "observedExternalDomains": observed_domains,
        }
    if len(domains) == 1:
        domain = next(iter(domains))
        return {
            "kind": "external",
            "domain": domain,
            "eligible": True,
            "reason": "allowlisted-external-evidence",
            "evidence": sorted(evidence),
            "observedExternalDomains": observed_domains,
        }
    if unknown_signals:
        return {
            "kind": "ambiguous",
            "domain": None,
            "eligible": False,
            "reason": "unrecognized-structured-signals:" + ",".join(unknown_signals),
            "evidence": [],
            "observedExternalDomains": observed_domains,
        }
    if gate_failures:
        semantic.append("failed-gate:" + ",".join(gate_failures))
    if semantic:
        return {
            "kind": "semantic",
            "domain": None,
            "eligible": False,
            "reason": "semantic-outcome:" + ",".join(sorted(set(semantic))),
            "evidence": [],
            "observedExternalDomains": observed_domains,
        }
    if exception_type or exception_code:
        return {
            "kind": "ambiguous",
            "domain": None,
            "eligible": False,
            "reason": "exception-is-not-exactly-allowlisted",
            "evidence": [],
            "observedExternalDomains": observed_domains,
        }
    if reward_key in rewards:
        return {
            "kind": "semantic",
            "domain": None,
            "eligible": False,
            "reason": "semantic-reward-present",
            "evidence": [],
            "observedExternalDomains": observed_domains,
        }
    return {
        "kind": "ambiguous",
        "domain": None,
        "eligible": False,
        "reason": "missing-reward-without-allowlisted-external-evidence",
        "evidence": [],
        "observedExternalDomains": observed_domains,
    }


def load_config(path: Path) -> dict[str, Any]:
    validate_path_chain(path, "resume config")
    if is_reparse(path):
        raise ValueError(f"resume config cannot be a link or reparse point: {path}")
    raw = read_mapping(path, "resume config")
    reject_unknown(
        raw,
        {
            "schemaVersion",
            "sourceJobs",
            "outputDirectory",
            "rewardKey",
            "requiredEnv",
            "requiredPaths",
            "policy",
            "remediation",
            "retryJobs",
        },
        "config",
    )
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"config.schemaVersion must be {SCHEMA_VERSION}.")
    base = Path(os.path.abspath(os.fspath(path.parent)))
    sources = []
    source_metadata = []
    for index, item in enumerate(require_list(raw.get("sourceJobs"), "sourceJobs")):
        if isinstance(item, str):
            path_value = item
            metadata = {"candidateId": None, "label": None}
        else:
            entry = require_mapping(item, f"sourceJobs[{index}]")
            reject_unknown(entry, {"jobDirectory", "candidateId", "label"}, f"sourceJobs[{index}]")
            path_value = entry.get("jobDirectory")
            metadata = {
                "candidateId": (
                    require_string(entry["candidateId"], f"sourceJobs[{index}].candidateId")
                    if entry.get("candidateId") is not None
                    else None
                ),
                "label": (
                    require_string(entry["label"], f"sourceJobs[{index}].label")
                    if entry.get("label") is not None
                    else None
                ),
            }
        sources.append(resolve_config_path(base, path_value, f"sourceJobs[{index}].jobDirectory"))
        source_metadata.append(metadata)
    if not sources or len(sources) != len(set(sources)):
        raise ValueError("sourceJobs must contain unique job directories.")
    output = resolve_config_path(base, raw.get("outputDirectory"), "outputDirectory")
    validate_path_chain(output, "outputDirectory")
    if os.path.lexists(output) and not output.is_dir():
        raise ValueError(f"outputDirectory must be a directory when it exists: {output}")
    if any(output == source or source in output.parents or output in source.parents for source in sources):
        raise ValueError("outputDirectory and sourceJobs must be disjoint.")
    reward_key = require_string(raw.get("rewardKey"), "rewardKey")
    required_env = [
        require_string(value, f"requiredEnv[{index}]")
        for index, value in enumerate(require_list(raw.get("requiredEnv"), "requiredEnv"))
    ]
    if len(required_env) != len(set(required_env)):
        raise ValueError("requiredEnv values must be unique.")
    required_paths = [
        resolve_config_path(base, value, f"requiredPaths[{index}]")
        for index, value in enumerate(require_list(raw.get("requiredPaths") or [], "requiredPaths"))
    ]
    if len(required_paths) != len(set(required_paths)):
        raise ValueError("requiredPaths values must be unique.")
    policy = require_mapping(raw.get("policy"), "policy")
    reject_unknown(
        policy,
        {"maxExternalRetriesPerTrial", "optInFailureContracts"},
        "policy",
    )
    maximum = policy.get("maxExternalRetriesPerTrial")
    if isinstance(maximum, bool) or not isinstance(maximum, int) or maximum < 1:
        raise ValueError("policy.maxExternalRetriesPerTrial must be a positive integer.")
    opt_in_failure_contracts = [
        require_string(value, f"policy.optInFailureContracts[{index}]")
        for index, value in enumerate(
            require_list(policy.get("optInFailureContracts") or [], "policy.optInFailureContracts")
        )
    ]
    if len(opt_in_failure_contracts) != len(set(opt_in_failure_contracts)):
        raise ValueError("policy.optInFailureContracts values must be unique.")
    unsupported_contracts = sorted(
        set(opt_in_failure_contracts) - set(OPT_IN_FAILURE_CONTRACTS)
    )
    if unsupported_contracts:
        raise ValueError(
            "Unsupported opt-in failure contracts: " + ", ".join(unsupported_contracts)
        )
    for contract_id in opt_in_failure_contracts:
        contract_cap = OPT_IN_FAILURE_CONTRACTS[contract_id]["maximumExternalRetries"]
        if maximum != contract_cap:
            raise ValueError(
                f"{contract_id} requires policy.maxExternalRetriesPerTrial={contract_cap}."
            )

    remediation_raw = require_mapping(raw.get("remediation") or {}, "remediation")
    reject_unknown(
        remediation_raw,
        {"authentication", "environment", "infrastructure"},
        "remediation",
    )
    if "infrastructure" in remediation_raw and SIGTERM_PRE_AGENT_CONTRACT not in opt_in_failure_contracts:
        raise ValueError(
            "remediation.infrastructure is accepted only with the exact supported opt-in failure contract."
        )
    remediation: dict[str, dict[str, Any]] = {}
    for domain, item in remediation_raw.items():
        entry = require_mapping(item, f"remediation.{domain}")
        reject_unknown(
            entry,
            {
                "attested",
                "remediationType",
                "evidencePath",
                "remediationEvidenceSha256",
                "preflightCommand",
            },
            f"remediation.{domain}",
        )
        if not isinstance(entry.get("attested"), bool):
            raise ValueError(f"remediation.{domain}.attested must be boolean.")
        command = [
            require_string(value, f"remediation.{domain}.preflightCommand[{index}]")
            for index, value in enumerate(
                require_list(entry.get("preflightCommand"), f"remediation.{domain}.preflightCommand")
            )
        ]
        if not command:
            raise ValueError(f"remediation.{domain}.preflightCommand cannot be empty.")
        remediation_type = normalize_signal(
            require_string(entry.get("remediationType"), f"remediation.{domain}.remediationType")
        )
        if not remediation_type:
            raise ValueError(f"remediation.{domain}.remediationType must be portable text.")
        remediation[domain] = {
            "attested": entry["attested"],
            "remediationType": remediation_type,
            "evidencePath": resolve_config_path(
                base, entry.get("evidencePath"), f"remediation.{domain}.evidencePath"
            ),
            "remediationEvidenceSha256": exact_sha256(
                entry.get("remediationEvidenceSha256"),
                f"remediation.{domain}.remediationEvidenceSha256",
            ),
            "preflightCommand": command,
        }

    retry_jobs = []
    for index, item in enumerate(require_list(raw.get("retryJobs") or [], "retryJobs")):
        entry = require_mapping(item, f"retryJobs[{index}]")
        reject_unknown(entry, {"sourceTrialKey", "attempt", "jobDirectory"}, f"retryJobs[{index}]")
        attempt = entry.get("attempt")
        if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
            raise ValueError(f"retryJobs[{index}].attempt must be a positive integer.")
        retry_jobs.append(
            {
                "sourceTrialKey": require_string(entry.get("sourceTrialKey"), f"retryJobs[{index}].sourceTrialKey"),
                "attempt": attempt,
                "jobDirectory": resolve_config_path(base, entry.get("jobDirectory"), f"retryJobs[{index}].jobDirectory"),
            }
        )
    pairs = [(entry["sourceTrialKey"], entry["attempt"]) for entry in retry_jobs]
    if len(pairs) != len(set(pairs)):
        raise ValueError("retryJobs sourceTrialKey/attempt pairs must be unique.")
    return {
        "path": Path(os.path.abspath(os.fspath(path))),
        "sourceJobs": sources,
        "sourceJobMetadata": source_metadata,
        "outputDirectory": output,
        "rewardKey": reward_key,
        "requiredEnv": required_env,
        "requiredPaths": required_paths,
        "maxRetries": maximum,
        "optInFailureContracts": opt_in_failure_contracts,
        "remediation": remediation,
        "retryJobs": retry_jobs,
    }


def model_json(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json", exclude_none=True)


def stable_job_config_payload(value: Any) -> dict[str, Any]:
    """Serialize JobConfig deterministically even when Harbor models exception sets."""

    model = value if isinstance(value, JobConfig) else JobConfig.model_validate(value)
    payload = model_json(model)
    retry = payload.get("retry")
    if isinstance(retry, dict):
        for field in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(field), list):
                retry[field] = sorted(retry[field])
    return payload


def ensure_harbor_version(job_lock: dict[str, Any], location: str) -> None:
    harbor = require_mapping(job_lock.get("harbor"), f"{location}.harbor")
    observed = require_string(harbor.get("version"), f"{location}.harbor.version")
    if observed != HARBOR_VERSION:
        raise ValueError(
            f"{location} was produced by Harbor {observed}; canonical retries require {HARBOR_VERSION}."
        )


def subset_equal(expected: Any, observed: Any, location: str) -> None:
    """Require every explicitly configured field to survive in a lock/result."""

    if isinstance(expected, dict):
        observed_map = require_mapping(observed, location)
        for key, value in expected.items():
            if value is None:
                continue
            if key not in observed_map:
                raise ValueError(f"{location} is missing configured field {key}.")
            subset_equal(value, observed_map[key], f"{location}.{key}")
        return
    if isinstance(expected, list):
        if not isinstance(observed, list) or canonical_json(expected) != canonical_json(observed):
            raise ValueError(f"{location} differs from the configured list.")
        return
    if expected != observed:
        raise ValueError(f"{location} drift: expected {expected!r}, observed {observed!r}.")


def resolved_path(value: Any, location: str) -> Path:
    text = require_string(value, location)
    if os.name == "nt":
        match = re.fullmatch(r"/mnt/([a-zA-Z])(?:/(.*))?", text)
        if match:
            text = f"{match.group(1).upper()}:/{match.group(2) or ''}"
    raw = Path(text).expanduser()
    if not raw.is_absolute():
        raise ValueError(f"{location} must be absolute in canonical Harbor artifacts: {raw}")
    return Path(os.path.abspath(os.fspath(raw)))


def host_path_value(value: Any, location: str) -> str:
    """Return the local host spelling for a canonical artifact path."""

    return str(resolved_path(value, location))


def task_signature(result: dict[str, Any], trial_lock: dict[str, Any]) -> dict[str, str]:
    task = require_mapping(trial_lock.get("task"), "trial lock task")
    locked_name = require_string(task.get("name"), "trial lock task.name")
    digest = normalize_digest(task.get("digest"))
    result_name = require_string(result.get("task_name"), "trial result task_name")
    checksum = normalize_digest(result.get("task_checksum"))
    if result_name != locked_name and not result_name.endswith("__" + locked_name):
        raise ValueError(
            f"Trial result task name drift: expected {locked_name!r}, observed {result_name!r}."
        )
    return {
        "resultName": result_name,
        "resultChecksum": "sha256:" + checksum,
        "lockedName": locked_name,
        "lockedDigest": "sha256:" + digest,
    }


def skill_lock_signature(trial_lock: dict[str, Any]) -> list[tuple[str, str]]:
    skills = require_list(trial_lock.get("skills"), "trial lock skills")
    return sorted(
        (
            require_string(require_mapping(item, "locked skill").get("name"), "locked skill.name"),
            "sha256:" + normalize_digest(require_mapping(item, "locked skill").get("digest")),
        )
        for item in skills
    )


def root_trial_signature(lock_trial: dict[str, Any]) -> str:
    task = require_mapping(lock_trial.get("task"), "job lock trial.task")
    agent = require_mapping(lock_trial.get("agent"), "job lock trial.agent")
    value = {
        "task": {
            "name": task.get("name"),
            "digest": "sha256:" + normalize_digest(task.get("digest")),
        },
        "agent": agent,
        "skills": skill_lock_signature(lock_trial),
        "environment": lock_trial.get("environment") or {},
        "verifier": lock_trial.get("verifier") or {},
    }
    return digest_value(value)


def trial_root_signature(trial_lock: dict[str, Any]) -> str:
    return root_trial_signature(trial_lock)


def exact_sigterm_root_envelope(
    raw_result: dict[str, Any], result_paths: list[Path]
) -> bool:
    stats = require_mapping(raw_result.get("stats"), "cancelled JobResult.stats")
    expected_stats = {
        "n_completed_trials": 1,
        "n_errored_trials": 1,
        "n_running_trials": 0,
        "n_pending_trials": 0,
        "n_cancelled_trials": 1,
        "n_retries": 0,
    }
    return (
        "finished_at" in raw_result
        and raw_result["finished_at"] is None
        and raw_result.get("n_total_trials") == 1
        and len(result_paths) == 1
        and all(stats.get(key) == value for key, value in expected_stats.items())
        and all(
            key in stats and stats[key] is None
            for key in ("n_input_tokens", "n_cache_tokens", "n_output_tokens", "cost_usd")
        )
    )


def validate_job_completion(
    directory: Path,
    raw_result: dict[str, Any],
    result_model: JobResult,
    result_paths: list[Path],
    opt_in_failure_contracts: set[str],
) -> str | None:
    problems: list[str] = []
    stats = result_model.stats
    if result_model.finished_at is None:
        problems.append("missing finished_at")
    if result_model.n_total_trials != len(result_paths):
        problems.append(
            f"declares {result_model.n_total_trials} trials but has {len(result_paths)} trial results"
        )
    if stats.n_completed_trials != len(result_paths):
        problems.append(
            f"stats report {stats.n_completed_trials} completed trials but {len(result_paths)} exist"
        )
    if stats.n_running_trials or stats.n_pending_trials or stats.n_cancelled_trials:
        problems.append("contains running, pending, or cancelled trials")
    if not problems:
        return None
    if (
        SIGTERM_PRE_AGENT_CONTRACT in opt_in_failure_contracts
        and exact_sigterm_root_envelope(raw_result, result_paths)
    ):
        return SIGTERM_PRE_AGENT_CONTRACT
    raise ValueError(f"Incomplete Harbor job {directory}: " + "; ".join(problems))


def validate_root_retry(job_config: dict[str, Any], job_lock: dict[str, Any]) -> str:
    configured = require_mapping(job_config.get("retry") or {}, "JobConfig.retry")
    lock_model = JobLock.model_validate(job_lock)
    locked = model_json(lock_model.retry)
    def normalized(value: dict[str, Any]) -> dict[str, Any]:
        result = deepcopy(value)
        for key in ("include_exceptions", "exclude_exceptions"):
            if isinstance(result.get(key), list):
                result[key] = sorted(result[key])
        return result

    if canonical_json(normalized(configured)) != canonical_json(normalized(locked)):
        raise ValueError("JobLock.retry differs from the canonical JobConfig retry policy.")
    retries = configured.get("max_retries", locked.get("max_retries", 0))
    if retries not in (0, None):
        raise ValueError(
            "Source JobConfig.retry.max_retries must be 0; external retry caps cannot coexist with hidden Harbor retries."
        )
    return digest_value(normalized(locked))


def selected_agent(
    job_config: dict[str, Any], trial_agent: dict[str, Any], location: str
) -> dict[str, Any]:
    name = require_string(trial_agent.get("name"), f"{location}.name")
    model_name = require_string(trial_agent.get("model_name"), f"{location}.model_name")
    matches = [
        agent
        for agent in require_list(job_config.get("agents"), "JobConfig.agents")
        if agent.get("name") == name and agent.get("model_name") == model_name
    ]
    if len(matches) != 1:
        raise ValueError(f"{location} does not select exactly one JobConfig agent profile.")
    return require_mapping(matches[0], "selected JobConfig agent")


def canonical_agent_profile(value: dict[str, Any]) -> dict[str, Any]:
    profile = deepcopy(value)
    profile.pop("skills", None)
    profile.setdefault("extra_allowed_hosts", [])
    profile.setdefault("mcp_servers", [])
    profile.setdefault("env", {})
    profile.setdefault("kwargs", {})
    return profile


TRIAL_INHERITED_JOB_FIELDS = (
    "install_only",
    "timeout_multiplier",
    "environment_build_timeout_multiplier",
    "agent_setup_timeout_multiplier",
    "agent_timeout_multiplier",
    "verifier_timeout_multiplier",
    "environment",
    "verifier",
    "artifacts",
    "extra_instruction_paths",
)


def validate_trial_inherited_profile(
    job_config: dict[str, Any], trial_config: dict[str, Any]
) -> None:
    """Bind every JobConfig field inherited by a Harbor TrialConfig."""

    for field in TRIAL_INHERITED_JOB_FIELDS:
        if canonical_json(job_config.get(field)) != canonical_json(trial_config.get(field)):
            raise ValueError(
                f"Execution profile drift between JobConfig and TrialConfig field {field}."
            )


def canonical_task_config(value: Any, location: str) -> dict[str, Any]:
    task = deepcopy(require_mapping(value, location))
    if task.get("path") is not None:
        task["path"] = host_path_value(task["path"], f"{location}.path")
    return task


def canonical_skill_paths(agent: dict[str, Any], skill: dict[str, Any], location: str) -> dict[str, Any]:
    result = deepcopy(agent)
    paths = require_list(result.get("skills") or [], f"{location}.skills")
    if len(paths) != 1:
        raise ValueError(f"{location}.skills must contain exactly one canonical skill.")
    result["skills"] = [
        {
            "name": require_string(skill.get("name"), f"{location} canonical skill name"),
            "digest": exact_sha256(skill.get("digest"), f"{location} canonical skill digest"),
        }
    ]
    return result


def canonical_trial_execution_profile(
    trial_config: dict[str, Any], skill: dict[str, Any]
) -> dict[str, Any]:
    """Normalize only per-run identity/destination and the staged skill source."""

    profile = model_json(TrialConfig.model_validate(trial_config))
    for field in ("trial_name", "trials_dir", "job_id"):
        profile.pop(field, None)
    profile["task"] = canonical_task_config(
        require_mapping(trial_config.get("task"), "TrialConfig.task"),
        "TrialConfig.task",
    )
    profile["agent"] = canonical_skill_paths(
        require_mapping(profile.get("agent"), "TrialConfig.agent"),
        skill,
        "TrialConfig.agent",
    )
    return profile


def canonical_job_common_profile(job_config: dict[str, Any]) -> dict[str, Any]:
    """Keep every executed job option while removing selection/scheduling identity."""

    profile = model_json(JobConfig.model_validate(job_config))
    for field in (
        "job_name",
        "jobs_dir",
        "n_attempts",
        "n_concurrent_trials",
        "agents",
        "tasks",
        "datasets",
    ):
        profile.pop(field, None)
    retry = profile.get("retry")
    if isinstance(retry, dict):
        for field in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(field), list):
                retry[field] = sorted(retry[field])
    return profile


def canonical_retry_job_profile(
    job_config: dict[str, Any], skill: dict[str, Any]
) -> dict[str, Any]:
    """Canonicalize a one-trial retry JobConfig without relaxing behavior fields."""

    profile = model_json(JobConfig.model_validate(job_config))
    profile.pop("job_name", None)
    profile.pop("jobs_dir", None)
    retry = profile.get("retry")
    if isinstance(retry, dict):
        for field in ("include_exceptions", "exclude_exceptions"):
            if isinstance(retry.get(field), list):
                retry[field] = sorted(retry[field])
    agents = require_list(profile.get("agents"), "retry JobConfig.agents")
    if len(agents) != 1:
        raise ValueError("Each external retry JobConfig must select exactly one agent.")
    profile["agents"] = [
        canonical_skill_paths(
            require_mapping(agents[0], "retry JobConfig agent"),
            skill,
            "retry JobConfig agent",
        )
    ]
    raw_tasks = require_list(job_config.get("tasks"), "retry JobConfig.tasks")
    profile["tasks"] = [
        canonical_task_config(item, f"retry JobConfig.tasks[{index}]")
        for index, item in enumerate(raw_tasks)
    ]
    return profile


def agent_profile(
    job_config: dict[str, Any],
    trial_config: dict[str, Any],
    trial_lock: dict[str, Any],
    result: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    configured_trial_agent = require_mapping(trial_config.get("agent"), "trial config agent")
    root_agent = selected_agent(job_config, configured_trial_agent, "trial config agent")
    locked_agent = deepcopy(require_mapping(trial_lock.get("agent"), "trial lock agent"))
    locked_agent.pop("skills", None)
    for key in ("name", "model_name"):
        if configured_trial_agent.get(key) != locked_agent.get(key):
            raise ValueError(f"Trial config and lock disagree on agent.{key}.")
        if root_agent.get(key) != locked_agent.get(key):
            raise ValueError(f"JobConfig and trial lock disagree on agent.{key}.")
    configured_kwargs = require_mapping(root_agent.get("kwargs") or {}, "JobConfig agent.kwargs")
    trial_kwargs = require_mapping(configured_trial_agent.get("kwargs") or {}, "trial config agent.kwargs")
    locked_kwargs = require_mapping(locked_agent.get("kwargs") or {}, "trial lock agent.kwargs")
    configured_agent_without_skills = canonical_agent_profile(root_agent)
    trial_agent_without_skills = canonical_agent_profile(configured_trial_agent)
    locked_agent = canonical_agent_profile(locked_agent)
    if canonical_json(configured_agent_without_skills) != canonical_json(trial_agent_without_skills):
        raise ValueError("Agent profile drift between JobConfig and TrialConfig.")
    if canonical_json(configured_agent_without_skills) != canonical_json(locked_agent):
        raise ValueError("Agent profile drift between JobConfig and trial lock.")
    if canonical_json(configured_kwargs) != canonical_json(trial_kwargs):
        raise ValueError("Complete agent kwargs drift between JobConfig and TrialConfig.")
    if canonical_json(configured_kwargs) != canonical_json(locked_kwargs):
        raise ValueError("Complete agent kwargs drift between JobConfig and trial lock.")

    info = require_mapping(result.get("agent_info"), "trial result agent_info")
    if info.get("name") != locked_agent.get("name"):
        raise ValueError("Trial result agent name differs from the lock.")
    locked_version = locked_kwargs.get("version")
    if locked_version is not None and info.get("version") != locked_version:
        raise ValueError("Trial result agent version differs from the lock.")
    model_info = require_mapping(info.get("model_info") or {}, "trial result agent model_info")
    result_name = str(model_info.get("name") or "")
    provider = str(model_info.get("provider") or "")
    observed_model = "/".join(part for part in (provider, result_name) if part)
    expected_model = require_string(locked_agent.get("model_name"), "trial lock agent.model_name")
    if not (observed_model == expected_model or result_name == expected_model or expected_model.endswith("/" + result_name)):
        raise ValueError(
            f"Trial result model {observed_model!r} differs from locked model {expected_model!r}."
        )
    canonical_locked_agent = deepcopy(locked_agent)
    canonical_locked_agent.pop("skills", None)
    profile = {
        "name": locked_agent.get("name"),
        "modelName": expected_model,
        "version": locked_version,
        "thinking": locked_kwargs.get("thinking"),
        "kwargs": locked_kwargs,
        "lockedAgent": canonical_locked_agent,
        "trialAgent": trial_agent_without_skills,
    }
    return profile, root_agent


def validate_skill_provenance(
    root_agent: dict[str, Any],
    trial_config: dict[str, Any],
    trial_lock: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    root_skills = require_list(root_agent.get("skills") or [], "JobConfig agent.skills")
    trial_agent = require_mapping(trial_config.get("agent"), "trial config agent")
    trial_skills = require_list(trial_agent.get("skills") or [], "trial config agent.skills")
    locked_skills = require_list(trial_lock.get("skills") or [], "trial lock skills")
    if len(root_skills) != 1 or len(trial_skills) != 1 or len(locked_skills) != 1:
        return None, "canonical-single-skill-provenance-required"
    root_path = resolved_path(root_skills[0], "JobConfig agent skill")
    trial_path = resolved_path(trial_skills[0], "trial config agent skill")
    locked = require_mapping(locked_skills[0], "trial locked skill")
    locked_path = resolved_path(locked.get("source"), "trial locked skill source")
    if root_path != trial_path or root_path != locked_path:
        raise ValueError("Skill source drift between JobConfig, trial config, and lock.")
    validate_tree(root_path, "canonical source skill")
    name = parse_skill_name(root_path)
    if root_path.name != name:
        return None, "legacy-or-aliased-skill-identity"
    if require_string(locked.get("name"), "locked skill name") != name:
        return None, "legacy-or-aliased-skill-identity"
    observed_digest = "sha256:" + normalize_digest(locked.get("digest"))
    computed_digest = skill_digest(root_path)
    if observed_digest != computed_digest:
        raise ValueError(
            f"Skill digest drift: lock has {observed_digest}, source computes {computed_digest}."
        )
    return {
        "name": name,
        "source": root_path,
        "digest": computed_digest,
    }, None


def validate_task_paths(
    job_config: dict[str, Any],
    trial_config: dict[str, Any],
    trial_lock: dict[str, Any],
    result: dict[str, Any],
) -> Path:
    configured = require_mapping(trial_config.get("task"), "trial config task")
    locked = require_mapping(trial_lock.get("task"), "trial lock task")
    configured_path = resolved_path(configured.get("path"), "trial config task.path")
    locked_path = resolved_path(locked.get("path"), "trial lock task.path")
    if configured_path != locked_path:
        raise ValueError("Trial task path differs between config and lock.")
    root_matches = []
    for index, item in enumerate(require_list(job_config.get("tasks") or [], "JobConfig.tasks")):
        root_task = require_mapping(item, f"JobConfig.tasks[{index}]")
        if root_task.get("path") is None:
            continue
        if resolved_path(root_task["path"], f"JobConfig.tasks[{index}].path") == configured_path:
            root_matches.append(root_task)
    dataset_matches = []
    locked_name = require_string(locked.get("name"), "trial lock task.name")
    for index, item in enumerate(require_list(job_config.get("datasets") or [], "JobConfig.datasets")):
        dataset = require_mapping(item, f"JobConfig.datasets[{index}]")
        if dataset.get("path") is None:
            continue
        dataset_path = resolved_path(dataset["path"], f"JobConfig.datasets[{index}].path")
        names = dataset.get("task_names")
        name_allowed = names is None or locked_name in require_list(
            names, f"JobConfig.datasets[{index}].task_names"
        )
        if configured_path.parent == dataset_path and configured_path.name == locked_name and name_allowed:
            dataset_matches.append(dataset)
    if len(root_matches) + len(dataset_matches) != 1:
        raise ValueError("Trial task must bind to exactly one JobConfig task or dataset selection.")
    if root_matches:
        subset_equal(root_matches[0], configured, "TrialConfig.task from JobConfig task")
    task_id = require_mapping(result.get("task_id"), "trial result task_id")
    if "path" in task_id and resolved_path(task_id["path"], "trial result task_id.path") != configured_path:
        raise ValueError("Trial result task_id.path differs from config and lock.")
    validate_tree(configured_path, "task bundle")
    result_checksum = normalize_digest(result.get("task_checksum"))
    legacy_checksum = dirhash(configured_path, "sha256")
    if result_checksum != legacy_checksum:
        raise ValueError(
            "Trial result task checksum differs from Harbor Task.checksum for the bound task bundle."
        )
    computed_digest, _ = Packager.compute_content_hash(configured_path)
    if normalize_digest(locked.get("digest")) != computed_digest:
        raise ValueError(
            f"Locked task digest drift: expected sha256:{computed_digest} from {configured_path}."
        )
    return configured_path


def artifact_manifest(job_directory: Path) -> list[dict[str, str]]:
    """Seal every file in a native Harbor job, not only selected control files."""

    root = validate_tree(job_directory, "Harbor job artifact tree")
    manifest = []
    for path in sorted(
        (item for item in root.rglob("*") if item.is_file()),
        key=lambda item: item.relative_to(root).as_posix(),
    ):
        if is_reparse(path):
            raise ValueError(f"Harbor artifact cannot be a link: {path}")
        manifest.append(
            {
                "path": path.relative_to(root).as_posix(),
                "sha256": digest_file(path),
            }
        )
    return manifest


def load_harbor_job(
    directory: Path,
    reward_key: str,
    opt_in_failure_contracts: set[str] | None = None,
) -> dict[str, Any]:
    enabled_failure_contracts = opt_in_failure_contracts or set()
    directory = validate_tree(directory, "Harbor job directory")
    config_path = directory / "config.json"
    result_path = directory / "result.json"
    lock_path = directory / "lock.json"
    raw_config = read_mapping(config_path, "Harbor JobConfig")
    raw_result = read_mapping(result_path, "Harbor JobResult")
    validate_finite_tree(raw_config, str(config_path))
    validate_finite_tree(raw_result, str(result_path))
    config_model = JobConfig.model_validate(raw_config)
    result_model = JobResult.model_validate(raw_result)
    normalized_job_config = model_json(config_model)
    job_config = deepcopy(raw_config)

    root_lock: dict[str, Any] | None = None
    root_lock_error: str | None = None
    if lock_path.is_file():
        raw_lock = read_mapping(lock_path, "Harbor JobLock")
        validate_finite_tree(raw_lock, str(lock_path))
        JobLock.model_validate(raw_lock)
        ensure_harbor_version(raw_lock, "JobLock")
        root_lock = raw_lock
    else:
        root_lock_error = "missing-canonical-job-lock"

    trial_result_paths = sorted(directory.glob("*/result.json"))
    root_failure_contract = validate_job_completion(
        directory,
        raw_result,
        result_model,
        trial_result_paths,
        enabled_failure_contracts,
    )
    if not trial_result_paths:
        raise ValueError(f"Harbor job has no trials: {directory}")
    if root_lock is not None:
        retry_signature = validate_root_retry(normalized_job_config, root_lock)
        root_trials = require_list(root_lock.get("trials"), "JobLock.trials")
        if len(root_trials) != len(trial_result_paths):
            raise ValueError("JobLock trial count differs from completed trial results.")
    else:
        retry_signature = digest_value(normalized_job_config.get("retry") or {})
        root_trials = []

    job_identity = str(raw_result.get("id") or raw_config.get("job_name") or directory.name)
    records: list[dict[str, Any]] = []
    local_lock_signatures: list[str] = []
    all_artifacts = [config_path, result_path]
    if lock_path.is_file():
        all_artifacts.append(lock_path)

    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for trial_result_path in trial_result_paths:
        trial_directory = trial_result_path.parent
        trial_config_path = trial_directory / "config.json"
        trial_lock_path = trial_directory / "lock.json"
        trial_result = read_mapping(trial_result_path, "Harbor TrialResult")
        validate_finite_tree(trial_result, str(trial_result_path))
        TrialResult.model_validate(trial_result)
        trial_id = require_string(str(trial_result.get("id")), "trial id")
        trial_name = require_string(trial_result.get("trial_name"), "trial name")
        if trial_id in seen_ids or trial_name in seen_names:
            raise ValueError(f"Duplicate trial id or name in {directory}: {trial_name}")
        seen_ids.add(trial_id)
        seen_names.add(trial_name)

        missing = [path.name for path in (trial_config_path, trial_lock_path) if not path.is_file()]
        base_record = {
            "jobDirectory": directory,
            "jobIdentity": job_identity,
            "trialDirectory": trial_directory,
            "trialId": trial_id,
            "trialName": trial_name,
            "result": trial_result,
            "jobConfig": job_config,
            "rootLock": root_lock,
            "retrySignature": retry_signature,
        }
        provisional_key = digest_value(
            {
                "job": str(directory),
                "jobIdentity": job_identity,
                "trialId": trial_id,
                "trialName": trial_name,
                "taskChecksum": trial_result.get("task_checksum"),
            }
        )
        if missing or root_lock_error:
            reason = root_lock_error or "missing-canonical-trial-artifacts:" + ",".join(missing)
            records.append({
                **base_record,
                "sourceTrialKey": provisional_key,
                "provenanceError": reason,
                "classification": {
                    "kind": "provenance",
                    "domain": None,
                    "eligible": False,
                    "reason": reason,
                    "evidence": [],
                    "observedExternalDomains": [],
                },
                "artifactPaths": [trial_result_path],
            })
            all_artifacts.append(trial_result_path)
            continue

        trial_config = read_mapping(trial_config_path, "Harbor TrialConfig")
        trial_lock = read_mapping(trial_lock_path, "Harbor trial lock")
        validate_finite_tree(trial_config, str(trial_config_path))
        validate_finite_tree(trial_lock, str(trial_lock_path))
        embedded_config = require_mapping(trial_result.get("config"), "TrialResult.config")
        normalized_side_config = model_json(TrialConfig.model_validate(trial_config))
        normalized_embedded_config = model_json(TrialConfig.model_validate(embedded_config))
        if canonical_json(normalized_side_config) != canonical_json(normalized_embedded_config):
            raise ValueError(f"Trial config drift between {trial_config_path} and TrialResult.config.")
        validate_trial_inherited_profile(normalized_job_config, normalized_side_config)
        ensure_harbor_version(root_lock, "JobLock")
        task = task_signature(trial_result, trial_lock)
        validate_task_paths(job_config, trial_config, trial_lock, trial_result)
        profile, root_agent = agent_profile(job_config, trial_config, trial_lock, trial_result)
        skill, skill_error = validate_skill_provenance(root_agent, trial_config, trial_lock)
        job_common_profile = canonical_job_common_profile(normalized_job_config)
        trial_execution_profile = (
            canonical_trial_execution_profile(trial_config, skill)
            if skill is not None
            else None
        )

        environment = require_mapping(trial_lock.get("environment") or {}, "trial lock environment")
        verifier = require_mapping(trial_lock.get("verifier") or {}, "trial lock verifier")
        configured_environment = require_mapping(
            normalized_job_config.get("environment") or {}, "JobConfig.environment"
        )
        configured_verifier = require_mapping(
            normalized_job_config.get("verifier") or {}, "JobConfig.verifier"
        )
        trial_environment = require_mapping(
            normalized_side_config.get("environment") or {}, "trial config environment"
        )
        trial_verifier = require_mapping(
            normalized_side_config.get("verifier") or {}, "trial config verifier"
        )
        if not (
            canonical_json(configured_environment)
            == canonical_json(trial_environment)
            == canonical_json(environment)
        ):
            raise ValueError("Environment profile drift across JobConfig, TrialConfig, and trial lock.")
        if not (
            canonical_json(configured_verifier)
            == canonical_json(trial_verifier)
            == canonical_json(verifier)
        ):
            raise ValueError("Verifier profile drift across JobConfig, TrialConfig, and trial lock.")
        environment_signature = digest_value(environment)
        verifier_signature = digest_value(verifier)
        local_lock_signatures.append(trial_root_signature(trial_lock))

        diagnostics, diagnostic_values, diagnostic_paths = collect_diagnostics(trial_directory)
        contract_artifact_paths: list[Path] = []
        if root_failure_contract == SIGTERM_PRE_AGENT_CONTRACT:
            if diagnostics or diagnostic_values:
                raise ValueError(
                    f"{SIGTERM_PRE_AGENT_CONTRACT} requires the verifier diagnostic tree to be empty."
                )
            classification, contract_artifact_paths = classify_sigterm_pre_agent_failure(
                directory,
                raw_result,
                trial_directory,
                trial_result,
            )
        else:
            classification = classify_failure(trial_result, diagnostic_values, reward_key)
        if skill_error:
            if root_failure_contract:
                raise ValueError(
                    f"{root_failure_contract} requires canonical skill provenance: {skill_error}."
                )
            observed = deepcopy(classification)
            classification = {
                "kind": observed["kind"],
                "domain": observed["domain"],
                "eligible": False,
                "reason": f"{skill_error}; observed-outcome={observed['reason']}",
                "evidence": observed["evidence"],
                "observedExternalDomains": observed.get("observedExternalDomains", []),
                "provenanceError": skill_error,
            }
        source_key = digest_value(
            {
                "job": str(directory),
                "jobIdentity": job_identity,
                "trialId": trial_id,
                "trialName": trial_name,
                "task": task,
            }
        )
        artifacts = [trial_result_path, trial_config_path, trial_lock_path]
        artifacts.extend(diagnostic_paths)
        artifacts.extend(contract_artifact_paths)
        all_artifacts.extend(artifacts)
        records.append({
            **base_record,
            "sourceTrialKey": source_key,
            "trialConfig": trial_config,
            "trialLock": trial_lock,
            "task": task,
            "profile": profile,
            "profileSignature": digest_value(profile),
            "jobCommonProfile": job_common_profile,
            "trialExecutionProfile": trial_execution_profile,
            "environment": environment,
            "environmentSignature": environment_signature,
            "verifier": verifier,
            "verifierSignature": verifier_signature,
            "evaluationProfileDigest": digest_value({
                "agent": profile,
                "job": job_common_profile,
                "trial": trial_execution_profile,
                "environment": environment,
                "verifier": verifier,
                "retry": retry_signature,
            }),
            "skill": skill,
            "classification": classification,
            "diagnostics": diagnostics,
            "diagnosticValues": diagnostic_values,
            "artifactPaths": artifacts,
        })

    if root_lock is not None and len(local_lock_signatures) == len(root_trials):
        observed = Counter(local_lock_signatures)
        expected = Counter(root_trial_signature(require_mapping(item, "JobLock trial")) for item in root_trials)
        if observed != expected:
            raise ValueError("JobLock trial profiles do not exactly match per-trial locks.")
    if root_failure_contract:
        if len(records) != 1:
            raise ValueError(f"{root_failure_contract} requires exactly one source trial.")
        observed_contract = records[0]["classification"].get("failureContract")
        if observed_contract != root_failure_contract:
            raise ValueError(
                f"Incomplete Harbor root was not justified by its opted-in failure contract: {directory}"
            )
    manifest = artifact_manifest(directory)
    manifest_digest = digest_value(manifest)
    for record in records:
        record["jobArtifactManifest"] = manifest
        record["jobArtifactDigest"] = manifest_digest
    return {
        "directory": directory,
        "config": job_config,
        "result": raw_result,
        "lock": root_lock,
        "artifactManifest": manifest,
        "artifactDigest": manifest_digest,
        "rootFailureContract": root_failure_contract,
        "trials": records,
    }


def policy_payload(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "harborVersion": HARBOR_VERSION,
        "maxExternalRetriesPerTrial": config["maxRetries"],
        "optInFailureContracts": config["optInFailureContracts"],
        "optInFailureContractPredicates": {
            contract_id: OPT_IN_FAILURE_CONTRACTS[contract_id]
            for contract_id in config["optInFailureContracts"]
        },
        "allowedExceptionTypes": EXCEPTION_TYPES,
        "allowedErrorCodes": ERROR_CODES,
        "allowedStructuredSignals": STRUCTURED_SIGNALS,
        "providerTransientSignals": sorted(PROVIDER_TRANSIENT_SIGNALS),
        "absoluteDenySignals": sorted(ABSOLUTE_DENY_SIGNALS),
        "absoluteDenyExceptionTypes": sorted(ABSOLUTE_DENY_EXCEPTION_TYPES),
        "semanticSignals": sorted(SEMANTIC_SIGNALS),
        "conflictPolicy": "deny",
        "diagnosticScopes": ["verifier/**/diagnostics.json", "steps/<step>/verifier/**/diagnostics.json"],
        "structuredExternalPrecedence": "only-exact-zero-placeholder-rewards-and-gates-may-coexist-with-one-external-domain",
        "selectionPolicy": "first-evaluable-retry-never-best-of",
        "attemptLifecycle": "durable-reservation-before-files-with-sealed-terminal-events",
    }


def output_lock_path(config: dict[str, Any]) -> Path:
    return config["outputDirectory"] / "resume-lock.json"


def read_existing_lock(config: dict[str, Any]) -> dict[str, Any] | None:
    path = output_lock_path(config)
    if not path.exists():
        return None
    if is_reparse(path):
        raise ValueError(f"resume-lock.json cannot be a link: {path}")
    value = read_mapping(path, "resume lock")
    if value.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("Existing resume-lock.json has an unsupported schemaVersion.")
    require_list(value.get("attempts"), "resume-lock.attempts")
    return value


def failure_requires_remediation(classification: dict[str, Any]) -> bool:
    if classification.get("domain") in {"authentication", "environment"}:
        return True
    contract_id = classification.get("failureContract")
    contract = OPT_IN_FAILURE_CONTRACTS.get(contract_id, {})
    return bool(classification.get("requiresRemediation") or contract.get("requiresRemediation"))


def remediation_readiness(
    config: dict[str, Any],
    domain: str | None,
    failure_contract: str | None = None,
) -> tuple[bool, str]:
    requires = domain in {"authentication", "environment"}
    if failure_contract:
        requires = requires or bool(
            OPT_IN_FAILURE_CONTRACTS.get(failure_contract, {}).get("requiresRemediation")
        )
    if not requires:
        return True, "not-required"
    if not domain:
        return False, "remediation-domain-required"
    entry = config["remediation"].get(domain)
    if not entry or not entry["attested"]:
        return False, f"{domain}-remediation-attestation-required"
    if not entry["preflightCommand"]:
        return False, f"{domain}-preflight-command-required"
    validate_remediation_evidence(entry, domain)
    return True, "attested-preflight-required"


def validate_remediation_evidence(entry: dict[str, Any], domain: str) -> dict[str, Any]:
    path = entry["evidencePath"]
    validate_path_chain(path, f"{domain} remediation evidence")
    if not path.is_file() or is_reparse(path):
        raise ValueError(f"{domain} remediation evidence must be a real regular file: {path}")
    observed = digest_file(path)
    if observed != entry["remediationEvidenceSha256"]:
        raise ValueError(
            f"{domain} remediation evidence digest drift: expected "
            f"{entry['remediationEvidenceSha256']}, observed {observed}."
        )
    attestation = {
        "attested": entry["attested"],
        "remediationType": entry["remediationType"],
        "evidencePath": str(path),
        "remediationEvidenceSha256": observed,
        "preflightCommand": entry["preflightCommand"],
    }
    attestation["remediationAttestationDigest"] = digest_value(attestation)
    return attestation


def remediation_contract(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        domain: validate_remediation_evidence(entry, domain)
        for domain, entry in sorted(config["remediation"].items())
    }


def run_preflight(command: list[str], domain: str) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"domain": domain, "ok": False, "reason": type(error).__name__}
    return {
        "domain": domain,
        "ok": completed.returncode == 0,
        "reason": "passed" if completed.returncode == 0 else f"exit-{completed.returncode}",
    }


def source_contract(config: dict[str, Any], jobs: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "harborVersion": HARBOR_VERSION,
        "rewardKey": config["rewardKey"],
        "requiredEnv": sorted(config["requiredEnv"]),
        "requiredPaths": sorted(str(path) for path in config["requiredPaths"]),
        "sourceJobs": [
            {
                "sourceJobIndex": job["sourceJobIndex"],
                "directory": str(job["directory"]),
                "name": job["sourceJobName"],
                "label": job["sourceJobLabel"],
                "candidateId": job["candidateId"],
                "artifactDigest": job["artifactDigest"],
                "artifactManifest": job["artifactManifest"],
            }
            for job in jobs
        ],
        "remediation": remediation_contract(config),
    }


def initialize_or_validate_lock(
    config: dict[str, Any], jobs: list[dict[str, Any]], existing: dict[str, Any] | None
) -> tuple[dict[str, Any], str, str]:
    policy_digest = digest_value(policy_payload(config))
    contract = source_contract(config, jobs)
    contract_digest = digest_value({"source": contract, "policyDigest": policy_digest})
    if existing is None:
        lock = {
            "schemaVersion": SCHEMA_VERSION,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
            "policyDigest": policy_digest,
            "contractDigest": contract_digest,
            "contract": contract,
            "attempts": [],
        }
    else:
        if existing.get("policyDigest") != policy_digest:
            raise ValueError("Existing resume-lock policy digest differs; retry policy is immutable.")
        if existing.get("contractDigest") != contract_digest:
            raise ValueError("Existing resume-lock source contract differs; source drift is rejected.")
        lock = existing
    return lock, policy_digest, contract_digest


def seal_attempt(attempt: dict[str, Any]) -> dict[str, Any]:
    sealed = deepcopy(attempt)
    sealed.pop("attemptRecordDigest", None)
    sealed["attemptRecordDigest"] = digest_value(sealed)
    return sealed


def validate_attempt_seal(attempt: dict[str, Any]) -> None:
    observed = exact_sha256(attempt.get("attemptRecordDigest"), "attemptRecordDigest")
    payload = deepcopy(attempt)
    payload.pop("attemptRecordDigest", None)
    expected = digest_value(payload)
    if observed != expected:
        raise ValueError("resume-lock attemptRecordDigest does not verify; ledger edit rejected.")


def attempts_by_trial(lock: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for raw in require_list(lock.get("attempts"), "resume-lock.attempts"):
        attempt = require_mapping(raw, "resume-lock attempt")
        validate_attempt_seal(attempt)
        key = require_string(attempt.get("sourceTrialKey"), "resume-lock attempt sourceTrialKey")
        number = attempt.get("attempt")
        if isinstance(number, bool) or not isinstance(number, int) or number < 1:
            raise ValueError("resume-lock attempt numbers must be positive integers.")
        status_value = require_string(attempt.get("status"), "resume-lock attempt status")
        if status_value not in ATTEMPT_TERMINAL_STATUSES | {"reserved"}:
            raise ValueError(f"Unsupported resume-lock attempt status: {status_value}")
        lifecycle = require_list(attempt.get("lifecycle"), "resume-lock attempt lifecycle")
        if not lifecycle or require_mapping(lifecycle[0], "attempt lifecycle[0]").get("status") != "reserved":
            raise ValueError("Every attempt lifecycle must begin with a durable reserved event.")
        if require_mapping(lifecycle[-1], "attempt lifecycle[-1]").get("status") != status_value:
            raise ValueError("Attempt lifecycle terminal status differs from the attempt status.")
        grouped.setdefault(key, []).append(attempt)
    for values in grouped.values():
        values.sort(key=lambda item: int(item["attempt"]))
        numbers = [int(item["attempt"]) for item in values]
        if numbers != list(range(1, len(numbers) + 1)):
            raise ValueError("resume-lock attempts must be contiguous and one-based per source trial.")
    return grouped


def expected_attempt_paths(
    config: dict[str, Any], source_trial_key: str, attempt_number: int
) -> dict[str, Path | str]:
    opaque = source_trial_key.removeprefix("sha256:")
    job_name = f"external-retry-{opaque[:12]}-a{attempt_number:03d}"
    attempt_root = (
        config["outputDirectory"]
        / "retries"
        / opaque
        / f"attempt-{attempt_number:03d}"
    )
    return {
        "jobName": job_name,
        "attemptRoot": attempt_root,
        "jobDirectory": attempt_root / "harbor-jobs" / job_name,
        "retryConfig": attempt_root / "job-config.yaml",
    }


def validate_engine_attempt_binding(
    config: dict[str, Any], source: dict[str, Any], attempt: dict[str, Any], lock: dict[str, Any]
) -> None:
    """Reject attempt ledgers that were not emitted at the engine's fixed live paths."""

    if attempt.get("mode") != "live":
        raise ValueError(
            "resume-lock contains a non-live attempt; arbitrary analyze-only imports are forbidden."
        )
    if attempt.get("policyDigest") != lock.get("policyDigest"):
        raise ValueError("resume-lock attempt policyDigest differs from the live policy.")
    if attempt.get("contractDigest") != lock.get("contractDigest"):
        raise ValueError("resume-lock attempt contractDigest differs from the live source contract.")
    expected_lineage = source_attempt_lineage(source)
    for field, expected in expected_lineage.items():
        if canonical_json(attempt.get(field)) != canonical_json(expected):
            raise ValueError(f"resume-lock attempt field {field} differs from its source trial.")
    paths = expected_attempt_paths(config, source["sourceTrialKey"], int(attempt["attempt"]))
    for field in ("attemptRoot", "jobDirectory", "retryConfig"):
        observed = Path(
            os.path.abspath(require_string(attempt.get(field), f"attempt {field}"))
        )
        if observed != paths[field]:
            raise ValueError(f"resume-lock attempt {field} is outside its fixed engine destination.")
    expected_config_payload = stable_job_config_payload(
        retry_job_config(
            source,
            Path(paths["attemptRoot"]),
            require_string(paths["jobName"], "expected retry job name"),
        )
    )
    observed_payload_digest = exact_sha256(
        attempt.get("retryConfigPayloadDigest"), "attempt retryConfigPayloadDigest"
    )
    expected_payload_digest = digest_value(expected_config_payload)
    if observed_payload_digest != expected_payload_digest:
        raise ValueError(
            "resume-lock retryConfigPayloadDigest differs from the engine-derived config: "
            f"expected {expected_payload_digest}, observed {observed_payload_digest}."
        )
    if failure_requires_remediation(source["classification"]):
        preflight = require_mapping(attempt.get("preflight"), "live attempt preflight")
        if (
            preflight.get("domain") != source["classification"].get("domain")
            or preflight.get("ok") is not True
        ):
            raise ValueError("Live attempt lacks its successful sealed remediation preflight.")


def attempt_chain_stop_reason(attempts: list[dict[str, Any]]) -> str | None:
    for attempt in attempts:
        if attempt.get("evaluable") is True:
            return "first-evaluable-retry-already-selected"
        status_value = attempt.get("status")
        if status_value == "reserved":
            return "prior-attempt-reservation-unresolved"
        if status_value == "failed-setup":
            return "prior-attempt-setup-failure-is-not-attested-external"
        if status_value == "failed-execution":
            failure_type = attempt.get("failureType")
            if failure_type not in EXCEPTION_TYPES:
                return "prior-execution-failure-is-not-exactly-allowlisted"
            continue
        if status_value == "completed" and attempt.get("classification") != "external":
            return "prior-retry-produced-nonretryable-terminal-outcome"
    return None


def verify_attempt_ledger(
    config: dict[str, Any], trials: list[dict[str, Any]], lock: dict[str, Any]
) -> None:
    source_by_key = {trial["sourceTrialKey"]: trial for trial in trials}
    grouped = attempts_by_trial(lock)
    job_directories: set[str] = set()
    for key, attempts in grouped.items():
        source = source_by_key.get(key)
        if source is None:
            raise ValueError(f"resume-lock contains an attempt for unknown sourceTrialKey: {key}")
        if len(attempts) > config["maxRetries"]:
            raise ValueError(f"resume-lock exceeds the immutable retry cap for {key}.")
        for attempt in attempts:
            validate_engine_attempt_binding(config, source, attempt, lock)
            job_directory = require_string(attempt.get("jobDirectory"), "attempt jobDirectory")
            if job_directory in job_directories:
                raise ValueError("resume-lock reuses one retry job directory across attempts.")
            job_directories.add(job_directory)
            lifecycle = require_list(attempt.get("lifecycle"), "attempt lifecycle")
            first_event = require_mapping(lifecycle[0], "attempt lifecycle[0]")
            if first_event.get("phase") != "durable-before-files":
                raise ValueError("Live attempt lifecycle must begin with durable-before-files.")
            phases = [
                require_mapping(event, "attempt lifecycle event").get("phase")
                for event in lifecycle
            ]
            for phase in ("durable-before-files", "configured-before-harbor-call", "harbor-call-starting"):
                if phases.count(phase) > 1:
                    raise ValueError(f"Live attempt lifecycle repeats phase {phase}.")
            configured = "configured-before-harbor-call" in phases
            call_started = "harbor-call-starting" in phases
            if call_started and not configured:
                raise ValueError("harbor-call-starting requires a configured reservation.")
            if call_started and phases.index("configured-before-harbor-call") > phases.index("harbor-call-starting"):
                raise ValueError("harbor-call-starting must follow configured-before-harbor-call.")
            if attempt["status"] in {"completed", "failed-execution"} and not call_started:
                raise ValueError(
                    f"{attempt['status']} attempt lacks the durable harbor-call-starting event."
                )
            if configured:
                retry_config_path = Path(
                    require_string(attempt.get("retryConfig"), "attempt retryConfig")
                )
                validate_path_chain(retry_config_path, "attempt retryConfig")
                if not retry_config_path.is_file() or is_reparse(retry_config_path):
                    raise ValueError("Recorded retry JobConfig is missing or unsafe.")
                if digest_file(retry_config_path) != attempt.get("retryConfigDigest"):
                    raise ValueError("Recorded retry JobConfig digest does not verify.")
                configured_payload = stable_job_config_payload(
                    read_mapping(retry_config_path, "recorded retry JobConfig")
                )
                expected_paths = expected_attempt_paths(
                    config, source["sourceTrialKey"], int(attempt["attempt"])
                )
                expected_payload = stable_job_config_payload(
                    retry_job_config(
                        source,
                        Path(expected_paths["attemptRoot"]),
                        require_string(expected_paths["jobName"], "expected retry job name"),
                    )
                )
                if canonical_json(configured_payload) != canonical_json(expected_payload):
                    raise ValueError("Recorded retry JobConfig differs from the engine-derived config.")
                if digest_value(configured_payload) != attempt.get("retryConfigPayloadDigest"):
                    raise ValueError("Recorded retry JobConfig payload digest does not verify.")
            if attempt["status"] != "completed":
                continue
            observed = import_retry_job(source, Path(job_directory), attempt["attempt"], config["rewardKey"])
            for field in (
                "sourceTrialKey",
                "parentJobDirectory",
                "parentJobArtifactDigest",
                "parentTrialId",
                "parentTrialName",
                "parentTrialResultSha256",
                "attempt",
                "jobDirectory",
                "jobArtifactDigest",
                "retryJobDigest",
                "trialId",
                "trialName",
                "taskChecksum",
                "candidateSkillDigest",
                "evaluationProfileDigest",
                "failureContract",
                "remediationAttestationDigest",
                "classification",
                "failureDomain",
                "observedExternalDomains",
                "reason",
                "evaluable",
                "reward",
                "status",
            ):
                if canonical_json(attempt.get(field)) != canonical_json(observed.get(field)):
                    raise ValueError(f"Completed retry ledger field {field} differs from native artifacts.")


def all_trials(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    trials = []
    for source_index, job in enumerate(jobs):
        job_name = str(job["config"].get("job_name") or job["directory"].name)
        parts = job["directory"].parts
        candidate_id = None
        for index, part in enumerate(parts[:-1]):
            if part == "candidates" and index + 1 < len(parts):
                candidate_id = parts[index + 1]
        candidate_id = job.get("configuredCandidateId") or candidate_id or job_name
        label = job.get("configuredLabel") or f"{source_index + 1}:{candidate_id}"
        job["sourceJobIndex"] = source_index
        job["sourceJobName"] = job_name
        job["sourceJobLabel"] = label
        job["candidateId"] = candidate_id
        for trial in job["trials"]:
            trial["sourceJobIndex"] = source_index
            trial["sourceJobName"] = job_name
            trial["sourceJobLabel"] = label
            trial["candidateId"] = candidate_id
            trials.append(trial)
    keys = [trial["sourceTrialKey"] for trial in trials]
    if len(keys) != len(set(keys)):
        raise ValueError("Source trial lineage keys are not unique.")
    return trials


def structured_attestation(trial: dict[str, Any]) -> dict[str, Any]:
    by_key: dict[str, set[str]] = {key: set() for key in DIAGNOSTIC_KEYS}
    for item in trial.get("diagnosticValues", []):
        if item.get("value"):
            by_key[item["key"]].add(item["value"])
    _, exception_code = exception_evidence(trial["result"])
    if exception_code:
        by_key["error_code"].add(exception_code)

    def scalar_or_list(key: str) -> Any:
        values = sorted(by_key[key])
        return values[0] if len(values) == 1 else (values if values else None)

    return {
        "failureDomain": trial["classification"].get("domain"),
        "failureContract": trial["classification"].get("failureContract"),
        "terminalOutcome": scalar_or_list("terminal_outcome"),
        "errorCode": scalar_or_list("error_code"),
    }


def classify_plan_trials(
    config: dict[str, Any],
    trials: list[dict[str, Any]],
    lock: dict[str, Any],
    preflights: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    prior = attempts_by_trial(lock)
    rows = []
    for trial in trials:
        classification = deepcopy(trial["classification"])
        eligible = bool(classification["eligible"])
        reason = classification["reason"]
        readiness = "not-applicable"
        if eligible:
            ready, readiness = remediation_readiness(
                config,
                classification["domain"],
                classification.get("failureContract"),
            )
            if not ready:
                eligible = False
                reason = readiness
            elif preflights is not None and failure_requires_remediation(classification):
                result = preflights.get(classification["domain"])
                if not result or not result["ok"]:
                    eligible = False
                    reason = f"{classification['domain']}-preflight-failed"
        attempts = prior.get(trial["sourceTrialKey"], [])
        stop_reason = attempt_chain_stop_reason(attempts)
        if eligible and stop_reason:
            eligible = False
            reason = stop_reason
        if eligible and len(attempts) >= config["maxRetries"]:
            eligible = False
            reason = "external-retry-cap-reached"
        remediation_attestation_digest = None
        if failure_requires_remediation(classification) and classification.get("domain"):
            entry = config["remediation"].get(classification["domain"])
            if entry:
                remediation_attestation_digest = validate_remediation_evidence(
                    entry, classification["domain"]
                )["remediationAttestationDigest"]
        next_attempt = len(attempts) + 1
        attempt_paths = expected_attempt_paths(config, trial["sourceTrialKey"], next_attempt)
        job_name = str(attempt_paths["jobName"])
        destination = attempt_paths["attemptRoot"]
        structured = structured_attestation(trial)
        rows.append({
            "sourceTrialKey": trial["sourceTrialKey"],
            "sourceJobIndex": trial["sourceJobIndex"],
            "sourceJob": str(trial["jobDirectory"]),
            "sourceJobName": trial["sourceJobName"],
            "sourceJobLabel": trial["sourceJobLabel"],
            "candidateId": trial["candidateId"],
            "trialId": trial["trialId"],
            "trialName": trial["trialName"],
            "sourceTrial": trial["trialName"],
            "taskId": trial["result"].get("task_id"),
            "taskName": trial["result"].get("task_name"),
            "taskChecksum": trial["result"].get("task_checksum"),
            "task": trial.get("task"),
            "agent": trial.get("profile"),
            "skill": (
                {"name": trial["skill"]["name"], "digest": trial["skill"]["digest"]}
                if trial.get("skill")
                else None
            ),
            "artifactDigest": trial["jobArtifactDigest"],
            "originalJobDigest": trial["jobArtifactDigest"],
            "candidateSkillDigest": (trial.get("skill") or {}).get("digest"),
            "evaluationProfileDigest": trial.get("evaluationProfileDigest"),
            "classification": classification["kind"],
            "failureDomain": classification["domain"],
            "failureContract": classification.get("failureContract"),
            "requiresRemediation": failure_requires_remediation(classification),
            "retryDomain": classification["domain"],
            "terminalOutcome": structured["terminalOutcome"],
            "errorCode": structured["errorCode"],
            "observedExternalDomains": classification.get("observedExternalDomains", []),
            "eligible": eligible,
            "reason": reason,
            "evidence": classification["evidence"],
            "evidenceArtifacts": classification.get("evidenceArtifacts", []),
            "provenanceError": classification.get("provenanceError") or trial.get("provenanceError"),
            "diagnostics": trial.get("diagnostics", []),
            "remediation": readiness,
            "remediationAttestationDigest": remediation_attestation_digest,
            "completedExternalAttempts": len(attempts),
            "maxExternalRetries": config["maxRetries"],
            "plannedAttempt": next_attempt if eligible else None,
            "plannedJobName": job_name if eligible else None,
            "plannedDestination": str(destination) if eligible else None,
        })
    return rows


def make_plan(
    config: dict[str, Any],
    rows: list[dict[str, Any]],
    policy_digest: str,
    contract_digest: str,
    mode: str,
    preflights: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": utc_now(),
        "mode": mode,
        "policyDigest": policy_digest,
        "contractDigest": contract_digest,
        "summary": {
            "sourceTrials": len(rows),
            "eligibleTrials": sum(row["eligible"] for row in rows),
            "excludedTrials": sum(not row["eligible"] for row in rows),
            "resumeNeeded": any(row["eligible"] for row in rows),
            "provenanceExcluded": sum(bool(row.get("provenanceError")) for row in rows),
            "semanticButUntrusted": sum(
                row["classification"] == "semantic" and bool(row.get("provenanceError"))
                for row in rows
            ),
        },
        "preflights": list((preflights or {}).values()),
        "trials": rows,
    }


def copy_canonical_skill(source: Path, destination: Path, expected_digest: str) -> None:
    validate_write_destination(destination, "staged skill destination")
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"Refusing to overwrite staged skill: {destination}")
    validate_tree(source, "source skill")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination, symlinks=False)
    validate_tree(destination, "staged skill")
    observed = skill_digest(destination)
    if observed != expected_digest:
        raise ValueError(f"Staged skill digest drift: expected {expected_digest}, observed {observed}.")


def retry_job_config(trial: dict[str, Any], attempt_root: Path, job_name: str) -> JobConfig:
    if not trial.get("skill") or not trial.get("trialConfig"):
        raise ValueError("Cannot create a retry without canonical trial provenance.")
    source = deepcopy(trial["jobConfig"])
    trial_agent = require_mapping(trial["trialConfig"].get("agent"), "trial config agent")
    root_agent = selected_agent(source, trial_agent, "trial config agent")
    staged_skill = attempt_root / "skills" / trial["skill"]["name"]
    agent = deepcopy(root_agent)
    agent["skills"] = [str(staged_skill)]
    source["job_name"] = job_name
    source["jobs_dir"] = str(attempt_root / "harbor-jobs")
    source["n_attempts"] = 1
    source["n_concurrent_trials"] = 1
    source["agents"] = [agent]
    task = deepcopy(trial["trialConfig"]["task"])
    if task.get("path") is not None:
        task["path"] = host_path_value(task["path"], "retry task.path")
    source["tasks"] = [task]
    source["datasets"] = []
    return JobConfig.model_validate(source)


async def run_native_job(config: JobConfig) -> Path:
    job = await Job.create(config)
    await job.run()
    return Path(os.path.abspath(os.fspath(Path(config.jobs_dir).expanduser()))) / config.job_name


def same_retry_profile(source: dict[str, Any], retry: dict[str, Any]) -> None:
    fields = (
        "task",
        "profileSignature",
        "jobCommonProfile",
        "trialExecutionProfile",
        "environmentSignature",
        "verifierSignature",
        "retrySignature",
    )
    for field in fields:
        if canonical_json(source.get(field)) != canonical_json(retry.get(field)):
            source_value = source.get(field)
            retry_value = retry.get(field)
            detail = ""
            if isinstance(source_value, dict) and isinstance(retry_value, dict):
                changed = sorted(
                    key
                    for key in set(source_value) | set(retry_value)
                    if canonical_json(source_value.get(key)) != canonical_json(retry_value.get(key))
                )
                detail = ":" + ",".join(changed)
            raise ValueError(f"Retry job drifted from source trial field {field}{detail}.")
    if source.get("skill", {}).get("name") != retry.get("skill", {}).get("name"):
        raise ValueError("Retry job skill name differs from the source trial.")
    if source.get("skill", {}).get("digest") != retry.get("skill", {}).get("digest"):
        raise ValueError("Retry job skill digest differs from the source trial.")
    expected_job = retry_job_config(
        source,
        source["jobDirectory"].parent / ".canonical-external-retry-profile",
        "canonical-external-retry-profile",
    )
    expected_job_profile = canonical_retry_job_profile(
        model_json(expected_job), source["skill"]
    )
    observed_job_profile = canonical_retry_job_profile(
        retry["jobConfig"], retry["skill"]
    )
    if canonical_json(expected_job_profile) != canonical_json(observed_job_profile):
        raise ValueError(
            "Retry JobConfig differs outside the allowed job identity, destination, "
            "single-trial isolation, or staged skill source changes."
        )
    expected_trial_profile = canonical_trial_execution_profile(
        source["trialConfig"], source["skill"]
    )
    observed_trial_profile = canonical_trial_execution_profile(
        retry["trialConfig"], retry["skill"]
    )
    if canonical_json(expected_trial_profile) != canonical_json(observed_trial_profile):
        raise ValueError(
            "Retry TrialConfig differs outside the allowed trial identity, destination, "
            "or staged skill source changes."
        )
    retry_config = retry["jobConfig"]
    if retry_config.get("n_attempts") != 1 or retry_config.get("n_concurrent_trials") != 1:
        raise ValueError("Each external retry JobConfig must contain exactly one attempt and one trial.")


def primary_reward(trial: dict[str, Any], reward_key: str) -> float | None:
    rewards = reward_values(trial["result"])
    return rewards.get(reward_key)


def source_attempt_lineage(source: dict[str, Any]) -> dict[str, Any]:
    trial_result_path = source["trialDirectory"] / "result.json"
    required_regular_file(trial_result_path, "parent TrialResult")
    return {
        "parentJobDirectory": str(source["jobDirectory"]),
        "parentJobArtifactDigest": source["jobArtifactDigest"],
        "parentTrialId": source["trialId"],
        "parentTrialName": source["trialName"],
        "parentTrialResultSha256": digest_file(trial_result_path),
        "taskChecksum": source["result"].get("task_checksum"),
        "candidateSkillDigest": (source.get("skill") or {}).get("digest"),
        "evaluationProfileDigest": source.get("evaluationProfileDigest"),
        "failureContract": source["classification"].get("failureContract"),
        "remediationAttestationDigest": source.get("remediationAttestationDigest"),
    }


def import_retry_job(
    source: dict[str, Any],
    job_directory: Path,
    attempt_number: int,
    reward_key: str,
) -> dict[str, Any]:
    retry_job = load_harbor_job(job_directory, reward_key)
    if len(retry_job["trials"]) != 1:
        raise ValueError(f"Retry job must contain exactly one completed trial: {job_directory}")
    retry = retry_job["trials"][0]
    if retry.get("provenanceError"):
        raise ValueError(f"Retry job lacks canonical provenance: {retry['provenanceError']}")
    same_retry_profile(source, retry)
    classification = retry["classification"]
    reward = primary_reward(retry, reward_key)
    evaluable = reward is not None and classification["kind"] == "semantic"
    imported_at = utc_now()
    return {
        "sourceTrialKey": source["sourceTrialKey"],
        **source_attempt_lineage(source),
        "attempt": attempt_number,
        "jobDirectory": str(retry_job["directory"]),
        "jobArtifactDigest": retry_job["artifactDigest"],
        "retryJobDigest": retry_job["artifactDigest"],
        "jobArtifactManifest": retry_job["artifactManifest"],
        "taskChecksum": retry["result"].get("task_checksum"),
        "candidateSkillDigest": retry["skill"]["digest"],
        "evaluationProfileDigest": retry["evaluationProfileDigest"],
        "trialId": retry["trialId"],
        "trialName": retry["trialName"],
        "classification": classification["kind"],
        "failureDomain": classification["domain"],
        "observedExternalDomains": classification.get("observedExternalDomains", []),
        "reason": classification["reason"],
        "evaluable": evaluable,
        "reward": reward if evaluable else None,
        "importedAt": imported_at,
        "status": "completed",
        "lifecycle": [
            {"status": "reserved", "at": imported_at, "mode": "analyze-only-import"},
            {"status": "completed", "at": imported_at},
        ],
    }


def original_lineage(trial: dict[str, Any], reward_key: str) -> dict[str, Any]:
    classification = trial["classification"]
    observed_reward = primary_reward(trial, reward_key)
    evaluable = (
        classification["kind"] == "semantic"
        and observed_reward is not None
        and not classification.get("provenanceError")
        and not trial.get("provenanceError")
    )
    return {
        "jobDirectory": str(trial["jobDirectory"]),
        "trialId": trial["trialId"],
        "trialName": trial["trialName"],
        "task": trial.get("task"),
        "agent": trial.get("profile"),
        "skill": (
            {"name": trial["skill"]["name"], "digest": trial["skill"]["digest"]}
            if trial.get("skill")
            else None
        ),
        "artifactDigest": trial["jobArtifactDigest"],
        "classification": classification["kind"],
        "failureDomain": classification["domain"],
        "failureContract": classification.get("failureContract"),
        "remediationAttestationDigest": trial.get("remediationAttestationDigest"),
        "observedExternalDomains": classification.get("observedExternalDomains", []),
        "reason": classification["reason"],
        "evaluable": evaluable,
        "reportedReward": observed_reward,
        "reward": observed_reward if evaluable else None,
    }


def merged_result(
    config: dict[str, Any],
    trials: list[dict[str, Any]],
    lock: dict[str, Any],
    policy_digest: str,
    contract_digest: str,
) -> dict[str, Any]:
    grouped = attempts_by_trial(lock)
    rows = []
    for trial in trials:
        original = original_lineage(trial, config["rewardKey"])
        retries = [deepcopy(item) for item in grouped.get(trial["sourceTrialKey"], [])]
        selected: dict[str, Any] | None = None
        reward: float | None = None
        if original["evaluable"]:
            selected = {
                "lineage": "original",
                "jobDirectory": original["jobDirectory"],
                "trialId": original["trialId"],
            }
            reward = original["reward"]
        else:
            for retry in retries:
                if retry.get("evaluable"):
                    selected = {
                        "lineage": "retry",
                        "attempt": retry["attempt"],
                        "jobDirectory": retry["jobDirectory"],
                        "trialId": retry.get("trialId"),
                    }
                    reward = finite_reward(retry["reward"], "stored retry reward")
                    break
        chain_stop = attempt_chain_stop_reason(retries)
        unresolved_retryable = (
            reward is None
            and original["classification"] == "external"
            and chain_stop is None
            and len(retries) < config["maxRetries"]
        )
        nonretryable_unavailable = reward is None and not unresolved_retryable
        rows.append({
            "sourceTrialKey": trial["sourceTrialKey"],
            "original": original,
            "retries": retries,
            "selected": selected,
            "reward": reward,
            "unresolvedRetryableExternal": unresolved_retryable,
            "nonRetryableUnavailable": nonretryable_unavailable,
            "unresolvedExternal": unresolved_retryable or nonretryable_unavailable,
            "resumeDisposition": (
                "retryable-external"
                if unresolved_retryable
                else (chain_stop or "nonretryable-or-cap-reached" if reward is None else "resolved")
            ),
        })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": utc_now(),
        "policyDigest": policy_digest,
        "contractDigest": contract_digest,
        "selectionPolicy": "first-evaluable-retry-never-best-of",
        "rewardKey": config["rewardKey"],
        "summary": {
            "sourceTrials": len(rows),
            "selectedOriginal": sum(row["selected"] is not None and row["selected"]["lineage"] == "original" for row in rows),
            "selectedRetry": sum(row["selected"] is not None and row["selected"]["lineage"] == "retry" for row in rows),
            "unresolvedRetryableExternal": sum(
                row["unresolvedRetryableExternal"] for row in rows
            ),
            "nonRetryableUnavailable": sum(row["nonRetryableUnavailable"] for row in rows),
            "unresolvedExternal": sum(
                row["unresolvedRetryableExternal"] or row["nonRetryableUnavailable"]
                for row in rows
            ),
        },
        "trials": rows,
    }


def report_text(plan: dict[str, Any], merged: dict[str, Any], lock: dict[str, Any]) -> str:
    classifications = Counter(row["classification"] for row in plan["trials"])
    reasons = Counter(row["reason"] for row in plan["trials"] if not row["eligible"])
    lines = [
        "# Harbor external retry report",
        "",
        f"- Policy digest: `{plan['policyDigest']}`",
        f"- Contract digest: `{plan['contractDigest']}`",
        f"- Source trials: {plan['summary']['sourceTrials']}",
        f"- Eligible in this plan: {plan['summary']['eligibleTrials']}",
        f"- Excluded in this plan: {plan['summary']['excludedTrials']}",
        f"- Resume needed: {str(plan['summary']['resumeNeeded']).lower()}",
        f"- Provenance excluded: {plan['summary']['provenanceExcluded']}",
        f"- Semantic but untrusted: {plan['summary']['semanticButUntrusted']}",
        f"- Recorded external attempts: {len(lock['attempts'])}",
        f"- Selected original results: {merged['summary']['selectedOriginal']}",
        f"- Selected retry results: {merged['summary']['selectedRetry']}",
        f"- Unresolved retryable external results: {merged['summary']['unresolvedRetryableExternal']}",
        f"- Non-retryable unavailable results: {merged['summary']['nonRetryableUnavailable']}",
        f"- Complete effective jobs: {merged['summary'].get('effectiveJobs', 0)}",
        "",
        "## Classifications",
        "",
    ]
    lines.extend(f"- {key}: {value}" for key, value in sorted(classifications.items()))
    if reasons:
        lines.extend(["", "## Exclusion reasons", ""])
        lines.extend(f"- {key}: {value}" for key, value in sorted(reasons.items()))
    lines.extend(["", "## Source trials", ""])
    for row in plan["trials"]:
        disposition = "eligible" if row["eligible"] else "excluded"
        lines.append(
            f"- [{row['sourceJobIndex']}] {row['sourceJobLabel']} / "
            f"{row['trialName']} / {row['taskName']}: {disposition} — {row['reason']}"
        )
    lines.extend([
        "",
        "The merged result always selects the first evaluable retry in attempt order; it never chooses the best score.",
        "",
    ])
    return "\n".join(lines)


def find_retry_trial_directory(attempt: dict[str, Any]) -> Path:
    job_directory = Path(
        os.path.abspath(require_string(attempt.get("jobDirectory"), "retry jobDirectory"))
    )
    expected_id = str(attempt.get("trialId") or "")
    expected_name = str(attempt.get("trialName") or "")
    matches = []
    for result_path in sorted(job_directory.glob("*/result.json")):
        payload = read_mapping(result_path, "retry TrialResult")
        if str(payload.get("id") or "") == expected_id and payload.get("trial_name") == expected_name:
            matches.append(result_path.parent)
    if len(matches) != 1:
        raise ValueError(f"Cannot bind selected retry lineage to exactly one trial in {job_directory}.")
    return matches[0]


def directory_file_manifest(directory: Path, *, exclude: set[str] | None = None) -> list[dict[str, str]]:
    exclude = exclude or set()
    validate_tree(directory, "derived effective job")
    rows = []
    for path in sorted(
        (item for item in directory.rglob("*") if item.is_file()),
        key=lambda item: item.relative_to(directory).as_posix(),
    ):
        relative = path.relative_to(directory).as_posix()
        if relative in exclude:
            continue
        rows.append({"path": relative, "sha256": digest_file(path)})
    return rows


def effective_lineage(
    source_job: dict[str, Any],
    source_trials: list[dict[str, Any]],
    selections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = []
    for source_trial, merged_trial in zip(source_trials, selections, strict=True):
        selected = require_mapping(merged_trial.get("selected"), "merged selected lineage")
        selected_attempt = None
        if selected.get("lineage") == "retry":
            matches = [
                attempt
                for attempt in require_list(merged_trial.get("retries"), "merged retry lineage")
                if attempt.get("attempt") == selected.get("attempt")
            ]
            if len(matches) != 1:
                raise ValueError("Merged retry selection does not bind to one retry attempt.")
            selected_attempt = matches[0]
        elif selected.get("lineage") != "original":
            raise ValueError("Effective selection lineage must be original or retry.")
        rows.append(
            {
                "sourceTrialKey": source_trial["sourceTrialKey"],
                "sourceTrial": {
                    "jobDirectory": str(source_job["directory"]),
                    "trialDirectory": str(source_trial["trialDirectory"]),
                    "artifactDigest": source_trial["jobArtifactDigest"],
                },
                "selected": {
                    "lineage": selected["lineage"],
                    "attempt": selected.get("attempt"),
                    "jobDirectory": selected.get("jobDirectory"),
                    "trialId": selected.get("trialId"),
                    "retryArtifactDigest": (
                        selected_attempt.get("jobArtifactDigest") if selected_attempt else None
                    ),
                },
            }
        )
    return rows


def verify_effective_job(
    destination: Path,
    source_job: dict[str, Any],
    policy_digest: str,
    contract_digest: str,
    reward_key: str,
    *,
    expected_lineage: list[dict[str, Any]] | None = None,
    published_destination: Path | None = None,
) -> dict[str, Any]:
    final_destination = Path(
        os.path.abspath(os.fspath(published_destination or destination))
    )
    manifest_path = destination / "resume-manifest.json"
    manifest = read_mapping(manifest_path, "effective job resume manifest")
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"Existing effective job has an unsupported manifest schema: {destination}")
    if manifest.get("policyDigest") != policy_digest or manifest.get("contractDigest") != contract_digest:
        raise ValueError(f"Existing effective job belongs to a different policy or contract: {destination}")
    if manifest.get("selectionPolicy") != "first-evaluable-retry-never-best-of":
        raise ValueError(f"Existing effective job has a different selection policy: {destination}")
    if Path(os.path.abspath(require_string(manifest.get("sourceJob"), "manifest sourceJob"))) != source_job["directory"]:
        raise ValueError(f"Existing effective job source path differs: {destination}")
    if manifest.get("sourceJobArtifactDigest") != source_job["artifactDigest"]:
        raise ValueError(f"Existing effective job source digest differs: {destination}")
    lineage = require_list(manifest.get("lineage"), "effective job lineage")
    if expected_lineage is not None and canonical_json(lineage) != canonical_json(expected_lineage):
        raise ValueError(f"Existing effective job lineage differs from the sealed merge: {destination}")
    if len(lineage) != len(source_job["trials"]):
        raise ValueError(f"Existing effective job lineage count differs from its source: {destination}")
    observed = directory_file_manifest(destination, exclude={"resume-manifest.json"})
    if canonical_json(observed) != canonical_json(manifest.get("files")):
        raise ValueError(f"Existing effective job checksum manifest does not verify: {destination}")
    if digest_value(observed) != manifest.get("effectiveJobDigest"):
        raise ValueError(f"Existing effective job aggregate digest does not verify: {destination}")
    for name in ("config.json", "lock.json"):
        if (destination / name).read_bytes() != (source_job["directory"] / name).read_bytes():
            raise ValueError(f"Effective {name} differs from the sealed source job: {destination}")

    source_by_key = {trial["sourceTrialKey"]: trial for trial in source_job["trials"]}
    if len(source_by_key) != len(source_job["trials"]):
        raise ValueError("Source job contains duplicate lineage keys.")
    seen_keys: set[str] = set()
    for raw_lineage in lineage:
        row = require_mapping(raw_lineage, "effective lineage row")
        key = require_string(row.get("sourceTrialKey"), "effective lineage sourceTrialKey")
        if key in seen_keys or key not in source_by_key:
            raise ValueError("Effective lineage contains a duplicate or unknown source trial.")
        seen_keys.add(key)
        source_trial = source_by_key[key]
        source_row = require_mapping(row.get("sourceTrial"), "effective source lineage")
        if Path(os.path.abspath(require_string(source_row.get("jobDirectory"), "lineage source job"))) != source_job["directory"]:
            raise ValueError("Effective lineage source job path drifted.")
        if Path(os.path.abspath(require_string(source_row.get("trialDirectory"), "lineage source trial"))) != source_trial["trialDirectory"]:
            raise ValueError("Effective lineage source trial path drifted.")
        if source_row.get("artifactDigest") != source_job["artifactDigest"]:
            raise ValueError("Effective lineage source artifact digest drifted.")

        selected = require_mapping(row.get("selected"), "effective selected lineage")
        lineage_kind = selected.get("lineage")
        selected_directory: Path
        selected_result: dict[str, Any]
        if lineage_kind == "original":
            if selected.get("attempt") is not None or selected.get("retryArtifactDigest") is not None:
                raise ValueError("Original effective lineage cannot declare a retry attempt or digest.")
            if Path(os.path.abspath(require_string(selected.get("jobDirectory"), "original selected job"))) != source_job["directory"]:
                raise ValueError("Original effective lineage job path drifted.")
            if str(selected.get("trialId")) != source_trial["trialId"]:
                raise ValueError("Original effective lineage trial id drifted.")
            selected_directory = source_trial["trialDirectory"]
            selected_result = deepcopy(source_trial["result"])
        elif lineage_kind == "retry":
            attempt_number = selected.get("attempt")
            if isinstance(attempt_number, bool) or not isinstance(attempt_number, int) or attempt_number < 1:
                raise ValueError("Retry effective lineage requires a positive attempt number.")
            retry_directory = Path(
                os.path.abspath(require_string(selected.get("jobDirectory"), "retry selected job"))
            )
            retry_job = load_harbor_job(retry_directory, reward_key)
            if retry_job["artifactDigest"] != exact_sha256(
                selected.get("retryArtifactDigest"), "retry selected artifact digest"
            ):
                raise ValueError("Retry effective lineage artifact digest does not verify.")
            matching = [
                trial for trial in retry_job["trials"] if trial["trialId"] == str(selected.get("trialId"))
            ]
            if len(matching) != 1:
                raise ValueError("Retry effective lineage does not bind exactly one retry trial.")
            retry_trial = matching[0]
            same_retry_profile(source_trial, retry_trial)
            if retry_trial["classification"]["kind"] != "semantic" or primary_reward(retry_trial, reward_key) is None:
                raise ValueError("Retry effective lineage is not an evaluable semantic result.")
            selected_directory = retry_trial["trialDirectory"]
            selected_result = deepcopy(retry_trial["result"])
            original_result = source_trial["result"]
            for field in ("task_name", "trial_name", "task_id", "source", "task_checksum"):
                selected_result[field] = deepcopy(original_result.get(field))
            selected_result["config"] = deepcopy(source_trial["trialConfig"])
        else:
            raise ValueError("Effective lineage selection must be original or retry.")

        effective_trial = destination / source_trial["trialDirectory"].name
        expected_uri = (final_destination / source_trial["trialDirectory"].name).as_uri()
        selected_result["trial_uri"] = expected_uri
        actual_result = read_mapping(effective_trial / "result.json", "effective TrialResult")
        if canonical_json(actual_result) != canonical_json(selected_result):
            raise ValueError("Effective TrialResult differs from its selected lineage transformation.")
        if actual_result.get("trial_uri") != expected_uri or ".build-" in expected_uri:
            raise ValueError("Effective TrialResult trial_uri does not name its final published directory.")
        for name in ("config.json", "lock.json"):
            if (effective_trial / name).read_bytes() != (source_trial["trialDirectory"] / name).read_bytes():
                raise ValueError(f"Effective trial {name} differs from the source trial provenance.")
        selected_auxiliary = directory_file_manifest(
            selected_directory,
            exclude={"config.json", "lock.json", "result.json"},
        )
        effective_auxiliary = directory_file_manifest(
            effective_trial,
            exclude={"config.json", "lock.json", "result.json"},
        )
        if canonical_json(selected_auxiliary) != canonical_json(effective_auxiliary):
            raise ValueError("Effective trial auxiliary artifacts differ from the selected lineage.")

    verified = load_harbor_job(destination, reward_key)
    if any(trial["classification"]["kind"] != "semantic" for trial in verified["trials"]):
        raise ValueError(f"Derived effective job contains a non-evaluable trial: {destination}")
    return manifest


def build_effective_job_at(
    destination: Path,
    published_destination: Path,
    reward_key: str,
    source_job: dict[str, Any],
    source_trials: list[dict[str, Any]],
    selections: list[dict[str, Any]],
    policy_digest: str,
    contract_digest: str,
) -> dict[str, Any]:
    shutil.copy2(source_job["directory"] / "config.json", destination / "config.json")
    shutil.copy2(source_job["directory"] / "lock.json", destination / "lock.json")
    effective_results: list[TrialResult] = []
    lineage = effective_lineage(source_job, source_trials, selections)
    for source_trial, merged_trial in zip(source_trials, selections, strict=True):
        selected = require_mapping(merged_trial["selected"], "merged selected lineage")
        destination_trial = destination / source_trial["trialDirectory"].name
        if selected["lineage"] == "original":
            selected_directory = source_trial["trialDirectory"]
            shutil.copytree(selected_directory, destination_trial, symlinks=False)
            selected_result = read_mapping(destination_trial / "result.json", "effective original TrialResult")
        else:
            matching_attempts = [
                attempt
                for attempt in merged_trial["retries"]
                if attempt.get("attempt") == selected.get("attempt")
            ]
            if len(matching_attempts) != 1:
                raise ValueError("Merged retry selection does not bind to one retry attempt.")
            selected_attempt = matching_attempts[0]
            selected_directory = find_retry_trial_directory(selected_attempt)
            validate_tree(selected_directory, "selected retry trial")
            shutil.copytree(selected_directory, destination_trial, symlinks=False)
            shutil.copy2(source_trial["trialDirectory"] / "config.json", destination_trial / "config.json")
            shutil.copy2(source_trial["trialDirectory"] / "lock.json", destination_trial / "lock.json")
            selected_result = read_mapping(destination_trial / "result.json", "effective retry TrialResult")
            original_result = source_trial["result"]
            for field in ("task_name", "trial_name", "task_id", "source", "task_checksum"):
                selected_result[field] = deepcopy(original_result.get(field))
            selected_result["config"] = deepcopy(source_trial["trialConfig"])
        selected_result["trial_uri"] = (
            published_destination / source_trial["trialDirectory"].name
        ).as_uri()
        TrialResult.model_validate(selected_result)
        atomic_json(destination_trial / "result.json", selected_result)
        model = TrialResult.model_validate(selected_result)
        effective_results.append(model)

    root_result = deepcopy(source_job["result"])
    root_result["n_total_trials"] = len(effective_results)
    root_result["stats"] = model_json(
        JobStats.from_trial_results(
            effective_results,
            n_total_trials=len(effective_results),
            n_running_trials=0,
            n_retries=0,
        )
    )
    finished = sorted(
        str(result.finished_at)
        for result in effective_results
        if result.finished_at is not None
    )
    if finished:
        root_result["updated_at"] = finished[-1]
        root_result["finished_at"] = finished[-1]
    JobConfig.model_validate(read_mapping(destination / "config.json", "effective JobConfig"))
    JobLock.model_validate(read_mapping(destination / "lock.json", "effective JobLock"))
    JobResult.model_validate(root_result)
    atomic_json(destination / "result.json", root_result)
    files = directory_file_manifest(destination, exclude={"resume-manifest.json"})
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "createdAt": utc_now(),
        "policyDigest": policy_digest,
        "contractDigest": contract_digest,
        "sourceJob": str(source_job["directory"]),
        "sourceJobArtifactDigest": source_job["artifactDigest"],
        "selectionPolicy": "first-evaluable-retry-never-best-of",
        "lineage": lineage,
        "files": files,
        "effectiveJobDigest": digest_value(files),
    }
    atomic_json(destination / "resume-manifest.json", manifest)
    verify_effective_job(
        destination,
        source_job,
        policy_digest,
        contract_digest,
        reward_key,
        expected_lineage=lineage,
        published_destination=published_destination,
    )
    return manifest


def materialize_effective_job(
    config: dict[str, Any],
    source_job: dict[str, Any],
    source_trials: list[dict[str, Any]],
    merged_by_key: dict[str, dict[str, Any]],
    policy_digest: str,
    contract_digest: str,
) -> dict[str, Any] | None:
    selections = [merged_by_key[trial["sourceTrialKey"]] for trial in source_trials]
    if any(row["selected"] is None or row["reward"] is None for row in selections):
        return None
    lineage = effective_lineage(source_job, source_trials, selections)
    source_key = digest_value({
        "directory": str(source_job["directory"]),
        "artifactDigest": source_job["artifactDigest"],
    }).removeprefix("sha256:")
    destination = config["outputDirectory"] / "effective-jobs" / source_key / "effective-job"
    validate_write_destination(destination, "effective job destination")
    if destination.exists() or destination.is_symlink():
        manifest = verify_effective_job(
            destination,
            source_job,
            policy_digest,
            contract_digest,
            config["rewardKey"],
            expected_lineage=lineage,
        )
        return {
            "sourceJob": str(source_job["directory"]),
            "jobDirectory": str(destination),
            "effectiveJobDigest": manifest["effectiveJobDigest"],
            "materialized": False,
        }

    destination.parent.mkdir(parents=True, exist_ok=True)
    validate_directory_node(destination.parent, "effective job publication parent")
    temporary = destination.with_name(f".{destination.name}.build-{secrets.token_hex(16)}")
    validate_write_destination(temporary, "effective job temporary")
    temporary.mkdir()
    try:
        manifest = build_effective_job_at(
            temporary,
            destination,
            config["rewardKey"],
            source_job,
            source_trials,
            selections,
            policy_digest,
            contract_digest,
        )
        if destination.exists() or destination.is_symlink():
            raise ValueError(f"Effective job destination appeared during publication: {destination}")
        temporary.rename(destination)
    except Exception:
        if temporary.exists() and not is_reparse(temporary):
            shutil.rmtree(temporary)
        raise
    verify_effective_job(
        destination,
        source_job,
        policy_digest,
        contract_digest,
        config["rewardKey"],
        expected_lineage=lineage,
    )
    return {
        "sourceJob": str(source_job["directory"]),
        "jobDirectory": str(destination),
        "effectiveJobDigest": manifest["effectiveJobDigest"],
        "materialized": True,
    }


def materialize_effective_jobs(
    config: dict[str, Any],
    jobs: list[dict[str, Any]],
    merged: dict[str, Any],
    policy_digest: str,
    contract_digest: str,
) -> list[dict[str, Any]]:
    merged_by_key = {row["sourceTrialKey"]: row for row in merged["trials"]}
    results = []
    for source_job in jobs:
        item = materialize_effective_job(
            config,
            source_job,
            source_job["trials"],
            merged_by_key,
            policy_digest,
            contract_digest,
        )
        if item is not None:
            results.append(item)
    return results


def lock_source_trials(config: dict[str, Any], trials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    attestations = remediation_contract(config)
    return [
        {
            "sourceTrialKey": trial["sourceTrialKey"],
            "sourceJobIndex": trial["sourceJobIndex"],
            "sourceJob": str(trial["jobDirectory"]),
            "sourceJobName": trial["sourceJobName"],
            "sourceJobLabel": trial["sourceJobLabel"],
            "candidateId": trial["candidateId"],
            "trialId": trial["trialId"],
            "sourceTrial": trial["trialName"],
            "taskId": trial["result"].get("task_id"),
            "taskName": trial["result"].get("task_name"),
            "taskChecksum": trial["result"].get("task_checksum"),
            "candidateSkillDigest": (trial.get("skill") or {}).get("digest"),
            "evaluationProfileDigest": trial.get("evaluationProfileDigest"),
            "originalJobDigest": trial["jobArtifactDigest"],
            "retryJobDigest": None,
            "artifactDigest": trial["jobArtifactDigest"],
            "classification": trial["classification"]["kind"],
            "failureDomain": trial["classification"]["domain"],
            "failureContract": trial["classification"].get("failureContract"),
            "requiresRemediation": failure_requires_remediation(trial["classification"]),
            "retryDomain": trial["classification"]["domain"],
            "terminalOutcome": structured_attestation(trial)["terminalOutcome"],
            "errorCode": structured_attestation(trial)["errorCode"],
            "remediationAttestationDigest": (
                attestations.get(trial["classification"]["domain"], {}).get(
                    "remediationAttestationDigest"
                )
                if failure_requires_remediation(trial["classification"])
                else None
            ),
            "observedExternalDomains": trial["classification"].get("observedExternalDomains", []),
            "reason": trial["classification"]["reason"],
            "evidence": trial["classification"].get("evidence", []),
            "evidenceArtifacts": trial["classification"].get("evidenceArtifacts", []),
            "diagnostics": trial.get("diagnostics", []),
        }
        for trial in trials
    ]


def validate_required_environment(config: dict[str, Any]) -> list[str]:
    return sorted(name for name in config["requiredEnv"] if not os.environ.get(name))


def validate_required_paths(config: dict[str, Any]) -> list[str]:
    missing = []
    for path in config["requiredPaths"]:
        validate_path_chain(path, f"requiredPath {path}")
        if not path.exists():
            missing.append(str(path))
            continue
        if is_reparse(path):
            raise ValueError(f"requiredPath cannot be a symlink, junction, or reparse point: {path}")
    return sorted(missing)


def host_input_disclosure(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "requiredEnv": "presence-only; credential validity is not checked in doctor/dry-run",
        "requiredPaths": "host existence and link safety only; container bind mounts are not proven",
        "preflights": "declared remediation commands are executed only in live mode",
        "unverifiedHostInputs": [
            "provider and service reachability",
            "credential authorization and quota",
            "container-visible mount equivalence",
        ],
    }


def persist_outputs(
    config: dict[str, Any],
    plan: dict[str, Any],
    lock: dict[str, Any],
    merged: dict[str, Any],
) -> None:
    output = config["outputDirectory"]
    validate_write_destination(output, "outputDirectory")
    output.mkdir(parents=True, exist_ok=True)
    atomic_json(output / "resume-plan.json", plan)
    atomic_json(output / "resume-lock.json", lock)
    atomic_json(output / "merged-result.json", merged)
    report_path = output / "report.md"
    validate_write_destination(report_path, "report destination")
    atomic_text(report_path, report_text(plan, merged, lock))


def persisted_noop_summary(
    config: dict[str, Any],
    jobs: list[dict[str, Any]],
    trials: list[dict[str, Any]],
    lock: dict[str, Any],
    policy_digest: str,
    contract_digest: str,
) -> dict[str, Any] | None:
    output = config["outputDirectory"]
    required = [
        output / "resume-plan.json",
        output / "resume-lock.json",
        output / "merged-result.json",
        output / "report.md",
    ]
    if not all(path.is_file() and not is_reparse(path) for path in required):
        return None
    plan = read_mapping(required[0], "persisted resume plan")
    merged = read_mapping(required[2], "persisted merged result")
    for label, payload in (("plan", plan), ("merged result", merged)):
        if payload.get("policyDigest") != policy_digest or payload.get("contractDigest") != contract_digest:
            raise ValueError(f"Persisted {label} belongs to a different resume contract.")
    expected_merged = merged_result(
        config, trials, lock, policy_digest, contract_digest
    )
    persisted_core = deepcopy(merged)
    expected_core = deepcopy(expected_merged)
    for payload in (persisted_core, expected_core):
        payload.pop("generatedAt", None)
        payload.pop("effectiveJobs", None)
        summary = require_mapping(payload.get("summary"), "merged summary")
        summary.pop("effectiveJobs", None)
    if canonical_json(persisted_core) != canonical_json(expected_core):
        raise ValueError("Persisted merged-result.json differs from the verified attempt ledger.")
    jobs_by_directory = {str(job["directory"]): job for job in jobs}
    effective_rows = require_list(merged.get("effectiveJobs") or [], "merged effectiveJobs")
    expected_effective_count = sum(
        all(
            expected["selected"] is not None and expected["reward"] is not None
            for expected in (
                next(
                    row
                    for row in expected_merged["trials"]
                    if row["sourceTrialKey"] == trial["sourceTrialKey"]
                )
                for trial in job["trials"]
            )
        )
        for job in jobs
    )
    if len(effective_rows) != expected_effective_count:
        raise ValueError("Persisted merged result has an incomplete effective job set.")
    expected_by_key = {row["sourceTrialKey"]: row for row in expected_merged["trials"]}
    for item in effective_rows:
        row = require_mapping(item, "merged effective job")
        source = jobs_by_directory.get(require_string(row.get("sourceJob"), "effective sourceJob"))
        if source is None:
            raise ValueError("Persisted effective job references an unknown source job.")
        selections = [expected_by_key[trial["sourceTrialKey"]] for trial in source["trials"]]
        manifest = verify_effective_job(
            Path(require_string(row.get("jobDirectory"), "effective jobDirectory")),
            source,
            policy_digest,
            contract_digest,
            config["rewardKey"],
            expected_lineage=effective_lineage(source, source["trials"], selections),
        )
        if row.get("effectiveJobDigest") != manifest.get("effectiveJobDigest"):
            raise ValueError("Persisted effective job digest differs from its verified manifest.")
    return require_mapping(merged.get("summary"), "persisted merged summary")


def prepare_context(config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], str, str]:
    observed_version = version("harbor")
    if observed_version != HARBOR_VERSION:
        raise ValueError(f"This tool requires Harbor {HARBOR_VERSION}; found {observed_version}.")
    jobs = []
    for path, metadata in zip(config["sourceJobs"], config["sourceJobMetadata"], strict=True):
        job = load_harbor_job(
            path,
            config["rewardKey"],
            set(config["optInFailureContracts"]),
        )
        job["configuredCandidateId"] = metadata["candidateId"]
        job["configuredLabel"] = metadata["label"]
        jobs.append(job)
    trials = all_trials(jobs)
    existing = read_existing_lock(config)
    lock, policy_digest, contract_digest = initialize_or_validate_lock(config, jobs, existing)
    attestations = remediation_contract(config)
    for trial in trials:
        classification = trial["classification"]
        trial["remediationAttestationDigest"] = (
            attestations.get(classification.get("domain"), {}).get(
                "remediationAttestationDigest"
            )
            if failure_requires_remediation(classification)
            else None
        )
    source_rows = lock_source_trials(config, trials)
    if "sourceTrials" in lock and canonical_json(lock["sourceTrials"]) != canonical_json(source_rows):
        old_by_key = {
            row.get("sourceTrialKey"): row
            for row in require_list(lock["sourceTrials"], "resume-lock.sourceTrials")
            if isinstance(row, dict)
        }
        details = []
        for row in source_rows:
            prior = old_by_key.get(row.get("sourceTrialKey"))
            if not isinstance(prior, dict):
                details.append(f"{row.get('sourceTrialKey')}:missing")
                continue
            changed = sorted(
                key
                for key in set(prior) | set(row)
                if canonical_json(prior.get(key)) != canonical_json(row.get(key))
            )
            if changed:
                details.append(f"{row.get('sourceTrialKey')}:{','.join(changed)}")
        raise ValueError(
            "Existing resume-lock source classifications differ from current artifacts"
            + (": " + "; ".join(details) if details else ".")
        )
    lock["sourceTrials"] = source_rows
    verify_attempt_ledger(config, trials, lock)
    return jobs, trials, lock, policy_digest, contract_digest


def dry_run(config: dict[str, Any], doctor: bool) -> int:
    jobs, trials, lock, policy_digest, contract_digest = prepare_context(config)
    rows = classify_plan_trials(config, trials, lock)
    missing_env = validate_required_environment(config)
    missing_paths = validate_required_paths(config)
    disclosure = host_input_disclosure(config)
    preflight_pending = any(
        row["eligible"]
        and (
            row["retryDomain"] in {"authentication", "environment"}
            or bool(row.get("requiresRemediation"))
        )
        for row in rows
    )
    if doctor:
        output = {
            "ok": True,
            "contractValid": True,
            "mode": "doctor",
            "harborVersion": HARBOR_VERSION,
            "sourceJobs": len(jobs),
            "sourceTrials": len(trials),
            "eligibleTrials": sum(row["eligible"] for row in rows),
            "excludedTrials": sum(not row["eligible"] for row in rows),
            "resumeNeeded": any(row["eligible"] for row in rows),
            "provenanceExcluded": sum(bool(row.get("provenanceError")) for row in rows),
            "semanticButUntrusted": sum(
                row["classification"] == "semantic" and bool(row.get("provenanceError"))
                for row in rows
            ),
            "readyForLive": not missing_env and not missing_paths and not preflight_pending,
            "liveReadiness": (
                "preflight-not-executed"
                if preflight_pending
                else ("missing-host-inputs" if missing_env or missing_paths else "host-checks-passed-with-limitations")
            ),
            "requiredPaths": [str(path) for path in config["requiredPaths"]],
            "missingRequiredEnv": missing_env,
            "missingRequiredPaths": missing_paths,
            "hostInputVerification": disclosure,
            "policyDigest": policy_digest,
            "contractDigest": contract_digest,
            "writes": 0,
            "externalCalls": 0,
        }
    else:
        output = make_plan(
            config,
            rows,
            policy_digest,
            contract_digest,
            "dry-run",
            None,
        )
        output["writes"] = 0
        output["externalCalls"] = 0
        output["requiredPaths"] = [str(path) for path in config["requiredPaths"]]
        output["missingRequiredEnv"] = missing_env
        output["missingRequiredPaths"] = missing_paths
        output["hostInputVerification"] = disclosure
        output["readyForLive"] = not missing_env and not missing_paths and not preflight_pending
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


def analyze_only(config: dict[str, Any]) -> int:
    jobs, trials, lock, policy_digest, contract_digest = prepare_context(config)
    if not config["retryJobs"]:
        summary = persisted_noop_summary(
            config, jobs, trials, lock, policy_digest, contract_digest
        )
        if summary is not None:
            print(json.dumps({
                "mode": "analyze-only",
                "importedRetryJobs": 0,
                "outputDirectory": str(config["outputDirectory"]),
                "merged": summary,
                "byteIdempotentNoop": True,
            }, indent=2))
            return 0
    source_by_key = {trial["sourceTrialKey"]: trial for trial in trials}
    grouped = attempts_by_trial(lock)
    replacements: list[tuple[int, dict[str, Any]]] = []
    for entry in config["retryJobs"]:
        key = entry["sourceTrialKey"]
        source = source_by_key.get(key)
        if source is None:
            raise ValueError(f"retryJobs references an unknown sourceTrialKey: {key}")
        classification = source["classification"]
        ready, readiness = remediation_readiness(
            config,
            classification.get("domain"),
            classification.get("failureContract"),
        )
        if not classification["eligible"] or not ready:
            raise ValueError(
                f"retryJobs references an ineligible source trial {key}: "
                f"{classification['reason'] if not classification['eligible'] else readiness}"
            )
        attempts = grouped.get(key, [])
        attempt_number = entry["attempt"]
        if attempt_number > config["maxRetries"]:
            raise ValueError(f"Retry attempt for {key} exceeds the persistent external retry cap.")
        if attempt_number > len(attempts):
            raise ValueError(
                "retryJobs may only recover a pre-existing engine reservation; "
                f"no live reservation exists for {key} attempt {attempt_number}."
            )
        reservation = attempts[attempt_number - 1]
        if reservation.get("attempt") != attempt_number or reservation.get("status") != "reserved":
            raise ValueError(
                "retryJobs may only replace the exact unresolved live reservation for "
                f"{key} attempt {attempt_number}."
            )
        if attempt_number != len(attempts):
            raise ValueError("An unresolved live reservation must be the final attempt in its chain.")
        stop_reason = attempt_chain_stop_reason(attempts[: attempt_number - 1])
        if stop_reason:
            raise ValueError(
                f"retryJobs cannot recover after a terminal prior attempt for {key}: {stop_reason}"
            )
        reserved_job = Path(
            os.path.abspath(require_string(reservation.get("jobDirectory"), "reserved jobDirectory"))
        )
        if entry["jobDirectory"] != reserved_job:
            raise ValueError(
                "retryJobs jobDirectory must exactly match the engine-reserved live destination."
            )
        lifecycle = require_list(reservation.get("lifecycle"), "reserved attempt lifecycle")
        phases = [require_mapping(event, "reserved lifecycle event").get("phase") for event in lifecycle]
        if "configured-before-harbor-call" not in phases or "harbor-call-starting" not in phases:
            raise ValueError(
                "retryJobs recovery requires a durable configured-before-harbor-call and "
                "harbor-call-starting receipt from the live engine."
            )
        imported = import_retry_job(
            source,
            entry["jobDirectory"],
            attempt_number,
            config["rewardKey"],
        )
        for field in (
            "mode",
            "attemptRoot",
            "retryConfig",
            "retryConfigDigest",
            "retryConfigPayloadDigest",
            "policyDigest",
            "contractDigest",
            "preflight",
            "reservedAt",
        ):
            imported[field] = deepcopy(reservation.get(field))
        imported["recoveredAt"] = utc_now()
        imported["lifecycle"] = deepcopy(lifecycle)
        imported["lifecycle"].append(
            {"status": "completed", "phase": "analyze-only-reservation-recovery", "at": utc_now()}
        )
        ledger_index = next(
            index
            for index, item in enumerate(lock["attempts"])
            if item.get("sourceTrialKey") == key and item.get("attempt") == attempt_number
        )
        replacements.append((ledger_index, seal_attempt(imported)))

    # Every completed job is verified before an existing live reservation is replaced.
    for ledger_index, recovered in replacements:
        lock["attempts"][ledger_index] = recovered
    lock["updatedAt"] = utc_now()
    rows = classify_plan_trials(config, trials, lock)
    plan = make_plan(
        config,
        rows,
        policy_digest,
        contract_digest,
        "analyze-only",
        None,
    )
    plan["summary"]["importedRetryJobs"] = len(replacements)
    merged = merged_result(config, trials, lock, policy_digest, contract_digest)
    effective_jobs = materialize_effective_jobs(
        config, jobs, merged, policy_digest, contract_digest
    )
    merged["effectiveJobs"] = effective_jobs
    merged["summary"]["effectiveJobs"] = len(effective_jobs)
    plan["effectiveJobs"] = effective_jobs
    persist_outputs(config, plan, lock, merged)
    print(json.dumps({
        "mode": "analyze-only",
        "importedRetryJobs": len(replacements),
        "outputDirectory": str(config["outputDirectory"]),
        "merged": merged["summary"],
    }, indent=2))
    return 0


def live_run(config: dict[str, Any]) -> int:
    missing_env = validate_required_environment(config)
    if missing_env:
        raise ValueError("Required environment variables are missing: " + ", ".join(missing_env))
    missing_paths = validate_required_paths(config)
    if missing_paths:
        raise ValueError("Required host paths are missing: " + ", ".join(missing_paths))
    jobs, trials, lock, policy_digest, contract_digest = prepare_context(config)
    preliminary_rows = classify_plan_trials(config, trials, lock)
    preliminary_by_key = {row["sourceTrialKey"]: row for row in preliminary_rows}
    remediation_domains: dict[str, str | None] = {}
    for trial in trials:
        classification = trial["classification"]
        preliminary = preliminary_by_key[trial["sourceTrialKey"]]
        if not preliminary["eligible"] or not failure_requires_remediation(classification):
            continue
        domain = require_string(classification.get("domain"), "remediation failure domain")
        failure_contract = classification.get("failureContract")
        prior_contract = remediation_domains.get(domain)
        if prior_contract is not None and prior_contract != failure_contract:
            raise ValueError(
                f"Conflicting remediation contracts share domain {domain}; split the resume config."
            )
        remediation_domains[domain] = failure_contract
    preflights: dict[str, dict[str, Any]] = {}
    for domain in sorted(remediation_domains):
        ready, reason = remediation_readiness(
            config,
            domain,
            remediation_domains[domain],
        )
        if not ready:
            preflights[domain] = {"domain": domain, "ok": False, "reason": reason}
        else:
            preflights[domain] = run_preflight(config["remediation"][domain]["preflightCommand"], domain)
    rows = classify_plan_trials(config, trials, lock, preflights)
    plan = make_plan(config, rows, policy_digest, contract_digest, "run", preflights)
    source_by_key = {trial["sourceTrialKey"]: trial for trial in trials}
    output = config["outputDirectory"]
    validate_write_destination(output, "outputDirectory")
    output.mkdir(parents=True, exist_ok=True)
    created = 0
    for row in rows:
        if not row["eligible"]:
            continue
        source = source_by_key[row["sourceTrialKey"]]
        attempt_number = int(row["plannedAttempt"])
        attempt_root = Path(row["plannedDestination"])
        validate_write_destination(attempt_root, "retry attempt destination")
        if attempt_root.exists() or attempt_root.is_symlink():
            raise ValueError(f"Refusing to resume or overwrite an existing retry destination: {attempt_root}")
        job_config = retry_job_config(source, attempt_root, row["plannedJobName"])
        config_payload = stable_job_config_payload(job_config)
        config_path = attempt_root / "job-config.yaml"
        expected_job_directory = Path(os.path.abspath(os.fspath(job_config.jobs_dir))) / job_config.job_name
        reserved_at = utc_now()
        reservation = {
            "sourceTrialKey": source["sourceTrialKey"],
            **source_attempt_lineage(source),
            "attempt": attempt_number,
            "mode": "live",
            "attemptRoot": str(attempt_root),
            "jobDirectory": str(expected_job_directory),
            "retryConfig": str(config_path),
            "retryConfigPayloadDigest": digest_value(config_payload),
            "policyDigest": policy_digest,
            "contractDigest": contract_digest,
            "preflight": (
                deepcopy(preflights.get(source["classification"].get("domain")))
                if failure_requires_remediation(source["classification"])
                else None
            ),
            "reservedAt": reserved_at,
            "status": "reserved",
            "evaluable": False,
            "reward": None,
            "lifecycle": [{"status": "reserved", "phase": "durable-before-files", "at": reserved_at}],
        }
        lock["attempts"].append(seal_attempt(reservation))
        lock["updatedAt"] = utc_now()
        atomic_json(output / "resume-lock.json", lock)
        harbor_started = False
        try:
            # The cap-consuming reservation above is durable before any attempt-local file exists.
            attempt_root.mkdir(parents=True)
            staged_skill = attempt_root / "skills" / source["skill"]["name"]
            copy_canonical_skill(source["skill"]["source"], staged_skill, source["skill"]["digest"])
            validate_write_destination(config_path, "retry JobConfig destination")
            atomic_text(config_path, yaml.safe_dump(config_payload, sort_keys=False))
            current = deepcopy(lock["attempts"][-1])
            current.pop("attemptRecordDigest", None)
            current["retryConfigDigest"] = digest_file(config_path)
            current["lifecycle"].append({
                "status": "reserved",
                "phase": "configured-before-harbor-call",
                "at": utc_now(),
            })
            lock["attempts"][-1] = seal_attempt(current)
            lock["updatedAt"] = utc_now()
            atomic_json(output / "resume-lock.json", lock)
            current = deepcopy(lock["attempts"][-1])
            current.pop("attemptRecordDigest", None)
            current["lifecycle"].append({
                "status": "reserved",
                "phase": "harbor-call-starting",
                "at": utc_now(),
            })
            lock["attempts"][-1] = seal_attempt(current)
            lock["updatedAt"] = utc_now()
            atomic_json(output / "resume-lock.json", lock)
            harbor_started = True
            observed_job_directory = asyncio.run(run_native_job(job_config))
            if observed_job_directory != expected_job_directory:
                raise ValueError("Harbor created the retry job at an unexpected destination.")
            imported = import_retry_job(source, observed_job_directory, attempt_number, config["rewardKey"])
            imported["mode"] = "live"
            imported["attemptRoot"] = str(attempt_root)
            imported["retryConfig"] = str(config_path)
            imported["retryConfigDigest"] = digest_file(config_path)
            imported["retryConfigPayloadDigest"] = digest_value(config_payload)
            imported["policyDigest"] = policy_digest
            imported["contractDigest"] = contract_digest
            imported["preflight"] = deepcopy(lock["attempts"][-1].get("preflight"))
            imported["reservedAt"] = reserved_at
            imported["lifecycle"] = deepcopy(lock["attempts"][-1]["lifecycle"])
            imported["lifecycle"].append({"status": "completed", "at": utc_now()})
            lock["attempts"][-1] = seal_attempt(imported)
            lock["updatedAt"] = utc_now()
            atomic_json(output / "resume-lock.json", lock)
            row["createdJob"] = str(observed_job_directory)
            created += 1
        except Exception as error:
            failed = deepcopy(lock["attempts"][-1])
            failed.pop("attemptRecordDigest", None)
            failed["status"] = "failed-execution" if harbor_started else "failed-setup"
            failed["failureType"] = type(error).__name__
            failed["failureDomain"] = EXCEPTION_TYPES.get(type(error).__name__)
            failed["lifecycle"].append({"status": failed["status"], "at": utc_now()})
            lock["attempts"][-1] = seal_attempt(failed)
            lock["updatedAt"] = utc_now()
            atomic_json(output / "resume-lock.json", lock)
            raise
    plan["summary"]["createdRetryJobs"] = created
    merged = merged_result(config, trials, lock, policy_digest, contract_digest)
    effective_jobs = materialize_effective_jobs(
        config, jobs, merged, policy_digest, contract_digest
    )
    merged["effectiveJobs"] = effective_jobs
    merged["summary"]["effectiveJobs"] = len(effective_jobs)
    plan["effectiveJobs"] = effective_jobs
    persist_outputs(config, plan, lock, merged)
    print(json.dumps({
        "mode": "run",
        "createdRetryJobs": created,
        "outputDirectory": str(output),
        "merged": merged["summary"],
    }, indent=2))
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create new Harbor 0.18.0 jobs only for verifiably external failures, "
            "or import completed retries without best-of selection."
        )
    )
    parser.add_argument("config", type=Path, help="YAML/JSON external retry config")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true", help="classify and print the plan; write and call nothing")
    modes.add_argument("--doctor", action="store_true", help="validate dependencies/config/sources; write and call nothing")
    modes.add_argument("--analyze-only", action="store_true", help="import completed retry jobs; never launch Harbor jobs")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        config_path = Path(os.path.abspath(os.fspath(args.config.expanduser())))
        config = load_config(config_path)
        if args.doctor or args.dry_run:
            return dry_run(config, args.doctor)
        if args.analyze_only:
            with exclusive_operation_lock(config["outputDirectory"]):
                return analyze_only(config)
        with exclusive_operation_lock(config["outputDirectory"]):
            return live_run(config)
    except (ValueError, OSError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
