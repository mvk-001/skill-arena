# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Atomically publish the append-only q003 V4 JavaScript-parity result."""

from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Sequence


CONTRACT_ID = "harbor-0.18.0.verifier-recovery-v3.native-harbor-ordinary-json.js-parity-v4"
RECEIPT_KIND = "generation-003-q003-verification-v4-publication-receipt"
COMPLETION_MODE = "verifier-only-recovery-derivation-v4-js-parity"
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
BARE_SHA256 = re.compile(r"^[0-9a-f]{64}$")
STAGING = re.compile(r"^\.q003\.verification-v4-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
PUBLICATION_FILES = ("result.json", "report.md", "verification-v4-receipt.json")
CROSS_BINDINGS = [
    "recoveryLockSha256",
    "recoveryRecordDigest",
    "recoveryResultSha256",
    "recoveryResultDigest",
    "effectiveJobDigest",
    "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest",
    "resumeManifestSha256",
]
COMPATIBILITY_PROJECTION_KEYS = {
    "effectiveJobDigest",
    "effectiveJobDirectory",
    "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest",
    "recoveryLockSha256",
    "recoveryOutputDirectory",
    "recoveryRecordDigest",
    "recoveryResultDigest",
    "recoveryResultSha256",
    "resumeManifestSha256",
    "schemaCompatibility",
}
NORMALIZATION = [
    {
        "id": "harbor-native-artifact-ordinary-json-boundary-v1",
        "scope": ["JobResult", "TrialResult", "lock.json", "source config.json"],
        "parser": "ordinary-json",
        "byteTrust": "manifest-bound-only",
        "pythonCanonicalRecoveryRecordsUnchanged": True,
        "artifactMutation": False,
    },
    {
        "id": "python-codepoint-manifest-order-v1",
        "scope": ["file manifests", "manifest path assertions", "terminal key assertions"],
        "ordering": "python-codepoint",
        "artifactMutation": False,
    },
    {
        "id": "harbor-recovered-trial-lock-default-projection-v1",
        "comparisonContract": "harbor-0.18.0.trial-lock-default-projection-v1",
        "artifactShapes": {
            "nativeTrialResult": {
                "environmentPresentNullFields": [
                    "import_path", "override_cpus", "override_memory_mb",
                    "override_storage_mb", "override_gpus", "override_tpu",
                ],
                "verifierPresentNullFields": ["override_timeout_sec", "max_timeout_sec"],
                "resumeProvenance": "forbidden",
            },
            "effectiveSourceConfig": {
                "environmentExactSourceKeys": ["mounts", "type"],
                "environmentOmittedLockDefaults": {
                    "force_build": False,
                    "delete": True,
                    "cpu_enforcement_policy": "auto",
                    "memory_enforcement_policy": "auto",
                    "extra_docker_compose": [],
                    "kwargs": {},
                    "extra_allowed_hosts": [],
                },
                "verifier": "absent",
                "lockVerifierEquivalent": {"disable": False},
                "resumeProvenance": "required-digest-pair",
            },
        },
        "artifactMutation": False,
    },
]
SEALED_RELATIVE_PATHS = {
    "../scripts/evidence-resolution-post-agent-v4-legacy.js",
    "../scripts/publish-generation-003-v4.js",
    "../scripts/publish-generation-003-post-agent-v4-legacy.js",
    "../scripts/evidence-resolution-post-agent-v4.js",
    "../scripts/publish-generation-003-post-agent-v4.js",
    "run-generation-003-baseline-v4.sh",
    "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v4.py",
    "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v4.py.lock",
    "../../../../../skills/harbor-resume-external-failures/references/verifier-js-parity-v4.md",
}
SHARED_RELATIVE_PATHS = {
    "../scripts/evidence-resolution.js",
    "../scripts/prepare-generation-003.js",
    "../scripts/publish-generation-003.js",
    "../../generation-002/scripts/prepare-generation-002.js",
    "../../scripts/prepare-meta-evolution.js",
    "../../scripts/publish-meta-evolution.js",
    "../../../../../package.json",
    "../../../../../package-lock.json",
}


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def canonical_pretty(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def object_digest(value: Any) -> str:
    return hashlib.sha256(canonical_pretty(value)).hexdigest()


def compact_digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not valid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    return value


def require_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ValueError(f"{label} keys drifted.")


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string.")
    return value


def require_digest(value: Any, label: str) -> str:
    value = require_string(value, label)
    if not SHA256.fullmatch(value):
        raise ValueError(f"{label} must be sha256:<lowercase hex>.")
    return value


def resolve(base: Path, raw: Any, label: str) -> Path:
    text = require_string(raw, label).replace("\\", "/")
    match = re.fullmatch(r"/mnt/([a-zA-Z])(?:/(.*))?", text)
    if os.name == "nt" and match:
        text = f"{match.group(1).upper()}:/{match.group(2) or ''}"
    candidate = Path(text)
    return Path(os.path.abspath(candidate if candidate.is_absolute() else base / candidate))


def import_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot import sealed V3 builder: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_contract(path: Path) -> dict[str, Any]:
    path = Path(os.path.abspath(path))
    body = read_json(path, "V4 verification contract")
    require_keys(
        body,
        {
            "schemaVersion", "caseId", "verificationContract", "parentV3",
            "parentLegacyResolver", "pythonVerifier", "normalization", "crossBindings", "sealedFiles", "sharedFiles",
        },
        "V4 verification contract",
    )
    if body["schemaVersion"] != 4 or body["verificationContract"] != CONTRACT_ID:
        raise ValueError("Unsupported V4 verification contract.")
    if body["normalization"] != NORMALIZATION:
        raise ValueError("V4 normalization declaration drifted.")
    if body["crossBindings"] != CROSS_BINDINGS:
        raise ValueError("V4 cross-binding declaration drifted.")
    rows = body["sealedFiles"]
    if not isinstance(rows, list) or len(rows) != 9:
        raise ValueError("V4 contract must seal exactly nine executable/reference files.")
    observed: set[Path] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"V4 sealedFiles[{index}] must be an object.")
        require_keys(row, {"path", "sha256"}, f"V4 sealedFiles[{index}]")
        file = resolve(path.parent, row["path"], f"V4 sealedFiles[{index}].path")
        expected = require_digest(row["sha256"], f"V4 sealedFiles[{index}].sha256")
        if file in observed or not file.is_file() or file.is_symlink() or file.stat().st_nlink != 1:
            raise ValueError(f"V4 sealed file is duplicate or unsafe: {file}")
        if digest_file(file) != expected:
            raise ValueError(f"V4 sealed file drifted: {file}")
        observed.add(file)
    expected_paths = {
        resolve(path.parent, relative, "V4 expected sealed file")
        for relative in SEALED_RELATIVE_PATHS
    }
    if observed != expected_paths:
        raise ValueError("V4 sealed files differ from the exact executable/reference set.")
    script = Path(os.path.abspath(__file__))
    if script not in observed:
        raise ValueError("V4 atomic publisher is not in the sealed executable set.")
    shared_rows = body["sharedFiles"]
    if not isinstance(shared_rows, list) or len(shared_rows) != 8:
        raise ValueError("V4 contract must bind exactly eight shared TCB files.")
    shared_observed: set[Path] = set()
    for index, row in enumerate(shared_rows):
        if not isinstance(row, dict):
            raise ValueError(f"V4 sharedFiles[{index}] must be an object.")
        require_keys(row, {"path", "sha256"}, f"V4 sharedFiles[{index}]")
        file = resolve(path.parent, row["path"], f"V4 sharedFiles[{index}].path")
        expected = require_digest(row["sha256"], f"V4 sharedFiles[{index}].sha256")
        if file in shared_observed or not file.is_file() or file.is_symlink() or file.stat().st_nlink != 1:
            raise ValueError(f"V4 shared TCB file is duplicate or unsafe: {file}")
        if digest_file(file) != expected:
            raise ValueError(f"V4 shared TCB file drifted: {file}")
        shared_observed.add(file)
    expected_shared = {
        resolve(path.parent, relative, "V4 expected shared TCB file")
        for relative in SHARED_RELATIVE_PATHS
    }
    if shared_observed != expected_shared or observed & shared_observed:
        raise ValueError("V4 shared files differ from the exact transitive TCB set.")
    legacy = body["parentLegacyResolver"]
    if not isinstance(legacy, dict):
        raise ValueError("V4 parentLegacyResolver must be an object.")
    require_keys(legacy, {"path", "sha256"}, "V4 parentLegacyResolver")
    legacy_path = resolve(path.parent, legacy["path"], "parentLegacyResolver.path")
    if digest_file(legacy_path) != require_digest(legacy["sha256"], "parentLegacyResolver.sha256"):
        raise ValueError("V4 parent legacy resolver drifted.")
    return {
        "path": path,
        "sha256": digest_file(path),
        "body": body,
        "sealedPaths": observed,
        "sharedPaths": shared_observed,
    }


def verify_parent_v3(contract: dict[str, Any]) -> tuple[Any, dict[str, Any], dict[str, Any], Any]:
    base = contract["path"].parent
    parent = contract["body"]["parentV3"]
    if not isinstance(parent, dict):
        raise ValueError("V4 parentV3 must be an object.")
    require_keys(
        parent,
        {"contractPath", "contractSha256", "receiptPath", "receiptSha256", "completionRecordDigest"},
        "V4 parentV3",
    )
    parent_contract = resolve(base, parent["contractPath"], "parentV3.contractPath")
    parent_receipt = resolve(base, parent["receiptPath"], "parentV3.receiptPath")
    if digest_file(parent_contract) != require_digest(parent["contractSha256"], "parentV3.contractSha256"):
        raise ValueError("Parent V3 contract drifted.")
    if digest_file(parent_receipt) != require_digest(parent["receiptSha256"], "parentV3.receiptSha256"):
        raise ValueError("Parent V3 receipt drifted.")
    python = contract["body"]["pythonVerifier"]
    if not isinstance(python, dict):
        raise ValueError("V4 pythonVerifier must be an object.")
    require_keys(python, {"builderPath", "builderSha256"}, "V4 pythonVerifier")
    builder_path = resolve(base, python["builderPath"], "pythonVerifier.builderPath")
    if digest_file(builder_path) != require_digest(python["builderSha256"], "pythonVerifier.builderSha256"):
        raise ValueError("Sealed V3 builder drifted.")
    builder = import_module("sealed_v3_q003_parent_verifier", builder_path)
    v3_contract = builder.load_contract(parent_contract)
    v2, parent_v2, v1, parent_v1, state = builder.prepare(v3_contract)
    receipt = builder.verify_receipt(v3_contract, v2, parent_v2, v1, parent_v1, state)
    expected_record = require_digest(parent["completionRecordDigest"], "parentV3.completionRecordDigest")
    if receipt.get("completionRecordDigest") != expected_record:
        raise ValueError("Parent V3 completion record drifted.")
    projection = receipt.get("compatibilityProjection")
    if not isinstance(projection, dict) or set(projection) != COMPATIBILITY_PROJECTION_KEYS:
        raise ValueError("Parent V3 compatibility projection keys drifted.")
    for key in CROSS_BINDINGS:
        require_digest(projection[key], f"parent V3 compatibilityProjection.{key}")
    return builder, v3_contract, receipt, v1


def verify_publication_receipt(
    contract: dict[str, Any],
    source: Path,
    parent_receipt: dict[str, Any],
) -> None:
    receipt_path = source / "verification-v4-receipt.json"
    receipt = read_json(receipt_path, "q003 V4 publication receipt")
    require_keys(
        receipt,
        {
            "schemaVersion", "kind", "verificationMode", "publicationSha256",
            "publicationDirectory", "publicationResultFileSha256", "publicationReportFileSha256",
            "completionMode", "completion", "aggregateRecoveryCalls", "receiptSha256",
        },
        "q003 V4 publication receipt",
    )
    if receipt["schemaVersion"] != 4 or receipt["kind"] != RECEIPT_KIND:
        raise ValueError("Unsupported q003 V4 publication receipt.")
    if receipt["verificationMode"] != "sealed-publication-receipt" or receipt["publicationDirectory"] != "publications/q003":
        raise ValueError("q003 V4 publication receipt mode/path drifted.")
    if receipt["completionMode"] != COMPLETION_MODE:
        raise ValueError("q003 V4 completion mode drifted.")
    if receipt["aggregateRecoveryCalls"] != {"harbor": 0, "model": 0, "verifier": 2}:
        raise ValueError("q003 V4 aggregate recovery calls drifted.")
    completion = receipt["completion"]
    if not isinstance(completion, dict):
        raise ValueError("q003 V4 completion must be an object.")
    require_keys(
        completion,
        {
            "contract", "contractFileSha256", "parentV3ContractSha256",
            "parentV3ReceiptFileSha256", "parentV3CompletionRecordDigest",
            "parserBoundary", "normalization", "crossBindingDigest", "execution",
        },
        "q003 V4 completion",
    )
    contract_hash = digest_file(contract["path"])
    parent = contract["body"]["parentV3"]
    if completion.get("contract") != CONTRACT_ID or completion.get("contractFileSha256") != contract_hash:
        raise ValueError("q003 V4 contract binding drifted.")
    if completion.get("parentV3ContractSha256") != parent["contractSha256"]:
        raise ValueError("q003 V4 parent contract binding drifted.")
    if completion.get("parentV3ReceiptFileSha256") != parent["receiptSha256"]:
        raise ValueError("q003 V4 parent receipt binding drifted.")
    if completion.get("parentV3CompletionRecordDigest") != parent["completionRecordDigest"]:
        raise ValueError("q003 V4 parent record binding drifted.")
    if completion.get("execution") != {"harbor": 0, "model": 0, "verifier": 0}:
        raise ValueError("q003 V4 completion calls drifted.")
    if completion.get("normalization") != contract["body"]["normalization"]:
        raise ValueError("q003 V4 normalization binding drifted.")
    if completion.get("parserBoundary") != "native-manifest-bound-ordinary-json+python-codepoint-order/recovery-python-score-json-v4":
        raise ValueError("q003 V4 parser boundary drifted.")
    projection = parent_receipt.get("compatibilityProjection")
    if not isinstance(projection, dict) or set(projection) != COMPATIBILITY_PROJECTION_KEYS:
        raise ValueError("Parent V3 compatibility projection drifted during q003 publication.")
    cross_projection = {key: require_digest(projection[key], f"parent V3 compatibilityProjection.{key}") for key in CROSS_BINDINGS}
    if completion.get("crossBindingDigest") != compact_digest(cross_projection):
        raise ValueError("q003 V4 cross-binding digest drifted.")
    result = read_json(source / "result.json", "q003 V4 publication result")
    publication_sha = result.get("publicationSha256")
    if not isinstance(publication_sha, str) or not BARE_SHA256.fullmatch(publication_sha):
        raise ValueError("q003 V4 publicationSha256 must be lowercase hex.")
    result_body = deepcopy(result)
    result_body.pop("publicationSha256", None)
    if object_digest(result_body) != publication_sha or receipt["publicationSha256"] != publication_sha:
        raise ValueError("q003 V4 publication result self-digest drifted.")
    provenance = result.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("q003 V4 publication provenance must be an object.")
    if provenance.get("postAgentVerificationContractFileSha256") != contract["sha256"]:
        raise ValueError("q003 V4 public contract binding drifted.")
    contrast = provenance.get("contrastResume")
    if not isinstance(contrast, dict):
        raise ValueError("q003 V4 contrast-resume provenance must be an object.")
    public_bindings = {
        "recoveryLockSha256": "recoveryLockFileSha256",
        "recoveryRecordDigest": "recoveryRecordDigest",
        "recoveryResultSha256": "recoveryResultFileSha256",
        "recoveryResultDigest": "recoveryResultDigest",
        "effectiveJobDigest": "effectiveJobDigest",
        "nativeRetryJobArtifactDigest": "nativeRetryJobArtifactDigest",
        "recoveredJobArtifactDigest": "recoveredJobArtifactDigest",
        "resumeManifestSha256": "manifestFileSha256",
    }
    for projection_key, public_key in public_bindings.items():
        if contrast.get(public_key) != cross_projection[projection_key]:
            raise ValueError(f"q003 V4 public cross-binding {projection_key} drifted.")
    result_hash = digest_file(source / "result.json")
    report_hash = digest_file(source / "report.md")
    if receipt["publicationResultFileSha256"] != result_hash or receipt["publicationReportFileSha256"] != report_hash:
        raise ValueError("q003 V4 publication file hash drifted.")
    seal = receipt.get("receiptSha256")
    if not isinstance(seal, str) or not BARE_SHA256.fullmatch(seal):
        raise ValueError("q003 V4 receiptSha256 must be lowercase hex.")
    body = deepcopy(receipt)
    body.pop("receiptSha256", None)
    if object_digest(body) != seal:
        raise ValueError("q003 V4 publication receipt self-digest drifted.")


def verify_publication_tree(
    v1: Any,
    contract: dict[str, Any],
    parent_receipt: dict[str, Any],
    root: Path,
    label: str,
) -> None:
    v1.require_direct_children(root, set(PUBLICATION_FILES), label)
    for name in PUBLICATION_FILES:
        v1.required_regular_file(root / name, f"{label} {name}")
    verify_publication_receipt(contract, root, parent_receipt)


def publications_equal(left: Path, right: Path) -> bool:
    return all((left / name).read_bytes() == (right / name).read_bytes() for name in PUBLICATION_FILES)


def publish(contract: dict[str, Any], raw_source: str, raw_destination: str) -> int:
    _builder, v3_contract, parent_receipt, v1 = verify_parent_v3(contract)
    completion = v3_contract["completionDirectory"]
    if (
        completion.name != "attempt-001"
        or completion.parent.name != "verifier-recovery-completion-v3"
        or completion.parents[2].name != "q003"
        or completion.parents[3].name != "resume"
    ):
        raise ValueError("Parent V3 completion cannot anchor q003 V4 publication.")
    runtime = completion.parents[4]
    publication_parent = runtime / "publications"
    source = Path(os.path.abspath(raw_source))
    destination = Path(os.path.abspath(raw_destination))
    if destination != publication_parent / "q003":
        raise ValueError("q003 V4 destination is outside its fixed runtime namespace.")
    if source.parent != publication_parent or not STAGING.fullmatch(source.name):
        raise ValueError("q003 V4 source is not an invocation-owned UUID staging tree.")
    verify_publication_tree(v1, contract, parent_receipt, source, "q003 verification V4 staging")

    # Re-open every contract and parent binding after validation. This closes the
    # mutation window between the first V3 attestation and the no-replace commit.
    final_contract = load_contract(contract["path"])
    if final_contract["sha256"] != contract["sha256"] or final_contract["body"] != contract["body"]:
        raise ValueError("V4 verification contract changed before publication.")
    _final_builder, final_v3_contract, final_parent_receipt, final_v1 = verify_parent_v3(final_contract)
    if final_v3_contract != v3_contract:
        raise ValueError("Parent V3 contract changed before publication.")
    verify_publication_tree(final_v1, final_contract, final_parent_receipt, source, "q003 verification V4 final staging")
    final_v1.fsync_tree(source, "q003 verification V4 publication build")
    try:
        final_v1.rename_noreplace(source, destination, "q003 verification V4 publication")
        published = True
    except ValueError as error:
        if "destination already exists" not in str(error) or not destination.exists():
            raise
        verify_publication_tree(
            final_v1,
            final_contract,
            final_parent_receipt,
            destination,
            "existing q003 verification V4 publication",
        )
        if not publications_equal(source, destination):
            raise ValueError("Existing q003 V4 publication differs from the verified staging tree.") from error
        published = False
    print(json.dumps({
        "ok": True,
        "mode": "publish-q003-verification-v4",
        "published": published,
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
    }, indent=2))
    return 0


def verify_parent(contract: dict[str, Any]) -> int:
    _builder, _v3_contract, receipt, _v1 = verify_parent_v3(contract)
    final_contract = load_contract(contract["path"])
    if final_contract["sha256"] != contract["sha256"] or final_contract["body"] != contract["body"]:
        raise ValueError("V4 verification contract changed during parent verification.")
    projection = receipt["compatibilityProjection"]
    cross_projection = {key: projection[key] for key in CROSS_BINDINGS}
    print(json.dumps({
        "ok": True,
        "mode": "verify-parent",
        "completionRecordDigest": receipt["completionRecordDigest"],
        "crossBindingDigest": compact_digest(cross_projection),
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
        "writes": 0,
    }, indent=2))
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    parser.add_argument("source", nargs="?")
    parser.add_argument("destination", nargs="?")
    parser.add_argument("--verify-parent", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.verify_parent:
            if args.source is not None or args.destination is not None:
                raise ValueError("--verify-parent does not accept source or destination.")
            return verify_parent(load_contract(args.contract))
        if args.source is None or args.destination is None:
            raise ValueError("Publication requires source and destination.")
        return publish(load_contract(args.contract), args.source, args.destination)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
