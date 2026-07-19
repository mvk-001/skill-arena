# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Append-only zero-call completion after a sealed V2 derivation failure.

V3 preserves the failed V2 owner and staging byte-for-byte, then permits only
two Harbor/Pydantic serialization defaults in memory: an omitted
``TaskConfig.overwrite`` equals ``false`` and an omitted ``JobConfig.n_attempts``
equals ``1``.  It never executes Harbor, an agent, a model, or a verifier.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence


SCHEMA_VERSION = 3
CONTRACT_ID = (
    "harbor-0.18.0.completed-verifier-journal."
    "task-overwrite-and-job-attempts-default-omission.derivation-v3"
)
RECEIPT_KIND = "harbor-verifier-recovery-derivation-v3-receipt"
OWNER_KIND = "harbor-verifier-recovery-derivation-v3-owner"
EXPECTED_PARENT_FAILURE = (
    "Each external retry JobConfig must contain exactly one attempt and one trial."
)
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
UUID_STAGE = re.compile(
    r"\.q003\.derivation-v3-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)
NORMALIZATIONS = [
    {
        "id": "harbor-taskconfig-overwrite-default-omission-v1",
        "scope": "JobConfig.tasks[0].overwrite",
        "expected": False,
        "observed": "absent",
        "artifactMutation": False,
    },
    {
        "id": "harbor-jobconfig-n-attempts-default-omission-v1",
        "scope": "JobConfig.n_attempts",
        "expected": 1,
        "observed": "absent",
        "artifactMutation": False,
    },
]


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_value(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


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
    missing = sorted(allowed - set(value))
    if missing:
        raise ValueError(f"{label} is missing keys: {', '.join(missing)}")


def resolve_path(base: Path, value: Any, label: str) -> Path:
    text = require_string(value, label)
    candidate = Path(text)
    return Path(os.path.abspath(candidate if candidate.is_absolute() else base / candidate))


def required_file(path: Path, label: str) -> Path:
    path = Path(os.path.abspath(path))
    if not path.is_file() or path.is_symlink() or path.lstat().st_nlink != 1:
        raise ValueError(f"{label} must be an ordinary single-link file: {path}")
    return path


def validate_tree(path: Path, label: str) -> Path:
    path = Path(os.path.abspath(path))
    if not path.is_dir() or path.is_symlink():
        raise ValueError(f"{label} must be an ordinary directory: {path}")
    for node in path.rglob("*"):
        if node.is_symlink() or (node.is_file() and node.lstat().st_nlink != 1):
            raise ValueError(f"{label} contains a linked node: {node}")
        if not node.is_file() and not node.is_dir():
            raise ValueError(f"{label} contains an unsupported node: {node}")
    return path


def read_json(path: Path, label: str) -> dict[str, Any]:
    required_file(path, label)
    try:
        return require_mapping(json.loads(path.read_text(encoding="utf-8")), label)
    except json.JSONDecodeError as error:
        raise ValueError(f"{label} is not valid JSON: {error}") from error


def import_module(name: str, path: Path) -> Any:
    required_file(path, f"sealed module {name}")
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import sealed module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def expected_sealed_paths(contract: dict[str, Any]) -> set[Path]:
    script = Path(os.path.abspath(__file__))
    bundle = script.parent.parent
    generation = contract["path"].parent.parent
    return {
        script,
        script.with_name(f"{script.name}.lock"),
        bundle / "references" / "verifier-only-derivation-v3.md",
        contract["path"].parent / "run-generation-003-verifier-derivation-v3.sh",
        generation / "scripts" / "evidence-resolution-post-agent-v3.js",
        generation / "scripts" / "publish-generation-003-post-agent-v3.js",
    }


def load_contract(path: Path) -> dict[str, Any]:
    path = Path(os.path.abspath(path))
    raw = read_json(path, "derivation V3 contract")
    reject_unknown(
        raw,
        {
            "schemaVersion",
            "caseId",
            "derivationContract",
            "parentDerivationContract",
            "failedParentAttempt",
            "completionDirectory",
            "normalizations",
            "sealedFiles",
        },
        "derivation V3 contract",
    )
    if raw["schemaVersion"] != SCHEMA_VERSION or raw["derivationContract"] != CONTRACT_ID:
        raise ValueError("Unsupported derivation V3 contract.")
    if canonical_json(raw["normalizations"]) != canonical_json(NORMALIZATIONS):
        raise ValueError("V3 normalizations differ from the two exact default omissions.")
    base = path.parent
    parent = require_mapping(raw["parentDerivationContract"], "parentDerivationContract")
    failed = require_mapping(raw["failedParentAttempt"], "failedParentAttempt")
    reject_unknown(parent, {"path", "sha256"}, "parentDerivationContract")
    reject_unknown(
        failed,
        {
            "ownerPath",
            "ownerSha256",
            "ownerRecordDigest",
            "stagingPath",
            "artifactDigest",
            "directoryManifestDigest",
            "expectedFailure",
            "failurePhase",
        },
        "failedParentAttempt",
    )
    if failed["expectedFailure"] != EXPECTED_PARENT_FAILURE:
        raise ValueError("V3 failed-parent error fingerprint drifted.")
    if failed["failurePhase"] != "recovered-job-built-before-recovery-lock":
        raise ValueError("V3 failed-parent phase is unsupported.")
    sealed = []
    for index, raw_row in enumerate(require_list(raw["sealedFiles"], "sealedFiles")):
        row = require_mapping(raw_row, f"sealedFiles[{index}]")
        reject_unknown(row, {"path", "sha256"}, f"sealedFiles[{index}]")
        sealed.append(
            {
                "path": resolve_path(base, row["path"], f"sealedFiles[{index}].path"),
                "storedPath": require_string(row["path"], f"sealedFiles[{index}].path"),
                "sha256": require_digest(row["sha256"], f"sealedFiles[{index}].sha256"),
            }
        )
    contract = {
        "path": path,
        "caseId": require_string(raw["caseId"], "caseId"),
        "derivationContract": CONTRACT_ID,
        "parentDerivationContract": {
            "path": resolve_path(base, parent["path"], "parentDerivationContract.path"),
            "sha256": require_digest(parent["sha256"], "parentDerivationContract.sha256"),
        },
        "failedParentAttempt": {
            "ownerPath": resolve_path(base, failed["ownerPath"], "failedParentAttempt.ownerPath"),
            "ownerSha256": require_digest(failed["ownerSha256"], "failedParentAttempt.ownerSha256"),
            "ownerRecordDigest": require_digest(
                failed["ownerRecordDigest"], "failedParentAttempt.ownerRecordDigest"
            ),
            "stagingPath": resolve_path(base, failed["stagingPath"], "failedParentAttempt.stagingPath"),
            "artifactDigest": require_digest(failed["artifactDigest"], "failedParentAttempt.artifactDigest"),
            "directoryManifestDigest": require_digest(
                failed["directoryManifestDigest"],
                "failedParentAttempt.directoryManifestDigest",
            ),
            "expectedFailure": EXPECTED_PARENT_FAILURE,
            "failurePhase": failed["failurePhase"],
        },
        "completionDirectory": resolve_path(base, raw["completionDirectory"], "completionDirectory"),
        "normalizations": deepcopy(NORMALIZATIONS),
        "sealedFiles": sealed,
    }
    observed = {row["path"] for row in sealed}
    expected = {Path(os.path.abspath(item)) for item in expected_sealed_paths(contract)}
    if len(sealed) != len(expected) or observed != expected:
        raise ValueError("V3 sealedFiles differ from the exact six-file executable set.")
    for row in sealed:
        if digest_file(required_file(row["path"], "V3 sealed file")) != row["sha256"]:
            raise ValueError(f"V3 sealed file drifted: {row['path']}")
    return contract


def load_parent_v2(contract: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    binding = contract["parentDerivationContract"]
    parent_path = required_file(binding["path"], "parent V2 contract")
    if digest_file(parent_path) != binding["sha256"]:
        raise ValueError("Parent V2 contract hash drifted.")
    raw = read_json(parent_path, "parent V2 contract")
    rows = require_list(raw.get("sealedFiles"), "parent V2 sealedFiles")
    modules = []
    for index, raw_row in enumerate(rows):
        row = require_mapping(raw_row, f"parent V2 sealedFiles[{index}]")
        reject_unknown(row, {"path", "sha256"}, f"parent V2 sealedFiles[{index}]")
        file = resolve_path(parent_path.parent, row["path"], f"parent V2 seal {index}")
        expected = require_digest(row["sha256"], f"parent V2 seal {index} sha256")
        if digest_file(required_file(file, f"parent V2 seal {index}")) != expected:
            raise ValueError(f"Parent V2 seal drifted: {file}")
        if file.name == "complete_verifier_derivation_v2.py":
            modules.append(file)
    if len(rows) != 6 or len(modules) != 1:
        raise ValueError("Parent V2 contract does not expose its exact sealed builder.")
    v2 = import_module("sealed_verifier_derivation_v2_parent", modules[0])
    parent_contract = v2.load_contract(parent_path)
    return v2, parent_contract


def compare_tree(v1: Any, left: Path, right: Path, label: str) -> None:
    if canonical_json(v1.file_manifest(left)) != canonical_json(v1.file_manifest(right)):
        raise ValueError(f"{label} file bytes differ.")
    if v1.directory_manifest(left) != v1.directory_manifest(right):
        raise ValueError(f"{label} directory topology differs.")


def validate_failed_parent(
    contract: dict[str, Any],
    v2: Any,
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
) -> None:
    failed = contract["failedParentAttempt"]
    owner = required_file(failed["ownerPath"], "failed V2 owner")
    staging = validate_tree(failed["stagingPath"], "failed V2 staging")
    if digest_file(owner) != failed["ownerSha256"]:
        raise ValueError("Failed V2 owner bytes drifted.")
    owner_record = read_json(owner, "failed V2 owner")
    if owner_record.get("ownerRecordDigest") != failed["ownerRecordDigest"]:
        raise ValueError("Failed V2 owner record digest drifted.")
    v2.verify_owner(
        parent_v2,
        staging,
        parent_v2["completionDirectory"],
        owner,
    )
    if parent_v2["completionDirectory"].exists() or parent_v2["completionDirectory"].is_symlink():
        raise ValueError("Parent V2 unexpectedly published a completion.")
    files = v1.file_manifest(staging)
    directories = v1.directory_manifest(staging)
    if v1.digest_value(files) != failed["artifactDigest"]:
        raise ValueError("Failed V2 staging bytes drifted.")
    if v1.digest_value(directories) != failed["directoryManifestDigest"]:
        raise ValueError("Failed V2 staging topology drifted.")
    v1.require_direct_children(
        staging,
        {"v1-evidence", "compatibility-projection-build"},
        "failed V2 staging namespace",
    )
    build = staging / "compatibility-projection-build"
    v1.require_direct_children(
        build,
        {"input-snapshot", "verifier-runs", "recovered-job"},
        "failed V2 compatibility build",
    )
    work = v1.recovery_work_path(parent_v1)
    compare_tree(v1, work / "input-snapshot", build / "input-snapshot", "failed V2 input snapshot")
    compare_tree(v1, work / "verifier-runs", build / "verifier-runs", "failed V2 verifier runs")
    recovered = build / "recovered-job"
    native = state["nativeJobDirectory"]
    trial = state["nativeTrialName"]
    for relative in ("config.json", "lock.json", f"{trial}/config.json", f"{trial}/lock.json"):
        if (recovered / relative).read_bytes() != (native / relative).read_bytes():
            raise ValueError(f"Failed V2 recovered {relative} differs from native bytes.")
    evidence = staging / "v1-evidence"
    expected_v1 = parent_v2["parentRecoveryContract"]["sha256"]
    if digest_file(evidence / "call-contract.json") != expected_v1:
        raise ValueError("Failed V2 copied V1 call contract drifted.")
    if digest_file(evidence / "call-journal.json") != parent_v2["parentCallJournal"]["sha256"]:
        raise ValueError("Failed V2 copied call journal drifted.")
    try:
        with v2.exact_default_omission_adapter(state, v1):
            state["engine"].import_retry_job(
                state["sourceTrial"], recovered, 1, state["rewardKey"]
            )
    except ValueError as error:
        if str(error) != EXPECTED_PARENT_FAILURE:
            raise ValueError(f"Failed V2 error fingerprint drifted: {error}") from error
    else:
        raise ValueError("Failed V2 recovered job no longer reproduces its exact read-only failure.")


def validate_n_attempts_omission(state: dict[str, Any], v1: Any) -> None:
    native = state["nativeJobDirectory"]
    raw = read_json(native / "config.json", "native retry JobConfig")
    if "n_attempts" in raw:
        raise ValueError("V3 requires native JobConfig.n_attempts to be absent.")
    concurrent = raw.get("n_concurrent_trials")
    if isinstance(concurrent, bool) or not isinstance(concurrent, int) or concurrent != 1:
        raise ValueError("V3 requires explicit n_concurrent_trials: 1.")
    modeled = state["engine"].model_json(v1.JobConfig.model_validate(raw))
    attempts = modeled.get("n_attempts")
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts != 1:
        raise ValueError("Harbor/Pydantic no longer defaults n_attempts to 1.")


def is_exact_recovered_copy(directory: Path, state: dict[str, Any]) -> bool:
    directory = Path(os.path.abspath(directory))
    if directory == state["nativeJobDirectory"] or not directory.is_dir() or directory.is_symlink():
        return False
    native = state["nativeJobDirectory"]
    trial = state["nativeTrialName"]
    for relative in ("config.json", "lock.json", f"{trial}/config.json", f"{trial}/lock.json"):
        left = directory / relative
        right = native / relative
        if not left.is_file() or left.is_symlink() or left.read_bytes() != right.read_bytes():
            return False
    return True


@contextmanager
def exact_two_default_adapter(
    parent_adapter: Any, state: dict[str, Any], v1: Any
) -> Iterator[None]:
    engine = state["engine"]
    original_loader = engine.load_harbor_job

    def load_harbor_job(directory: Path, *args: Any, **kwargs: Any) -> dict[str, Any]:
        loaded = original_loader(directory, *args, **kwargs)
        directory = Path(os.path.abspath(directory))
        if not is_exact_recovered_copy(directory, state):
            return loaded
        raw = read_json(directory / "config.json", "recovered JobConfig default adapter")
        concurrent = raw.get("n_concurrent_trials")
        if (
            "n_attempts" in raw
            or isinstance(concurrent, bool)
            or not isinstance(concurrent, int)
            or concurrent != 1
        ):
            raise ValueError("Recovered JobConfig is not the exact omitted n_attempts default case.")
        modeled = engine.model_json(v1.JobConfig.model_validate(raw))
        attempts = modeled.get("n_attempts")
        if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts != 1:
            raise ValueError("Recovered JobConfig n_attempts default is not 1.")
        adapted = deepcopy(loaded)
        trials = require_list(adapted.get("trials"), "adapted recovered trials")
        if len(trials) != 1:
            raise ValueError("Adapted recovered job must contain one trial.")
        trial = require_mapping(trials[0], "adapted recovered trial")
        job_config = require_mapping(trial.get("jobConfig"), "adapted recovered JobConfig")
        if canonical_json(job_config) != canonical_json(raw):
            raise ValueError("Loaded recovered JobConfig differs from its raw bytes.")
        job_config["n_attempts"] = 1
        return adapted

    with parent_adapter(state, v1):
        engine.load_harbor_job = load_harbor_job
        try:
            yield
        finally:
            engine.load_harbor_job = original_loader


@contextmanager
def install_v3_adapter(v2: Any) -> Iterator[None]:
    original = v2.exact_default_omission_adapter

    @contextmanager
    def adapter(state: dict[str, Any], v1: Any) -> Iterator[None]:
        with exact_two_default_adapter(original, state, v1):
            yield

    v2.exact_default_omission_adapter = adapter
    try:
        yield
    finally:
        v2.exact_default_omission_adapter = original


def prepare(
    contract: dict[str, Any],
) -> tuple[Any, dict[str, Any], Any, dict[str, Any], dict[str, Any]]:
    v2, parent_v2 = load_parent_v2(contract)
    v1, parent_v1, state = v2.prepare(parent_v2)
    validate_n_attempts_omission(state, v1)
    validate_failed_parent(contract, v2, parent_v2, v1, parent_v1, state)
    return v2, parent_v2, v1, parent_v1, state


def write_new_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with path.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())


def seal_record(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = deepcopy(value)
    result.pop(field, None)
    result[field] = digest_value(result)
    return result


def copied_failure_evidence(
    contract: dict[str, Any], v1: Any, staging: Path, final: Path
) -> dict[str, Any]:
    root = staging / "v2-failed-attempt"
    root.mkdir()
    failed = contract["failedParentAttempt"]
    v1.copy_tree(failed["stagingPath"], root / "staging", "failed V2 staging evidence")
    v1.copy_sealed_file(
        failed["ownerPath"],
        root / "owner.json",
        failed["ownerSha256"],
        "failed V2 owner evidence",
    )
    parent_path = contract["parentDerivationContract"]["path"]
    v1.copy_sealed_file(
        parent_path,
        root / "parent-v2-contract.json",
        contract["parentDerivationContract"]["sha256"],
        "parent V2 contract evidence",
    )
    files = v1.file_manifest(root)
    directories = v1.directory_manifest(root)
    return {
        "directory": str(final / "v2-failed-attempt"),
        "artifactManifest": files,
        "artifactDigest": v1.digest_value(files),
        "directoryManifest": directories,
        "directoryManifestDigest": v1.digest_value(directories),
        "trust": "failed-derived-evidence-only",
        "originalOwnerPath": str(failed["ownerPath"]),
        "originalOwnerSha256": failed["ownerSha256"],
        "originalStagingPath": str(failed["stagingPath"]),
        "originalStagingArtifactDigest": failed["artifactDigest"],
        "originalStagingDirectoryManifestDigest": failed["directoryManifestDigest"],
    }


def completion_body(
    contract: dict[str, Any],
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
    evidence: dict[str, Any],
    v2: Any,
) -> dict[str, Any]:
    journal = v1.read_json(parent_v2["parentCallJournal"]["path"], "completed V1 journal")
    v3_seals = [
        {"path": row["storedPath"], "sha256": row["sha256"]}
        for row in contract["sealedFiles"]
    ]
    v2_seals = [
        {"path": row["storedPath"], "sha256": row["sha256"]}
        for row in parent_v2["sealedFiles"]
    ]
    failed = contract["failedParentAttempt"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": RECEIPT_KIND,
        "caseId": contract["caseId"],
        "derivationContract": CONTRACT_ID,
        "status": "completed",
        "parentV2": {
            "contractPath": str(contract["parentDerivationContract"]["path"]),
            "contractSha256": contract["parentDerivationContract"]["sha256"],
            "sealedFiles": v2_seals,
            "sealedSetDigest": digest_value(v2_seals),
            "failedOwnerPath": str(failed["ownerPath"]),
            "failedOwnerSha256": failed["ownerSha256"],
            "failedOwnerRecordDigest": failed["ownerRecordDigest"],
            "failedStagingPath": str(failed["stagingPath"]),
            "failedStagingArtifactDigest": failed["artifactDigest"],
            "failedStagingDirectoryManifestDigest": failed["directoryManifestDigest"],
            "failure": failed["expectedFailure"],
            "failurePhase": failed["failurePhase"],
            "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 0},
        },
        "baseRecovery": {
            "callJournalPath": str(parent_v2["parentCallJournal"]["path"]),
            "callJournalSha256": parent_v2["parentCallJournal"]["sha256"],
            "callJournalRecordDigest": journal["journalRecordDigest"],
            "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2},
        },
        "completion": {
            "contractPath": str(contract["path"]),
            "contractSha256": digest_file(contract["path"]),
            "sealedFiles": v3_seals,
            "sealedSetDigest": digest_value(v3_seals),
            "normalizations": contract["normalizations"],
            "execution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 0},
        },
        "aggregateExecution": {"harborCalls": 0, "modelCalls": 0, "verifierCalls": 2},
        "native": {
            "resumeLockSha256": parent_v1["native"]["resumeLockSha256"],
            "nativeRetryJobArtifactDigest": state["nativeRetryJobArtifactDigest"],
            "sourceAttemptRecordDigest": parent_v1["native"]["sourceAttemptRecordDigest"],
        },
        "v2FailureEvidence": evidence,
        "compatibilityProjection": v2.projection_body(v1, parent_v1, state),
    }


def verify_failure_evidence(contract: dict[str, Any], v1: Any, root: Path, body: dict[str, Any]) -> None:
    reject_unknown(
        body,
        {
            "directory",
            "artifactManifest",
            "artifactDigest",
            "directoryManifest",
            "directoryManifestDigest",
            "trust",
            "originalOwnerPath",
            "originalOwnerSha256",
            "originalStagingPath",
            "originalStagingArtifactDigest",
            "originalStagingDirectoryManifestDigest",
        },
        "V3 failure evidence",
    )
    if body["directory"] != str(root):
        raise ValueError("V3 failure evidence directory binding drifted.")
    if body["trust"] != "failed-derived-evidence-only":
        raise ValueError("V3 failed parent evidence was promoted to trusted input.")
    v1.require_direct_children(
        root,
        {"staging", "owner.json", "parent-v2-contract.json"},
        "V3 failure evidence namespace",
    )
    files = v1.file_manifest(root)
    directories = v1.directory_manifest(root)
    if canonical_json(files) != canonical_json(body["artifactManifest"]):
        raise ValueError("V3 failure evidence manifest drifted.")
    if v1.digest_value(files) != body["artifactDigest"]:
        raise ValueError("V3 failure evidence digest drifted.")
    if directories != body["directoryManifest"] or v1.digest_value(directories) != body["directoryManifestDigest"]:
        raise ValueError("V3 failure evidence topology drifted.")
    failed = contract["failedParentAttempt"]
    expected = {
        "originalOwnerPath": str(failed["ownerPath"]),
        "originalOwnerSha256": failed["ownerSha256"],
        "originalStagingPath": str(failed["stagingPath"]),
        "originalStagingArtifactDigest": failed["artifactDigest"],
        "originalStagingDirectoryManifestDigest": failed["directoryManifestDigest"],
    }
    for key, value in expected.items():
        if body[key] != value:
            raise ValueError(f"V3 failure evidence {key} drifted.")
    compare_tree(v1, failed["stagingPath"], root / "staging", "copied failed V2 staging")
    if digest_file(root / "owner.json") != failed["ownerSha256"]:
        raise ValueError("Copied failed V2 owner drifted.")
    if digest_file(root / "parent-v2-contract.json") != contract["parentDerivationContract"]["sha256"]:
        raise ValueError("Copied parent V2 contract drifted.")


def verify_receipt(
    contract: dict[str, Any],
    v2: Any,
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    root = validate_tree(contract["completionDirectory"], "completed derivation V3")
    v1.require_direct_children(
        root,
        {"v2-failed-attempt", "completion-receipt.json"},
        "completed derivation V3 namespace",
    )
    receipt = read_json(root / "completion-receipt.json", "derivation V3 receipt")
    digest = require_digest(receipt.get("completionRecordDigest"), "completionRecordDigest")
    body = deepcopy(receipt)
    body.pop("completionRecordDigest", None)
    if digest_value(body) != digest:
        raise ValueError("Derivation V3 receipt self-digest drifted.")
    evidence = require_mapping(body.get("v2FailureEvidence"), "receipt.v2FailureEvidence")
    verify_failure_evidence(contract, v1, root / "v2-failed-attempt", evidence)
    with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
        v2.verify_projection(v1, parent_v1, state)
    expected = completion_body(contract, parent_v2, v1, parent_v1, state, evidence, v2)
    if canonical_json(body) != canonical_json(expected):
        raise ValueError("Derivation V3 receipt differs from current sealed evidence.")
    return receipt


def owner_body(contract: dict[str, Any], staging: Path, final: Path) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": OWNER_KIND,
        "caseId": contract["caseId"],
        "contractSha256": digest_file(contract["path"]),
        "stagingDirectory": str(staging),
        "finalDirectory": str(final),
    }


def verify_owner(contract: dict[str, Any], staging: Path, final: Path, owner: Path) -> None:
    record = read_json(owner, "derivation V3 owner")
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
        "derivation V3 owner",
    )
    digest = require_digest(record.get("ownerRecordDigest"), "V3 ownerRecordDigest")
    body = deepcopy(record)
    body.pop("ownerRecordDigest", None)
    if digest_value(body) != digest or canonical_json(body) != canonical_json(owner_body(contract, staging, final)):
        raise ValueError("Derivation V3 owner binding drifted.")


def reconcile_staging(contract: dict[str, Any], v1: Any, staging: Path, final: Path, owner: Path) -> None:
    staging_exists = staging.exists() or staging.is_symlink()
    owner_exists = owner.exists() or owner.is_symlink()
    if not staging_exists and not owner_exists:
        return
    if not owner_exists:
        raise ValueError("Unreceipted V3 staging exists.")
    verify_owner(contract, staging, final, owner)
    if final.exists() or final.is_symlink():
        if staging_exists:
            raise ValueError("Completed V3 output and owned staging coexist.")
        owner.unlink()
        v1.fsync_directory(owner.parent)
        return
    if staging_exists:
        validate_tree(staging, "owned interrupted V3 staging")
        shutil.rmtree(staging)
    owner.unlink()
    v1.fsync_directory(owner.parent)


def live(
    contract: dict[str, Any],
    v2: Any,
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
) -> int:
    final = contract["completionDirectory"]
    staging = final.with_name(f".{final.name}.build")
    owner = final.with_name(f".{final.name}.owner.json")
    if final.exists() or final.is_symlink():
        if staging.exists() or staging.is_symlink() or owner.exists() or owner.is_symlink():
            with v1.writer_lock(v1.writer_lock_path(parent_v1), parent_v1):
                reconcile_staging(contract, v1, staging, final, owner)
        receipt = verify_receipt(contract, v2, parent_v2, v1, parent_v1, state)
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
    with v1.writer_lock(v1.writer_lock_path(parent_v1), parent_v1):
        # Re-prepare after taking the same writer lock as V1/V2.
        v1, parent_v1, state = v2.prepare(parent_v2)
        validate_n_attempts_omission(state, v1)
        validate_failed_parent(contract, v2, parent_v2, v1, parent_v1, state)
        reconcile_staging(contract, v1, staging, final, owner)
        # Another invocation may have published while this process waited for
        # the shared V1/V2 writer lock.  Re-check under that lock before
        # reserving an owner or creating staging.
        if final.exists() or final.is_symlink():
            receipt = verify_receipt(contract, v2, parent_v2, v1, parent_v1, state)
            print(json.dumps({
                "ok": True,
                "mode": "live-idempotent-after-lock",
                "completionRecordDigest": receipt["completionRecordDigest"],
                "harborCalls": 0,
                "modelCalls": 0,
                "verifierCalls": 0,
            }, indent=2))
            return 0
        write_new_json(owner, seal_record(owner_body(contract, staging, final), "ownerRecordDigest"))
        v1.fsync_directory(owner.parent)
        staging.mkdir()
        v1.fsync_directory(staging.parent)
        try:
            evidence = copied_failure_evidence(contract, v1, staging, final)
            failed_path = contract["failedParentAttempt"]["stagingPath"]
            failed_before = v1.digest_value(v1.file_manifest(failed_path))
            failed_directories_before = v1.digest_value(v1.directory_manifest(failed_path))
            failed_owner_before = digest_file(contract["failedParentAttempt"]["ownerPath"])
            with install_v3_adapter(v2):
                v2.complete_projection(v1, parent_v1, state, staging)
            if v1.digest_value(v1.file_manifest(failed_path)) != failed_before:
                raise ValueError("Failed V2 staging changed during V3 derivation.")
            if v1.digest_value(v1.directory_manifest(failed_path)) != failed_directories_before:
                raise ValueError("Failed V2 staging topology changed during V3 derivation.")
            if digest_file(contract["failedParentAttempt"]["ownerPath"]) != failed_owner_before:
                raise ValueError("Failed V2 owner changed during V3 derivation.")
            body = completion_body(contract, parent_v2, v1, parent_v1, state, evidence, v2)
            write_new_json(
                staging / "completion-receipt.json",
                seal_record(body, "completionRecordDigest"),
            )
            v1.fsync_tree(staging, "derivation V3 completion build")
            v1.rename_noreplace(staging, final, "derivation V3 receipt publication")
            owner.unlink()
            v1.fsync_directory(owner.parent)
        except Exception:
            raise
    receipt = verify_receipt(contract, v2, parent_v2, v1, parent_v1, state)
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


def doctor(contract: dict[str, Any], completed: bool, mode: str) -> int:
    print(json.dumps({
        "ok": True,
        "mode": mode,
        "caseId": contract["caseId"],
        "derivationContract": CONTRACT_ID,
        "parentV2Failed": True,
        "normalizations": contract["normalizations"],
        "alreadyCompleted": completed,
        "plannedHarborCalls": 0,
        "plannedModelCalls": 0,
        "plannedVerifierCalls": 0,
        "writes": 0,
    }, indent=2))
    return 0


def rehearse(
    contract: dict[str, Any],
    v2: Any,
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
) -> int:
    """Exercise build, finish, and verify against disposable copied call evidence."""

    temporary = Path(tempfile.mkdtemp(prefix="skill-arena-v3-rehearsal-"))
    failed_before = v1.digest_value(v1.file_manifest(contract["failedParentAttempt"]["stagingPath"]))
    failed_directories_before = v1.digest_value(
        v1.directory_manifest(contract["failedParentAttempt"]["stagingPath"])
    )
    failed_owner_before = digest_file(contract["failedParentAttempt"]["ownerPath"])
    journal_before = digest_file(v1.journal_path(parent_v1))
    work_before = v1.digest_value(v1.file_manifest(v1.recovery_work_path(parent_v1)))
    try:
        rehearsal = deepcopy(parent_v1)
        rehearsal["outputDirectory"] = temporary / "verifier-recovery" / "attempt-001"
        rehearsal["effectiveJobDirectory"] = (
            temporary
            / "effective-jobs"
            / "contrast-matrix-one-shot-answer"
            / "effective-job"
        )
        rehearsal_contract = deepcopy(contract)
        rehearsal_contract["completionDirectory"] = (
            temporary / "verifier-recovery-completion-v3" / "attempt-001"
        )
        rehearsal["outputDirectory"].parent.mkdir(parents=True)
        v1.copy_tree(
            v1.recovery_work_path(parent_v1),
            v1.recovery_work_path(rehearsal),
            "V3 rehearsal completed V1 work",
        )
        v1.copy_sealed_file(
            v1.journal_path(parent_v1),
            v1.journal_path(rehearsal),
            digest_file(v1.journal_path(parent_v1)),
            "V3 rehearsal completed V1 journal",
        )
        completion_final = rehearsal_contract["completionDirectory"]
        completion_final.parent.mkdir(parents=True)
        completion_staging = completion_final.with_name(f".{completion_final.name}.build")
        completion_staging.mkdir()
        evidence = copied_failure_evidence(
            rehearsal_contract,
            v1,
            completion_staging,
            completion_final,
        )
        with v1.writer_lock(v1.writer_lock_path(rehearsal), rehearsal):
            with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
                v2.complete_projection(v1, rehearsal, state, completion_staging)
                v2.verify_projection(v1, rehearsal, state)
            # Rehearse the two reachable post-call crash checkpoints before
            # sealing the V3 receipt.  recovery-result.json is published only
            # after the effective projection, so output-only cannot retain it.
            result_path = rehearsal["outputDirectory"] / "recovery-result.json"
            result_path.unlink()
            v1.fsync_directory(result_path.parent)
            shutil.rmtree(rehearsal["effectiveJobDirectory"])
            v1.fsync_directory(rehearsal["effectiveJobDirectory"].parent)
            output_only_staging = temporary / "checkpoint-output-only"
            output_only_staging.mkdir()
            with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
                v2.complete_projection(v1, rehearsal, state, output_only_staging)
                v2.verify_projection(v1, rehearsal, state)
            # Output plus effective, but no result, is the second reachable
            # checkpoint.  It must finish without changing the effective job.
            result_path.unlink()
            v1.fsync_directory(result_path.parent)
            output_effective_staging = temporary / "checkpoint-output-and-effective"
            output_effective_staging.mkdir()
            with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
                v2.complete_projection(v1, rehearsal, state, output_effective_staging)
                v2.verify_projection(v1, rehearsal, state)
            # Effective-without-output is ambiguous and must reject.
            displaced_output = temporary / "displaced-recovery-output"
            v1.rename_noreplace(
                rehearsal["outputDirectory"],
                displaced_output,
                "V3 rehearsal effective-only checkpoint setup",
            )
            invalid_staging = temporary / "checkpoint-effective-only"
            invalid_staging.mkdir()
            try:
                with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
                    v2.complete_projection(v1, rehearsal, state, invalid_staging)
            except ValueError as error:
                if str(error) != "Effective projection exists without its recovery output.":
                    raise
            else:
                raise ValueError("V3 rehearsal accepted effective output without recovery output.")
            v1.rename_noreplace(
                displaced_output,
                rehearsal["outputDirectory"],
                "V3 rehearsal effective-only checkpoint restoration",
            )
            with v2.forbidden_call_surfaces(v1, state), install_v3_adapter(v2):
                result = v2.verify_projection(v1, rehearsal, state)
            body = completion_body(
                rehearsal_contract,
                parent_v2,
                v1,
                rehearsal,
                state,
                evidence,
                v2,
            )
            write_new_json(
                completion_staging / "completion-receipt.json",
                seal_record(body, "completionRecordDigest"),
            )
            v1.fsync_tree(completion_staging, "V3 rehearsal completion build")
            v1.rename_noreplace(
                completion_staging,
                completion_final,
                "V3 rehearsal completion publication",
            )
        verify_receipt(
            rehearsal_contract,
            v2,
            parent_v2,
            v1,
            rehearsal,
            state,
        )
        v2.assert_projection_config_bytes(rehearsal, state)
        if v1.digest_value(v1.file_manifest(contract["failedParentAttempt"]["stagingPath"])) != failed_before:
            raise ValueError("Failed V2 staging changed during V3 rehearsal.")
        if v1.digest_value(v1.directory_manifest(contract["failedParentAttempt"]["stagingPath"])) != failed_directories_before:
            raise ValueError("Failed V2 staging topology changed during V3 rehearsal.")
        if digest_file(contract["failedParentAttempt"]["ownerPath"]) != failed_owner_before:
            raise ValueError("Failed V2 owner changed during V3 rehearsal.")
        if digest_file(v1.journal_path(parent_v1)) != journal_before:
            raise ValueError("Original V1 journal changed during V3 rehearsal.")
        if v1.digest_value(v1.file_manifest(v1.recovery_work_path(parent_v1))) != work_before:
            raise ValueError("Original V1 work changed during V3 rehearsal.")
        print(json.dumps({
            "ok": True,
            "mode": "rehearse",
            "semantic": result["classification"] == "semantic" and result["status"] == "evaluable",
            "reward": result["rewards"].get(state["rewardKey"]),
            "harborCalls": 0,
            "modelCalls": 0,
            "verifierCalls": 0,
            "workspaceWrites": 0,
        }, indent=2))
        return 0
    finally:
        shutil.rmtree(temporary, ignore_errors=False)


def publish_q003_staging(
    contract: dict[str, Any],
    v2: Any,
    parent_v2: dict[str, Any],
    v1: Any,
    parent_v1: dict[str, Any],
    state: dict[str, Any],
    raw_source: str,
    raw_destination: str,
) -> int:
    verify_receipt(contract, v2, parent_v2, v1, parent_v1, state)
    completion = contract["completionDirectory"]
    if (
        completion.name != "attempt-001"
        or completion.parent.name != "verifier-recovery-completion-v3"
        or completion.parents[2].name != "q003"
        or completion.parents[3].name != "resume"
    ):
        raise ValueError("V3 completion path cannot anchor q003 publication.")
    runtime = completion.parents[4]
    publication_parent = runtime / "publications"
    source = Path(os.path.abspath(raw_source))
    destination = Path(os.path.abspath(raw_destination))
    if destination != publication_parent / "q003":
        raise ValueError("q003 V3 destination is outside its fixed runtime namespace.")
    if source.parent != publication_parent or not UUID_STAGE.fullmatch(source.name):
        raise ValueError("q003 V3 source is not an invocation-owned UUID staging tree.")
    v1.require_direct_children(
        source,
        {"result.json", "report.md", "derivation-v3-receipt.json"},
        "q003 derivation V3 staging",
    )
    for name in ("result.json", "report.md", "derivation-v3-receipt.json"):
        v1.required_regular_file(source / name, f"q003 derivation V3 {name}")
    v1.fsync_tree(source, "q003 derivation V3 publication build")
    v1.rename_noreplace(source, destination, "q003 derivation V3 publication")
    print(json.dumps({
        "ok": True,
        "mode": "publish-q003-staging",
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
    modes.add_argument("--rehearse", action="store_true")
    modes.add_argument("--publish-q003-staging", nargs=2, metavar=("SOURCE", "DESTINATION"))
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        contract = load_contract(Path(os.path.abspath(args.contract)))
        v2, parent_v2, v1, parent_v1, state = prepare(contract)
        if args.doctor:
            return doctor(contract, contract["completionDirectory"].exists(), "doctor")
        if args.dry_run:
            return doctor(contract, contract["completionDirectory"].exists(), "dry-run")
        if args.verify:
            receipt = verify_receipt(contract, v2, parent_v2, v1, parent_v1, state)
            print(json.dumps({
                "ok": True,
                "mode": "verify",
                "completionRecordDigest": receipt["completionRecordDigest"],
                "harborCalls": 0,
                "modelCalls": 0,
                "verifierCalls": 0,
            }, indent=2))
            return 0
        if args.rehearse:
            return rehearse(contract, v2, parent_v2, v1, parent_v1, state)
        if args.publish_q003_staging:
            return publish_q003_staging(
                contract,
                v2,
                parent_v2,
                v1,
                parent_v1,
                state,
                args.publish_q003_staging[0],
                args.publish_q003_staging[1],
            )
        return live(contract, v2, parent_v2, v1, parent_v1, state)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
