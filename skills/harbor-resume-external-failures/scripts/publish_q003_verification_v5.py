# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Atomically publish q003 across an exact JavaScript-serialization boundary."""

from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any, Sequence


CONTRACT_ID = "harbor-0.18.0.q003-publication-javascript-number-token-parity-v5"
PARENT_V4_ID = "harbor-0.18.0.verifier-recovery-v3.native-harbor-ordinary-json.js-parity-v4"
PARENT_V4_SHA256 = "sha256:0d17825136d07069302e39dac9cc5737fc6adfa7ff06666cf097f052a7591394"
RECEIPT_KIND = "generation-003-q003-publication-v5-receipt"
VERIFICATION_MODE = "sealed-v4-publication+javascript-number-token-parity-v5"
COMPLETION_MODE = "verifier-only-recovery-derivation-v4-js-parity"
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
BARE_SHA256 = re.compile(r"^[0-9a-f]{64}$")
STAGING = re.compile(r"^\.q003\.verification-v5-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
PUBLICATION_FILES = ("result.json", "report.md", "verification-v5-receipt.json")
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
PUBLIC_BINDINGS = ["postAgentVerificationContractFileSha256", *CROSS_BINDINGS]
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
PUBLIC_CROSS_BINDINGS = {
    "recoveryLockSha256": "recoveryLockFileSha256",
    "recoveryRecordDigest": "recoveryRecordDigest",
    "recoveryResultSha256": "recoveryResultFileSha256",
    "recoveryResultDigest": "recoveryResultDigest",
    "effectiveJobDigest": "effectiveJobDigest",
    "nativeRetryJobArtifactDigest": "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest": "recoveredJobArtifactDigest",
    "resumeManifestSha256": "manifestFileSha256",
}
SERIALIZATION_BOUNDARY = {
    "id": "javascript-canonical-root-member-elision-v1",
    "scope": "result.json root publicationSha256",
    "parser": "strict-utf8-json-no-bom-no-duplicate-keys",
    "layout": "LF-only-two-space-JavaScript-canonical-pretty",
    "rootMember": "publicationSha256",
    "memberLineCount": 1,
    "bodyDigest": "sha256(exact-result-bytes-after-root-member-line-elision)",
    "javascriptNumberTokens": "preserved-verbatim",
    "artifactMutation": False,
}
FAILURE_REPRODUCTION = {
    "error": "q003 V4 publication result self-digest drifted.",
    "jsonPointer": "/thresholds/passThreshold",
    "storedJavaScriptObjectDigest": "sha256:31ff94e2b9088d7896c6504a3b2499a4eeeb174818a741aa1dcfe5dddcb5b2b3",
    "pythonObjectDigest": "sha256:3f52311e63f8e0259251fd4de0f9d4c11cd8194c47d5b6062bf70418f04676d2",
    "javascriptCanonicalLength": 10764,
    "pythonCanonicalLength": 10761,
    "firstDifferenceLine": 224,
    "firstDifferenceColumn": 22,
}
SEALED_RELATIVE_PATHS = {
    "../scripts/publish-generation-003-post-agent-v5.js",
    "run-generation-003-q003-publication-v5.sh",
    "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v5.py",
    "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v5.py.lock",
    "../../../../../skills/harbor-resume-external-failures/references/q003-publication-number-parity-v5.md",
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


def required_regular_file(path: Path, label: str) -> Path:
    resolved = Path(os.path.abspath(path))
    metadata = os.lstat(resolved)
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or metadata.st_nlink != 1:
        raise ValueError(f"{label} must be an ordinary single-link file: {resolved}")
    return resolved


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def reject_non_json_constant(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant: {value}")


def read_strict_json(path: Path, label: str, *, canonical_python: bool = False) -> tuple[bytes, dict[str, Any]]:
    file = required_regular_file(path, label)
    raw = file.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"{label} must not contain a UTF-8 BOM.")
    if b"\r" in raw or b"\t" in raw:
        raise ValueError(f"{label} must use LF and spaces only.")
    if not raw.startswith(b"{\n") or not raw.endswith(b"}\n") or raw.endswith(b"}\n\n"):
        raise ValueError(f"{label} canonical root layout drifted.")
    if any(line.endswith(b" ") for line in raw.splitlines()):
        raise ValueError(f"{label} contains trailing whitespace.")
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_non_json_constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"Cannot read {label}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    if canonical_python and raw != canonical_pretty(value):
        raise ValueError(f"{label} canonical Python layout drifted.")
    return raw, value


def read_json(path: Path, label: str) -> dict[str, Any]:
    return read_strict_json(path, label)[1]


def javascript_publication_body_digest(raw: bytes, result: dict[str, Any]) -> str:
    publication_sha = result.get("publicationSha256")
    if not isinstance(publication_sha, str) or not BARE_SHA256.fullmatch(publication_sha):
        raise ValueError("q003 V5 publicationSha256 must be lowercase hex.")
    member = f'  "publicationSha256": "{publication_sha}",\n'.encode("ascii")
    lines = raw.splitlines(keepends=True)
    member_lines = [index for index, line in enumerate(lines) if line == member]
    if len(member_lines) != 1:
        raise ValueError("q003 V5 canonical root publicationSha256 member count drifted.")
    index = member_lines[0]
    body_raw = b"".join(lines[:index] + lines[index + 1:])
    _body_bytes, body = read_strict_json_bytes(body_raw, "q003 V5 publication body")
    expected = deepcopy(result)
    expected.pop("publicationSha256", None)
    if body != expected:
        raise ValueError("q003 V5 root-member elision changed publication semantics.")
    return hashlib.sha256(body_raw).hexdigest()


def read_strict_json_bytes(raw: bytes, label: str) -> tuple[bytes, dict[str, Any]]:
    if raw.startswith(b"\xef\xbb\xbf") or b"\r" in raw or b"\t" in raw:
        raise ValueError(f"{label} encoding/layout drifted.")
    if not raw.startswith(b"{\n") or not raw.endswith(b"}\n") or raw.endswith(b"}\n\n"):
        raise ValueError(f"{label} canonical root layout drifted.")
    if any(line.endswith(b" ") for line in raw.splitlines()):
        raise ValueError(f"{label} contains trailing whitespace.")
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_non_json_constant,
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"Cannot read {label}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    return raw, value


def require_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ValueError(f"{label} keys drifted.")


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string.")
    return value


def require_digest(value: Any, label: str) -> str:
    text = require_string(value, label)
    if not SHA256.fullmatch(text):
        raise ValueError(f"{label} must be sha256:<lowercase hex>.")
    return text


def resolve(base: Path, raw: Any, label: str) -> Path:
    value = require_string(raw, label).replace("/", os.sep)
    return Path(os.path.abspath(base / value))


def import_module(name: str, path: Path) -> Any:
    file = required_regular_file(path, name)
    spec = importlib.util.spec_from_file_location(name, file)
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot import sealed helper: {file}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_contract(path: Path) -> dict[str, Any]:
    file = required_regular_file(Path(os.path.abspath(path)), "V5 publication contract")
    before = digest_file(file)
    body = read_json(file, "V5 publication contract")
    require_keys(
        body,
        {
            "schemaVersion", "caseId", "publicationContract", "parentV4", "failureReproduction",
            "serializationBoundary", "publicBindings", "sealedFiles",
        },
        "V5 publication contract",
    )
    if body["schemaVersion"] != 5 or body["publicationContract"] != CONTRACT_ID:
        raise ValueError("Unsupported V5 publication contract.")
    if body["failureReproduction"] != FAILURE_REPRODUCTION:
        raise ValueError("V5 failure reproduction declaration drifted.")
    if body["serializationBoundary"] != SERIALIZATION_BOUNDARY:
        raise ValueError("V5 JavaScript serialization-boundary declaration drifted.")
    if body["publicBindings"] != PUBLIC_BINDINGS:
        raise ValueError("V5 public-binding declaration drifted.")
    parent = body["parentV4"]
    if not isinstance(parent, dict):
        raise ValueError("V5 parentV4 must be an object.")
    require_keys(parent, {"contractPath", "contractSha256", "verificationContract"}, "V5 parentV4")
    if parent["contractSha256"] != PARENT_V4_SHA256 or parent["verificationContract"] != PARENT_V4_ID:
        raise ValueError("V5 parent V4 declaration drifted.")
    parent_path = required_regular_file(resolve(file.parent, parent["contractPath"], "parentV4.contractPath"), "V5 parent V4 contract")
    if digest_file(parent_path) != PARENT_V4_SHA256:
        raise ValueError("V5 parent V4 contract hash drifted.")

    rows = body["sealedFiles"]
    if not isinstance(rows, list) or len(rows) != len(SEALED_RELATIVE_PATHS):
        raise ValueError("V5 contract must seal exactly five delta files.")
    observed: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"V5 sealedFiles[{index}] must be an object.")
        require_keys(row, {"path", "sha256"}, f"V5 sealedFiles[{index}]")
        relative = require_string(row["path"], f"V5 sealedFiles[{index}].path")
        target = required_regular_file(resolve(file.parent, relative, f"V5 sealedFiles[{index}].path"), f"V5 sealed file {relative}")
        if relative in observed or digest_file(target) != require_digest(row["sha256"], f"V5 sealedFiles[{index}].sha256"):
            raise ValueError(f"V5 sealed file is duplicate or drifted: {relative}")
        observed.add(relative)
    if observed != SEALED_RELATIVE_PATHS:
        raise ValueError("V5 sealed files differ from the exact q003-only delta set.")
    if digest_file(file) != before or read_json(file, "V5 publication contract resnapshot") != body:
        raise ValueError("V5 publication contract changed while loading.")
    return {"path": file, "sha256": before, "body": body, "parentPath": parent_path}


def verify_parent_v4(contract: dict[str, Any]) -> tuple[Any, dict[str, Any], Any, dict[str, Any], dict[str, Any], Any]:
    parent_path = contract["parentPath"]
    parent_body = read_json(parent_path, "parent V4 verification contract")
    if parent_body.get("verificationContract") != PARENT_V4_ID:
        raise ValueError("Parent V4 verification contract identity drifted.")
    helper_relative = "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v4.py"
    matches = [row for row in parent_body.get("sealedFiles", []) if isinstance(row, dict) and row.get("path") == helper_relative]
    if len(matches) != 1:
        raise ValueError("Parent V4 helper binding is absent or ambiguous.")
    helper_path = required_regular_file(resolve(parent_path.parent, helper_relative, "parent V4 helper"), "parent V4 helper")
    if digest_file(helper_path) != require_digest(matches[0].get("sha256"), "parent V4 helper sha256"):
        raise ValueError("Parent V4 helper drifted.")
    v4 = import_module("sealed_q003_v4_publication_helper", helper_path)
    parent_contract = v4.load_contract(parent_path)
    if parent_contract["sha256"] != PARENT_V4_SHA256 or parent_contract["body"] != parent_body:
        raise ValueError("Parent V4 contract changed during verification.")
    builder, v3_contract, parent_receipt, v1 = v4.verify_parent_v3(parent_contract)
    return v4, parent_contract, builder, v3_contract, parent_receipt, v1


def verify_publication_receipt(
    contract: dict[str, Any],
    parent_v4: dict[str, Any],
    parent_receipt: dict[str, Any],
    source: Path,
    expected_hashes: dict[str, str],
) -> None:
    receipt_path = source / "verification-v5-receipt.json"
    _receipt_raw, receipt = read_strict_json(receipt_path, "q003 V5 publication receipt", canonical_python=True)
    require_keys(
        receipt,
        {
            "schemaVersion", "kind", "verificationMode", "publicationSha256", "publicationDirectory",
            "publicationResultFileSha256", "publicationReportFileSha256", "publicationContractFileSha256",
            "parentV4ContractFileSha256", "serializationBoundary", "publicBindings", "completionMode", "completion",
            "aggregateRecoveryCalls", "receiptSha256",
        },
        "q003 V5 publication receipt",
    )
    if receipt["schemaVersion"] != 5 or receipt["kind"] != RECEIPT_KIND or receipt["verificationMode"] != VERIFICATION_MODE:
        raise ValueError("Unsupported q003 V5 publication receipt.")
    if receipt["publicationDirectory"] != "publications/q003":
        raise ValueError("q003 V5 publication path drifted.")
    if receipt["publicationContractFileSha256"] != contract["sha256"]:
        raise ValueError("q003 V5 publication contract binding drifted.")
    if receipt["parentV4ContractFileSha256"] != PARENT_V4_SHA256:
        raise ValueError("q003 V5 parent V4 contract binding drifted.")
    if receipt["serializationBoundary"] != SERIALIZATION_BOUNDARY or receipt["publicBindings"] != PUBLIC_BINDINGS:
        raise ValueError("q003 V5 declared publication boundary drifted.")
    if receipt["completionMode"] != COMPLETION_MODE or receipt["aggregateRecoveryCalls"] != {"harbor": 0, "model": 0, "verifier": 2}:
        raise ValueError("q003 V5 completion mode or call accounting drifted.")

    completion = receipt["completion"]
    if not isinstance(completion, dict):
        raise ValueError("q003 V5 completion must be an object.")
    require_keys(
        completion,
        {
            "contract", "contractFileSha256", "parentV3ContractSha256", "parentV3ReceiptFileSha256",
            "parentV3CompletionRecordDigest", "parserBoundary", "normalization", "crossBindingDigest", "execution",
        },
        "q003 V5 completion",
    )
    parent_v4_body = parent_v4["body"]
    parent_v3 = parent_v4_body["parentV3"]
    if completion.get("contract") != PARENT_V4_ID or completion.get("contractFileSha256") != PARENT_V4_SHA256:
        raise ValueError("q003 V5 completion parent V4 binding drifted.")
    if completion.get("parentV3ContractSha256") != parent_v3["contractSha256"]:
        raise ValueError("q003 V5 parent V3 contract binding drifted.")
    if completion.get("parentV3ReceiptFileSha256") != parent_v3["receiptSha256"]:
        raise ValueError("q003 V5 parent V3 receipt binding drifted.")
    if completion.get("parentV3CompletionRecordDigest") != parent_v3["completionRecordDigest"]:
        raise ValueError("q003 V5 parent V3 record binding drifted.")
    if completion.get("execution") != {"harbor": 0, "model": 0, "verifier": 0}:
        raise ValueError("q003 V5 completion calls drifted.")
    if completion.get("normalization") != parent_v4_body["normalization"]:
        raise ValueError("q003 V5 parent normalization binding drifted.")
    if completion.get("parserBoundary") != "native-manifest-bound-ordinary-json+python-codepoint-order/recovery-python-score-json-v4":
        raise ValueError("q003 V5 parser boundary drifted.")

    projection = parent_receipt.get("compatibilityProjection")
    if not isinstance(projection, dict) or set(projection) != COMPATIBILITY_PROJECTION_KEYS:
        raise ValueError("Parent V3 compatibility projection drifted during q003 V5 publication.")
    cross_projection = {key: require_digest(projection[key], f"parent V3 compatibilityProjection.{key}") for key in CROSS_BINDINGS}
    if completion.get("crossBindingDigest") != compact_digest(cross_projection):
        raise ValueError("q003 V5 cross-binding digest drifted.")

    result_path = source / "result.json"
    result_raw, result = read_strict_json(result_path, "q003 V5 publication result")
    publication_sha = result.get("publicationSha256")
    if not isinstance(publication_sha, str) or not BARE_SHA256.fullmatch(publication_sha):
        raise ValueError("q003 V5 publicationSha256 must be lowercase hex.")
    if javascript_publication_body_digest(result_raw, result) != publication_sha or receipt["publicationSha256"] != publication_sha:
        raise ValueError("q003 V5 publication result JavaScript self-digest drifted.")
    provenance = result.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("postAgentVerificationContractFileSha256") != PARENT_V4_SHA256:
        raise ValueError("q003 V5 public parent V4 contract binding drifted.")
    contrast = provenance.get("contrastResume")
    if not isinstance(contrast, dict):
        raise ValueError("q003 V5 contrast-resume provenance must be an object.")
    for projection_key, public_key in PUBLIC_CROSS_BINDINGS.items():
        if contrast.get(public_key) != cross_projection[projection_key]:
            raise ValueError(f"q003 V5 public cross-binding {projection_key} drifted.")
    if receipt["publicationResultFileSha256"] != expected_hashes["result.json"] or receipt["publicationReportFileSha256"] != expected_hashes["report.md"]:
        raise ValueError("q003 V5 publication file hash drifted.")
    seal = receipt.get("receiptSha256")
    if not isinstance(seal, str) or not BARE_SHA256.fullmatch(seal):
        raise ValueError("q003 V5 receiptSha256 must be lowercase hex.")
    body = deepcopy(receipt)
    body.pop("receiptSha256", None)
    if object_digest(body) != seal:
        raise ValueError("q003 V5 publication receipt self-digest drifted.")


def verify_publication_tree(
    v1: Any,
    contract: dict[str, Any],
    parent_v4: dict[str, Any],
    parent_receipt: dict[str, Any],
    root: Path,
    label: str,
    expected_hashes: dict[str, str],
) -> None:
    v1.require_direct_children(root, set(PUBLICATION_FILES), label)
    for name in PUBLICATION_FILES:
        v1.required_regular_file(root / name, f"{label} {name}")
        if digest_file(root / name) != expected_hashes[name]:
            raise ValueError(f"{label} {name} changed from the JavaScript-validated bytes.")
    verify_publication_receipt(contract, parent_v4, parent_receipt, root, expected_hashes)


def publications_equal(left: Path, right: Path) -> bool:
    return all((left / name).read_bytes() == (right / name).read_bytes() for name in PUBLICATION_FILES)


def publish(
    contract: dict[str, Any],
    raw_source: str,
    raw_destination: str,
    expected_hashes: dict[str, str],
) -> int:
    _v4, parent_v4, _builder, v3_contract, parent_receipt, v1 = verify_parent_v4(contract)
    completion = v3_contract["completionDirectory"]
    if completion.name != "attempt-001" or completion.parent.name != "verifier-recovery-completion-v3" or completion.parents[2].name != "q003" or completion.parents[3].name != "resume":
        raise ValueError("Parent V3 completion cannot anchor q003 V5 publication.")
    runtime = completion.parents[4]
    publication_parent = runtime / "publications"
    source = Path(os.path.abspath(raw_source))
    destination = Path(os.path.abspath(raw_destination))
    if destination != publication_parent / "q003":
        raise ValueError("q003 V5 destination is outside its fixed runtime namespace.")
    if source.parent != publication_parent or not STAGING.fullmatch(source.name):
        raise ValueError("q003 V5 source is not an invocation-owned UUID staging tree.")
    verify_publication_tree(v1, contract, parent_v4, parent_receipt, source, "q003 V5 staging", expected_hashes)

    final_contract = load_contract(contract["path"])
    if final_contract["sha256"] != contract["sha256"] or final_contract["body"] != contract["body"]:
        raise ValueError("V5 publication contract changed before publication.")
    _final_v4, final_parent_v4, _final_builder, final_v3_contract, final_parent_receipt, final_v1 = verify_parent_v4(final_contract)
    if final_v3_contract != v3_contract:
        raise ValueError("Parent V3 contract changed before q003 V5 publication.")
    verify_publication_tree(final_v1, final_contract, final_parent_v4, final_parent_receipt, source, "q003 V5 final staging", expected_hashes)
    final_v1.fsync_tree(source, "q003 V5 publication build")
    try:
        final_v1.rename_noreplace(source, destination, "q003 V5 publication")
        published = True
    except ValueError as error:
        if "destination already exists" not in str(error) or not destination.exists():
            raise
        verify_publication_tree(final_v1, final_contract, final_parent_v4, final_parent_receipt, destination, "existing q003 V5 publication", expected_hashes)
        if not publications_equal(source, destination):
            raise ValueError("Existing q003 V5 publication differs from the verified staging tree.") from error
        published = False
    print(json.dumps({
        "ok": True,
        "mode": "publish-q003-verification-v5",
        "published": published,
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
    }, sort_keys=True))
    return 0


def verify_parent(contract: dict[str, Any]) -> int:
    _v4, parent_v4, _builder, _v3_contract, receipt, _v1 = verify_parent_v4(contract)
    final = load_contract(contract["path"])
    if final["sha256"] != contract["sha256"] or final["body"] != contract["body"]:
        raise ValueError("V5 publication contract changed during parent verification.")
    print(json.dumps({
        "ok": True,
        "mode": "verify-parent-v5",
        "parentV4ContractFileSha256": parent_v4["sha256"],
        "completionRecordDigest": receipt["completionRecordDigest"],
        "harborCalls": 0,
        "modelCalls": 0,
        "verifierCalls": 0,
    }, sort_keys=True))
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    parser.add_argument("source", nargs="?")
    parser.add_argument("destination", nargs="?")
    parser.add_argument("--verify-parent", action="store_true")
    parser.add_argument("--result-file-sha256")
    parser.add_argument("--report-file-sha256")
    parser.add_argument("--receipt-file-sha256")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        contract = load_contract(Path(os.path.abspath(args.contract)))
        if args.verify_parent:
            if any(value is not None for value in (
                args.source, args.destination, args.result_file_sha256,
                args.report_file_sha256, args.receipt_file_sha256,
            )):
                raise ValueError("--verify-parent does not accept publication paths or hashes.")
            return verify_parent(contract)
        if any(value is None for value in (
            args.source, args.destination, args.result_file_sha256,
            args.report_file_sha256, args.receipt_file_sha256,
        )):
            raise ValueError("V5 publication requires source, destination, and all three JavaScript-validated file hashes.")
        expected_hashes = {
            "result.json": require_digest(args.result_file_sha256, "--result-file-sha256"),
            "report.md": require_digest(args.report_file_sha256, "--report-file-sha256"),
            "verification-v5-receipt.json": require_digest(args.receipt_file_sha256, "--receipt-file-sha256"),
        }
        return publish(contract, args.source, args.destination, expected_hashes)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
