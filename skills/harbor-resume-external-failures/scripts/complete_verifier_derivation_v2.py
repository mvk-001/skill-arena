# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Complete a sealed verifier-only recovery after its calls already finished.

This append-only completion never executes Harbor, an agent, a model, or a
verifier.  It accepts only the exact completed V1 call journal, preserves the
failed V1 post-call staging as evidence, and applies one compatibility rule in
memory: an omitted Harbor ``TaskConfig.overwrite`` is equivalent to its
Pydantic default ``false``.  The native and journal artifacts are immutable.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import secrets
import shutil
import sys
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence


SCHEMA_VERSION = 2
CONTRACT_ID = (
    "harbor-0.18.0.completed-verifier-journal."
    "task-overwrite-default-omission.derivation-v2"
)
RECEIPT_KIND = "harbor-verifier-recovery-derivation-v2-receipt"
NORMALIZATION_ID = "harbor-taskconfig-overwrite-default-omission-v1"
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")


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


def reject_unknown(value: Mapping[str, Any], allowed: set[str], label: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"{label} has unknown keys: {', '.join(unknown)}")


def read_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"{label} must be an ordinary file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not valid UTF-8 JSON: {path}") from error
    return require_mapping(value, label)


def resolve_path(base: Path, value: Any, label: str) -> Path:
    text = require_string(value, label)
    path = Path(text).expanduser()
    return Path(os.path.abspath(path if path.is_absolute() else base / path))


def load_module(path: Path, name: str) -> Any:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"Sealed Python module is missing or linked: {path}")
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import sealed Python module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_contract(path: Path) -> dict[str, Any]:
    raw = read_json(path, "derivation V2 contract")
    reject_unknown(
        raw,
        {
            "schemaVersion",
            "caseId",
            "derivationContract",
            "parentRecoveryContract",
            "parentCallJournal",
            "preservedV1Work",
            "completionDirectory",
            "normalization",
            "sealedFiles",
        },
        "derivation V2 contract",
    )
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"contract.schemaVersion must be {SCHEMA_VERSION}.")
    if raw.get("derivationContract") != CONTRACT_ID:
        raise ValueError("Unsupported derivation V2 contract.")
    base = path.parent
    parent = require_mapping(raw.get("parentRecoveryContract"), "parentRecoveryContract")
    journal = require_mapping(raw.get("parentCallJournal"), "parentCallJournal")
    preserved_work = require_mapping(raw.get("preservedV1Work"), "preservedV1Work")
    normalization = require_mapping(raw.get("normalization"), "normalization")
    reject_unknown(parent, {"path", "sha256"}, "parentRecoveryContract")
    reject_unknown(journal, {"path", "sha256", "recordDigest"}, "parentCallJournal")
    reject_unknown(
        preserved_work,
        {"path", "artifactDigest", "directoryManifestDigest"},
        "preservedV1Work",
    )
    reject_unknown(
        normalization,
        {"id", "scope", "expected", "observed", "artifactMutation"},
        "normalization",
    )
    expected_normalization = {
        "id": NORMALIZATION_ID,
        "scope": "JobConfig.tasks[0].overwrite",
        "expected": False,
        "observed": "absent",
        "artifactMutation": False,
    }
    if canonical_json(normalization) != canonical_json(expected_normalization):
        raise ValueError("Contract normalization is broader than the allowed default omission.")
    sealed_files = []
    for index, raw_row in enumerate(require_list(raw.get("sealedFiles"), "sealedFiles")):
        row = require_mapping(raw_row, f"sealedFiles[{index}]")
        reject_unknown(row, {"path", "sha256"}, f"sealedFiles[{index}]")
        sealed_files.append(
            {
                "path": resolve_path(base, row.get("path"), f"sealedFiles[{index}].path"),
                "storedPath": require_string(row.get("path"), f"sealedFiles[{index}].path"),
                "sha256": require_digest(row.get("sha256"), f"sealedFiles[{index}].sha256"),
            }
        )
    if not sealed_files or len({str(row["path"]) for row in sealed_files}) != len(sealed_files):
        raise ValueError("sealedFiles must be non-empty and unique.")
    return {
        "path": Path(os.path.abspath(path)),
        "caseId": require_string(raw.get("caseId"), "caseId"),
        "derivationContract": CONTRACT_ID,
        "parentRecoveryContract": {
            "path": resolve_path(base, parent.get("path"), "parentRecoveryContract.path"),
            "sha256": require_digest(parent.get("sha256"), "parentRecoveryContract.sha256"),
        },
        "parentCallJournal": {
            "path": resolve_path(base, journal.get("path"), "parentCallJournal.path"),
            "sha256": require_digest(journal.get("sha256"), "parentCallJournal.sha256"),
            "recordDigest": require_digest(
                journal.get("recordDigest"), "parentCallJournal.recordDigest"
            ),
        },
        "preservedV1Work": {
            "path": resolve_path(base, preserved_work.get("path"), "preservedV1Work.path"),
            "artifactDigest": require_digest(
                preserved_work.get("artifactDigest"), "preservedV1Work.artifactDigest"
            ),
            "directoryManifestDigest": require_digest(
                preserved_work.get("directoryManifestDigest"),
                "preservedV1Work.directoryManifestDigest",
            ),
        },
        "completionDirectory": resolve_path(
            base, raw.get("completionDirectory"), "completionDirectory"
        ),
        "normalization": expected_normalization,
        "sealedFiles": sealed_files,
    }


