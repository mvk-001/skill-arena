# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Recover a deterministic verifier after an exact post-agent Harbor failure.

This tool is intentionally narrower than a Harbor retry. It never creates a
Harbor Job or Agent, never calls a model, and never mutates the failed native
job or its resume ledger. It accepts only a sealed post-agent/pre-verifier
artifact-collection failure, executes the task verifier twice without network
or credentials, and publishes a derived Harbor-compatible effective job.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import importlib.util
import json
import os
import re
import secrets
import selectors
import shutil
import stat
import subprocess
import sys
import time
import tomllib
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

from harbor.models.job.config import JobConfig
from harbor.models.job.lock import JobLock
from harbor.models.job.result import JobResult, JobStats
from harbor.models.trial.config import TrialConfig
from harbor.models.trial.result import TrialResult


SCHEMA_VERSION = 1
RECOVERY_CONTRACT = (
    "harbor-0.18.0.oserror-eio-during-artifact-collection."
    "post-agent.pre-verifier.v1"
)
LOCK_KIND = "harbor-post-agent-verifier-recovery-lock"
RESULT_KIND = "harbor-post-agent-verifier-recovery-result"
JOURNAL_KIND = "harbor-verifier-only-call-journal"
SELECTION_POLICY = "first-evaluable-retry-never-best-of"
COMPLETION_MODE = "verifier-only-recovery"
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
EIO_PATH_SUFFIX = "/artifacts/logs/artifacts"
EIO_REQUIRED_TRACE_MARKERS = (
    "single_step.py\", line 45, in _run",
    "trial.py\", line 944, in _collect_artifacts_phased",
    "artifact_handler.py\", line 179, in download_artifacts",
    "artifact_handler.py\", line 297, in _download_artifact",
    "artifact_handler.py\", line 366, in _record_mounted_artifacts_dir",
    "has_contents = target.exists() and any(target.iterdir())",
)
EIO_FORBIDDEN_TRACE_MARKERS = (
    "_run_verifier",
    "AgentFactory",
    "agent.run",
    "provider",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_value(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def digest_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            hasher.update(chunk)
    return "sha256:" + hasher.hexdigest()


def tree_content_sha256(root: Path) -> str:
    root = validate_tree(root, "content-addressed tree")
    files = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if "__pycache__" in relative.parts or path.name.endswith(".pyc"):
            continue
        if path.is_file():
            files.append((relative.as_posix(), path))
            if len(files) > 10_000:
                raise ValueError("Content-addressed tree exceeds the 10,000-file safety limit.")
    files.sort(key=lambda row: row[0].encode("utf-8"))
    hasher = hashlib.sha256()
    for relative, path in files:
        hasher.update(relative.encode("utf-8"))
        hasher.update(b"\0")
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                hasher.update(chunk)
        hasher.update(b"\0")
    return hasher.hexdigest()


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be an array.")
    return value


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string.")
    return value.strip()


def require_digest(value: Any, label: str) -> str:
    text = require_string(value, label).casefold()
    if not SHA256.fullmatch(text):
        raise ValueError(f"{label} must be sha256:<64 lowercase hex>.")
    return text


def require_integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{label} must be an integer >= {minimum}.")
    return value


def reject_unknown(value: Mapping[str, Any], allowed: set[str], label: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"{label} has unknown keys: {', '.join(unknown)}")


def read_json(path: Path, label: str, *, maximum_bytes: int = 16 * 1024 * 1024) -> dict[str, Any]:
    required_regular_file(path, label)
    if path.stat().st_size > maximum_bytes:
        raise ValueError(f"{label} exceeds the {maximum_bytes}-byte JSON safety limit: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not valid UTF-8 JSON: {path}") from error
    return require_mapping(value, label)


def read_utf8(path: Path, label: str, *, maximum_bytes: int = 1024 * 1024) -> str:
    required_regular_file(path, label)
    if path.stat().st_size > maximum_bytes:
        raise ValueError(f"{label} exceeds the {maximum_bytes}-byte text safety limit: {path}")
    try:
        raw = path.read_bytes()
        if len(raw) > maximum_bytes:
            raise ValueError(
                f"{label} exceeds the {maximum_bytes}-byte text safety limit: {path}"
            )
        return raw.decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise ValueError(f"{label} is not valid bounded UTF-8 text: {path}") from error


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{secrets.token_hex(12)}")
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with temporary.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    fsync_directory(path.parent)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def fsync_file(path: Path, label: str) -> None:
    required_regular_file(path, label)
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def fsync_tree(root: Path, label: str) -> None:
    root = validate_tree(root, label)
    files = sorted(path for path in root.rglob("*") if path.is_file())
    directories = sorted(
        (path for path in root.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    )
    for path in files:
        fsync_file(path, f"{label} file")
    for path in directories:
        fsync_directory(path)
    fsync_directory(root)
    fsync_directory(root.parent)


def rename_noreplace(source: Path, destination: Path, label: str) -> None:
    source = validate_ancestor_chain(source, f"{label} source")
    destination = validate_ancestor_chain(destination, f"{label} destination")
    source_is_directory = source.is_dir() and not is_link_or_reparse(source)
    if source_is_directory:
        validate_tree(source, f"{label} source")
    else:
        required_regular_file(source, f"{label} source")
    validate_tree(destination.parent, f"{label} destination parent")
    if os.name != "posix":
        raise RuntimeError(f"{label} requires POSIX renameat2(RENAME_NOREPLACE).")
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise RuntimeError(f"{label} requires renameat2(RENAME_NOREPLACE) support.")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        -100,
        os.fsencode(source),
        -100,
        os.fsencode(destination),
        1,
    )
    if result != 0:
        code = ctypes.get_errno()
        if code in {errno.EEXIST, errno.ENOTEMPTY}:
            raise ValueError(f"{label} destination already exists: {destination}")
        if code in {errno.EINVAL, errno.ENOSYS, errno.ENOTSUP}:
            # WSL DrvFS rejects Linux RENAME_NOREPLACE. Windows Directory.Move
            # uses MoveFile without replacement, preserving the same atomic
            # no-clobber property on the backing NTFS filesystem.
            converted = []
            for path in (source, destination):
                conversion = subprocess.run(
                    ["wslpath", "-w", os.fspath(path)],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if conversion.returncode != 0 or not conversion.stdout.strip():
                    raise RuntimeError(f"{label} cannot convert its DrvFS path safely.")
                converted.append(conversion.stdout.strip())
            move_environment = dict(os.environ)
            move_environment["SKILL_ARENA_MOVE_SOURCE"] = converted[0]
            move_environment["SKILL_ARENA_MOVE_DESTINATION"] = converted[1]
            move_environment["WSLENV"] = ":".join(
                part
                for part in (
                    move_environment.get("WSLENV", ""),
                    "SKILL_ARENA_MOVE_SOURCE",
                    "SKILL_ARENA_MOVE_DESTINATION",
                )
                if part
            )
            move_method = "Directory" if source_is_directory else "File"
            move = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    f"[System.IO.{move_method}]::Move("
                    "$env:SKILL_ARENA_MOVE_SOURCE, "
                    "$env:SKILL_ARENA_MOVE_DESTINATION)",
                ],
                check=False,
                capture_output=True,
                text=True,
                env=move_environment,
                timeout=30,
            )
            if move.returncode != 0:
                if os.path.lexists(destination):
                    raise ValueError(f"{label} destination already exists: {destination}")
                raise RuntimeError(
                    f"{label} Windows no-replace move failed: {move.stderr.strip()[:1000]}"
                )
            destination_valid = (
                destination.is_dir()
                and not is_link_or_reparse(destination)
                if source_is_directory
                else destination.is_file()
                and not is_link_or_reparse(destination)
                and destination.lstat().st_nlink == 1
            )
            if os.path.lexists(source) or not destination_valid:
                raise RuntimeError(f"{label} Windows no-replace move did not publish exactly once.")
            fsync_directory(destination.parent)
            return
        raise OSError(code, os.strerror(code), os.fspath(destination))
    if os.path.lexists(source):
        raise RuntimeError(f"{label} no-replace rename left its source behind.")
    if source_is_directory:
        validate_tree(destination, f"{label} published destination")
    else:
        required_regular_file(destination, f"{label} published destination")
    fsync_directory(destination.parent)


def durable_new_json(path: Path, value: Any, label: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(path):
        raise ValueError(f"{label} already exists: {path}")
    temporary = path.with_name(f".{path.name}.tmp-{secrets.token_hex(12)}")
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    try:
        with temporary.open("xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        rename_noreplace(temporary, path, label)
    except Exception:
        if temporary.exists() and not is_link_or_reparse(temporary):
            temporary.unlink()
            fsync_directory(path.parent)
        raise


def publish_expected_json(path: Path, value: Any, label: str) -> None:
    """Publish deterministic JSON once, resuming only an exact staged payload."""
    path.parent.mkdir(parents=True, exist_ok=True)
    validate_tree(path.parent, f"{label} parent")
    temporary = path.with_name(f".{path.name}.verifier-recovery-build")
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if os.path.lexists(path):
        if os.path.lexists(temporary):
            raise ValueError(f"{label} and its staged payload coexist ambiguously.")
        return
    if os.path.lexists(temporary):
        required_regular_file(temporary, f"{label} staged payload")
        if temporary.read_bytes() != payload:
            raise ValueError(f"{label} staged payload differs from the expected record.")
    else:
        with temporary.open("xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        fsync_directory(path.parent)
    rename_noreplace(temporary, path, label)


def durable_json(path: Path, value: Any, *, exclusive: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if exclusive:
        if not hasattr(os, "O_NOFOLLOW"):
            raise RuntimeError("Durable verifier journal creation requires POSIX O_NOFOLLOW support.")
        descriptor = os.open(
            path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
            0o600,
        )
        try:
            offset = 0
            while offset < len(payload):
                written = os.write(descriptor, payload[offset:])
                if written <= 0:
                    raise OSError("Short write while creating durable verifier journal.")
                offset += written
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        fsync_directory(path.parent)
        return
    required_regular_file(path, "durable verifier journal")
    temporary = path.with_name(f".{path.name}.tmp-{secrets.token_hex(12)}")
    with temporary.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    fsync_directory(path.parent)


def validate_finite_tree(value: Any, label: str) -> None:
    if isinstance(value, float) and not float("-inf") < value < float("inf"):
        raise ValueError(f"{label} contains a non-finite number.")
    if isinstance(value, dict):
        for key, item in value.items():
            validate_finite_tree(item, f"{label}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            validate_finite_tree(item, f"{label}[{index}]")


def validate_verifier_payload(
    reward: Mapping[str, Any], diagnostics: Mapping[str, Any], label: str
) -> float:
    validate_finite_tree(reward, f"{label} reward")
    validate_finite_tree(diagnostics, f"{label} diagnostics")
    primary = reward.get("reward")
    if isinstance(primary, bool) or not isinstance(primary, (int, float)):
        raise ValueError(f"{label} reward must contain a finite numeric reward.")
    if not float("-inf") < float(primary) < float("inf"):
        raise ValueError(f"{label} reward cannot be non-finite.")
    if float(primary) < 0:
        raise ValueError(f"{label} reward cannot be negative.")
    expected_diagnostics = {
        "status": "scored-response",
        "terminal_outcome": "answer-emitted",
        "failure_domain": None,
        "question_id": "q003",
    }
    for field, expected in expected_diagnostics.items():
        if diagnostics.get(field) != expected:
            raise ValueError(f"{label} diagnostics field {field} drifted.")
    return float(primary)


def parse_timestamp(value: Any, label: str) -> datetime:
    text = require_string(value, label)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO-8601 timestamp.") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def is_link_or_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    try:
        return bool(path.lstat().st_file_attributes & 0x400)
    except AttributeError:
        return False


def validate_ancestor_chain(path: Path, label: str) -> Path:
    absolute = Path(os.path.abspath(os.fspath(path)))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if not os.path.lexists(current):
            break
        if is_link_or_reparse(current):
            raise ValueError(f"{label} contains a linked/reparse ancestor: {current}")
    return absolute


def required_regular_file(path: Path, label: str) -> Path:
    path = validate_ancestor_chain(path, label)
    if is_link_or_reparse(path) or not path.is_file():
        raise ValueError(f"{label} must be an ordinary file: {path}")
    if path.lstat().st_nlink != 1:
        raise ValueError(f"{label} cannot be a hard link: {path}")
    return path


def validate_tree(root: Path, label: str) -> Path:
    root = validate_ancestor_chain(root, label)
    if is_link_or_reparse(root) or not root.is_dir():
        raise ValueError(f"{label} must be an ordinary directory: {root}")
    for path in root.rglob("*"):
        if is_link_or_reparse(path):
            raise ValueError(f"{label} contains a link or reparse point: {path}")
        if path.is_file() and path.lstat().st_nlink != 1:
            raise ValueError(f"{label} contains a hard-linked file: {path}")
        if not path.is_file() and not path.is_dir():
            raise ValueError(f"{label} contains an unsupported filesystem node: {path}")
    return root


def require_direct_children(
    root: Path,
    required: set[str],
    label: str,
    *,
    optional: set[str] | None = None,
) -> set[str]:
    root = validate_tree(root, label)
    observed = {path.name for path in root.iterdir()}
    allowed = required | (optional or set())
    if not required.issubset(observed) or not observed.issubset(allowed):
        raise ValueError(
            f"{label} direct children drifted: expected required={sorted(required)} "
            f"optional={sorted(optional or set())}, observed={sorted(observed)}"
        )
    return observed


def file_manifest(root: Path) -> list[dict[str, str]]:
    root = validate_tree(root, "artifact tree")
    files = []
    for path in root.rglob("*"):
        if path.is_file():
            files.append(path)
            if len(files) > 10_000:
                raise ValueError("Artifact tree exceeds the 10,000-file safety limit.")
    files.sort(key=lambda path: path.relative_to(root).as_posix())
    return [
        {"path": path.relative_to(root).as_posix(), "sha256": digest_file(path)}
        for path in files
    ]


def resolve_path(base: Path, value: Any, label: str) -> Path:
    raw = Path(require_string(value, label)).expanduser()
    return validate_ancestor_chain(
        Path(os.path.abspath(os.fspath(raw if raw.is_absolute() else base / raw))),
        label,
    )


def safe_relative(value: Any, label: str) -> str:
    text = require_string(value, label)
    pure = Path(text)
    if (
        pure.is_absolute()
        or "\\" in text
        or text.startswith("/")
        or any(part in {"", ".", ".."} for part in text.split("/"))
        or pure.as_posix() != text
    ):
        raise ValueError(f"{label} must be a normalized relative POSIX path.")
    return text


def path_inside(root: Path, candidate: Path, label: str, *, allow_root: bool = False) -> Path:
    root = Path(os.path.abspath(os.fspath(root)))
    candidate = Path(os.path.abspath(os.fspath(candidate)))
    try:
        relative = candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes its declared root: {candidate}") from error
    if not allow_root and not relative.parts:
        raise ValueError(f"{label} cannot equal its declared root.")
    return candidate


def load_engine() -> Any:
    engine_path = validate_ancestor_chain(
        Path(os.path.abspath(__file__)).with_name("resume_external_failures.py"),
        "frozen resume engine",
    )
    spec = importlib.util.spec_from_file_location("harbor_resume_frozen_engine", engine_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load frozen resume engine: {engine_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def model_json(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json", exclude_none=False)


def load_contract(path: Path) -> dict[str, Any]:
    raw = read_json(path, "verifier recovery contract")
    reject_unknown(
        raw,
        {
            "schemaVersion",
            "caseId",
            "recoveryContract",
            "resumeConfig",
            "sourceTrialKey",
            "attempt",
            "outputDirectory",
            "effectiveJobDirectory",
            "native",
            "agentTrace",
            "task",
            "verifier",
            "sealedFiles",
        },
        "verifier recovery contract",
    )
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"contract.schemaVersion must be {SCHEMA_VERSION}.")
    if raw.get("recoveryContract") != RECOVERY_CONTRACT:
        raise ValueError("Unsupported verifier recovery contract.")
    path = validate_ancestor_chain(path, "verifier recovery contract")
    base = path.parent
    native = require_mapping(raw.get("native"), "contract.native")
    agent_trace = require_mapping(raw.get("agentTrace"), "contract.agentTrace")
    task = require_mapping(raw.get("task"), "contract.task")
    verifier = require_mapping(raw.get("verifier"), "contract.verifier")
    reject_unknown(
        native,
        {
            "resumeLockSha256",
            "sourceAttemptRecordDigest",
            "retryJobDirectory",
            "nativeRetryJobArtifactDigest",
            "nativeRetryJobArtifactManifest",
            "nativeRetryJobDirectoryManifest",
            "trialId",
            "trialName",
            "trialResultSha256",
            "exceptionSha256",
        },
        "contract.native",
    )
    reject_unknown(
        agent_trace,
        {"path", "sha256", "size", "parsedEvents", "terminalOutputSha256", "tokens"},
        "contract.agentTrace",
    )
    reject_unknown(
        task,
        {
            "testsDirectory",
            "checksum",
            "treeSha256",
            "packagerDigest",
            "taskTestsArtifactDigest",
            "taskTestsArtifactManifest",
        },
        "contract.task",
    )
    reject_unknown(
        verifier,
        {"image", "imageId", "command", "network", "repeat"},
        "contract.verifier",
    )
    tokens = require_mapping(agent_trace.get("tokens"), "contract.agentTrace.tokens")
    reject_unknown(tokens, {"input", "cache", "output"}, "contract.agentTrace.tokens")
    sealed_files = []
    for index, item in enumerate(require_list(raw.get("sealedFiles"), "contract.sealedFiles")):
        row = require_mapping(item, f"contract.sealedFiles[{index}]")
        reject_unknown(row, {"path", "sha256"}, f"contract.sealedFiles[{index}]")
        sealed_files.append(
            {
                "path": resolve_path(base, row.get("path"), f"sealedFiles[{index}].path"),
                "sha256": require_digest(row.get("sha256"), f"sealedFiles[{index}].sha256"),
            }
        )
    if not sealed_files:
        raise ValueError("contract.sealedFiles cannot be empty.")
    sealed_paths = [str(item["path"]) for item in sealed_files]
    if len(sealed_paths) != len(set(sealed_paths)):
        raise ValueError("contract.sealedFiles contains duplicate paths.")
    result = {
        "path": path,
        "caseId": require_string(raw.get("caseId"), "contract.caseId"),
        "recoveryContract": RECOVERY_CONTRACT,
        "resumeConfig": resolve_path(base, raw.get("resumeConfig"), "contract.resumeConfig"),
        "sourceTrialKey": require_digest(raw.get("sourceTrialKey"), "contract.sourceTrialKey"),
        "attempt": require_integer(raw.get("attempt"), "contract.attempt", minimum=1),
        "outputDirectory": resolve_path(base, raw.get("outputDirectory"), "contract.outputDirectory"),
        "effectiveJobDirectory": resolve_path(
            base, raw.get("effectiveJobDirectory"), "contract.effectiveJobDirectory"
        ),
        "native": {
            "resumeLockSha256": require_digest(
                native.get("resumeLockSha256"), "contract.native.resumeLockSha256"
            ),
            "sourceAttemptRecordDigest": require_digest(
                native.get("sourceAttemptRecordDigest"),
                "contract.native.sourceAttemptRecordDigest",
            ),
            "retryJobDirectory": resolve_path(
                base, native.get("retryJobDirectory"), "contract.native.retryJobDirectory"
            ),
            "nativeRetryJobArtifactDigest": require_digest(
                native.get("nativeRetryJobArtifactDigest"),
                "contract.native.nativeRetryJobArtifactDigest",
            ),
            "nativeRetryJobArtifactManifest": require_list(
                native.get("nativeRetryJobArtifactManifest"),
                "contract.native.nativeRetryJobArtifactManifest",
            ),
            "nativeRetryJobDirectoryManifest": [
                safe_relative(item, f"contract.native.nativeRetryJobDirectoryManifest[{index}]")
                for index, item in enumerate(
                    require_list(
                        native.get("nativeRetryJobDirectoryManifest"),
                        "contract.native.nativeRetryJobDirectoryManifest",
                    )
                )
            ],
            "trialId": require_string(native.get("trialId"), "contract.native.trialId"),
            "trialName": require_string(native.get("trialName"), "contract.native.trialName"),
            "trialResultSha256": require_digest(
                native.get("trialResultSha256"), "contract.native.trialResultSha256"
            ),
            "exceptionSha256": require_digest(
                native.get("exceptionSha256"), "contract.native.exceptionSha256"
            ),
        },
        "agentTrace": {
            "path": safe_relative(agent_trace.get("path"), "contract.agentTrace.path"),
            "sha256": require_digest(agent_trace.get("sha256"), "contract.agentTrace.sha256"),
            "size": require_integer(agent_trace.get("size"), "contract.agentTrace.size", minimum=1),
            "parsedEvents": require_integer(
                agent_trace.get("parsedEvents"), "contract.agentTrace.parsedEvents", minimum=1
            ),
            "terminalOutputSha256": require_digest(
                agent_trace.get("terminalOutputSha256"),
                "contract.agentTrace.terminalOutputSha256",
            ),
            "tokens": {
                key: require_integer(tokens.get(key), f"contract.agentTrace.tokens.{key}")
                for key in ("input", "cache", "output")
            },
        },
        "task": {
            "testsDirectory": resolve_path(
                base, task.get("testsDirectory"), "contract.task.testsDirectory"
            ),
            "checksum": require_string(task.get("checksum"), "contract.task.checksum"),
            "treeSha256": require_string(task.get("treeSha256"), "contract.task.treeSha256").casefold(),
            "packagerDigest": require_digest(
                task.get("packagerDigest"), "contract.task.packagerDigest"
            ),
            "taskTestsArtifactDigest": require_digest(
                task.get("taskTestsArtifactDigest"), "contract.task.taskTestsArtifactDigest"
            ),
            "taskTestsArtifactManifest": require_list(
                task.get("taskTestsArtifactManifest"),
                "contract.task.taskTestsArtifactManifest",
            ),
        },
        "verifier": {
            "image": require_string(verifier.get("image"), "contract.verifier.image"),
            "imageId": require_digest(verifier.get("imageId"), "contract.verifier.imageId"),
            "command": [
                require_string(item, f"contract.verifier.command[{index}]")
                for index, item in enumerate(
                    require_list(verifier.get("command"), "contract.verifier.command")
                )
            ],
            "network": require_string(verifier.get("network"), "contract.verifier.network"),
            "repeat": require_integer(verifier.get("repeat"), "contract.verifier.repeat", minimum=1),
        },
        "sealedFiles": sealed_files,
    }
    if result["attempt"] != 1:
        raise ValueError("This recovery contract permits only attempt 1.")
    if not re.fullmatch(r"[0-9a-f]{64}", result["task"]["treeSha256"]):
        raise ValueError("contract.task.treeSha256 must be 64 lowercase hex characters.")
    if result["agentTrace"]["parsedEvents"] != 27:
        raise ValueError("q003 verifier recovery requires exactly 27 parsed Pi events.")
    if result["native"]["nativeRetryJobDirectoryManifest"] != sorted(
        set(result["native"]["nativeRetryJobDirectoryManifest"])
    ):
        raise ValueError("Native retry directory manifest must be unique and path-sorted.")
    if result["verifier"]["network"] != "none" or result["verifier"]["repeat"] != 2:
        raise ValueError("Verifier recovery requires exactly two network-disabled runs.")
    if result["verifier"]["command"] != ["/tests/test.sh"]:
        raise ValueError("Verifier recovery requires the exact /tests/test.sh command.")
    return result


def verify_declared_manifest(
    root: Path, declared: list[Any], expected_digest: str, label: str
) -> list[dict[str, str]]:
    observed = file_manifest(root)
    normalized = []
    for index, item in enumerate(declared):
        row = require_mapping(item, f"{label}[{index}]")
        reject_unknown(row, {"path", "sha256"}, f"{label}[{index}]")
        normalized.append(
            {
                "path": safe_relative(row.get("path"), f"{label}[{index}].path"),
                "sha256": require_digest(row.get("sha256"), f"{label}[{index}].sha256"),
            }
        )
    if normalized != sorted(normalized, key=lambda row: row["path"]):
        raise ValueError(f"{label} must be path-sorted.")
    if canonical_json(observed) != canonical_json(normalized):
        raise ValueError(f"{label} differs from the current artifact tree.")
    if digest_value(observed) != expected_digest:
        raise ValueError(f"{label} aggregate digest drifted.")
    return observed


def directory_manifest(root: Path) -> list[str]:
    root = validate_tree(root, "artifact directory topology")
    directories = []
    for path in root.rglob("*"):
        if path.is_dir():
            directories.append(path.relative_to(root).as_posix())
            if len(directories) > 10_000:
                raise ValueError("Artifact tree exceeds the 10,000-directory safety limit.")
    return sorted(directories)


def verify_manifest_topology(
    root: Path,
    manifest: Sequence[Mapping[str, Any]],
    label: str,
    *,
    allowed_empty_directories: Sequence[str] = (),
) -> None:
    root = validate_tree(root, label)
    expected_files = {
        safe_relative(row.get("path"), f"{label} manifest path") for row in manifest
    }
    expected_directories: set[str] = set()
    for relative in [*expected_files, *allowed_empty_directories]:
        normalized = safe_relative(relative, f"{label} topology path")
        parts = normalized.split("/")
        for index in range(1, len(parts)):
            expected_directories.add("/".join(parts[:index]))
    expected_directories.update(
        safe_relative(relative, f"{label} empty directory")
        for relative in allowed_empty_directories
    )
    observed_files = {
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    }
    observed_directories = set(directory_manifest(root))
    if observed_files != expected_files or observed_directories != expected_directories:
        raise ValueError(f"{label} file/directory topology drifted.")


def verify_flat_executable_tree(
    root: Path,
    manifest: Sequence[Mapping[str, Any]],
    label: str,
    *,
    executable: Sequence[str] = (),
) -> None:
    root = validate_tree(root, label)
    expected_nodes = sorted(require_string(row.get("path"), f"{label} manifest path") for row in manifest)
    observed_nodes = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
    if observed_nodes != expected_nodes:
        raise ValueError(f"{label} contains unmanifested files or directories.")
    for relative in executable:
        path = required_regular_file(root / relative, f"{label} executable {relative}")
        if not os.access(path, os.X_OK):
            raise ValueError(f"{label} executable bit drifted: {relative}")


def message_text(message: Mapping[str, Any]) -> str | None:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None
    parts = [
        block.get("text")
        for block in content
        if isinstance(block, dict)
        and block.get("type") == "text"
        and isinstance(block.get("text"), str)
    ]
    return "".join(parts) if parts else None


def validate_agent_trace(path: Path, expected: dict[str, Any], agent_result: Mapping[str, Any]) -> dict[str, Any]:
    required_regular_file(path, "native Pi trace")
    if path.stat().st_size != expected["size"]:
        raise ValueError("Native Pi trace size drifted.")
    raw = path.read_bytes()
    if len(raw) != expected["size"] or digest_bytes(raw) != expected["sha256"]:
        raise ValueError("Native Pi trace bytes drifted.")
    try:
        text = raw.decode("utf-8")
    except UnicodeError as error:
        raise ValueError("Native Pi trace is not UTF-8.") from error
    events = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"Native Pi trace line {number} is not JSON.") from error
        events.append(require_mapping(event, f"Pi event {number}"))
    if len(events) != expected["parsedEvents"]:
        raise ValueError("Native Pi trace event count drifted.")
    if not events or events[-1].get("type") != "agent_end":
        raise ValueError("Native Pi trace does not terminate with agent_end.")
    assistants = [
        event.get("message")
        for event in events
        if event.get("type") == "message_end"
        and isinstance(event.get("message"), dict)
        and event["message"].get("role") == "assistant"
    ]
    if not assistants:
        raise ValueError("Native Pi trace has no completed assistant message.")
    terminal = require_mapping(assistants[-1], "terminal assistant message")
    if terminal.get("stopReason") != "stop" or terminal.get("errorMessage"):
        raise ValueError("Native Pi trace did not terminate with a successful stop.")
    terminal_text = message_text(terminal)
    if not isinstance(terminal_text, str) or not terminal_text.strip():
        raise ValueError("Native Pi trace terminal answer is empty.")
    terminal_text = terminal_text.strip()
    if digest_bytes(terminal_text.encode("utf-8")) != expected["terminalOutputSha256"]:
        raise ValueError("Native Pi terminal output drifted.")

    input_tokens = 0
    cache_tokens = 0
    output_tokens = 0
    for message in assistants:
        usage = require_mapping(message.get("usage"), "assistant usage")
        raw_input = require_integer(usage.get("input"), "assistant input tokens")
        raw_cache = require_integer(usage.get("cacheRead"), "assistant cache tokens")
        raw_output = require_integer(usage.get("output"), "assistant output tokens")
        input_tokens += raw_input + raw_cache
        cache_tokens += raw_cache
        output_tokens += raw_output
    reconstructed = {
        "input": input_tokens,
        "cache": cache_tokens,
        "output": output_tokens,
    }
    configured_tokens = {
        key: require_integer(expected["tokens"].get(key), f"contract trace token {key}")
        for key in ("input", "cache", "output")
    }
    observed_tokens = {
        "input": require_integer(agent_result.get("n_input_tokens"), "agent_result input tokens"),
        "cache": require_integer(agent_result.get("n_cache_tokens"), "agent_result cache tokens"),
        "output": require_integer(agent_result.get("n_output_tokens"), "agent_result output tokens"),
    }
    if reconstructed != configured_tokens or reconstructed != observed_tokens:
        raise ValueError("Pi trace token reconstruction differs from agent_result or contract.")
    return {
        "path": expected["path"],
        "sha256": expected["sha256"],
        "size": len(raw),
        "parsedEvents": len(events),
        "terminal": "stop+agent_end",
        "terminalOutputSha256": expected["terminalOutputSha256"],
        "tokens": reconstructed,
    }


def validate_eio_failure(
    root_result: Mapping[str, Any],
    trial_result: Mapping[str, Any],
    trial_directory: Path,
    exception_text: str,
) -> None:
    stats = require_mapping(root_result.get("stats"), "native retry JobStats")
    exact_counters = {
        "n_completed_trials": 1,
        "n_errored_trials": 1,
        "n_running_trials": 0,
        "n_pending_trials": 0,
        "n_cancelled_trials": 0,
        "n_retries": 0,
    }
    if root_result.get("finished_at") is not None or root_result.get("n_total_trials") != 1:
        raise ValueError("Native retry root lifecycle does not match post-agent EIO.")
    for key, expected in exact_counters.items():
        if stats.get(key) != expected:
            raise ValueError(f"Native retry root counter {key} drifted.")
    agent_execution = require_mapping(trial_result.get("agent_execution"), "agent execution")
    if not agent_execution.get("started_at") or not agent_execution.get("finished_at"):
        raise ValueError("Post-agent recovery requires a completed agent execution interval.")
    trial_started = parse_timestamp(trial_result.get("started_at"), "trial started_at")
    agent_started = parse_timestamp(agent_execution.get("started_at"), "agent started_at")
    agent_finished = parse_timestamp(agent_execution.get("finished_at"), "agent finished_at")
    trial_finished = parse_timestamp(trial_result.get("finished_at"), "trial finished_at")
    if not trial_started <= agent_started <= agent_finished <= trial_finished:
        raise ValueError("Native trial and agent execution timestamps are not monotonic.")
    agent_result = require_mapping(trial_result.get("agent_result"), "agent result")
    if any(agent_result.get(key) is None for key in ("n_input_tokens", "n_cache_tokens", "n_output_tokens")):
        raise ValueError("Post-agent recovery requires complete token accounting.")
    for field in ("verifier", "verifier_result", "step_results"):
        if trial_result.get(field) is not None:
            raise ValueError(f"Post-agent recovery requires trial.{field}=null.")
    exception = require_mapping(trial_result.get("exception_info"), "trial exception_info")
    if exception.get("exception_type") != "OSError":
        raise ValueError("Post-agent recovery requires exact OSError evidence.")
    expected_path = (trial_directory / "artifacts" / "logs" / "artifacts").as_posix()
    message = require_string(exception.get("exception_message"), "OSError message")
    if not message.startswith("[Errno 5] Input/output error:") or expected_path not in message:
        raise ValueError("OSError message does not bind the exact artifact-collection path.")
    traceback = exception.get("exception_traceback")
    if not isinstance(traceback, str) or not traceback.strip():
        raise ValueError("OSError traceback must be a non-empty string.")
    if exception_text != traceback:
        raise ValueError("Native exception.txt differs from TrialResult exception_traceback.")
    if any(marker not in traceback for marker in EIO_REQUIRED_TRACE_MARKERS):
        raise ValueError("OSError traceback lacks a required Harbor artifact-collection frame.")
    if any(marker.casefold() in traceback.casefold() for marker in EIO_FORBIDDEN_TRACE_MARKERS):
        raise ValueError("OSError traceback crosses a forbidden agent/provider/verifier phase.")
    if not expected_path.endswith(EIO_PATH_SUFFIX):
        raise ValueError("Internal artifact EIO path invariant failed.")
    tokens = {
        "n_input_tokens": agent_result["n_input_tokens"],
        "n_cache_tokens": agent_result["n_cache_tokens"],
        "n_output_tokens": agent_result["n_output_tokens"],
    }
    for key, value in tokens.items():
        if stats.get(key) != value:
            raise ValueError(f"Root {key} differs from completed agent_result.")


def validate_task_contract(
    tests_directory: Path,
    task_directory: Path,
    contract: dict[str, Any],
    trial_result: Mapping[str, Any],
    trial_lock: Mapping[str, Any],
) -> dict[str, Any]:
    manifest = verify_declared_manifest(
        tests_directory,
        contract["task"]["taskTestsArtifactManifest"],
        contract["task"]["taskTestsArtifactDigest"],
        "task tests artifact manifest",
    )
    verify_flat_executable_tree(
        tests_directory,
        manifest,
        "task tests tree",
        executable=("test.sh",),
    )
    if tree_content_sha256(task_directory) != contract["task"]["treeSha256"]:
        raise ValueError("q003 task tree digest drifted from the frozen preparation task.")
    if trial_result.get("task_checksum") != contract["task"]["checksum"]:
        raise ValueError("Native retry task checksum differs from recovery contract.")
    locked_task = require_mapping(trial_lock.get("task"), "native trial lock task")
    locked_digest = "sha256:" + require_string(locked_task.get("digest"), "locked task digest").removeprefix("sha256:")
    if locked_digest != contract["task"]["packagerDigest"]:
        raise ValueError("Native retry Packager digest differs from recovery contract.")
    task_toml = task_directory / "task.toml"
    required_regular_file(task_toml, "task.toml")
    task_definition = tomllib.loads(task_toml.read_text(encoding="utf-8"))
    reject_unknown(
        task_definition,
        {"schema_version", "artifacts", "task", "metadata", "agent", "verifier", "environment"},
        "task.toml",
    )
    artifacts = task_definition.get("artifacts")
    expected_artifacts = [{"source": "/logs/agent/pi.txt", "destination": "pi.jsonl"}]
    if artifacts != expected_artifacts:
        raise ValueError("Verifier-only recovery requires the sole Pi trace artifact mapping.")
    environment = require_mapping(task_definition.get("environment"), "task.toml environment")
    if environment.get("docker_image") != contract["verifier"]["image"]:
        raise ValueError("task.toml environment image differs from the sealed verifier image.")
    verifier_definition = require_mapping(task_definition.get("verifier"), "task.toml verifier")
    verifier_environment = require_mapping(
        verifier_definition.get("environment"), "task.toml verifier environment"
    )
    if verifier_definition.get("timeout_sec") != 180.0:
        raise ValueError("Verifier-only recovery requires the sealed 180-second timeout.")
    if verifier_environment.get("memory_mb") != 4096:
        raise ValueError("Verifier-only recovery requires the sealed 4096 MiB memory limit.")
    dockerfile = (tests_directory / "Dockerfile").read_text(encoding="utf-8").splitlines()
    expected_dockerfile = [
        f"FROM {contract['verifier']['image']}",
        "COPY . /tests",
        "RUN chmod 0555 /tests/test.sh /tests/score.py",
        "WORKDIR /tests",
    ]
    if dockerfile != expected_dockerfile:
        raise ValueError("Task verifier Dockerfile differs from the no-build recovery contract.")
    return {
        "checksum": contract["task"]["checksum"],
        "treeSha256": contract["task"]["treeSha256"],
        "packagerDigest": contract["task"]["packagerDigest"],
        "taskTestsArtifactDigest": contract["task"]["taskTestsArtifactDigest"],
        "taskTestsArtifactManifest": manifest,
    }


def docker_image_id(image: str) -> str:
    result = subprocess.run(
        ["docker", "image", "inspect", "--format", "{{.Id}}", image],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise ValueError(f"Required local verifier image is unavailable: {image}")
    return require_digest(result.stdout.strip(), "local verifier image ID")


def remove_recovery_container(identifier: str) -> None:
    result = subprocess.run(
        ["docker", "rm", "--force", identifier],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode == 0:
        return
    inspection = subprocess.run(
        [
            "docker",
            "container",
            "ls",
            "--all",
            "--filter",
            f"id={identifier}",
            "--format",
            "{{.ID}}",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if inspection.returncode != 0:
        raise RuntimeError("Cannot verify owned verifier container cleanup.")
    if not inspection.stdout.strip():
        return
    raise RuntimeError(
        f"Owned verifier recovery container cleanup failed for {identifier}: "
        + result.stderr[:1000]
    )


def remove_recovery_container_if_owned(
    contract: Mapping[str, Any], name: str, owner_token: str
) -> None:
    if not recovery_container_exists(name):
        return
    inspection = subprocess.run(
        [
            "docker",
            "container",
            "inspect",
            "--format",
            "{{.Id}}\t{{.Name}}\t{{.Image}}\t{{index .Config.Labels \"skill-arena.recovery-owner\"}}",
            name,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if inspection.returncode != 0:
        if not recovery_container_exists(name):
            return
        raise RuntimeError("Cannot inspect a possibly owned verifier recovery container.")
    fields = inspection.stdout.strip().split("\t")
    expected = [f"/{name}", contract["verifier"]["imageId"], owner_token]
    if len(fields) != 4 or fields[1:] != expected or not re.fullmatch(r"[0-9a-f]{64}", fields[0]):
        raise ValueError(f"Container name is occupied by unproven recovery ownership: {name}")
    remove_recovery_container(fields[0])


def recovery_container_exists(name: str) -> bool:
    result = subprocess.run(
        [
            "docker",
            "container",
            "ls",
            "--all",
            "--filter",
            f"name=^/{name}$",
            "--format",
            "{{.ID}}\t{{.Names}}",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Cannot determine verifier recovery container state: " + result.stderr[:1000]
        )
    rows = [line.split("\t") for line in result.stdout.splitlines() if line.strip()]
    if any(len(row) != 2 or row[1] != name for row in rows) or len(rows) > 1:
        raise RuntimeError("Docker returned an ambiguous verifier container name match.")
    return len(rows) == 1


def run_bounded_process(
    command: Sequence[str],
    *,
    timeout: float,
    stdout_limit: int,
    stderr_limit: int,
) -> tuple[int, bytes, bytes]:
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.stdout is None or process.stderr is None:
        process.kill()
        process.wait()
        raise RuntimeError("Cannot capture verifier process output.")
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, ("stdout", stdout_limit))
    selector.register(process.stderr, selectors.EVENT_READ, ("stderr", stderr_limit))
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    deadline = time.monotonic() + timeout
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            events = selector.select(min(remaining, 1.0))
            for key, _mask in events:
                stream_name, limit = key.data
                chunk = os.read(key.fileobj.fileno(), 64 * 1024)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                buffers[stream_name].extend(chunk)
                if len(buffers[stream_name]) > limit:
                    raise RuntimeError(
                        f"Verifier-only {stream_name} exceeds the {limit}-byte safety limit."
                    )
        remaining = max(0.0, deadline - time.monotonic())
        returncode = process.wait(timeout=remaining)
    except BaseException:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise
    finally:
        selector.close()
        process.stdout.close()
        process.stderr.close()
    return returncode, bytes(buffers["stdout"]), bytes(buffers["stderr"])


def run_verifier_container(
    contract: dict[str, Any],
    tests_directory: Path,
    pi_trace: Path,
    output_directory: Path,
    container_name: str,
    started_at: str,
) -> dict[str, Any]:
    output_directory.mkdir(parents=True)
    validate_tree(output_directory, "empty verifier output directory")
    owner_token = digest_value(
        {
            "caseId": contract["caseId"],
            "sourceTrialKey": contract["sourceTrialKey"],
            "containerName": container_name,
            "imageId": contract["verifier"]["imageId"],
        }
    )
    command = [
        "docker",
        "create",
        "--pull",
        "never",
        "--name",
        container_name,
        "--label",
        "skill-arena.verifier-only-recovery=true",
        "--label",
        f"skill-arena.recovery-owner={owner_token}",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        "--memory",
        "4096m",
        "--mount",
        f"type=bind,src={tests_directory},dst=/tests,readonly",
        "--mount",
        f"type=bind,src={pi_trace},dst=/logs/agent/pi.txt,readonly",
        "--mount",
        "type=tmpfs,dst=/logs/verifier,tmpfs-size=4194304,tmpfs-mode=0700",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=67108864",
        "--entrypoint",
        "python",
        contract["verifier"]["imageId"],
        "-c",
        "import time; time.sleep(600)",
    ]
    container_created = False
    container_id = container_name
    try:
        create_code, create_stdout, create_stderr = run_bounded_process(
            command,
            timeout=30,
            stdout_limit=4096,
            stderr_limit=1024 * 1024,
        )
        if create_code == 0:
            container_created = True
        if create_code != 0 or create_stderr:
            raise RuntimeError(
                f"Verifier-only container creation failed with exit {create_code}: "
                + create_stderr.decode("utf-8", errors="replace")[:1000]
            )
        if not re.fullmatch(rb"[0-9a-f]{64}\s*", create_stdout):
            raise ValueError("Verifier-only container creation returned an invalid container ID.")
        container_id = create_stdout.decode("ascii").strip()
        start_code, start_stdout, start_stderr = run_bounded_process(
            ["docker", "start", container_id],
            timeout=30,
            stdout_limit=4096,
            stderr_limit=1024 * 1024,
        )
        if start_code != 0 or start_stderr or not start_stdout.strip():
            raise RuntimeError(
                f"Verifier-only container start failed with exit {start_code}: "
                + start_stderr.decode("utf-8", errors="replace")[:1000]
            )
        returncode, stdout, stderr = run_bounded_process(
            ["docker", "exec", container_id, *contract["verifier"]["command"]],
            timeout=180,
            stdout_limit=4 * 1024 * 1024,
            stderr_limit=1024 * 1024,
        )
        if returncode != 0:
            raise RuntimeError(
                f"Verifier-only command failed with exit {returncode}: "
                + stderr.decode("utf-8", errors="replace")[:1000]
            )
        if stderr:
            raise ValueError("Verifier-only command emitted unexpected stderr.")
        topology_script = (
            "import json,os,stat;root='/logs/verifier';rows=[];"
            "[(rows.append({'name':e.name,'type':'file' if stat.S_ISREG(e.stat(follow_symlinks=False).st_mode) else 'other'})) "
            "for e in os.scandir(root)];print(json.dumps(sorted(rows,key=lambda r:r['name']),separators=(',',':')))"
        )
        topology_code, topology_stdout, topology_stderr = run_bounded_process(
            ["docker", "exec", container_id, "python", "-c", topology_script],
            timeout=30,
            stdout_limit=64 * 1024,
            stderr_limit=64 * 1024,
        )
        if topology_code != 0 or topology_stderr:
            raise RuntimeError(
                "Cannot inspect bounded verifier output topology: "
                + topology_stderr.decode("utf-8", errors="replace")[:1000]
            )
        try:
            topology = json.loads(topology_stdout.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise ValueError("Verifier output topology receipt is invalid JSON.") from error
        expected_topology = [
            {"name": "diagnostics.json", "type": "file"},
            {"name": "reward.json", "type": "file"},
        ]
        if topology != expected_topology:
            raise ValueError("Verifier-only command created unexpected tmpfs output nodes.")
        extracted: dict[str, bytes] = {}
        for name in ("reward.json", "diagnostics.json"):
            code, payload, extraction_stderr = run_bounded_process(
                ["docker", "exec", container_id, "cat", f"/logs/verifier/{name}"],
                timeout=30,
                stdout_limit=1024 * 1024,
                stderr_limit=64 * 1024,
            )
            if code != 0 or extraction_stderr:
                raise RuntimeError(
                    f"Cannot extract bounded verifier {name}: "
                    + extraction_stderr.decode("utf-8", errors="replace")[:1000]
                )
            extracted[name] = payload
    finally:
        if container_created:
            remove_recovery_container(container_id)
        else:
            remove_recovery_container_if_owned(contract, container_name, owner_token)

    for name, payload in extracted.items():
        path = output_directory / name
        with path.open("xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
    validate_tree(output_directory, "verifier output directory")
    observed_nodes = sorted(
        path.relative_to(output_directory).as_posix()
        for path in output_directory.rglob("*")
    )
    if observed_nodes != ["diagnostics.json", "reward.json"]:
        raise ValueError(
            "Verifier-only container created unexpected output nodes: "
            + ", ".join(observed_nodes)
        )
    stdout_path = output_directory / "test-stdout.txt"
    with stdout_path.open("xb") as stream:
        stream.write(stdout)
        stream.flush()
        os.fsync(stream.fileno())
    reward_path = required_regular_file(output_directory / "reward.json", "verifier reward")
    diagnostics_path = required_regular_file(
        output_directory / "diagnostics.json", "verifier diagnostics"
    )
    for path, label in (
        (reward_path, "verifier reward"),
        (diagnostics_path, "verifier diagnostics"),
    ):
        if path.stat().st_size > 1024 * 1024:
            raise ValueError(f"{label} exceeds the 1 MiB safety limit.")
    reward = read_json(reward_path, "verifier reward")
    diagnostics = read_json(diagnostics_path, "verifier diagnostics")
    validate_verifier_payload(reward, diagnostics, "verifier-only command")
    if sorted(path.name for path in output_directory.iterdir()) != [
        "diagnostics.json",
        "reward.json",
        "test-stdout.txt",
    ]:
        raise ValueError("Verifier-only output directory changed during validation.")
    validate_tree(output_directory, "sealed verifier output directory")
    fsync_tree(output_directory, "sealed verifier output directory")
    finished = utc_now()
    return {
        "startedAt": started_at,
        "finishedAt": finished,
        "reward": reward,
        "diagnostics": diagnostics,
        "rewardSha256": digest_file(reward_path),
        "diagnosticsSha256": digest_file(diagnostics_path),
        "stdoutSha256": digest_file(stdout_path),
        "exitCode": returncode,
    }


def copy_tree(source: Path, destination: Path, label: str) -> None:
    validate_tree(source, label)
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"Refusing to overwrite {label}: {destination}")
    shutil.copytree(source, destination, symlinks=False)
    validate_tree(destination, f"copied {label}")
    if canonical_json(file_manifest(source)) != canonical_json(file_manifest(destination)):
        raise ValueError(f"Copied {label} differs bytewise from its source.")


def manifest_sha(manifest: Sequence[Mapping[str, Any]], relative: str, label: str) -> str:
    matches = [row for row in manifest if row.get("path") == relative]
    if len(matches) != 1:
        raise ValueError(f"{label} does not contain exactly one {relative} row.")
    return require_digest(matches[0].get("sha256"), f"{label} {relative} sha256")


def copy_sealed_file(source: Path, destination: Path, expected_sha256: str, label: str) -> None:
    required_regular_file(source, label)
    payload = source.read_bytes()
    if digest_bytes(payload) != expected_sha256:
        raise ValueError(f"{label} source bytes drifted during sealed copy.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    if digest_file(destination) != expected_sha256:
        raise ValueError(f"{label} destination bytes drifted during sealed copy.")


def build_recovered_job(
    engine: Any,
    state: dict[str, Any],
    destination: Path,
    published_destination: Path,
    run: dict[str, Any],
    run_directory: Path,
    agent_snapshot: Path,
) -> dict[str, Any]:
    native_job = state["nativeJobDirectory"]
    native_trial = state["nativeTrialDirectory"]
    native_manifest = state["nativeRetryJobArtifactManifest"]
    trial_prefix = state["nativeTrialName"]
    destination.mkdir(parents=True)
    for name in ("config.json", "lock.json"):
        copy_sealed_file(
            native_job / name,
            destination / name,
            manifest_sha(native_manifest, name, "native retry manifest"),
            f"native retry {name}",
        )
    trial_destination = destination / state["nativeTrialName"]
    trial_destination.mkdir()
    for name in ("config.json", "lock.json"):
        relative = f"{trial_prefix}/{name}"
        copy_sealed_file(
            native_trial / name,
            trial_destination / name,
            manifest_sha(native_manifest, relative, "native retry manifest"),
            f"native retry trial {name}",
        )
    copy_tree(agent_snapshot, trial_destination / "agent", "sealed agent snapshot tree")
    artifacts = trial_destination / "artifacts"
    artifacts.mkdir()
    copy_sealed_file(
        agent_snapshot / "pi.txt",
        artifacts / "pi.jsonl",
        state["agentTrace"]["sha256"],
        "sealed agent Pi trace",
    )
    (artifacts / "logs" / "artifacts").mkdir(parents=True)
    atomic_json(
        artifacts / "manifest.json",
        [
            {
                "source": "/logs/artifacts",
                "destination": "artifacts/logs/artifacts",
                "type": "directory",
                "status": "empty",
                "service": None,
            },
            {
                "source": "/logs/agent/pi.txt",
                "destination": "artifacts/pi.jsonl",
                "type": "file",
                "status": "ok",
                "service": None,
            },
        ],
    )
    verifier_directory = trial_destination / "verifier"
    verifier_directory.mkdir()
    for name, digest_field in (
        ("reward.json", "rewardSha256"),
        ("diagnostics.json", "diagnosticsSha256"),
        ("test-stdout.txt", "stdoutSha256"),
    ):
        copy_sealed_file(
            run_directory / name,
            verifier_directory / name,
            run[digest_field],
            f"sealed verifier {name}",
        )

    trial_result = deepcopy(state["nativeTrialResult"])
    trial_result["trial_uri"] = (published_destination / state["nativeTrialName"]).as_uri()
    trial_result["verifier"] = {
        "started_at": run["startedAt"],
        "finished_at": run["finishedAt"],
    }
    trial_result["verifier_result"] = {"rewards": deepcopy(run["reward"])}
    trial_result["exception_info"] = None
    trial_result["finished_at"] = run["finishedAt"]
    TrialConfig.model_validate(read_json(trial_destination / "config.json", "recovered TrialConfig"))
    recovered_trial = TrialResult.model_validate(trial_result)
    atomic_json(trial_destination / "result.json", model_json(recovered_trial))

    root_result = deepcopy(state["nativeJobResult"])
    root_result["n_total_trials"] = 1
    root_result["stats"] = model_json(
        JobStats.from_trial_results(
            [recovered_trial], n_total_trials=1, n_running_trials=0, n_retries=0
        )
    )
    root_result["updated_at"] = run["finishedAt"]
    root_result["finished_at"] = run["finishedAt"]
    JobConfig.model_validate(read_json(destination / "config.json", "recovered JobConfig"))
    JobLock.model_validate(read_json(destination / "lock.json", "recovered JobLock"))
    recovered_root = JobResult.model_validate(root_result)
    atomic_json(destination / "result.json", model_json(recovered_root))

    recovered_job = engine.load_harbor_job(destination, state["rewardKey"])
    if len(recovered_job["trials"]) != 1:
        raise ValueError("Recovered job must contain exactly one trial.")
    recovered_trial_record = recovered_job["trials"][0]
    engine.same_retry_profile(state["sourceTrial"], recovered_trial_record)
    imported = engine.import_retry_job(
        state["sourceTrial"], destination, state["attemptNumber"], state["rewardKey"]
    )
    if not imported.get("evaluable") or imported.get("classification") != "semantic":
        raise ValueError("Recovered verifier result is not a semantic evaluable result.")
    return {"job": recovered_job, "trial": recovered_trial_record, "attempt": imported}


def enrich_effective_manifest(
    manifest_path: Path,
    state: dict[str, Any],
    recovery_record_digest: str,
    recovered_job_digest: str,
) -> dict[str, Any]:
    manifest = read_json(manifest_path, "effective resume manifest")
    manifest["schemaVersion"] = 2
    manifest["completionMode"] = COMPLETION_MODE
    manifest["recoveryContract"] = RECOVERY_CONTRACT
    manifest["recoveryRecordDigest"] = recovery_record_digest
    manifest["recovery"] = {
        "completionMode": COMPLETION_MODE,
        "recoveryContract": RECOVERY_CONTRACT,
        "recoveryRecordDigest": recovery_record_digest,
        "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
        "recoveredJobArtifactDigest": recovered_job_digest,
    }
    lineage = require_list(manifest.get("lineage"), "effective lineage")
    if len(lineage) != 1:
        raise ValueError("Verifier-only effective manifest requires one lineage row.")
    selected = require_mapping(
        require_mapping(lineage[0], "effective lineage row").get("selected"),
        "effective selected lineage",
    )
    selected["completionMode"] = COMPLETION_MODE
    selected["nativeRetryJobArtifactDigest"] = state["nativeRetryJobArtifactDigest"]
    selected["recoveredJobArtifactDigest"] = recovered_job_digest
    selected["recoveryRecordDigest"] = recovery_record_digest
    atomic_json(manifest_path, manifest)
    return manifest


@contextmanager
def writer_lock(path: Path, contract: dict[str, Any]) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not hasattr(os, "O_NOFOLLOW"):
        raise RuntimeError("Verifier recovery writer locking requires POSIX O_NOFOLLOW support.")
    import fcntl

    try:
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    except OSError as error:
        raise ValueError(f"Cannot open verifier recovery writer lock safely: {path}") from error
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1:
            raise ValueError("Verifier recovery writer lock is not an ordinary single-link file.")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f"Verifier recovery writer is already active: {path}") from error
        payload = {
            "schemaVersion": 1,
            "caseId": contract["caseId"],
            "recoveryContract": RECOVERY_CONTRACT,
            "pid": os.getpid(),
            "createdAt": utc_now(),
        }
        os.ftruncate(descriptor, 0)
        os.lseek(descriptor, 0, os.SEEK_SET)
        os.write(descriptor, (json.dumps(payload, sort_keys=True) + "\n").encode("utf-8"))
        os.fsync(descriptor)
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            os.close(descriptor)
        except OSError:
            pass


def effective_build_paths(effective: Path) -> tuple[Path, Path]:
    build = effective.with_name(f".{effective.name}.verifier-recovery-build")
    owner = effective.with_name(f".{effective.name}.verifier-recovery-build-owner.json")
    return build, owner


def verify_effective_namespace(
    effective: Path,
    required_source_children: set[str],
    *,
    optional_source_children: set[str] | None = None,
) -> None:
    source_root = validate_tree(effective.parent, "effective source-key namespace")
    effective_jobs_root = validate_tree(source_root.parent, "effective-jobs namespace")
    require_direct_children(
        effective_jobs_root,
        {source_root.name},
        "effective-jobs namespace",
    )
    require_direct_children(
        source_root,
        required_source_children,
        "effective source-key namespace",
        optional=optional_source_children,
    )


def effective_build_owner_body(
    contract: Mapping[str, Any], recovery_lock: Mapping[str, Any], build: Path, effective: Path
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "kind": "harbor-verifier-recovery-effective-build-owner",
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "recoveryRecordDigest": recovery_lock["recoveryRecordDigest"],
        "buildDirectory": str(build),
        "effectiveJobDirectory": str(effective),
    }


def verify_effective_build_owner(
    contract: Mapping[str, Any], recovery_lock: Mapping[str, Any], build: Path, effective: Path, owner: Path
) -> None:
    record = read_json(owner, "effective build owner")
    reject_unknown(
        record,
        {
            "schemaVersion",
            "kind",
            "caseId",
            "recoveryContract",
            "sourceTrialKey",
            "recoveryRecordDigest",
            "buildDirectory",
            "effectiveJobDirectory",
            "ownerRecordDigest",
        },
        "effective build owner",
    )
    digest = require_digest(record.get("ownerRecordDigest"), "effective build owner digest")
    body = deepcopy(record)
    body.pop("ownerRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Effective build owner self-digest does not verify.")
    if canonical_json(body) != canonical_json(
        effective_build_owner_body(contract, recovery_lock, build, effective)
    ):
        raise ValueError("Effective build owner binding drifted.")


def reconcile_effective_build(
    contract: Mapping[str, Any],
    recovery_lock: Mapping[str, Any],
    effective: Path,
    *,
    destination_verified: bool,
) -> tuple[Path, Path]:
    build, owner = effective_build_paths(effective)
    build_exists = build.exists() or build.is_symlink()
    owner_exists = owner.exists() or owner.is_symlink()
    if build_exists and not owner_exists:
        raise ValueError("Unreceipted verifier-recovery effective build exists.")
    if not owner_exists:
        return build, owner
    required_regular_file(owner, "effective build owner")
    verify_effective_build_owner(contract, recovery_lock, build, effective, owner)
    if build_exists:
        if effective.exists() or effective.is_symlink():
            raise ValueError("Effective destination and owned build coexist ambiguously.")
        validate_tree(build, "owned verifier-recovery effective build")
        shutil.rmtree(build)
    elif effective.exists() or effective.is_symlink():
        if not destination_verified:
            raise ValueError("Effective destination must verify before owner reconciliation.")
    owner.unlink()
    fsync_directory(effective.parent)
    return build, owner


def prepare_state(contract: dict[str, Any], *, check_docker: bool) -> dict[str, Any]:
    script = validate_ancestor_chain(Path(os.path.abspath(__file__)), "recovery builder")
    bundle = script.parent.parent
    case_root = contract["path"].parent
    generation_root = case_root.parent
    expected_sealed_paths = {
        script,
        script.with_name(f"{script.name}.lock"),
        script.with_name("resume_external_failures.py"),
        bundle / "references" / "verifier-only-recovery.md",
        case_root / "run-generation-003-verifier-recovery.sh",
        generation_root / "scripts" / "evidence-resolution-post-agent.js",
        generation_root / "scripts" / "prepare-generation-003-post-agent.js",
        generation_root / "scripts" / "publish-generation-003-post-agent.js",
    }
    observed_sealed_paths = {item["path"] for item in contract["sealedFiles"]}
    if observed_sealed_paths != expected_sealed_paths:
        raise ValueError("contract.sealedFiles differs from the exact recovery executable set.")
    for item in contract["sealedFiles"]:
        required_regular_file(item["path"], "sealed executable input")
        if digest_file(item["path"]) != item["sha256"]:
            raise ValueError(f"Sealed executable input drifted: {item['path']}")
    engine = load_engine()
    config = engine.load_config(contract["resumeConfig"])
    if config["rewardKey"] != "reward":
        raise ValueError("Verifier-only recovery currently requires rewardKey=reward.")
    if config["maxRetries"] != 1:
        raise ValueError("Verifier-only recovery requires the frozen one-attempt retry cap.")
    jobs, source_trials, resume_lock, policy_digest, contract_digest = engine.prepare_context(config)
    if len(jobs) != 1 or len(source_trials) != 1:
        raise ValueError("Verifier-only recovery requires exactly one source job and trial.")
    source_trial = source_trials[0]
    source_job_manifest = file_manifest(jobs[0]["directory"])
    if digest_value(source_job_manifest) != jobs[0]["artifactDigest"]:
        raise ValueError("Original source job artifact digest drifted during recovery preparation.")
    source_trial_name = source_trial["trialDirectory"].name
    verify_manifest_topology(
        jobs[0]["directory"],
        source_job_manifest,
        "original source job topology",
        allowed_empty_directories=(
            f"{source_trial_name}/agent/setup",
            f"{source_trial_name}/artifacts/logs/artifacts",
            f"{source_trial_name}/verifier",
        ),
    )
    source_job_directories = directory_manifest(jobs[0]["directory"])
    if source_trial["sourceTrialKey"] != contract["sourceTrialKey"]:
        raise ValueError("Recovery sourceTrialKey differs from frozen resume lineage.")
    resume_lock_path = config["outputDirectory"] / "resume-lock.json"
    if digest_file(resume_lock_path) != contract["native"]["resumeLockSha256"]:
        raise ValueError("Native resume-lock.json drifted.")
    attempts = require_list(resume_lock.get("attempts"), "native resume attempts")
    if len(attempts) != 1:
        raise ValueError("Verifier-only recovery requires exactly one cap-consuming attempt.")
    attempt = require_mapping(attempts[0], "native attempt 1")
    engine.validate_attempt_seal(attempt)
    exact_attempt = {
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": contract["attempt"],
        "mode": "live",
        "status": "failed-execution",
        "evaluable": False,
        "reward": None,
    }
    for key, expected in exact_attempt.items():
        if attempt.get(key) != expected:
            raise ValueError(f"Native attempt field {key} differs from recovery contract.")
    if attempt.get("attemptRecordDigest") != contract["native"]["sourceAttemptRecordDigest"]:
        raise ValueError("Native attempt seal differs from recovery contract.")
    if attempt.get("failureType") != "ExceptionGroup" or attempt.get("failureDomain") is not None:
        raise ValueError("Native attempt wrapper failure metadata drifted.")
    lifecycle = require_list(attempt.get("lifecycle"), "native attempt lifecycle")
    if len(lifecycle) != 4:
        raise ValueError("Native attempt must contain exactly four lifecycle events.")
    phases = [require_mapping(item, "native lifecycle event").get("phase") for item in lifecycle]
    if phases[:3] != [
        "durable-before-files",
        "configured-before-harbor-call",
        "harbor-call-starting",
    ]:
        raise ValueError("Native attempt lacks the exact durable Harbor lifecycle.")
    if lifecycle[-1].get("status") != "failed-execution" or set(lifecycle[-1]) != {"status", "at"}:
        raise ValueError("Native attempt did not terminate as failed-execution.")
    native_job = Path(os.path.abspath(require_string(attempt.get("jobDirectory"), "native retry job")))
    if native_job != contract["native"]["retryJobDirectory"]:
        raise ValueError("Native retry job path differs from recovery contract.")
    native_manifest = verify_declared_manifest(
        native_job,
        contract["native"]["nativeRetryJobArtifactManifest"],
        contract["native"]["nativeRetryJobArtifactDigest"],
        "native retry job artifact manifest",
    )
    verify_manifest_topology(
        native_job,
        native_manifest,
        "native retry job topology",
        allowed_empty_directories=(
            f"{contract['native']['trialName']}/agent/setup",
            f"{contract['native']['trialName']}/artifacts/logs/artifacts",
            f"{contract['native']['trialName']}/verifier",
        ),
    )
    native_directories = directory_manifest(native_job)
    if native_directories != contract["native"]["nativeRetryJobDirectoryManifest"]:
        raise ValueError("Native retry directory manifest drifted from the recovery contract.")
    root_result = read_json(native_job / "result.json", "native retry JobResult")
    JobConfig.model_validate(read_json(native_job / "config.json", "native retry JobConfig"))
    JobLock.model_validate(read_json(native_job / "lock.json", "native retry JobLock"))
    JobResult.model_validate(root_result)
    trial_name = contract["native"]["trialName"]
    trial_directory = native_job / trial_name
    if not trial_directory.is_dir() or is_link_or_reparse(trial_directory):
        raise ValueError("Native retry trial directory is missing or linked.")
    trial_result_path = trial_directory / "result.json"
    if digest_file(trial_result_path) != contract["native"]["trialResultSha256"]:
        raise ValueError("Native retry TrialResult drifted.")
    exception_path = trial_directory / "exception.txt"
    if digest_file(exception_path) != contract["native"]["exceptionSha256"]:
        raise ValueError("Native retry exception artifact drifted.")
    exception_text = read_utf8(exception_path, "native retry exception artifact")
    trial_result = read_json(trial_result_path, "native retry TrialResult")
    TrialResult.model_validate(trial_result)
    if trial_result.get("id") != contract["native"]["trialId"]:
        raise ValueError("Native retry trial ID drifted.")
    if trial_result.get("trial_name") != trial_name:
        raise ValueError("Native retry trial name drifted.")
    trial_config = read_json(trial_directory / "config.json", "native retry TrialConfig")
    trial_lock = read_json(trial_directory / "lock.json", "native retry TrialLock")
    TrialConfig.model_validate(trial_config)
    validate_eio_failure(root_result, trial_result, trial_directory, exception_text)
    pi_trace = trial_directory / contract["agentTrace"]["path"]
    trace = validate_agent_trace(
        pi_trace,
        contract["agentTrace"],
        require_mapping(trial_result.get("agent_result"), "native agent_result"),
    )
    task_id = require_mapping(trial_result.get("task_id"), "native task_id")
    task_directory = validate_tree(
        Path(os.path.abspath(require_string(task_id.get("path"), "native task path"))),
        "native task directory",
    )
    if contract["task"]["testsDirectory"] != task_directory / "tests":
        raise ValueError("Recovery tests directory differs from the bound native task.")
    task = validate_task_contract(
        contract["task"]["testsDirectory"],
        task_directory,
        contract,
        trial_result,
        trial_lock,
    )
    if check_docker and docker_image_id(contract["verifier"]["image"]) != contract["verifier"]["imageId"]:
        raise ValueError("Local verifier image ID drifted.")
    expected_output = config["outputDirectory"] / "verifier-recovery" / "attempt-001"
    if contract["outputDirectory"] != expected_output:
        raise ValueError("Recovery output path differs from the fixed resume output.")
    expected_effective = (
        config["outputDirectory"]
        / "effective-jobs"
        / digest_value(
            {"directory": str(jobs[0]["directory"]), "artifactDigest": jobs[0]["artifactDigest"]}
        ).removeprefix("sha256:")
        / "effective-job"
    )
    if contract["effectiveJobDirectory"] != expected_effective:
        raise ValueError("Effective job path differs from its source-lineage key.")
    return {
        "engine": engine,
        "config": config,
        "jobs": jobs,
        "sourceJobArtifactManifest": source_job_manifest,
        "sourceJobDirectoryManifest": source_job_directories,
        "sourceTrial": source_trial,
        "resumeLock": resume_lock,
        "resumeLockPath": resume_lock_path,
        "policyDigest": policy_digest,
        "contractDigest": contract_digest,
        "attempt": attempt,
        "attemptNumber": contract["attempt"],
        "rewardKey": config["rewardKey"],
        "nativeJobDirectory": native_job,
        "nativeRetryJobArtifactManifest": native_manifest,
        "nativeRetryJobDirectoryManifest": native_directories,
        "nativeRetryJobArtifactDigest": contract["native"]["nativeRetryJobArtifactDigest"],
        "nativeJobResult": root_result,
        "nativeTrialDirectory": trial_directory,
        "nativeTrialName": trial_name,
        "nativeTrialResult": trial_result,
        "nativeTrialConfig": trial_config,
        "nativeTrialLock": trial_lock,
        "piTrace": pi_trace,
        "agentTrace": trace,
        "task": task,
        "taskDirectory": task_directory,
    }


def assert_native_immutable(contract: dict[str, Any], state: dict[str, Any], phase: str) -> None:
    if digest_file(state["resumeLockPath"]) != contract["native"]["resumeLockSha256"]:
        raise ValueError(f"Native resume lock drifted {phase}.")
    if digest_value(file_manifest(state["nativeJobDirectory"])) != state["nativeRetryJobArtifactDigest"]:
        raise ValueError(f"Native retry job drifted {phase}.")
    if directory_manifest(state["nativeJobDirectory"]) != state["nativeRetryJobDirectoryManifest"]:
        raise ValueError(f"Native retry job directory topology drifted {phase}.")
    source_manifest = file_manifest(state["jobs"][0]["directory"])
    if (
        canonical_json(source_manifest) != canonical_json(state["sourceJobArtifactManifest"])
        or digest_value(source_manifest) != state["jobs"][0]["artifactDigest"]
        or directory_manifest(state["jobs"][0]["directory"])
        != state["sourceJobDirectoryManifest"]
    ):
        raise ValueError(f"Original source job drifted {phase}.")
    tests_manifest = verify_declared_manifest(
        contract["task"]["testsDirectory"],
        contract["task"]["taskTestsArtifactManifest"],
        contract["task"]["taskTestsArtifactDigest"],
        f"task tests {phase}",
    )
    verify_flat_executable_tree(
        contract["task"]["testsDirectory"],
        tests_manifest,
        f"task tests {phase}",
        executable=("test.sh",),
    )
    if tree_content_sha256(state["taskDirectory"]) != state["task"]["treeSha256"]:
        raise ValueError(f"q003 task tree drifted {phase}.")


def assert_recovered_immutable(
    contract: dict[str, Any], state: dict[str, Any], recovery_lock: Mapping[str, Any], phase: str
) -> None:
    recovered = require_mapping(recovery_lock.get("recoveredJob"), "recovered job binding")
    root = contract["outputDirectory"] / "recovered-job"
    manifest = verify_declared_manifest(
        root,
        require_list(recovered.get("artifactManifest"), "recovered job artifact manifest"),
        require_digest(recovered.get("artifactDigest"), "recovered job artifact digest"),
        f"recovered job {phase}",
    )
    stored_directories = [
        safe_relative(item, f"recovered job directory {index}")
        for index, item in enumerate(
            require_list(recovered.get("directoryManifest"), "recovered job directory manifest")
        )
    ]
    if directory_manifest(root) != stored_directories:
        raise ValueError(f"Recovered job directory topology drifted {phase}.")
    verify_manifest_topology(
        root,
        manifest,
        f"recovered job topology {phase}",
        allowed_empty_directories=(
            f"{state['nativeTrialName']}/artifacts/logs/artifacts",
        ),
    )


def journal_path(contract: dict[str, Any]) -> Path:
    return contract["outputDirectory"].parent / "attempt-001-verifier-call-journal.json"


def writer_lock_path(contract: dict[str, Any]) -> Path:
    return contract["outputDirectory"].parent / ".verifier-recovery.writer.lock"


def recovery_work_path(contract: dict[str, Any]) -> Path:
    return contract["outputDirectory"].parent / ".attempt-001-verifier-work"


def expected_container_name(contract: dict[str, Any], run_number: int) -> str:
    source = contract["sourceTrialKey"].removeprefix("sha256:")[:12]
    return f"skill-arena-vr-{source}-a001-r{run_number:03d}"


def write_journal(path: Path, value: dict[str, Any], *, exclusive: bool = False) -> dict[str, Any]:
    sealed = seal_record(value, "journalRecordDigest")
    durable_json(path, sealed, exclusive=exclusive)
    return sealed


def initialize_journal(contract: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    path = journal_path(contract)
    work = recovery_work_path(contract)
    if path.exists() or path.is_symlink():
        journal = verify_journal(contract, state)
        if not (work.exists() or work.is_symlink()):
            if (
                journal.get("status") != "reserved"
                or journal.get("inputSnapshot") is not None
                or journal.get("runs")
            ):
                raise ValueError("Verifier journal exists without its required recovery work.")
            work.mkdir()
            fsync_directory(work.parent)
        validate_tree(work, "verifier recovery work")
        return journal
    if work.exists() or work.is_symlink():
        raise ValueError("Verifier recovery work exists without its durable call journal.")
    created = utc_now()
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": JOURNAL_KIND,
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": 1,
        "status": "reserved",
        "native": {
            "resumeLockSha256": contract["native"]["resumeLockSha256"],
            "nativeRetryJobArtifactDigest": contract["native"]["nativeRetryJobArtifactDigest"],
        },
        "inputSnapshot": None,
        "runs": [],
        "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 0},
        "lifecycle": [
            {"status": "reserved", "phase": "durable-before-verifier-runs", "at": created}
        ],
    }
    journal = write_journal(path, body, exclusive=True)
    work.mkdir()
    fsync_directory(work.parent)
    assert_native_immutable(contract, state, "after durable recovery reservation")
    return journal


def reconcile_safe_pre_call_leftovers(contract: dict[str, Any], state: dict[str, Any]) -> None:
    path = journal_path(contract)
    temporaries = sorted(path.parent.glob(f".{path.name}.tmp-*"))
    if temporaries:
        if not path.exists() or path.is_symlink():
            raise ValueError("Verifier journal temporary exists without a durable base receipt.")
        current = verify_journal(
            contract,
            state,
            allow_temporary_receipts=True,
        )
        safe_pre_call = current.get("status") in {"reserved", "running"} and all(
            run.get("status") == "completed" for run in current.get("runs", [])
        )
        if not safe_pre_call:
            raise ValueError("Verifier journal temporary follows an ambiguous call boundary.")
        for temporary in temporaries:
            required_regular_file(temporary, "safe pre-call journal temporary")
            temporary.unlink()
        fsync_directory(path.parent)

    if not path.exists() or path.is_symlink():
        return
    current = verify_journal(contract, state)
    work = recovery_work_path(contract)
    if (
        current.get("status") == "reserved"
        and current.get("inputSnapshot") is None
        and not current.get("runs")
        and work.is_dir()
        and not is_link_or_reparse(work)
    ):
        snapshot = work / "input-snapshot"
        if snapshot.exists() or snapshot.is_symlink():
            validate_tree(snapshot, "unreceipted pre-call input snapshot")
            shutil.rmtree(snapshot)
            fsync_directory(work)
        for temporary in sorted(work.glob(".input-snapshot.build-*")):
            path_inside(work, temporary, "pre-call input snapshot build")
            validate_tree(temporary, "pre-call input snapshot build")
            shutil.rmtree(temporary)
            fsync_directory(work)


def verify_journal(
    contract: dict[str, Any],
    state: dict[str, Any],
    *,
    require_completed: bool = False,
    allow_temporary_receipts: bool = False,
) -> dict[str, Any]:
    path = journal_path(contract)
    if list(path.parent.glob(f".{path.name}.tmp-*")) and not allow_temporary_receipts:
        raise ValueError("Ambiguous verifier call journal temporary receipt exists.")
    journal = read_json(path, "verifier call journal")
    reject_unknown(
        journal,
        {
            "schemaVersion",
            "kind",
            "caseId",
            "recoveryContract",
            "sourceTrialKey",
            "attempt",
            "status",
            "native",
            "inputSnapshot",
            "runs",
            "execution",
            "lifecycle",
            "journalRecordDigest",
        },
        "verifier call journal",
    )
    digest = require_digest(journal.get("journalRecordDigest"), "journal record digest")
    body = deepcopy(journal)
    body.pop("journalRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Verifier call journal self-digest does not verify.")
    exact = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": JOURNAL_KIND,
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": 1,
    }
    for key, expected in exact.items():
        if journal.get(key) != expected:
            raise ValueError(f"Verifier call journal field {key} drifted.")
    expected_native = {
        "resumeLockSha256": contract["native"]["resumeLockSha256"],
        "nativeRetryJobArtifactDigest": contract["native"]["nativeRetryJobArtifactDigest"],
    }
    if canonical_json(journal.get("native")) != canonical_json(expected_native):
        raise ValueError("Verifier call journal native binding drifted.")
    lifecycle = require_list(journal.get("lifecycle"), "verifier call journal lifecycle")
    if not lifecycle:
        raise ValueError("Verifier call journal lifecycle is empty.")
    lifecycle_times = []
    for index, raw_event in enumerate(lifecycle, 1):
        event = require_mapping(raw_event, f"verifier call journal lifecycle {index}")
        reject_unknown(event, {"status", "phase", "at"}, f"journal lifecycle {index}")
        lifecycle_times.append(parse_timestamp(event.get("at"), "journal lifecycle timestamp"))
    first = require_mapping(lifecycle[0], "first verifier call journal lifecycle")
    if (first.get("status"), first.get("phase")) != (
        "reserved",
        "durable-before-verifier-runs",
    ):
        raise ValueError("Verifier call journal lacks the durable pre-call reservation.")
    if lifecycle_times != sorted(lifecycle_times):
        raise ValueError("Verifier call journal lifecycle timestamps are not monotonic.")

    runs = require_list(journal.get("runs"), "verifier call journal runs")
    if len(runs) > 2:
        raise ValueError("Verifier call journal exceeds the two-run cap.")
    completed = 0
    for index, raw_run in enumerate(runs, 1):
        run = require_mapping(raw_run, f"verifier call journal run {index}")
        reject_unknown(
            run,
            {
                "run",
                "status",
                "containerName",
                "directory",
                "rewardPath",
                "rewardSha256",
                "diagnosticsPath",
                "diagnosticsSha256",
                "stdoutPath",
                "stdoutSha256",
                "exitCode",
                "startedAt",
                "finishedAt",
                "errorType",
            },
            f"verifier call journal run {index}",
        )
        if run.get("run") != index:
            raise ValueError("Verifier call journal runs are not contiguous and one-based.")
        if run.get("containerName") != expected_container_name(contract, index):
            raise ValueError("Verifier call journal container name drifted.")
        expected_directory = f"verifier-runs/run-{index:03d}"
        expected_paths = {
            "directory": expected_directory,
            "rewardPath": f"{expected_directory}/reward.json",
            "diagnosticsPath": f"{expected_directory}/diagnostics.json",
            "stdoutPath": f"{expected_directory}/test-stdout.txt",
        }
        if any(run.get(field) != value for field, value in expected_paths.items()):
            raise ValueError("Verifier call journal run path drifted.")
        parse_timestamp(run.get("startedAt"), f"journal run {index} startedAt")
        status = run.get("status")
        if status == "completed":
            if "errorType" in run or run.get("exitCode") != 0:
                raise ValueError("Completed verifier call journal run has invalid terminal fields.")
            for field in ("rewardSha256", "diagnosticsSha256", "stdoutSha256"):
                require_digest(run.get(field), f"completed journal run {index} {field}")
            if parse_timestamp(run.get("startedAt"), f"journal run {index} startedAt") > parse_timestamp(
                run.get("finishedAt"), f"journal run {index} finishedAt"
            ):
                raise ValueError("Verifier call journal run timestamps are not monotonic.")
            completed += 1
        elif status == "starting":
            if (
                "errorType" in run
                or run.get("finishedAt") is not None
                or run.get("exitCode") is not None
                or any(run.get(field) is not None for field in (
                    "rewardSha256", "diagnosticsSha256", "stdoutSha256"
                ))
            ):
                raise ValueError("Starting verifier call journal run has terminal fields.")
        elif status == "failed":
            parse_timestamp(run.get("finishedAt"), f"failed journal run {index} finishedAt")
            require_string(run.get("errorType"), f"failed journal run {index} errorType")
            if run.get("exitCode") is not None or any(run.get(field) is not None for field in (
                "rewardSha256", "diagnosticsSha256", "stdoutSha256"
            )):
                raise ValueError("Failed verifier call journal run has sealed-success fields.")
        else:
            raise ValueError("Verifier call journal run has an unsupported status.")
    execution = require_mapping(journal.get("execution"), "verifier call journal execution")
    # A durable starting record consumes one call slot conservatively. After a
    # crash we cannot prove whether Docker crossed the call boundary, so the
    # slot remains counted and automatic replay stays forbidden.
    expected_execution = {"harborCalls": 0, "modelCalls": 0, "verifierCalls": len(runs)}
    if canonical_json(execution) != canonical_json(expected_execution):
        raise ValueError("Verifier call journal execution accounting drifted.")
    expected_status = "completed" if completed == 2 else ("running" if runs else "reserved")
    if any(run.get("status") in {"starting", "failed"} for run in runs):
        expected_status = "blocked"
    if journal.get("status") != expected_status:
        raise ValueError("Verifier call journal status disagrees with its run ledger.")
    if require_completed and expected_status != "completed":
        raise ValueError("Verifier call journal is not complete; automatic replay is forbidden.")

    snapshot = journal.get("inputSnapshot")
    if snapshot is not None:
        snapshot = require_mapping(snapshot, "verifier call journal inputSnapshot")
        reject_unknown(
            snapshot,
            {
                "agentArtifactDigest",
                "agentArtifactManifest",
                "testsArtifactDigest",
                "testsArtifactManifest",
            },
            "verifier call journal inputSnapshot",
        )
        expected_agent_manifest = [
            {"path": "pi.txt", "sha256": contract["agentTrace"]["sha256"]}
        ]
        if canonical_json(snapshot.get("agentArtifactManifest")) != canonical_json(expected_agent_manifest):
            raise ValueError("Verifier call journal agent snapshot manifest drifted.")
        if snapshot.get("agentArtifactDigest") != digest_value(expected_agent_manifest):
            raise ValueError("Verifier call journal agent snapshot digest drifted.")
        if canonical_json(snapshot.get("testsArtifactManifest")) != canonical_json(state["task"]["taskTestsArtifactManifest"]):
            raise ValueError("Verifier call journal tests snapshot manifest drifted.")
        if snapshot.get("testsArtifactDigest") != state["task"]["taskTestsArtifactDigest"]:
            raise ValueError("Verifier call journal tests snapshot digest drifted.")
        artifact_root = (
            contract["outputDirectory"]
            if contract["outputDirectory"].is_dir()
            else recovery_work_path(contract)
        )
        verify_declared_manifest(
            artifact_root / "input-snapshot" / "agent",
            expected_agent_manifest,
            snapshot["agentArtifactDigest"],
            "staged agent input snapshot",
        )
        verify_flat_executable_tree(
            artifact_root / "input-snapshot" / "agent",
            expected_agent_manifest,
            "staged agent input snapshot",
        )
        verify_declared_manifest(
            artifact_root / "input-snapshot" / "tests",
            state["task"]["taskTestsArtifactManifest"],
            snapshot["testsArtifactDigest"],
            "staged tests input snapshot",
        )
        verify_flat_executable_tree(
            artifact_root / "input-snapshot" / "tests",
            state["task"]["taskTestsArtifactManifest"],
            "staged tests input snapshot",
            executable=("test.sh",),
        )
        if runs and all(run.get("status") == "completed" for run in runs):
            require_direct_children(
                artifact_root / "verifier-runs",
                {f"run-{index:03d}" for index in range(1, len(runs) + 1)},
                "journal verifier runs root",
            )
        for index, run in enumerate(runs, 1):
            if run.get("status") != "completed":
                continue
            directory = artifact_root / f"verifier-runs/run-{index:03d}"
            validate_tree(directory, f"journal verifier run {index}")
            require_direct_children(
                directory,
                {"reward.json", "diagnostics.json", "test-stdout.txt"},
                f"journal verifier run {index}",
            )
            for field, filename in (
                ("rewardSha256", "reward.json"),
                ("diagnosticsSha256", "diagnostics.json"),
                ("stdoutSha256", "test-stdout.txt"),
            ):
                if run.get(field) != digest_file(directory / filename):
                    raise ValueError(f"Verifier call journal run {index} {field} drifted.")
            load_completed_run(artifact_root, index, run)
    elif runs:
        raise ValueError("Verifier call journal has runs without a sealed input snapshot.")

    expected_lifecycle = [("reserved", "durable-before-verifier-runs")]
    if snapshot is not None:
        expected_lifecycle.append(("reserved", "input-snapshot-sealed"))
    for index, run in enumerate(runs, 1):
        expected_lifecycle.append(("running", f"run-{index:03d}-starting"))
        if run.get("status") == "completed":
            expected_lifecycle.append(
                (
                    "completed" if index == 2 else "running",
                    "verifier-runs-sealed" if index == 2 else f"run-{index:03d}-completed",
                )
            )
        elif run.get("status") == "failed":
            expected_lifecycle.append(("failed", f"run-{index:03d}-failed"))
    observed_lifecycle = [
        (event.get("status"), event.get("phase"))
        for event in lifecycle
    ]
    if observed_lifecycle != expected_lifecycle:
        raise ValueError("Verifier call journal lifecycle differs from its exact run ledger.")
    event_index = 2 if snapshot is not None else 1
    for index, run in enumerate(runs, 1):
        if lifecycle[event_index].get("at") != run.get("startedAt"):
            raise ValueError(f"Verifier call journal run {index} start timestamp is unbound.")
        event_index += 1
        if run.get("status") in {"completed", "failed"}:
            if lifecycle[event_index].get("at") != run.get("finishedAt"):
                raise ValueError(f"Verifier call journal run {index} finish timestamp is unbound.")
            event_index += 1
    if expected_status == "completed":
        last = require_mapping(lifecycle[-1], "final verifier call journal lifecycle")
        if (last.get("status"), last.get("phase")) != (
            "completed",
            "verifier-runs-sealed",
        ):
            raise ValueError("Verifier call journal lacks its final sealed lifecycle event.")
        artifact_root = (
            contract["outputDirectory"]
            if contract["outputDirectory"].is_dir()
            else recovery_work_path(contract)
        )
        payloads = [
            load_completed_run(artifact_root, index, run)
            for index, run in enumerate(runs, 1)
        ]
        for field in ("rewardSha256", "diagnosticsSha256", "stdoutSha256"):
            if payloads[0][field] != payloads[1][field]:
                raise ValueError(f"Verifier call journal deterministic {field} drifted.")
        if canonical_json(payloads[0]["reward"]) != canonical_json(payloads[1]["reward"]):
            raise ValueError("Verifier call journal rewards are not deterministic.")
        if canonical_json(payloads[0]["diagnostics"]) != canonical_json(payloads[1]["diagnostics"]):
            raise ValueError("Verifier call journal diagnostics are not deterministic.")
        if payloads[0]["stdout"] != payloads[1]["stdout"]:
            raise ValueError("Verifier call journal stdout is not deterministic.")
        if parse_timestamp(runs[0]["finishedAt"], "journal run 1 finishedAt") > parse_timestamp(
            runs[1]["startedAt"], "journal run 2 startedAt"
        ):
            raise ValueError("Verifier call journal runs overlap or are out of order.")
    return journal


def stage_input_snapshot(
    contract: dict[str, Any], state: dict[str, Any], journal: dict[str, Any]
) -> tuple[dict[str, Any], Path, Path]:
    work = recovery_work_path(contract)
    if not work.exists():
        work.mkdir()
        fsync_directory(work.parent)
    validate_tree(work, "verifier recovery work directory")
    snapshot_root = work / "input-snapshot"
    if journal.get("inputSnapshot") is not None:
        verified = verify_journal(contract, state)
        return verified, snapshot_root / "agent", snapshot_root / "tests"
    if require_list(journal.get("runs"), "journal runs before snapshot"):
        raise ValueError("Verifier calls cannot precede the sealed input snapshot.")
    if snapshot_root.exists() or snapshot_root.is_symlink():
        raise ValueError("Unreceipted verifier input snapshot exists; automatic replay is forbidden.")
    if list(work.glob(".input-snapshot.build-*")):
        raise ValueError("Ambiguous verifier input snapshot build exists.")
    assert_native_immutable(contract, state, "before input snapshot")
    temporary = work / f".input-snapshot.build-{secrets.token_hex(16)}"
    temporary.mkdir()
    try:
        (temporary / "agent").mkdir()
        copy_sealed_file(
            state["piTrace"],
            temporary / "agent" / "pi.txt",
            contract["agentTrace"]["sha256"],
            "native agent Pi trace input",
        )
        copy_tree(
            contract["task"]["testsDirectory"],
            temporary / "tests",
            "task tests input",
        )
        agent_manifest = file_manifest(temporary / "agent")
        expected_agent_manifest = [
            {"path": "pi.txt", "sha256": contract["agentTrace"]["sha256"]}
        ]
        if canonical_json(agent_manifest) != canonical_json(expected_agent_manifest):
            raise ValueError("Agent input snapshot contains files beyond the sealed Pi trace.")
        verify_flat_executable_tree(
            temporary / "agent",
            agent_manifest,
            "agent input snapshot build",
        )
        tests_manifest = file_manifest(temporary / "tests")
        if canonical_json(tests_manifest) != canonical_json(state["task"]["taskTestsArtifactManifest"]):
            raise ValueError("Tests input snapshot differs from the sealed task tests.")
        verify_flat_executable_tree(
            temporary / "tests",
            tests_manifest,
            "tests input snapshot build",
            executable=("test.sh",),
        )
        fsync_tree(temporary, "verifier input snapshot build")
        rename_noreplace(temporary, snapshot_root, "verifier input snapshot publication")
    except Exception:
        if temporary.exists() and not is_link_or_reparse(temporary):
            shutil.rmtree(temporary)
        raise
    body = deepcopy(journal)
    body.pop("journalRecordDigest", None)
    body["inputSnapshot"] = {
        "agentArtifactDigest": digest_value(agent_manifest),
        "agentArtifactManifest": agent_manifest,
        "testsArtifactDigest": digest_value(tests_manifest),
        "testsArtifactManifest": tests_manifest,
    }
    body["lifecycle"].append(
        {"status": "reserved", "phase": "input-snapshot-sealed", "at": utc_now()}
    )
    journal = write_journal(journal_path(contract), body)
    assert_native_immutable(contract, state, "after input snapshot")
    journal = verify_journal(contract, state)
    return journal, snapshot_root / "agent", snapshot_root / "tests"


def load_completed_run(root: Path, index: int, run: Mapping[str, Any]) -> dict[str, Any]:
    directory = validate_tree(root / f"verifier-runs/run-{index:03d}", f"verifier run {index}")
    require_direct_children(
        directory,
        {"reward.json", "diagnostics.json", "test-stdout.txt"},
        f"verifier run {index}",
    )
    reward_path = directory / "reward.json"
    diagnostics_path = directory / "diagnostics.json"
    stdout_path = directory / "test-stdout.txt"
    for path, maximum, label in (
        (reward_path, 1024 * 1024, "reward"),
        (diagnostics_path, 1024 * 1024, "diagnostics"),
        (stdout_path, 4 * 1024 * 1024, "stdout"),
    ):
        required_regular_file(path, f"completed verifier {label} {index}")
        if path.stat().st_size > maximum:
            raise ValueError(f"Completed verifier {label} {index} exceeds its safety limit.")
    for field, path in (
        ("rewardSha256", reward_path),
        ("diagnosticsSha256", diagnostics_path),
        ("stdoutSha256", stdout_path),
    ):
        if run.get(field) != digest_file(path):
            raise ValueError(f"Completed verifier run {index} {field} drifted.")
    reward = read_json(
        reward_path,
        f"completed verifier reward {index}",
        maximum_bytes=1024 * 1024,
    )
    diagnostics = read_json(
        diagnostics_path,
        f"completed verifier diagnostics {index}",
        maximum_bytes=1024 * 1024,
    )
    validate_verifier_payload(reward, diagnostics, f"completed verifier run {index}")
    return {
        "startedAt": require_string(run.get("startedAt"), f"run {index} startedAt"),
        "finishedAt": require_string(run.get("finishedAt"), f"run {index} finishedAt"),
        "reward": reward,
        "diagnostics": diagnostics,
        "rewardSha256": require_digest(run.get("rewardSha256"), f"run {index} rewardSha256"),
        "diagnosticsSha256": require_digest(
            run.get("diagnosticsSha256"), f"run {index} diagnosticsSha256"
        ),
        "stdoutSha256": require_digest(run.get("stdoutSha256"), f"run {index} stdoutSha256"),
        "stdout": stdout_path.read_bytes(),
        "exitCode": 0,
    }


def execute_verifier_runs(
    contract: dict[str, Any], state: dict[str, Any], journal: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], Path, Path]:
    if any(run.get("status") in {"starting", "failed"} for run in journal.get("runs", [])):
        raise ValueError(
            "Verifier call journal contains an ambiguous or failed call; automatic replay is forbidden."
        )
    journal, agent_snapshot, tests_snapshot = stage_input_snapshot(contract, state, journal)
    work = recovery_work_path(contract)
    verifier_runs_root = work / "verifier-runs"
    if verifier_runs_root.exists() or verifier_runs_root.is_symlink():
        validate_tree(verifier_runs_root, "verifier runs root")
    else:
        verifier_runs_root.mkdir()
        fsync_directory(work)
    optional_work_children: set[str] = set()
    if journal.get("status") == "completed":
        optional_work_children = {"recovered-job", "recovery-lock.json"} | {
            path.name for path in work.glob(".recovery-lock.json.tmp-*")
        }
    require_direct_children(
        work,
        {"input-snapshot", "verifier-runs"},
        "active verifier recovery work",
        optional=optional_work_children,
    )
    expected_existing_runs = [f"run-{index:03d}" for index in range(1, len(journal["runs"]) + 1)]
    observed_existing_runs = sorted(path.name for path in verifier_runs_root.iterdir())
    if observed_existing_runs != expected_existing_runs:
        raise ValueError("Verifier runs root differs from the durable call journal.")
    for index in range(len(journal["runs"]) + 1, 3):
        assert_native_immutable(contract, state, f"before verifier run {index}")
        run_directory = work / f"verifier-runs/run-{index:03d}"
        if run_directory.exists() or run_directory.is_symlink():
            raise ValueError(
                f"Unreceipted verifier run {index} output exists; automatic replay is forbidden."
            )
        started_at = utc_now()
        container_name = expected_container_name(contract, index)
        if recovery_container_exists(container_name):
            raise ValueError(
                f"Verifier recovery container already exists before run {index}: {container_name}"
            )
        relative_directory = f"verifier-runs/run-{index:03d}"
        starting = {
            "run": index,
            "status": "starting",
            "containerName": container_name,
            "directory": relative_directory,
            "rewardPath": f"{relative_directory}/reward.json",
            "rewardSha256": None,
            "diagnosticsPath": f"{relative_directory}/diagnostics.json",
            "diagnosticsSha256": None,
            "stdoutPath": f"{relative_directory}/test-stdout.txt",
            "stdoutSha256": None,
            "exitCode": None,
            "startedAt": started_at,
            "finishedAt": None,
        }
        body = deepcopy(journal)
        body.pop("journalRecordDigest", None)
        body["status"] = "blocked"
        body["runs"].append(starting)
        body["execution"] = {"harborCalls": 0, "modelCalls": 0, "verifierCalls": index}
        body["lifecycle"].append(
            {"status": "running", "phase": f"run-{index:03d}-starting", "at": started_at}
        )
        journal = write_journal(journal_path(contract), body)
        journal = verify_journal(contract, state)
        try:
            result = run_verifier_container(
                contract,
                tests_snapshot,
                agent_snapshot / "pi.txt",
                run_directory,
                container_name,
                started_at,
            )
        except Exception as error:
            failed_at = utc_now()
            body = deepcopy(journal)
            body.pop("journalRecordDigest", None)
            body["status"] = "blocked"
            body["runs"][-1] = {
                **starting,
                "status": "failed",
                "finishedAt": failed_at,
                "errorType": type(error).__name__,
            }
            body["lifecycle"].append(
                {"status": "failed", "phase": f"run-{index:03d}-failed", "at": failed_at}
            )
            write_journal(journal_path(contract), body)
            raise
        completed = {
            **relative_run_record(index, result),
            "status": "completed",
            "containerName": container_name,
        }
        if index == 2:
            first = load_completed_run(work, 1, journal["runs"][0])
            for field in ("rewardSha256", "diagnosticsSha256", "stdoutSha256"):
                if first[field] != result[field]:
                    raise ValueError(f"Verifier-only {field} differs across the two runs.")
            if canonical_json(first["reward"]) != canonical_json(result["reward"]):
                raise ValueError("Verifier-only reward differs across the two runs.")
            if canonical_json(first["diagnostics"]) != canonical_json(result["diagnostics"]):
                raise ValueError("Verifier-only diagnostics differs across the two runs.")
            if first["stdout"] != (run_directory / "test-stdout.txt").read_bytes():
                raise ValueError("Verifier-only stdout differs across the two runs.")
        body = deepcopy(journal)
        body.pop("journalRecordDigest", None)
        body["runs"][-1] = completed
        body["execution"] = {"harborCalls": 0, "modelCalls": 0, "verifierCalls": index}
        body["status"] = "completed" if index == 2 else "running"
        body["lifecycle"].append(
            {
                "status": "completed" if index == 2 else "running",
                "phase": "verifier-runs-sealed" if index == 2 else f"run-{index:03d}-completed",
                "at": result["finishedAt"],
            }
        )
        journal = write_journal(journal_path(contract), body)
        journal = verify_journal(contract, state, require_completed=index == 2)
        assert_native_immutable(contract, state, f"after verifier run {index}")
    journal = verify_journal(contract, state, require_completed=True)
    runs = [load_completed_run(work, index, run) for index, run in enumerate(journal["runs"], 1)]
    return journal, runs, agent_snapshot, tests_snapshot


def relative_run_record(
    run_number: int,
    run: dict[str, Any],
) -> dict[str, Any]:
    directory = f"verifier-runs/run-{run_number:03d}"
    return {
        "run": run_number,
        "directory": directory,
        "rewardPath": f"{directory}/reward.json",
        "rewardSha256": run["rewardSha256"],
        "diagnosticsPath": f"{directory}/diagnostics.json",
        "diagnosticsSha256": run["diagnosticsSha256"],
        "stdoutPath": f"{directory}/test-stdout.txt",
        "stdoutSha256": run["stdoutSha256"],
        "exitCode": run["exitCode"],
        "startedAt": run["startedAt"],
        "finishedAt": run["finishedAt"],
    }


def recovery_lock_body(
    contract: dict[str, Any],
    state: dict[str, Any],
    runs: list[dict[str, Any]],
    recovered_job_directory: Path,
    recovered_job_digest: str,
    recovered_job_manifest: list[dict[str, str]],
    journal: dict[str, Any],
    started_at: str,
    verifier_started_at: str,
    completed_at: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": LOCK_KIND,
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": contract["attempt"],
        "status": "completed",
        "native": {
            "resumeLockSha256": contract["native"]["resumeLockSha256"],
            "sourceAttemptRecordDigest": contract["native"]["sourceAttemptRecordDigest"],
            "retryJobDirectory": str(state["nativeJobDirectory"]),
            "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
            "nativeRetryJobArtifactManifest": state["nativeRetryJobArtifactManifest"],
            "nativeRetryJobDirectoryManifest": state["nativeRetryJobDirectoryManifest"],
            "trialId": contract["native"]["trialId"],
            "trialName": contract["native"]["trialName"],
            "trialResultSha256": contract["native"]["trialResultSha256"],
            "exceptionSha256": contract["native"]["exceptionSha256"],
        },
        "agentTrace": state["agentTrace"],
        "task": state["task"],
        "verifier": {
            "image": contract["verifier"]["image"],
            "imageId": contract["verifier"]["imageId"],
            "command": contract["verifier"]["command"],
            "network": "none",
            "authMounted": False,
            "knowledgeMounted": False,
        },
        "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2},
        "callJournal": {
            "path": str(journal_path(contract)),
            "sha256": digest_file(journal_path(contract)),
            "journalRecordDigest": journal["journalRecordDigest"],
        },
        "runs": [relative_run_record(index + 1, run) for index, run in enumerate(runs)],
        "recoveredJob": {
            "directory": str(recovered_job_directory),
            "artifactDigest": recovered_job_digest,
            "artifactManifest": recovered_job_manifest,
            "directoryManifest": directory_manifest(
                recovery_work_path(contract) / "recovered-job"
            ),
        },
        "lifecycle": [
            {"status": "reserved", "phase": "durable-before-verifier-runs", "at": started_at},
            {"status": "running", "phase": "verifier-runs-starting", "at": verifier_started_at},
            {"status": "completed", "phase": "recovered-job-sealed", "at": completed_at},
        ],
    }


def seal_record(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = deepcopy(value)
    result.pop(field, None)
    result[field] = digest_value(result)
    return result


def verify_recovery_lock(
    contract: dict[str, Any],
    state: dict[str, Any],
    *,
    artifact_root: Path | None = None,
) -> dict[str, Any]:
    root = validate_tree(
        artifact_root if artifact_root is not None else contract["outputDirectory"],
        "verifier recovery output",
    )
    required_root_children = {
        "input-snapshot",
        "verifier-runs",
        "recovered-job",
        "recovery-lock.json",
    }
    if root == contract["outputDirectory"]:
        require_direct_children(
            root.parent,
            {writer_lock_path(contract).name, journal_path(contract).name, root.name},
            "published verifier recovery namespace",
        )
        result_path = root / "recovery-result.json"
        result_temporaries = sorted(root.glob(".recovery-result.json.tmp-*"))
        result_stage = root / ".recovery-result.json.verifier-recovery-build"
        if result_path.exists() or result_path.is_symlink():
            require_direct_children(
                root,
                required_root_children | {"recovery-result.json"},
                "completed published verifier recovery output",
            )
        else:
            for temporary in result_temporaries:
                required_regular_file(temporary, "unpublished recovery result temporary")
            if result_stage.exists() or result_stage.is_symlink():
                required_regular_file(result_stage, "staged deterministic recovery result")
            require_direct_children(
                root,
                required_root_children,
                "pre-result published verifier recovery output",
                optional={path.name for path in result_temporaries}
                | ({result_stage.name} if os.path.lexists(result_stage) else set()),
            )
    else:
        require_direct_children(root, required_root_children, "unpublished verifier recovery output")
    lock = read_json(root / "recovery-lock.json", "recovery lock")
    reject_unknown(
        lock,
        {
            "schemaVersion",
            "kind",
            "caseId",
            "recoveryContract",
            "sourceTrialKey",
            "attempt",
            "status",
            "native",
            "agentTrace",
            "task",
            "verifier",
            "execution",
            "callJournal",
            "runs",
            "recoveredJob",
            "lifecycle",
            "recoveryRecordDigest",
        },
        "recovery lock",
    )
    if lock.get("schemaVersion") != SCHEMA_VERSION or lock.get("kind") != LOCK_KIND:
        raise ValueError("Recovery lock schema or kind is unsupported.")
    digest = require_digest(lock.get("recoveryRecordDigest"), "recovery record digest")
    body = deepcopy(lock)
    body.pop("recoveryRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Recovery lock self-digest does not verify.")
    exact = {
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": 1,
        "status": "completed",
    }
    for key, expected in exact.items():
        if lock.get(key) != expected:
            raise ValueError(f"Recovery lock field {key} drifted.")
    journal = verify_journal(contract, state, require_completed=True)
    journal_binding = require_mapping(lock.get("callJournal"), "recovery lock callJournal")
    reject_unknown(
        journal_binding,
        {"path", "sha256", "journalRecordDigest"},
        "recovery lock callJournal",
    )
    expected_journal_binding = {
        "path": str(journal_path(contract)),
        "sha256": digest_file(journal_path(contract)),
        "journalRecordDigest": journal["journalRecordDigest"],
    }
    if canonical_json(journal_binding) != canonical_json(expected_journal_binding):
        raise ValueError("Recovery lock call journal binding drifted.")
    native = require_mapping(lock.get("native"), "recovery lock native")
    reject_unknown(
        native,
        {
            "resumeLockSha256",
            "sourceAttemptRecordDigest",
            "retryJobDirectory",
            "nativeRetryJobArtifactDigest",
            "nativeRetryJobArtifactManifest",
            "nativeRetryJobDirectoryManifest",
            "trialId",
            "trialName",
            "trialResultSha256",
            "exceptionSha256",
        },
        "recovery lock native",
    )
    expected_native = {
        "resumeLockSha256": contract["native"]["resumeLockSha256"],
        "sourceAttemptRecordDigest": contract["native"]["sourceAttemptRecordDigest"],
        "retryJobDirectory": str(state["nativeJobDirectory"]),
        "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
        "nativeRetryJobArtifactManifest": state["nativeRetryJobArtifactManifest"],
        "nativeRetryJobDirectoryManifest": state["nativeRetryJobDirectoryManifest"],
        "trialId": contract["native"]["trialId"],
        "trialName": contract["native"]["trialName"],
        "trialResultSha256": contract["native"]["trialResultSha256"],
        "exceptionSha256": contract["native"]["exceptionSha256"],
    }
    if canonical_json(native) != canonical_json(expected_native):
        raise ValueError("Recovery lock native binding drifted.")
    if native["resumeLockSha256"] != digest_file(state["resumeLockPath"]):
        raise ValueError("Recovery lock no longer binds native resume-lock.json.")
    if native["nativeRetryJobArtifactDigest"] != digest_value(file_manifest(state["nativeJobDirectory"])):
        raise ValueError("Recovery lock no longer binds the immutable native retry job.")
    for field, expected_value in (
        ("agentTrace", state["agentTrace"]),
        ("task", state["task"]),
        (
            "verifier",
            {
                "image": contract["verifier"]["image"],
                "imageId": contract["verifier"]["imageId"],
                "command": contract["verifier"]["command"],
                "network": "none",
                "authMounted": False,
                "knowledgeMounted": False,
            },
        ),
        ("execution", {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2}),
    ):
        observed_value = require_mapping(lock.get(field), f"recovery lock {field}")
        if canonical_json(observed_value) != canonical_json(expected_value):
            raise ValueError(f"Recovery lock {field} binding drifted.")
    lifecycle = require_list(lock.get("lifecycle"), "recovery lock lifecycle")
    if len(lifecycle) != 3:
        raise ValueError("Recovery lock lifecycle must contain exactly three events.")
    expected_lifecycle = [
        ("reserved", "durable-before-verifier-runs"),
        ("running", "verifier-runs-starting"),
        ("completed", "recovered-job-sealed"),
    ]
    lifecycle_times = []
    for index, (raw_event, expected_event) in enumerate(zip(lifecycle, expected_lifecycle, strict=True)):
        event = require_mapping(raw_event, f"recovery lifecycle event {index + 1}")
        reject_unknown(event, {"status", "phase", "at"}, f"recovery lifecycle event {index + 1}")
        if (event.get("status"), event.get("phase")) != expected_event:
            raise ValueError("Recovery lifecycle phase drifted.")
        lifecycle_times.append(parse_timestamp(event.get("at"), "recovery lifecycle timestamp"))
    if lifecycle_times != sorted(lifecycle_times):
        raise ValueError("Recovery lifecycle timestamps are not monotonic.")
    if lifecycle[0].get("at") != journal["lifecycle"][0].get("at"):
        raise ValueError("Recovery lifecycle does not bind the durable journal reservation.")
    if lifecycle[1].get("at") != journal["runs"][0].get("startedAt"):
        raise ValueError("Recovery lifecycle does not bind the first verifier call.")
    runs = require_list(lock.get("runs"), "recovery verifier runs")
    if len(runs) != 2:
        raise ValueError("Recovery lock must contain two verifier runs.")
    require_direct_children(
        root / "verifier-runs",
        {"run-001", "run-002"},
        "recovery verifier runs root",
    )
    run_payloads = []
    for index, raw in enumerate(runs, 1):
        run = require_mapping(raw, f"recovery verifier run {index}")
        reject_unknown(
            run,
            {
                "run",
                "directory",
                "rewardPath",
                "rewardSha256",
                "diagnosticsPath",
                "diagnosticsSha256",
                "stdoutPath",
                "stdoutSha256",
                "exitCode",
                "startedAt",
                "finishedAt",
            },
            f"recovery verifier run {index}",
        )
        if run.get("run") != index or run.get("exitCode") != 0:
            raise ValueError("Recovery verifier run index or exit code drifted.")
        directory = root / f"verifier-runs/run-{index:03d}"
        expected_directory = f"verifier-runs/run-{index:03d}"
        expected_paths = {
            "directory": expected_directory,
            "rewardPath": f"{expected_directory}/reward.json",
            "diagnosticsPath": f"{expected_directory}/diagnostics.json",
            "stdoutPath": f"{expected_directory}/test-stdout.txt",
        }
        if any(run.get(field) != value for field, value in expected_paths.items()):
            raise ValueError(f"Recovery verifier run {index} path binding drifted.")
        if parse_timestamp(run.get("startedAt"), f"run {index} startedAt") > parse_timestamp(
            run.get("finishedAt"), f"run {index} finishedAt"
        ):
            raise ValueError(f"Recovery verifier run {index} timestamps are not monotonic.")
        journal_run = require_mapping(journal["runs"][index - 1], f"journal run {index}")
        for field in (
            "directory",
            "rewardPath",
            "rewardSha256",
            "diagnosticsPath",
            "diagnosticsSha256",
            "stdoutPath",
            "stdoutSha256",
            "exitCode",
            "startedAt",
            "finishedAt",
        ):
            if run.get(field) != journal_run.get(field):
                raise ValueError(f"Recovery lock run {index} {field} differs from its journal.")
        validate_tree(directory, f"recovery verifier run {index}")
        require_direct_children(
            directory,
            {"reward.json", "diagnostics.json", "test-stdout.txt"},
            f"recovery verifier run {index}",
        )
        reward_path = directory / "reward.json"
        diagnostics_path = directory / "diagnostics.json"
        stdout_path = directory / "test-stdout.txt"
        for path, maximum, label in (
            (reward_path, 1024 * 1024, "reward"),
            (diagnostics_path, 1024 * 1024, "diagnostics"),
            (stdout_path, 4 * 1024 * 1024, "stdout"),
        ):
            required_regular_file(path, f"recovery verifier {label} {index}")
            if path.stat().st_size > maximum:
                raise ValueError(f"Recovery verifier {label} {index} exceeds its safety limit.")
        for field, path in (
            ("rewardSha256", reward_path),
            ("diagnosticsSha256", diagnostics_path),
            ("stdoutSha256", stdout_path),
        ):
            if run.get(field) != digest_file(path):
                raise ValueError(f"Recovery verifier run {index} {field} drifted.")
        reward_value = read_json(
            reward_path,
            f"recovery reward {index}",
            maximum_bytes=1024 * 1024,
        )
        diagnostics_value = read_json(
            diagnostics_path,
            f"recovery diagnostics {index}",
            maximum_bytes=1024 * 1024,
        )
        validate_verifier_payload(reward_value, diagnostics_value, f"recovery verifier run {index}")
        run_payloads.append(
            {
                "reward": reward_value,
                "diagnostics": diagnostics_value,
                "stdout": stdout_path.read_bytes(),
            }
        )
    for field in ("rewardSha256", "diagnosticsSha256", "stdoutSha256"):
        if runs[0].get(field) != runs[1].get(field):
            raise ValueError(f"Verifier recovery {field} differs across the two runs.")
    if parse_timestamp(runs[0].get("finishedAt"), "run 1 finishedAt") > parse_timestamp(
        runs[1].get("startedAt"), "run 2 startedAt"
    ):
        raise ValueError("Verifier recovery runs overlap or are out of order.")
    if canonical_json(run_payloads[0]["reward"]) != canonical_json(run_payloads[1]["reward"]):
        raise ValueError("Verifier recovery rewards differ across the two runs.")
    if canonical_json(run_payloads[0]["diagnostics"]) != canonical_json(run_payloads[1]["diagnostics"]):
        raise ValueError("Verifier recovery diagnostics differ across the two runs.")
    if run_payloads[0]["stdout"] != run_payloads[1]["stdout"]:
        raise ValueError("Verifier recovery stdout differs across the two runs.")
    recovered = require_mapping(lock.get("recoveredJob"), "recovery lock recoveredJob")
    reject_unknown(
        recovered,
        {"directory", "artifactDigest", "artifactManifest", "directoryManifest"},
        "recovery lock recoveredJob",
    )
    declared_recovered_directory = Path(
        os.path.abspath(require_string(recovered.get("directory"), "recovered job directory"))
    )
    expected_declared_directory = contract["outputDirectory"] / "recovered-job"
    if declared_recovered_directory != expected_declared_directory:
        raise ValueError("Recovery lock recovered job path drifted.")
    recovered_directory = root / "recovered-job"
    recovered_manifest = verify_declared_manifest(
        recovered_directory,
        require_list(recovered.get("artifactManifest"), "recovered job artifact manifest"),
        require_digest(recovered.get("artifactDigest"), "recovered job artifact digest"),
        "recovered job artifact manifest",
    )
    recovered_directories = [
        safe_relative(item, f"recovered job directory manifest {index}")
        for index, item in enumerate(
            require_list(recovered.get("directoryManifest"), "recovered job directory manifest")
        )
    ]
    if recovered_directories != sorted(set(recovered_directories)):
        raise ValueError("Recovered job directory manifest must be unique and path-sorted.")
    if directory_manifest(recovered_directory) != recovered_directories:
        raise ValueError("Recovered job directory manifest drifted.")
    verify_manifest_topology(
        recovered_directory,
        recovered_manifest,
        "recovered job topology",
        allowed_empty_directories=(
            f"{state['nativeTrialName']}/artifacts/logs/artifacts",
        ),
    )
    recovered_job = state["engine"].load_harbor_job(recovered_directory, state["rewardKey"])
    if len(recovered_job["trials"]) != 1:
        raise ValueError("Recovered job trial count drifted.")
    state["engine"].same_retry_profile(state["sourceTrial"], recovered_job["trials"][0])
    state["engine"].import_retry_job(
        state["sourceTrial"], recovered_directory, 1, state["rewardKey"]
    )
    lock["_runPayload"] = run_payloads[0]
    lock["_recoveredManifest"] = recovered_manifest
    lock["_recoveredJob"] = recovered_job
    return lock


def reset_safe_post_verifier_derivations(
    contract: dict[str, Any],
    journal: Mapping[str, Any],
) -> None:
    if journal.get("status") != "completed":
        raise ValueError("Post-verifier derivations can be reset only after two sealed calls.")
    work = validate_tree(recovery_work_path(contract), "completed verifier recovery work")
    lock_temporaries = sorted(work.glob(".recovery-lock.json.tmp-*"))
    require_direct_children(
        work,
        {"input-snapshot", "verifier-runs"},
        "completed verifier recovery work",
        optional={"recovered-job"} | {path.name for path in lock_temporaries},
    )
    recovered_build = work / "recovered-job"
    if recovered_build.exists() or recovered_build.is_symlink():
        path_inside(work, recovered_build, "derived recovered job")
        validate_tree(recovered_build, "derived recovered job")
        shutil.rmtree(recovered_build)
        fsync_directory(work)
    for temporary in lock_temporaries:
        path_inside(work, temporary, "derived recovery lock temporary")
        required_regular_file(temporary, "derived recovery lock temporary")
        temporary.unlink()
        fsync_directory(work)


def publish_recovery_inputs(contract: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    output = contract["outputDirectory"]
    if output.exists() or output.is_symlink():
        validate_tree(output, "existing verifier recovery output")
        require_direct_children(
            output.parent,
            {writer_lock_path(contract).name, journal_path(contract).name, output.name},
            "published verifier recovery namespace",
        )
        return verify_recovery_lock(contract, state)
    effective_jobs_root = contract["effectiveJobDirectory"].parent.parent
    if effective_jobs_root.exists() or effective_jobs_root.is_symlink():
        raise ValueError(
            "Effective-jobs namespace exists before verifier recovery publication; "
            "refusing to consume verifier calls."
        )
    for run_number in range(1, 3):
        container_name = expected_container_name(contract, run_number)
        if recovery_container_exists(container_name):
            raise ValueError(
                "Verifier recovery container name is occupied before any remaining call: "
                + container_name
            )
    parent = output.parent
    parent.mkdir(parents=True, exist_ok=True)
    validate_tree(parent, "verifier recovery parent")
    known_parent_names = {
        writer_lock_path(contract).name,
        journal_path(contract).name,
        recovery_work_path(contract).name,
        output.name,
    }
    observed_parent_names = {path.name for path in parent.iterdir()}
    journal_temporaries = {
        path.name for path in parent.glob(f".{journal_path(contract).name}.tmp-*")
    }
    if not observed_parent_names.issubset(known_parent_names | journal_temporaries):
        raise ValueError("Verifier recovery parent contains unrecognized state before calls.")
    stale_random_builds = sorted(parent.glob(f".{output.name}.build-*"))
    if stale_random_builds:
        raise ValueError("Legacy unreceipted verifier recovery builds exist; refusing deletion or replay.")
    reconcile_safe_pre_call_leftovers(contract, state)
    journal = initialize_journal(contract, state)
    require_direct_children(
        parent,
        {
            writer_lock_path(contract).name,
            journal_path(contract).name,
            recovery_work_path(contract).name,
        },
        "active verifier recovery namespace",
    )
    journal, runs, agent_snapshot, _tests_snapshot = execute_verifier_runs(
        contract, state, journal
    )
    work = validate_tree(recovery_work_path(contract), "receipted verifier recovery work")
    recovered_final = output / "recovered-job"
    recovered_build = work / "recovered-job"
    recovery_lock_path = work / "recovery-lock.json"
    if recovery_lock_path.exists() or recovery_lock_path.is_symlink():
        require_direct_children(
            work,
            {"input-snapshot", "verifier-runs", "recovered-job", "recovery-lock.json"},
            "unpublished completed verifier recovery",
        )
        required_regular_file(recovery_lock_path, "unpublished recovery lock")
        if not recovered_build.is_dir() or is_link_or_reparse(recovered_build):
            raise ValueError("Unpublished recovery lock lacks its recovered job.")
        verify_recovery_lock(contract, state, artifact_root=work)
        assert_native_immutable(contract, state, "before recovered publication continuation")
        rename_noreplace(work, output, "verifier recovery publication")
        require_direct_children(
            parent,
            {writer_lock_path(contract).name, journal_path(contract).name, output.name},
            "published verifier recovery namespace",
        )
        assert_native_immutable(contract, state, "after recovered publication continuation")
        return verify_recovery_lock(contract, state)
    reset_safe_post_verifier_derivations(contract, journal)
    build_recovered_job(
        state["engine"],
        state,
        recovered_build,
        recovered_final,
        runs[0],
        work / "verifier-runs/run-001",
        agent_snapshot,
    )
    fsync_tree(recovered_build, "recovered Harbor-compatible job")
    require_direct_children(
        work,
        {"input-snapshot", "verifier-runs", "recovered-job"},
        "pre-lock verifier recovery work",
    )
    recovered_manifest = file_manifest(recovered_build)
    recovered_digest = digest_value(recovered_manifest)
    completed_at = utc_now()
    lock_body = recovery_lock_body(
        contract,
        state,
        runs,
        recovered_final,
        recovered_digest,
        recovered_manifest,
        journal,
        journal["lifecycle"][0]["at"],
        journal["runs"][0]["startedAt"],
        completed_at,
    )
    durable_new_json(
        recovery_lock_path,
        seal_record(lock_body, "recoveryRecordDigest"),
        "recovery lock publication",
    )
    require_direct_children(
        work,
        {"input-snapshot", "verifier-runs", "recovered-job", "recovery-lock.json"},
        "sealed verifier recovery work",
    )
    verify_recovery_lock(contract, state, artifact_root=work)
    assert_native_immutable(contract, state, "before recovery publication")
    if digest_file(journal_path(contract)) != lock_body["callJournal"]["sha256"]:
        raise ValueError("Verifier call journal changed before recovery publication.")
    if output.exists() or output.is_symlink():
        raise ValueError("Verifier recovery output appeared during atomic publication.")
    rename_noreplace(work, output, "verifier recovery publication")
    require_direct_children(
        parent,
        {writer_lock_path(contract).name, journal_path(contract).name, output.name},
        "published verifier recovery namespace",
    )
    assert_native_immutable(contract, state, "after recovery publication")
    return verify_recovery_lock(contract, state)


def verify_effective_template(
    contract: dict[str, Any],
    state: dict[str, Any],
    recovery_lock: dict[str, Any],
    *,
    artifact_root: Path | None = None,
) -> dict[str, Any]:
    assert_native_immutable(contract, state, "before effective job verification")
    assert_recovered_immutable(
        contract, state, recovery_lock, "before effective job verification"
    )
    effective = validate_tree(
        artifact_root if artifact_root is not None else contract["effectiveJobDirectory"],
        "effective recovered job",
    )
    if artifact_root is None:
        verify_effective_namespace(effective, {effective.name})
    manifest_path = effective / "resume-manifest.json"
    manifest = read_json(manifest_path, "post-agent effective resume manifest")
    reject_unknown(
        manifest,
        {
            "schemaVersion",
            "createdAt",
            "policyDigest",
            "contractDigest",
            "sourceJob",
            "sourceJobArtifactDigest",
            "selectionPolicy",
            "lineage",
            "files",
            "effectiveJobDigest",
            "completionMode",
            "recoveryContract",
            "recoveryRecordDigest",
            "recovery",
        },
        "post-agent effective resume manifest",
    )
    if manifest.get("schemaVersion") != 2:
        raise ValueError("Post-agent effective manifest schemaVersion must be 2.")
    exact = {
        "completionMode": COMPLETION_MODE,
        "recoveryContract": RECOVERY_CONTRACT,
        "selectionPolicy": SELECTION_POLICY,
        "recoveryRecordDigest": recovery_lock["recoveryRecordDigest"],
        "sourceJobArtifactDigest": state["jobs"][0]["artifactDigest"],
        "policyDigest": state["policyDigest"],
        "contractDigest": state["contractDigest"],
        "sourceJob": str(state["jobs"][0]["directory"]),
    }
    for key, expected in exact.items():
        if manifest.get(key) != expected:
            raise ValueError(f"Effective resume manifest field {key} drifted.")
    parse_timestamp(manifest.get("createdAt"), "effective manifest createdAt")
    recovered_binding = require_mapping(
        recovery_lock.get("recoveredJob"), "recovery lock recovered job"
    )
    expected_recovery = {
        "completionMode": COMPLETION_MODE,
        "recoveryContract": RECOVERY_CONTRACT,
        "recoveryRecordDigest": recovery_lock["recoveryRecordDigest"],
        "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
        "recoveredJobArtifactDigest": recovered_binding["artifactDigest"],
    }
    if canonical_json(manifest.get("recovery")) != canonical_json(expected_recovery):
        raise ValueError("Effective resume manifest recovery binding drifted.")
    lineage = require_list(manifest.get("lineage"), "effective recovery lineage")
    if len(lineage) != 1:
        raise ValueError("Effective recovery lineage must contain exactly one trial.")
    lineage_row = require_mapping(lineage[0], "effective recovery lineage row")
    reject_unknown(
        lineage_row,
        {"sourceTrialKey", "sourceTrial", "selected"},
        "effective recovery lineage row",
    )
    if lineage_row.get("sourceTrialKey") != state["sourceTrial"]["sourceTrialKey"]:
        raise ValueError("Effective recovery sourceTrialKey drifted.")
    source_binding = require_mapping(lineage_row.get("sourceTrial"), "effective source binding")
    expected_source_binding = {
        "jobDirectory": str(state["jobs"][0]["directory"]),
        "trialDirectory": str(state["sourceTrial"]["trialDirectory"]),
        "artifactDigest": state["jobs"][0]["artifactDigest"],
    }
    if canonical_json(source_binding) != canonical_json(expected_source_binding):
        raise ValueError("Effective recovery source binding drifted.")
    selected = require_mapping(lineage_row.get("selected"), "effective selected recovery")
    reject_unknown(
        selected,
        {
            "lineage",
            "attempt",
            "jobDirectory",
            "trialId",
            "retryArtifactDigest",
            "completionMode",
            "nativeRetryJobArtifactDigest",
            "recoveredJobArtifactDigest",
            "recoveryRecordDigest",
        },
        "effective selected recovery",
    )
    recovered_directory = contract["outputDirectory"] / "recovered-job"
    recovered_job = state["engine"].load_harbor_job(recovered_directory, state["rewardKey"])
    if len(recovered_job["trials"]) != 1:
        raise ValueError("Recovered job no longer contains exactly one trial.")
    recovered_trial = recovered_job["trials"][0]
    expected_selected = {
        "lineage": "retry",
        "attempt": 1,
        "jobDirectory": str(recovered_directory),
        "trialId": recovered_trial["trialId"],
        "retryArtifactDigest": recovered_job["artifactDigest"],
        "completionMode": COMPLETION_MODE,
        "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
        "recoveredJobArtifactDigest": recovered_binding["artifactDigest"],
        "recoveryRecordDigest": recovery_lock["recoveryRecordDigest"],
    }
    if canonical_json(selected) != canonical_json(expected_selected):
        raise ValueError("Effective selected recovery binding drifted.")
    files = state["engine"].directory_file_manifest(
        effective, exclude={"resume-manifest.json"}
    )
    if canonical_json(files) != canonical_json(manifest.get("files")):
        raise ValueError("Effective job file manifest drifted.")
    if digest_value(files) != manifest.get("effectiveJobDigest"):
        raise ValueError("Effective job digest drifted.")
    verify_manifest_topology(
        effective,
        [
            *files,
            {
                "path": "resume-manifest.json",
                "sha256": digest_file(effective / "resume-manifest.json"),
            },
        ],
        "effective recovered job topology",
        allowed_empty_directories=(
            f"{state['sourceTrial']['trialDirectory'].name}/artifacts/logs/artifacts",
        ),
    )
    inspection = state["engine"].load_harbor_job(effective, state["rewardKey"])
    if len(inspection["trials"]) != 1:
        raise ValueError("Effective job trial count drifted.")
    if inspection["trials"][0]["classification"]["kind"] != "semantic":
        raise ValueError("Effective job is no longer an evaluable semantic result.")
    for name in ("config.json", "lock.json"):
        if (effective / name).read_bytes() != (state["jobs"][0]["directory"] / name).read_bytes():
            raise ValueError(f"Effective recovered {name} differs from its source job.")
    effective_trial = inspection["trials"][0]
    expected_result = deepcopy(recovered_trial["result"])
    for field in ("task_name", "trial_name", "task_id", "source", "task_checksum"):
        expected_result[field] = deepcopy(state["sourceTrial"]["result"].get(field))
    expected_result["config"] = deepcopy(state["sourceTrial"]["trialConfig"])
    expected_result["trial_uri"] = (
        contract["effectiveJobDirectory"] / state["sourceTrial"]["trialDirectory"].name
    ).as_uri()
    if canonical_json(effective_trial["result"]) != canonical_json(expected_result):
        raise ValueError("Effective recovered TrialResult differs from its sealed transformation.")
    for name in ("config.json", "lock.json"):
        if (effective_trial["trialDirectory"] / name).read_bytes() != (
            state["sourceTrial"]["trialDirectory"] / name
        ).read_bytes():
            raise ValueError(f"Effective recovered trial {name} differs from source provenance.")
    recovered_auxiliary = state["engine"].directory_file_manifest(
        recovered_trial["trialDirectory"], exclude={"config.json", "lock.json", "result.json"}
    )
    effective_auxiliary = state["engine"].directory_file_manifest(
        effective_trial["trialDirectory"], exclude={"config.json", "lock.json", "result.json"}
    )
    if canonical_json(recovered_auxiliary) != canonical_json(effective_auxiliary):
        raise ValueError("Effective recovered auxiliary artifacts differ from recovered lineage.")
    assert_native_immutable(contract, state, "after effective job verification")
    assert_recovered_immutable(
        contract, state, recovery_lock, "after effective job verification"
    )
    return manifest


def publish_effective_job(
    contract: dict[str, Any],
    state: dict[str, Any],
    recovery_lock: dict[str, Any],
) -> dict[str, Any]:
    effective = contract["effectiveJobDirectory"]
    if effective.exists() or effective.is_symlink():
        validate_tree(effective, "existing effective recovered job")
        verify_effective_template(
            contract,
            state,
            recovery_lock,
            artifact_root=effective,
        )
        reconcile_effective_build(
            contract,
            recovery_lock,
            effective,
            destination_verified=True,
        )
        return verify_effective_template(contract, state, recovery_lock)
    assert_native_immutable(contract, state, "before effective job materialization")
    assert_recovered_immutable(
        contract, state, recovery_lock, "before effective job materialization"
    )
    effective.parent.mkdir(parents=True, exist_ok=True)
    validate_tree(effective.parent, "effective job parent")
    temporary, owner = effective_build_paths(effective)
    verify_effective_namespace(
        effective,
        set(),
        optional_source_children={temporary.name, owner.name},
    )
    legacy_builds = sorted(effective.parent.glob(f".{effective.name}.build-*"))
    if legacy_builds:
        raise ValueError(
            "Unowned legacy effective build exists; refusing deletion: "
            + ", ".join(str(path) for path in legacy_builds)
        )
    temporary, owner = reconcile_effective_build(
        contract,
        recovery_lock,
        effective,
        destination_verified=False,
    )
    verify_effective_namespace(effective, set())
    durable_new_json(
        owner,
        seal_record(
            effective_build_owner_body(contract, recovery_lock, temporary, effective),
            "ownerRecordDigest",
        ),
        "effective build owner publication",
    )
    verify_effective_namespace(effective, {owner.name})
    temporary.mkdir()
    fsync_directory(effective.parent)
    verify_effective_namespace(effective, {temporary.name, owner.name})
    try:
        recovered_job = contract["outputDirectory"] / "recovered-job"
        imported = state["engine"].import_retry_job(
            state["sourceTrial"], recovered_job, 1, state["rewardKey"]
        )
        selection = {
            "selected": {
                "lineage": "retry",
                "attempt": 1,
                "jobDirectory": str(recovered_job),
                "trialId": imported["trialId"],
            },
            "retries": [imported],
        }
        state["engine"].build_effective_job_at(
            temporary,
            effective,
            state["rewardKey"],
            state["jobs"][0],
            [state["sourceTrial"]],
            [selection],
            state["policyDigest"],
            state["contractDigest"],
        )
        recovered_digest = require_mapping(
            recovery_lock.get("recoveredJob"), "recovery lock recovered job"
        )["artifactDigest"]
        enrich_effective_manifest(
            temporary / "resume-manifest.json",
            state,
            recovery_lock["recoveryRecordDigest"],
            recovered_digest,
        )
        assert_native_immutable(contract, state, "after effective job materialization")
        assert_recovered_immutable(
            contract, state, recovery_lock, "after effective job materialization"
        )
        if effective.exists() or effective.is_symlink():
            raise ValueError("Effective job destination appeared during publication.")
        fsync_tree(temporary, "effective recovered job build")
        verify_effective_template(
            contract,
            state,
            recovery_lock,
            artifact_root=temporary,
        )
        rename_noreplace(temporary, effective, "effective recovered job publication")
        verify_effective_namespace(effective, {effective.name, owner.name})
        owner.unlink()
        fsync_directory(effective.parent)
        verify_effective_namespace(effective, {effective.name})
    except Exception:
        if temporary.exists() and not is_link_or_reparse(temporary):
            validate_tree(temporary, "current verifier-recovery effective build")
            shutil.rmtree(temporary)
        if owner.exists() and not is_link_or_reparse(owner):
            required_regular_file(owner, "current effective build owner")
            owner.unlink()
        fsync_directory(effective.parent)
        raise
    return verify_effective_template(contract, state, recovery_lock)


def recovery_result_body(
    contract: dict[str, Any],
    state: dict[str, Any],
    recovery_lock: dict[str, Any],
    effective_manifest: dict[str, Any],
) -> dict[str, Any]:
    recovered = require_mapping(recovery_lock.get("recoveredJob"), "recovered job")
    reward = require_mapping(recovery_lock["_runPayload"].get("reward"), "recovered reward")
    primary = reward.get(state["rewardKey"])
    if isinstance(primary, bool) or not isinstance(primary, (int, float)):
        raise ValueError("Recovered primary reward is missing or non-numeric.")
    if not float("-inf") < float(primary) < float("inf"):
        raise ValueError("Recovered primary reward is non-finite.")
    recovered_job = validate_tree(
        Path(require_string(recovered.get("directory"), "recovered job path")),
        "recovered result job",
    )
    recovered_trials = [
        path
        for path in recovered_job.iterdir()
        if path.is_dir() and not is_link_or_reparse(path) and (path / "result.json").is_file()
    ]
    if len(recovered_trials) != 1:
        raise ValueError("Recovered result must bind exactly one trial directory.")
    recovered_trial = recovered_trials[0]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": RESULT_KIND,
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": 1,
        "status": "evaluable",
        "classification": "semantic",
        "completionMode": COMPLETION_MODE,
        "selectionPolicy": SELECTION_POLICY,
        "rewardKey": state["rewardKey"],
        "reward": primary,
        "rewards": reward,
        "recoveryRecordDigest": recovery_lock["recoveryRecordDigest"],
        "recoveredJobDirectory": str(recovered_job),
        "recoveredJobArtifactDigest": recovered["artifactDigest"],
        "recoveredTrialResultSha256": digest_file(recovered_trial / "result.json"),
        "recoveredJobResultSha256": digest_file(recovered_job / "result.json"),
        "effectiveJobDirectory": str(contract["effectiveJobDirectory"]),
        "effectiveJobDigest": effective_manifest["effectiveJobDigest"],
        "resumeManifestSha256": digest_file(
            contract["effectiveJobDirectory"] / "resume-manifest.json"
        ),
        "modelCalls": 0,
        "harborCalls": 0,
        "verifierCalls": 2,
    }


def verify_recovery_result(
    contract: dict[str, Any],
    state: dict[str, Any],
    recovery_lock: dict[str, Any],
    effective_manifest: dict[str, Any],
) -> dict[str, Any]:
    result_path = contract["outputDirectory"] / "recovery-result.json"
    result = read_json(result_path, "verifier recovery result")
    reject_unknown(
        result,
        {
            "schemaVersion",
            "kind",
            "caseId",
            "recoveryContract",
            "sourceTrialKey",
            "attempt",
            "status",
            "classification",
            "completionMode",
            "selectionPolicy",
            "rewardKey",
            "reward",
            "rewards",
            "recoveryRecordDigest",
            "recoveredJobDirectory",
            "recoveredJobArtifactDigest",
            "recoveredTrialResultSha256",
            "recoveredJobResultSha256",
            "effectiveJobDirectory",
            "effectiveJobDigest",
            "resumeManifestSha256",
            "modelCalls",
            "harborCalls",
            "verifierCalls",
            "recoveryResultDigest",
        },
        "verifier recovery result",
    )
    digest = require_digest(result.get("recoveryResultDigest"), "recovery result digest")
    body = deepcopy(result)
    body.pop("recoveryResultDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Recovery result self-digest does not verify.")
    expected = recovery_result_body(contract, state, recovery_lock, effective_manifest)
    if canonical_json(body) != canonical_json(expected):
        raise ValueError("Recovery result differs from current sealed artifacts.")
    return result


def finish_recovery(
    contract: dict[str, Any], state: dict[str, Any], recovery_lock: dict[str, Any]
) -> dict[str, Any]:
    effective_manifest = publish_effective_job(contract, state, recovery_lock)
    result_path = contract["outputDirectory"] / "recovery-result.json"
    legacy_result_temporaries = sorted(
        contract["outputDirectory"].glob(".recovery-result.json.tmp-*")
    )
    if legacy_result_temporaries:
        raise ValueError(
            "Ambiguous legacy recovery-result temporary exists: "
            + ", ".join(str(path) for path in legacy_result_temporaries)
        )
    publish_expected_json(
        result_path,
        seal_record(
            recovery_result_body(contract, state, recovery_lock, effective_manifest),
            "recoveryResultDigest",
        ),
        "recovery result publication",
    )
    require_direct_children(
        contract["outputDirectory"],
        {
            "input-snapshot",
            "verifier-runs",
            "recovered-job",
            "recovery-lock.json",
            "recovery-result.json",
        },
        "completed verifier recovery output",
    )
    result = verify_recovery_result(contract, state, recovery_lock, effective_manifest)
    if digest_file(state["resumeLockPath"]) != contract["native"]["resumeLockSha256"]:
        raise ValueError("Native resume-lock.json changed after verifier recovery.")
    if digest_value(file_manifest(state["nativeJobDirectory"])) != state["nativeRetryJobArtifactDigest"]:
        raise ValueError("Native retry job changed after verifier recovery.")
    return result


def doctor_or_dry(contract: dict[str, Any], mode: str) -> int:
    state = prepare_state(contract, check_docker=True)
    output = contract["outputDirectory"]
    recovered = output.exists() or output.is_symlink()
    journal_file = journal_path(contract)
    journal = None
    completed_runs = 0
    blocked = False
    if journal_file.exists() or journal_file.is_symlink():
        journal = verify_journal(contract, state, require_completed=recovered)
        completed_runs = sum(run.get("status") == "completed" for run in journal["runs"])
        blocked = journal["status"] == "blocked"
    elif recovery_work_path(contract).exists() or recovery_work_path(contract).is_symlink():
        blocked = True
    payload = {
        "ok": True,
        "mode": mode,
        "caseId": contract["caseId"],
        "recoveryContract": RECOVERY_CONTRACT,
        "eligible": not recovered and not blocked,
        "alreadyRecovered": recovered,
        "blocked": blocked,
        "sourceTrialKey": contract["sourceTrialKey"],
        "attempt": 1,
        "completionMode": COMPLETION_MODE,
        "nativeRetryImmutable": True,
        "plannedVerifierRuns": 0 if recovered or blocked else 2 - completed_runs,
        "harborCalls": 0,
        "modelCalls": 0,
        "externalCalls": 0,
        "writes": 0,
    }
    if journal is not None:
        payload["journalStatus"] = journal["status"]
        payload["completedVerifierRuns"] = completed_runs
    if recovered:
        recovery_lock = verify_recovery_lock(contract, state)
        manifest = verify_effective_template(contract, state, recovery_lock)
        result = verify_recovery_result(contract, state, recovery_lock, manifest)
        payload["reward"] = result["reward"]
        payload["recoveryResultDigest"] = result["recoveryResultDigest"]
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def verify_existing(contract: dict[str, Any]) -> int:
    state = prepare_state(contract, check_docker=True)
    recovery_lock = verify_recovery_lock(contract, state)
    effective_manifest = verify_effective_template(contract, state, recovery_lock)
    result = verify_recovery_result(contract, state, recovery_lock, effective_manifest)
    print(
        json.dumps(
            {
                "ok": True,
                "mode": "verify",
                "completionMode": COMPLETION_MODE,
                "reward": result["reward"],
                "harborCalls": 0,
                "modelCalls": 0,
                "verifierCalls": 2,
                "recoveryResultDigest": result["recoveryResultDigest"],
                "effectiveJobDigest": result["effectiveJobDigest"],
            },
            indent=2,
        )
    )
    return 0


def live(contract: dict[str, Any]) -> int:
    state = prepare_state(contract, check_docker=True)
    writer = writer_lock_path(contract)
    with writer_lock(writer, contract):
        recovery_lock = publish_recovery_inputs(contract, state)
        result = finish_recovery(contract, state, recovery_lock)
    print(
        json.dumps(
            {
                "ok": True,
                "mode": "live",
                "completionMode": COMPLETION_MODE,
                "reward": result["reward"],
                "harborCalls": 0,
                "modelCalls": 0,
                "verifierCalls": 2,
                "recoveryResultDigest": result["recoveryResultDigest"],
                "effectiveJobDigest": result["effectiveJobDigest"],
            },
            indent=2,
        )
    )
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--doctor", action="store_true")
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--verify", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    contract = load_contract(Path(os.path.abspath(args.contract)))
    try:
        if args.doctor:
            return doctor_or_dry(contract, "doctor")
        if args.dry_run:
            return doctor_or_dry(contract, "dry-run")
        if args.verify:
            return verify_existing(contract)
        return live(contract)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