def seal_record(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = deepcopy(value)
    result.pop(field, None)
    result[field] = digest_value(result)
    return result


def write_new_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with path.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())


def copy_file(source: Path, destination: Path, expected: str, label: str) -> None:
    if not source.is_file() or source.is_symlink():
        raise ValueError(f"{label} source is missing or linked: {source}")
    payload = source.read_bytes()
    if digest_bytes(payload) != expected:
        raise ValueError(f"{label} source hash drifted.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    if digest_file(destination) != expected:
        raise ValueError(f"{label} copied bytes drifted.")


def diff_paths(expected: Any, observed: Any, prefix: str = "") -> list[str]:
    if isinstance(expected, dict) and isinstance(observed, dict):
        rows = []
        for key in sorted(set(expected) | set(observed)):
            child = f"{prefix}.{key}" if prefix else key
            if key not in expected or key not in observed:
                rows.append(child)
            else:
                rows.extend(diff_paths(expected[key], observed[key], child))
        return rows
    if isinstance(expected, list) and isinstance(observed, list):
        rows = []
        if len(expected) != len(observed):
            rows.append(f"{prefix}.length")
        for index, (left, right) in enumerate(zip(expected, observed)):
            rows.extend(diff_paths(left, right, f"{prefix}[{index}]"))
        return rows
    return [] if canonical_json(expected) == canonical_json(observed) else [prefix]


def normalize_retry_profile_default_omission(
    job_config: Mapping[str, Any], profile: Mapping[str, Any]
) -> dict[str, Any]:
    """Return a copy normalized only for one omitted retry-task default."""

    raw_tasks = require_list(job_config.get("tasks"), "adapted retry JobConfig.tasks")
    result = deepcopy(require_mapping(dict(profile), "adapted retry profile"))
    profile_tasks = require_list(result.get("tasks"), "adapted retry profile tasks")
    if len(raw_tasks) != 1 or len(profile_tasks) != 1:
        raise ValueError("Default-omission adapter requires exactly one task.")
    raw_task = require_mapping(raw_tasks[0], "adapted raw retry task")
    profile_task = require_mapping(profile_tasks[0], "adapted retry profile task")
    if "overwrite" not in raw_task:
        if "overwrite" in profile_task:
            raise ValueError("Missing overwrite unexpectedly materialized before V2 adapter.")
        profile_task["overwrite"] = False
    return result


def normalize_exact_retry_profile_pair(
    expected: Mapping[str, Any],
    observed: Mapping[str, Any],
    observed_job_config: Mapping[str, Any],
) -> dict[str, Any]:
    """Reject every profile delta except expected false versus observed omission."""

    expected_copy = deepcopy(require_mapping(dict(expected), "expected retry profile"))
    observed_copy = deepcopy(require_mapping(dict(observed), "observed retry profile"))
    expected_tasks = require_list(expected_copy.get("tasks"), "expected retry profile tasks")
    observed_tasks = require_list(observed_copy.get("tasks"), "observed retry profile tasks")
    raw_tasks = require_list(observed_job_config.get("tasks"), "observed retry JobConfig tasks")
    if len(expected_tasks) != 1 or len(observed_tasks) != 1 or len(raw_tasks) != 1:
        raise ValueError("Exact default omission requires one expected and observed task.")
    expected_task = require_mapping(expected_tasks[0], "expected retry profile task")
    observed_task = require_mapping(observed_tasks[0], "observed retry profile task")
    raw_task = require_mapping(raw_tasks[0], "observed raw retry task")
    if (
        expected_task.get("overwrite") is not False
        or "overwrite" in observed_task
        or "overwrite" in raw_task
    ):
        raise ValueError("Profile pair is not explicit false versus an omitted overwrite.")
    if diff_paths(expected_copy, observed_copy) != ["tasks[0].overwrite"]:
        raise ValueError("Retry profiles differ beyond tasks[0].overwrite.")
    normalized = normalize_retry_profile_default_omission(observed_job_config, observed_copy)
    if canonical_json(normalized) != canonical_json(expected_copy):
        raise ValueError("Default-omission normalization did not produce the expected profile.")
    return normalized


def validate_exact_default_omission(state: dict[str, Any]) -> None:
    engine = state["engine"]
    expected_model = engine.retry_job_config(
        state["sourceTrial"],
        state["nativeJobDirectory"].parent / ".canonical-v2-default-omission-profile",
        "canonical-v2-default-omission-profile",
    )
    expected_raw = engine.model_json(expected_model)
    observed_raw = read_json(state["nativeJobDirectory"] / "config.json", "native retry JobConfig")
    expected_tasks = require_list(expected_raw.get("tasks"), "expected retry tasks")
    observed_tasks = require_list(observed_raw.get("tasks"), "observed retry tasks")
    if len(expected_tasks) != 1 or len(observed_tasks) != 1:
        raise ValueError("Default-omission compatibility requires exactly one retry task.")
    expected_task = require_mapping(expected_tasks[0], "expected retry task")
    observed_task = require_mapping(observed_tasks[0], "observed retry task")
    if expected_task.get("overwrite") is not False or "overwrite" in observed_task:
        raise ValueError("Observed mismatch is not exactly omitted overwrite versus false.")
    expected_without = deepcopy(expected_task)
    expected_without.pop("overwrite")
    if canonical_json(expected_without) != canonical_json(observed_task):
        raise ValueError("Retry task differs beyond the overwrite default omission.")
    strict_expected = engine.canonical_retry_job_profile(expected_raw, state["sourceTrial"]["skill"])
    strict_observed = engine.canonical_retry_job_profile(observed_raw, state["sourceTrial"]["skill"])
    normalize_exact_retry_profile_pair(strict_expected, strict_observed, observed_raw)
    expected_trial = engine.canonical_trial_execution_profile(
        state["sourceTrial"]["trialConfig"], state["sourceTrial"]["skill"]
    )
    observed_trial = engine.canonical_trial_execution_profile(
        state["nativeTrialConfig"], state["sourceTrial"]["skill"]
    )
    if canonical_json(expected_trial) != canonical_json(observed_trial):
        raise ValueError("TrialConfig differs independently of the JobConfig omission.")


@contextmanager
def exact_default_omission_adapter(state: dict[str, Any], v1: Any) -> Iterator[None]:
    engine = state["engine"]
    original_profile = engine.canonical_retry_job_profile
    original_verifier = v1.run_verifier_container

    def canonical_retry_job_profile(job_config: dict[str, Any], skill: dict[str, Any]) -> dict[str, Any]:
        profile = original_profile(job_config, skill)
        return normalize_retry_profile_default_omission(job_config, profile)

    def forbidden_verifier(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("Derivation V2 forbids every verifier execution.")

    engine.canonical_retry_job_profile = canonical_retry_job_profile
    v1.run_verifier_container = forbidden_verifier
    try:
        yield
    finally:
        engine.canonical_retry_job_profile = original_profile
        v1.run_verifier_container = original_verifier


def expected_sealed_paths(contract: dict[str, Any]) -> set[Path]:
    script = Path(os.path.abspath(__file__))
    bundle = script.parent.parent
    generation = contract["path"].parent.parent
    return {
        script,
        script.with_name(f"{script.name}.lock"),
        bundle / "references" / "verifier-only-derivation-v2.md",
        contract["path"].parent / "run-generation-003-verifier-derivation-v2.sh",
        generation / "scripts" / "evidence-resolution-post-agent-v2.js",
        generation / "scripts" / "publish-generation-003-post-agent-v2.js",
    }


def prepare(contract: dict[str, Any]) -> tuple[Any, dict[str, Any], dict[str, Any]]:
    observed = {row["path"] for row in contract["sealedFiles"]}
    if observed != expected_sealed_paths(contract):
        raise ValueError("V2 sealedFiles differs from the exact executable set.")
    for row in contract["sealedFiles"]:
        if digest_file(row["path"]) != row["sha256"]:
            raise ValueError(f"V2 sealed executable drifted: {row['path']}")

    parent_path = contract["parentRecoveryContract"]["path"]
    if digest_file(parent_path) != contract["parentRecoveryContract"]["sha256"]:
        raise ValueError("Parent V1 recovery contract drifted.")
    v1_path = next(
        row["path"]
        for row in contract["sealedFiles"]
        if row["path"].name == "complete_verifier_derivation_v2.py"
    ).with_name("recover_verifier_only.py")
    v1 = load_module(v1_path, "harbor_verifier_recovery_v1_for_derivation_v2")
    parent = v1.load_contract(parent_path)
    state = v1.prepare_state(parent, check_docker=False)
    journal = v1.verify_journal(parent, state, require_completed=True)
    declared_journal = contract["parentCallJournal"]
    if Path(v1.journal_path(parent)) != declared_journal["path"]:
        raise ValueError("Parent journal path differs from the V1 path derivation.")
    if digest_file(declared_journal["path"]) != declared_journal["sha256"]:
        raise ValueError("Completed verifier journal bytes drifted.")
    if journal.get("journalRecordDigest") != declared_journal["recordDigest"]:
        raise ValueError("Completed verifier journal self-digest drifted.")
    if journal.get("status") != "completed" or journal.get("execution") != {
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 2,
    }:
        raise ValueError("Parent journal is not the exact completed two-call evidence.")
    work = v1.recovery_work_path(parent)
    if work != contract["preservedV1Work"]["path"]:
        raise ValueError("Preserved V1 work path differs from the V1 path derivation.")
    if v1.digest_value(v1.file_manifest(work)) != contract["preservedV1Work"]["artifactDigest"]:
        raise ValueError("Preserved V1 post-call staging bytes drifted from the V2 contract.")
    if (
        v1.digest_value(v1.directory_manifest(work))
        != contract["preservedV1Work"]["directoryManifestDigest"]
    ):
        raise ValueError("Preserved V1 post-call staging topology drifted from the V2 contract.")
    validate_exact_default_omission(state)
    return v1, parent, state


def evidence_body(
    contract: dict[str, Any], v1: Any, parent: dict[str, Any], destination: Path
) -> dict[str, Any]:
    root = destination / "v1-evidence"
    root.mkdir(parents=True)
    copy_file(
        contract["parentRecoveryContract"]["path"],
        root / "call-contract.json",
        contract["parentRecoveryContract"]["sha256"],
        "V1 call contract",
    )
    copied_seals = []
    for index, row in enumerate(parent["sealedFiles"], 1):
        name = f"{index:03d}-{row['path'].name}"
        target = root / "sealed-files" / name
        copy_file(row["path"], target, row["sha256"], f"V1 sealed file {index}")
        copied_seals.append(
            {
                "sourcePath": str(row["path"]),
                "copiedPath": f"sealed-files/{name}",
                "sha256": row["sha256"],
            }
        )
    copy_file(
        contract["parentCallJournal"]["path"],
        root / "call-journal.json",
        contract["parentCallJournal"]["sha256"],
        "completed V1 call journal",
    )
    source_work = v1.recovery_work_path(parent)
    if not source_work.is_dir() or source_work.is_symlink():
        raise ValueError("V1 post-call staging is missing or linked.")
    work_files = v1.file_manifest(source_work)
    work_directories = v1.directory_manifest(source_work)
    if v1.digest_value(work_files) != contract["preservedV1Work"]["artifactDigest"]:
        raise ValueError("V1 work changed before its V2 evidence copy.")
    if v1.digest_value(work_directories) != contract["preservedV1Work"]["directoryManifestDigest"]:
        raise ValueError("V1 work topology changed before its V2 evidence copy.")
    v1.copy_tree(source_work, root / "post-call-staging-unsealed", "V1 post-call staging")
    files = v1.file_manifest(root)
    directories = v1.directory_manifest(root)
    return {
        "directory": str(root),
        "artifactManifest": files,
        "artifactDigest": v1.digest_value(files),
        "directoryManifest": directories,
        "sealedFiles": copied_seals,
        "partialStagingTrust": "unsealed-evidence-only",
        "preservedV1Work": {
            "directory": str(source_work),
            "artifactManifest": work_files,
            "artifactDigest": v1.digest_value(work_files),
            "directoryManifest": work_directories,
            "directoryManifestDigest": v1.digest_value(work_directories),
        },
    }


def verify_evidence(
    contract: dict[str, Any],
    v1: Any,
    parent: dict[str, Any],
    root: Path,
    stored: Mapping[str, Any],
) -> None:
    reject_unknown(
        stored,
        {
            "directory",
            "artifactManifest",
            "artifactDigest",
            "directoryManifest",
            "sealedFiles",
            "partialStagingTrust",
            "preservedV1Work",
        },
        "receipt V1 evidence",
    )
    if Path(require_string(stored.get("directory"), "V1 evidence directory")) != root:
        raise ValueError("V1 evidence directory differs from its final publication path.")
    if stored.get("partialStagingTrust") != "unsealed-evidence-only":
        raise ValueError("Partial V1 staging was promoted beyond evidence-only trust.")
    files = v1.file_manifest(root)
    if canonical_json(files) != canonical_json(stored.get("artifactManifest")):
        raise ValueError("V1 copied evidence manifest drifted.")
    if v1.digest_value(files) != stored.get("artifactDigest"):
        raise ValueError("V1 copied evidence aggregate digest drifted.")
    if v1.directory_manifest(root) != stored.get("directoryManifest"):
        raise ValueError("V1 copied evidence directory topology drifted.")
    copied_seals = require_list(stored.get("sealedFiles"), "copied V1 seals")
    if len(copied_seals) != len(parent["sealedFiles"]):
        raise ValueError("Copied V1 seal count drifted.")
    for index, (raw_row, parent_row) in enumerate(zip(copied_seals, parent["sealedFiles"], strict=True), 1):
        row = require_mapping(raw_row, f"copied V1 seal {index}")
        reject_unknown(row, {"sourcePath", "copiedPath", "sha256"}, f"copied V1 seal {index}")
        expected_path = f"sealed-files/{index:03d}-{parent_row['path'].name}"
        if (
            row.get("sourcePath") != str(parent_row["path"])
            or row.get("copiedPath") != expected_path
            or row.get("sha256") != parent_row["sha256"]
            or digest_file(root / expected_path) != parent_row["sha256"]
        ):
            raise ValueError(f"Copied V1 seal {index} binding drifted.")
    if digest_file(root / "call-contract.json") != contract["parentRecoveryContract"]["sha256"]:
        raise ValueError("Copied V1 call contract drifted.")
    if digest_file(root / "call-journal.json") != contract["parentCallJournal"]["sha256"]:
        raise ValueError("Copied V1 call journal drifted.")
    preserved = require_mapping(stored.get("preservedV1Work"), "preserved V1 work")
    reject_unknown(
        preserved,
        {
            "directory",
            "artifactManifest",
            "artifactDigest",
            "directoryManifest",
            "directoryManifestDigest",
        },
        "preserved V1 work",
    )
    source = Path(require_string(preserved.get("directory"), "preserved V1 work directory"))
    if source != contract["preservedV1Work"]["path"]:
        raise ValueError("Receipt preserved V1 work path drifted from its contract.")
    if (
        preserved.get("artifactDigest") != contract["preservedV1Work"]["artifactDigest"]
        or preserved.get("directoryManifestDigest")
        != contract["preservedV1Work"]["directoryManifestDigest"]
    ):
        raise ValueError("Receipt preserved V1 work digests drifted from its contract.")
    copied = root / "post-call-staging-unsealed"
    source_files = v1.file_manifest(source)
    copied_files = v1.file_manifest(copied)
    expected_files = require_list(preserved.get("artifactManifest"), "preserved V1 work manifest")
    if canonical_json(source_files) != canonical_json(expected_files):
        raise ValueError("Original V1 post-call staging changed after preservation.")
    if canonical_json(copied_files) != canonical_json(expected_files):
        raise ValueError("Copied V1 post-call staging differs from its source.")
    if v1.digest_value(source_files) != preserved.get("artifactDigest"):
        raise ValueError("Preserved V1 work artifact digest drifted.")
    source_directories = v1.directory_manifest(source)
    if source_directories != preserved.get("directoryManifest"):
        raise ValueError("Original V1 work directory topology drifted.")
    if v1.digest_value(source_directories) != preserved.get("directoryManifestDigest"):
        raise ValueError("Preserved V1 work topology digest drifted.")


def assert_projection_config_bytes(parent: dict[str, Any], state: dict[str, Any]) -> None:
    recovered = parent["outputDirectory"] / "recovered-job"
    native = state["nativeJobDirectory"]
    trial = state["nativeTrialName"]
    for relative in ("config.json", "lock.json", f"{trial}/config.json", f"{trial}/lock.json"):
        if (recovered / relative).read_bytes() != (native / relative).read_bytes():
            raise ValueError(f"Recovered projection {relative} is not byte-identical to native.")


def projection_body(v1: Any, parent: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    recovery_lock_path = parent["outputDirectory"] / "recovery-lock.json"
    recovery_result_path = parent["outputDirectory"] / "recovery-result.json"
    manifest_path = parent["effectiveJobDirectory"] / "resume-manifest.json"
    recovery_lock = v1.read_json(recovery_lock_path, "V1 compatibility recovery lock")
    recovery_result = v1.read_json(recovery_result_path, "V1 compatibility recovery result")
    manifest = v1.read_json(manifest_path, "V1 compatibility effective manifest")
    return {
        "recoveryOutputDirectory": str(parent["outputDirectory"]),
        "recoveryLockSha256": digest_file(recovery_lock_path),
        "recoveryRecordDigest": require_digest(
            recovery_lock.get("recoveryRecordDigest"), "recoveryRecordDigest"
        ),
        "recoveryResultSha256": digest_file(recovery_result_path),
        "recoveryResultDigest": require_digest(
            recovery_result.get("recoveryResultDigest"), "recoveryResultDigest"
        ),
        "effectiveJobDirectory": str(parent["effectiveJobDirectory"]),
        "resumeManifestSha256": digest_file(manifest_path),
        "effectiveJobDigest": require_digest(manifest.get("effectiveJobDigest"), "effectiveJobDigest"),
        "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
        "recoveredJobArtifactDigest": require_digest(
            recovery_result.get("recoveredJobArtifactDigest"), "recoveredJobArtifactDigest"
        ),
        "schemaCompatibility": {
            "recoveryLock": 1,
            "recoveryResult": 1,
            "effectiveManifest": 2,
        },
    }


def receipt_body(
    contract: dict[str, Any],
    v1: Any,
    parent: dict[str, Any],
    state: dict[str, Any],
    evidence: dict[str, Any],
) -> dict[str, Any]:
    journal = v1.read_json(contract["parentCallJournal"]["path"], "completed call journal")
    parent_seals = [
        {"path": str(row["path"]), "sha256": row["sha256"]}
        for row in parent["sealedFiles"]
    ]
    v2_seals = [
        {"path": row["storedPath"], "sha256": row["sha256"]}
        for row in contract["sealedFiles"]
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": RECEIPT_KIND,
        "caseId": contract["caseId"],
        "derivationContract": CONTRACT_ID,
        "status": "completed",
        "parent": {
            "recoveryContractPath": str(contract["parentRecoveryContract"]["path"]),
            "recoveryContractSha256": contract["parentRecoveryContract"]["sha256"],
            "sealedFiles": parent_seals,
            "sealedSetDigest": digest_value(parent_seals),
            "callJournalPath": str(contract["parentCallJournal"]["path"]),
            "callJournalSha256": contract["parentCallJournal"]["sha256"],
            "callJournalRecordDigest": journal["journalRecordDigest"],
            "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2},
        },
        "completion": {
            "contractPath": str(contract["path"]),
            "contractSha256": digest_file(contract["path"]),
            "sealedFiles": v2_seals,
            "sealedSetDigest": digest_value(v2_seals),
            "normalization": contract["normalization"],
            "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 0},
        },
        "aggregateExecution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2},
        "native": {
            "resumeLockSha256": parent["native"]["resumeLockSha256"],
            "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
            "sourceAttemptRecordDigest": parent["native"]["sourceAttemptRecordDigest"],
        },
        "v1Evidence": evidence,
        "compatibilityProjection": projection_body(v1, parent, state),
    }


def verify_receipt(
    contract: dict[str, Any], v1: Any, parent: dict[str, Any], state: dict[str, Any]
) -> dict[str, Any]:
    root = contract["completionDirectory"]
    if not root.is_dir() or root.is_symlink():
        raise ValueError("Completed derivation V2 directory is missing or linked.")
    v1.require_direct_children(
        root,
        {"v1-evidence", "completion-receipt.json"},
        "completed derivation V2 namespace",
    )
    receipt = read_json(root / "completion-receipt.json", "derivation V2 receipt")
    digest = require_digest(receipt.get("completionRecordDigest"), "completionRecordDigest")
    body = deepcopy(receipt)
    body.pop("completionRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Derivation V2 receipt self-digest does not verify.")
    evidence = require_mapping(body.get("v1Evidence"), "receipt.v1Evidence")
    verify_evidence(contract, v1, parent, root / "v1-evidence", evidence)
    with forbidden_call_surfaces(v1, state):
        verify_projection(v1, parent, state)
    expected = receipt_body(contract, v1, parent, state, evidence)
    if canonical_json(body) != canonical_json(expected):
        raise ValueError("Derivation V2 receipt differs from current sealed artifacts.")
    return receipt


@contextmanager
def forbidden_call_surfaces(v1: Any, state: dict[str, Any]) -> Iterator[None]:
    engine = state["engine"]

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("Derivation V2 crossed a forbidden call surface.")

    names = (
        "docker_image_id",
        "recovery_container_exists",
        "run_verifier_container",
        "execute_verifier_runs",
    )
    original_v1 = {name: getattr(v1, name) for name in names}
    original_native = getattr(engine, "run_native_job")
    for name in names:
        setattr(v1, name, forbidden)
    engine.run_native_job = forbidden
    try:
        yield
    finally:
        for name, value in original_v1.items():
            setattr(v1, name, value)
        engine.run_native_job = original_native


@contextmanager
def allow_only_preserved_work_sibling(
    v1: Any, parent: dict[str, Any]
) -> Iterator[None]:
    original = v1.require_direct_children
    work_name = v1.recovery_work_path(parent).name

    def require_children(
        root: Path,
        required: set[str],
        label: str,
        *,
        optional: set[str] | None = None,
    ) -> None:
        allowed = set(optional or set())
        if (
            Path(root) == parent["outputDirectory"].parent
            and label == "published verifier recovery namespace"
        ):
            allowed.add(work_name)
        original(root, required, label, optional=allowed)

    v1.require_direct_children = require_children
    try:
        yield
    finally:
        v1.require_direct_children = original


def verify_projection(v1: Any, parent: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    with exact_default_omission_adapter(state, v1), allow_only_preserved_work_sibling(v1, parent):
        recovery_lock = v1.verify_recovery_lock(parent, state)
        manifest = v1.verify_effective_template(parent, state, recovery_lock)
        result = v1.verify_recovery_result(parent, state, recovery_lock, manifest)
    assert_projection_config_bytes(parent, state)
    return result


def load_recovery_projection(
    v1: Any, parent: dict[str, Any], state: dict[str, Any]
) -> dict[str, Any]:
    with exact_default_omission_adapter(state, v1), allow_only_preserved_work_sibling(v1, parent):
        return v1.verify_recovery_lock(parent, state)


def build_projection(
    v1: Any,
    parent: dict[str, Any],
    state: dict[str, Any],
    completion_staging: Path,
) -> None:
    output = parent["outputDirectory"]
    if output.exists() or output.is_symlink():
        recovery_lock = load_recovery_projection(v1, parent, state)
        with exact_default_omission_adapter(state, v1):
            v1.finish_recovery(parent, state, recovery_lock)
        verify_projection(v1, parent, state)
        return
    if parent["effectiveJobDirectory"].exists() or parent["effectiveJobDirectory"].is_symlink():
        raise ValueError("Effective projection exists without its recovery output.")
    work = v1.recovery_work_path(parent)
    journal = v1.verify_journal(parent, state, require_completed=True)
    runs = [
        v1.load_completed_run(work, index, run)
        for index, run in enumerate(journal["runs"], 1)
    ]
    build = completion_staging / "compatibility-projection-build"
    build.mkdir()
    v1.copy_tree(work / "input-snapshot", build / "input-snapshot", "sealed input snapshot")
    v1.copy_tree(work / "verifier-runs", build / "verifier-runs", "sealed verifier runs")
    with exact_default_omission_adapter(state, v1):
        v1.build_recovered_job(
            state["engine"],
            state,
            build / "recovered-job",
            output / "recovered-job",
            runs[0],
            work / "verifier-runs/run-001",
            work / "input-snapshot/agent",
        )
        recovered_manifest = v1.file_manifest(build / "recovered-job")
        recovered_digest = v1.digest_value(recovered_manifest)
        lock_body = v1.recovery_lock_body(
            parent,
            state,
            runs,
            output / "recovered-job",
            recovered_digest,
            recovered_manifest,
            journal,
            journal["lifecycle"][0]["at"],
            journal["runs"][0]["startedAt"],
            journal["runs"][1]["finishedAt"],
        )
        lock_body["recoveredJob"]["directoryManifest"] = v1.directory_manifest(
            build / "recovered-job"
        )
        v1.durable_new_json(
            build / "recovery-lock.json",
            v1.seal_record(lock_body, "recoveryRecordDigest"),
            "V2 compatibility recovery lock",
        )
        v1.fsync_tree(build, "V2 compatibility recovery build")
        recovery_lock = v1.verify_recovery_lock(parent, state, artifact_root=build)
    output.parent.mkdir(parents=True, exist_ok=True)
    v1.rename_noreplace(build, output, "V2 compatibility recovery publication")
    with exact_default_omission_adapter(state, v1):
        v1.finish_recovery(parent, state, recovery_lock)
    verify_projection(v1, parent, state)


def complete_projection(
    v1: Any, parent: dict[str, Any], state: dict[str, Any], completion_staging: Path
) -> None:
    journal_before = digest_file(v1.journal_path(parent))
    native_before = v1.digest_value(v1.file_manifest(state["nativeJobDirectory"]))
    work = v1.recovery_work_path(parent)
    work_files_before = v1.file_manifest(work)
    work_directories_before = v1.directory_manifest(work)
    with forbidden_call_surfaces(v1, state):
        build_projection(v1, parent, state, completion_staging)
    if digest_file(v1.journal_path(parent)) != journal_before:
        raise ValueError("Completed verifier journal changed during V2 derivation.")
    if v1.digest_value(v1.file_manifest(state["nativeJobDirectory"])) != native_before:
        raise ValueError("Native retry job changed during V2 derivation.")
    if canonical_json(v1.file_manifest(work)) != canonical_json(work_files_before):
        raise ValueError("V1 post-call staging changed during V2 derivation.")
    if v1.directory_manifest(work) != work_directories_before:
        raise ValueError("V1 post-call staging topology changed during V2 derivation.")
    assert_projection_config_bytes(parent, state)


def owner_body(contract: dict[str, Any], staging: Path, final: Path) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "harbor-verifier-recovery-derivation-v2-owner",
        "caseId": contract["caseId"],
        "contractSha256": digest_file(contract["path"]),
        "stagingDirectory": str(staging),
        "finalDirectory": str(final),
    }


def verify_owner(contract: dict[str, Any], staging: Path, final: Path, owner: Path) -> None:
    record = read_json(owner, "derivation V2 staging owner")
    reject_unknown(
        record,
        {
            "schemaVersion",
            "kind",
            "caseId",
            "contractSha256",
            "stagingDirectory",
            "finalDirectory",
            "ownerRecordDigest",
        },
        "derivation V2 staging owner",
    )
    digest = require_digest(record.get("ownerRecordDigest"), "V2 ownerRecordDigest")
    body = deepcopy(record)
    body.pop("ownerRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Derivation V2 staging owner self-digest drifted.")
    if canonical_json(body) != canonical_json(owner_body(contract, staging, final)):
        raise ValueError("Derivation V2 staging owner binding drifted.")


def reconcile_owned_staging(
    contract: dict[str, Any], v1: Any, staging: Path, final: Path, owner: Path
) -> None:
    staging_exists = staging.exists() or staging.is_symlink()
    owner_exists = owner.exists() or owner.is_symlink()
    if not staging_exists and not owner_exists:
        return
    if not owner_exists:
        raise ValueError("Unreceipted derivation V2 staging exists.")
    verify_owner(contract, staging, final, owner)
    if final.exists() or final.is_symlink():
        if staging_exists:
            raise ValueError("Completed V2 output and owned staging coexist ambiguously.")
        owner.unlink()
        v1.fsync_directory(owner.parent)
        return
    if not staging_exists:
        owner.unlink()
        v1.fsync_directory(owner.parent)
        return
    if not staging.is_dir() or staging.is_symlink():
        raise ValueError("Owned derivation V2 staging is linked or not a directory.")
    # Every call surface is already forbidden and the completed V1 journal is
    # immutable. This tree contains derived copies only, so an exactly owned
    # interrupted build can be discarded and rebuilt without replaying calls.
    v1.validate_tree(staging, "owned interrupted derivation V2 staging")
    shutil.rmtree(staging)
    owner.unlink()
    v1.fsync_directory(owner.parent)


def live(contract: dict[str, Any], v1: Any, parent: dict[str, Any], state: dict[str, Any]) -> int:
    final = contract["completionDirectory"]
    staging = final.with_name(f".{final.name}.build")
    owner = final.with_name(f".{final.name}.owner.json")
    if final.exists() or final.is_symlink():
        if staging.exists() or staging.is_symlink() or owner.exists() or owner.is_symlink():
            with v1.writer_lock(v1.writer_lock_path(parent), parent):
                reconcile_owned_staging(contract, v1, staging, final, owner)
        receipt = verify_receipt(contract, v1, parent, state)
        print(json.dumps({
            "ok": True,
            "mode": "live-idempotent",
            "completionRecordDigest": receipt["completionRecordDigest"],
            "harborCalls": 0,
            "modelCalls": 0,
            "verifierCalls": 0,
        }, indent=2))
        return 0

    final.parent.mkdir(parents=True, exist_ok=True)
    with v1.writer_lock(v1.writer_lock_path(parent), parent):
        # Revalidate the entire native/journal state after acquiring the same
        # exclusive lock used by V1.
        state = v1.prepare_state(parent, check_docker=False)
        v1.verify_journal(parent, state, require_completed=True)
        validate_exact_default_omission(state)
        with forbidden_call_surfaces(v1, state):
            reconcile_owned_staging(contract, v1, staging, final, owner)
            write_new_json(owner, seal_record(owner_body(contract, staging, final), "ownerRecordDigest"))
            v1.fsync_directory(owner.parent)
            staging.mkdir()
            v1.fsync_directory(staging.parent)
            try:
                evidence = evidence_body(contract, v1, parent, staging)
                evidence["directory"] = str(final / "v1-evidence")
                complete_projection(v1, parent, state, staging)
                body = receipt_body(contract, v1, parent, state, evidence)
                write_new_json(
                    staging / "completion-receipt.json",
                    seal_record(body, "completionRecordDigest"),
                )
                v1.fsync_tree(staging, "derivation V2 completion build")
                if final.exists() or final.is_symlink():
                    raise ValueError("Derivation V2 destination appeared during publication.")
                v1.rename_noreplace(staging, final, "derivation V2 receipt publication")
                owner.unlink()
                v1.fsync_directory(owner.parent)
            except Exception:
                # Leave the exactly owned derived staging for zero-call
                # reconciliation by the next invocation.
                raise
    receipt = verify_receipt(contract, v1, parent, state)
    print(json.dumps({
        "ok": True,
        "mode": "live",
        "completionRecordDigest": receipt["completionRecordDigest"],
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
        "aggregateVerifierCalls": 2,
    }, indent=2))
    return 0


def doctor(contract: dict[str, Any], v1: Any, parent: dict[str, Any], state: dict[str, Any], mode: str) -> int:
    completed = contract["completionDirectory"].exists()
    payload: dict[str, Any] = {
        "ok": True,
        "mode": mode,
        "caseId": contract["caseId"],
        "derivationContract": CONTRACT_ID,
        "journalCompleted": True,
        "normalization": contract["normalization"],
        "alreadyCompleted": completed,
        "plannedHarborCalls": 0,
        "plannedModelCalls": 0,
        "plannedVerifierCalls": 0,
        "writes": 0,
    }
    if completed:
        receipt = verify_receipt(contract, v1, parent, state)
        payload["completionRecordDigest"] = receipt["completionRecordDigest"]
    print(json.dumps(payload, indent=2))
    return 0


def publish_q003_staging(
    contract: dict[str, Any],
    v1: Any,
    parent: dict[str, Any],
    state: dict[str, Any],
    raw_source: str,
    raw_destination: str,
) -> int:
    """Durably publish the one permitted q003 staging tree without replacement."""

    verify_receipt(contract, v1, parent, state)
    completion = contract["completionDirectory"]
    if (
        completion.name != "attempt-001"
        or completion.parent.name != "verifier-recovery-completion"
        or completion.parents[2].name != "q003"
        or completion.parents[3].name != "resume"
    ):
        raise ValueError("Derivation V2 completion path cannot anchor q003 publication.")
    runtime = completion.parents[4]
    publication_parent = runtime / "publications"
    source = Path(os.path.abspath(raw_source))
    destination = Path(os.path.abspath(raw_destination))
    if destination != publication_parent / "q003":
        raise ValueError("q003 publication destination is outside the sealed generation runtime.")
    if source.parent != publication_parent or not re.fullmatch(
        r"\.q003\.derivation-v2-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        source.name,
    ):
        raise ValueError("q003 publication source is not an invocation-owned UUID staging tree.")
    v1.require_direct_children(
        source,
        {"result.json", "report.md", "derivation-v2-receipt.json"},
        "q003 derivation V2 staging",
    )
    for name in ("result.json", "report.md", "derivation-v2-receipt.json"):
        v1.required_regular_file(source / name, f"q003 derivation V2 {name}")
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"q003 publication destination already exists: {destination}")
    v1.fsync_tree(source, "q003 derivation V2 publication build")
    v1.rename_noreplace(source, destination, "q003 derivation V2 publication")
    print(json.dumps({
        "ok": True,
        "mode": "publish-q003-staging",
        "source": str(source),
        "destination": str(destination),
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
    }, indent=2))
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--doctor", action="store_true")
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--verify", action="store_true")
    modes.add_argument(
        "--publish-q003-staging",
        nargs=2,
        metavar=("SOURCE", "DESTINATION"),
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        contract = load_contract(Path(os.path.abspath(args.contract)))
        v1, parent, state = prepare(contract)
        if args.doctor:
            return doctor(contract, v1, parent, state, "doctor")
        if args.dry_run:
            return doctor(contract, v1, parent, state, "dry-run")
        if args.verify:
            receipt = verify_receipt(contract, v1, parent, state)
            print(json.dumps({
                "ok": True,
                "mode": "verify",
                "completionRecordDigest": receipt["completionRecordDigest"],
                "harborCalls": 0,
                "modelCalls": 0,
                "verifierCalls": 0,
            }, indent=2))
            return 0
        if args.publish_q003_staging:
            return publish_q003_staging(
                contract,
                v1,
                parent,
                state,
                args.publish_q003_staging[0],
                args.publish_q003_staging[1],
            )
        return live(contract, v1, parent, state)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
