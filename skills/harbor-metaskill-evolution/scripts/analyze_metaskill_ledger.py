# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Replay a development-only branch/meta-skill ledger without evaluating work."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
SOURCE = "harbor-metaskill-evolution"
TRUST_LEVEL = "content-bound-development-projection-authority-unverified"
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,127}$")
META_COMPONENTS = ("analyzer", "retriever", "allocator", "proposer", "evolver")
EVIDENCE_CLASSES = {
    "harbor-native-development-summary",
    "harbor-native-development-projection",
}
EVALUATION_STATUSES = {"evaluable", "external-failure", "non-evaluable"}
HEADER_KEYS = {
    "recordType",
    "schemaVersion",
    "ledgerId",
    "split",
    "appendOnly",
    "evidenceRoot",
    "budget",
    "frontierPolicy",
    "counterfactualPolicy",
    "previousRecordDigest",
    "recordDigest",
}
NODE_KEYS = {
    "recordType",
    "sequence",
    "nodeId",
    "parentNodeId",
    "inspirationNodeIds",
    "taskSkillDigest",
    "producingMetaDigest",
    "inheritedMetaDigest",
    "metaBundle",
    "metaBundleDigest",
    "budgetUnits",
    "allocatedChildBudgetUnits",
    "utilityEvidence",
    "generationReceipt",
    "counterfactual",
    "previousRecordDigest",
    "recordDigest",
}
SELECTION_KEYS = {
    "recordType",
    "sequence",
    "eventId",
    "nodeId",
    "previousRecordDigest",
    "recordDigest",
}
EVIDENCE_KEYS = {
    "schemaVersion",
    "evidenceClass",
    "publicEvidence",
    "split",
    "evaluationStatus",
    "evaluatedTaskSkillDigest",
    "comparisonProfileDigest",
    "taskSetDigest",
    "utilityMetricDigest",
    "values",
    "hardGates",
    "sourceReceipt",
}
SOURCE_RECEIPT_KEYS = {
    "schemaVersion",
    "receiptClass",
    "publicEvidence",
    "split",
    "owningAnalyzerDigest",
    "sourceArtifact",
    "sourceSelectors",
    "projection",
}
SOURCE_ARTIFACT_KEYS = {"path", "sha256", "artifactClass"}
SOURCE_BINDING_KEYS = {"path", "sha256"}
PROJECTED_EVIDENCE_KEYS = {
    "evaluationStatus",
    "evaluatedTaskSkillDigest",
    "comparisonProfileDigest",
    "taskSetDigest",
    "utilityMetricDigest",
    "values",
    "hardGates",
}
COUNTERFACTUAL_KEYS = {
    "groupId",
    "arm",
    "k",
    "retrievalOrderedArtifactDigests",
    "generatorProfileDigest",
    "proposerProfileDigest",
    "generatorPromptDigest",
    "proposerPromptDigest",
    "generatorSeeds",
    "proposerSeeds",
    "downstreamEvaluationCohortDigest",
    "downstreamEvaluationProfileDigest",
}
GENERATION_RECEIPT_KEYS = {
    "schemaVersion",
    "receiptClass",
    "split",
    "groupId",
    "arm",
    "slotIndex",
    "generatorSeed",
    "proposerSeed",
    "retrievalOrderedArtifactDigests",
    "generatorProfileDigest",
    "proposerProfileDigest",
    "generatorPromptDigest",
    "proposerPromptDigest",
    "parentNodeId",
    "parentTaskSkillDigest",
    "parentMetaDigest",
    "realizedChildTaskSkillDigest",
    "childProducingMetaDigest",
}


class ContractError(ValueError):
    """Raised when an input fails the replay contract."""


class DuplicateKeyError(ValueError):
    """Raised for duplicate JSON object keys."""


def reject_json_constant(value: str) -> None:
    raise ContractError(f"non-finite JSON constant is forbidden: {value}")


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json_text(text: str, label: str) -> Any:
    try:
        return json.loads(
            text,
            object_pairs_hook=unique_object,
            parse_constant=reject_json_constant,
        )
    except (json.JSONDecodeError, DuplicateKeyError, ContractError) as error:
        raise ContractError(f"{label} is not strict JSON: {error}") from error


def canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise ContractError(f"value cannot be canonicalized as JSON: {error}") from error


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def contract_digest(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def record_digest(record: dict[str, Any]) -> str:
    payload = {key: value for key, value in record.items() if key != "recordDigest"}
    return contract_digest(payload)


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    observed = set(value)
    missing = sorted(expected - observed)
    extra = sorted(observed - expected)
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing {missing}")
        if extra:
            details.append(f"unexpected {extra}")
        raise ContractError(f"{label} has invalid keys: {'; '.join(details)}")


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{label} must be a non-empty string")
    return value


def require_identifier(value: Any, label: str) -> str:
    text = require_string(value, label)
    if not IDENTIFIER_PATTERN.fullmatch(text):
        raise ContractError(f"{label} must match {IDENTIFIER_PATTERN.pattern}")
    return text


def require_digest(value: Any, label: str) -> str:
    text = require_string(value, label)
    if not DIGEST_PATTERN.fullmatch(text):
        raise ContractError(f"{label} must be a lowercase sha256 digest")
    return text


def require_integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ContractError(f"{label} must be an integer >= {minimum}")
    return value


def require_finite(value: Any, label: str, *, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{label} must be a finite number")
    number = float(value)
    if not math.isfinite(number):
        raise ContractError(f"{label} must be a finite number")
    if minimum is not None and number < minimum:
        raise ContractError(f"{label} must be >= {minimum}")
    return number


def normalized_number(value: float | None) -> float | None:
    if value is None:
        return None
    rounded = round(float(value), 12)
    return 0.0 if rounded == 0 else rounded


def is_within(root: Path, target: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def reject_unsafe_relative_path(value: Any, label: str) -> str:
    text = require_string(value, label)
    if "\\" in text:
        raise ContractError(f"{label} must use forward slashes")
    path = Path(text)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ContractError(f"{label} must be a normalized relative path")
    if any("holdout" in part.lower() for part in path.parts):
        raise ContractError(f"{label} must not reference a holdout path")
    return text


def is_reparse_stat(value: os.stat_result) -> bool:
    return stat.S_ISLNK(value.st_mode) or bool(
        getattr(value, "st_file_attributes", 0) & 0x400
    )


def ensure_no_reparse_path(boundary: Path, target: Path, label: str) -> None:
    relative = target.relative_to(boundary)
    current = boundary
    for part in relative.parts:
        current = current / part
        try:
            metadata = os.lstat(current)
        except FileNotFoundError as error:
            raise ContractError(f"{label} does not exist: {current}") from error
        if is_reparse_stat(metadata):
            raise ContractError(f"{label} contains a symbolic link or reparse point: {current}")


def pointer_tokens(pointer: Any, label: str) -> list[str]:
    text = require_string(pointer, label)
    if not text.startswith("/"):
        raise ContractError(f"{label} must be an RFC 6901 JSON Pointer")
    tokens = []
    for raw in text[1:].split("/"):
        index = 0
        decoded = ""
        while index < len(raw):
            if raw[index] != "~":
                decoded += raw[index]
                index += 1
                continue
            if index + 1 >= len(raw) or raw[index + 1] not in {"0", "1"}:
                raise ContractError(f"{label} has invalid JSON Pointer escaping")
            decoded += "~" if raw[index + 1] == "0" else "/"
            index += 2
        tokens.append(decoded)
    return tokens


def canonical_pointer(pointer: Any, label: str) -> str:
    text = require_string(pointer, label)
    tokens = pointer_tokens(text, label)
    encoded = "/" + "/".join(
        token.replace("~", "~0").replace("/", "~1") for token in tokens
    )
    if text != encoded:
        raise ContractError(f"{label} must use canonical RFC 6901 escaping")
    return text


def resolve_pointer(document: Any, pointer: Any, label: str) -> Any:
    current = document
    for token in pointer_tokens(pointer, label):
        if isinstance(current, dict):
            if token not in current:
                raise ContractError(f"{label} does not resolve: missing key {token!r}")
            current = current[token]
        elif isinstance(current, list):
            if not token.isdigit() or (token.startswith("0") and token != "0"):
                raise ContractError(f"{label} has an invalid array index {token!r}")
            index = int(token)
            if index >= len(current):
                raise ContractError(f"{label} array index is out of range: {index}")
            current = current[index]
        else:
            raise ContractError(f"{label} traverses a non-container value")
    return current


def resolve_regular_file(root: Path, raw_path_value: Any, label: str) -> tuple[str, Path]:
    raw_path = reject_unsafe_relative_path(raw_path_value, label)
    unresolved = root / raw_path
    ensure_no_reparse_path(root, unresolved, label)
    try:
        target = unresolved.resolve(strict=True)
    except FileNotFoundError as error:
        raise ContractError(f"{label} does not exist: {raw_path}") from error
    if not is_within(root, target):
        raise ContractError(f"{label} escapes header.evidenceRoot")
    if not target.is_file():
        raise ContractError(f"{label} must resolve to a regular file")
    return raw_path, target


def read_sha_bound_file(
    evidence_root: Path,
    path_value: Any,
    digest_value: Any,
    label: str,
) -> tuple[str, str, bytes]:
    raw_path, target = resolve_regular_file(evidence_root, path_value, f"{label}.path")
    expected_digest = require_digest(digest_value, f"{label}.sha256")
    raw_bytes = target.read_bytes()
    observed_digest = sha256_bytes(raw_bytes)
    if observed_digest != expected_digest:
        raise ContractError(
            f"{label}.sha256 mismatch: expected {expected_digest}, observed {observed_digest}"
        )
    return raw_path, observed_digest, raw_bytes


def reject_holdout_content(value: Any, label: str, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if "holdout" in key.lower():
                raise ContractError(f"{label} contains forbidden holdout key at {path}.{key}")
            reject_holdout_content(child, label, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_holdout_content(child, label, f"{path}[{index}]")
    elif isinstance(value, str) and "holdout" in value.lower():
        raise ContractError(f"{label} contains forbidden holdout value at {path}")


def verify_source_receipt(
    document: dict[str, Any],
    evidence_root: Path,
    label: str,
) -> dict[str, Any]:
    binding = require_mapping(document.get("sourceReceipt"), f"{label}.sourceReceipt")
    require_exact_keys(binding, SOURCE_BINDING_KEYS, f"{label}.sourceReceipt")
    receipt_path, receipt_digest, receipt_bytes = read_sha_bound_file(
        evidence_root,
        binding.get("path"),
        binding.get("sha256"),
        f"{label}.sourceReceipt",
    )
    try:
        receipt_text = receipt_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError(f"{label}.sourceReceipt.path is not UTF-8") from error
    receipt = require_mapping(
        load_json_text(receipt_text, f"{label}.sourceReceipt.path"),
        f"{label}.sourceReceipt.path",
    )
    require_exact_keys(receipt, SOURCE_RECEIPT_KEYS, f"{label}.sourceReceipt receipt")
    if receipt.get("schemaVersion") != SCHEMA_VERSION:
        raise ContractError(f"{label}.sourceReceipt schemaVersion must be {SCHEMA_VERSION}")
    if receipt.get("receiptClass") != "harbor-owning-analyzer-receipt":
        raise ContractError(f"{label}.sourceReceipt receiptClass is invalid")
    if receipt.get("publicEvidence") is not True:
        raise ContractError(f"{label}.sourceReceipt publicEvidence must be true")
    if receipt.get("split") != "development":
        raise ContractError(f"{label}.sourceReceipt split must be development")
    analyzer_digest = require_digest(
        receipt.get("owningAnalyzerDigest"), f"{label}.sourceReceipt.owningAnalyzerDigest"
    )

    source_artifact = require_mapping(
        receipt.get("sourceArtifact"), f"{label}.sourceReceipt.sourceArtifact"
    )
    require_exact_keys(
        source_artifact, SOURCE_ARTIFACT_KEYS, f"{label}.sourceReceipt.sourceArtifact"
    )
    if (
        source_artifact.get("artifactClass")
        != "harbor-native-development-only-public-summary-artifact"
    ):
        raise ContractError(f"{label}.sourceReceipt.sourceArtifact.artifactClass is invalid")
    artifact_path, artifact_digest, artifact_bytes = read_sha_bound_file(
        evidence_root,
        source_artifact.get("path"),
        source_artifact.get("sha256"),
        f"{label}.sourceReceipt.sourceArtifact",
    )
    stripped_artifact = artifact_bytes.lstrip()
    if not stripped_artifact.startswith((b"{", b"[")):
        raise ContractError(
            f"{label}.sourceReceipt.sourceArtifact must be a JSON document"
        )
    try:
        artifact_text = artifact_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError(
            f"{label}.sourceReceipt.sourceArtifact JSON is not UTF-8"
        ) from error
    artifact_json = load_json_text(
        artifact_text, f"{label}.sourceReceipt.sourceArtifact"
    )
    reject_holdout_content(
        artifact_json, f"{label}.sourceReceipt.sourceArtifact"
    )

    receipt_projection = require_mapping(
        receipt.get("projection"), f"{label}.sourceReceipt.projection"
    )
    require_exact_keys(
        receipt_projection, PROJECTED_EVIDENCE_KEYS, f"{label}.sourceReceipt.projection"
    )
    observed_projection = {key: document[key] for key in PROJECTED_EVIDENCE_KEYS}
    if receipt_projection != observed_projection:
        raise ContractError(
            f"{label} values and comparison identities do not match the owning-analyzer receipt"
        )
    source_selectors = require_mapping(
        receipt.get("sourceSelectors"), f"{label}.sourceReceipt.sourceSelectors"
    )
    require_exact_keys(
        source_selectors,
        PROJECTED_EVIDENCE_KEYS,
        f"{label}.sourceReceipt.sourceSelectors",
    )
    normalized_selectors: dict[str, str] = {}
    for field in sorted(PROJECTED_EVIDENCE_KEYS):
        selector = canonical_pointer(
            source_selectors[field],
            f"{label}.sourceReceipt.sourceSelectors.{field}",
        )
        extracted = resolve_pointer(
            artifact_json,
            selector,
            f"{label}.sourceReceipt.sourceSelectors.{field}",
        )
        if extracted != receipt_projection[field]:
            raise ContractError(
                f"{label}.sourceReceipt source selector for {field} does not match projection"
            )
        normalized_selectors[field] = selector
    source_locator = {
        "sourceArtifactSha256": artifact_digest,
        "sourceSelectors": dict(sorted(normalized_selectors.items())),
    }
    return {
        "trustLevel": TRUST_LEVEL,
        "receiptPath": receipt_path,
        "receiptSha256": receipt_digest,
        "owningAnalyzerDigest": analyzer_digest,
        "sourceArtifactPath": artifact_path,
        "sourceArtifactSha256": artifact_digest,
        "sourceArtifactClass": source_artifact["artifactClass"],
        "sourceSelectors": source_locator["sourceSelectors"],
        "sourceLocatorDigest": contract_digest(source_locator),
    }


def parse_header(record: dict[str, Any], ledger_path: Path) -> dict[str, Any]:
    require_exact_keys(record, HEADER_KEYS, "header")
    if record.get("recordType") != "header":
        raise ContractError("first ledger record must have recordType=header")
    if record.get("schemaVersion") != SCHEMA_VERSION:
        raise ContractError(f"header.schemaVersion must be {SCHEMA_VERSION}")
    ledger_id = require_identifier(record.get("ledgerId"), "header.ledgerId")
    if record.get("split") != "development":
        raise ContractError("header.split must be exactly development; holdout is forbidden")
    if record.get("appendOnly") is not True:
        raise ContractError("header.appendOnly must be true")
    if record.get("previousRecordDigest") is not None:
        raise ContractError("header.previousRecordDigest must be null")

    raw_evidence_root = reject_unsafe_relative_path(
        record.get("evidenceRoot"), "header.evidenceRoot"
    )
    ledger_directory = ledger_path.resolve().parent
    unresolved_evidence_root = ledger_directory / raw_evidence_root
    ensure_no_reparse_path(
        ledger_directory, unresolved_evidence_root, "header.evidenceRoot"
    )
    try:
        evidence_root = unresolved_evidence_root.resolve(strict=True)
    except FileNotFoundError as error:
        raise ContractError("header.evidenceRoot does not exist") from error
    if not is_within(ledger_directory, evidence_root):
        raise ContractError("header.evidenceRoot must remain inside the ledger directory")
    if not evidence_root.is_dir():
        raise ContractError("header.evidenceRoot must resolve to a directory")

    budget = require_mapping(record.get("budget"), "header.budget")
    require_exact_keys(
        budget,
        {"unit", "totalUnits", "maximumChildrenPerNode"},
        "header.budget",
    )
    if budget.get("unit") != "candidate-evaluations":
        raise ContractError("header.budget.unit must be candidate-evaluations")
    total_units = require_integer(budget.get("totalUnits"), "header.budget.totalUnits", minimum=1)
    maximum_children = require_integer(
        budget.get("maximumChildrenPerNode"),
        "header.budget.maximumChildrenPerNode",
        minimum=1,
    )

    frontier = require_mapping(record.get("frontierPolicy"), "header.frontierPolicy")
    require_exact_keys(
        frontier,
        {"weights", "minimumProductivitySupport", "hardGateThresholds"},
        "header.frontierPolicy",
    )
    weights = require_mapping(frontier.get("weights"), "header.frontierPolicy.weights")
    require_exact_keys(weights, {"utility", "productivity", "novelty"}, "frontier weights")
    normalized_weights = {
        key: require_finite(value, f"frontier weight {key}", minimum=0)
        for key, value in weights.items()
    }
    if not any(value > 0 for value in normalized_weights.values()):
        raise ContractError("at least one frontier weight must be positive")
    minimum_support = require_integer(
        frontier.get("minimumProductivitySupport"),
        "header.frontierPolicy.minimumProductivitySupport",
        minimum=1,
    )
    thresholds = require_mapping(
        frontier.get("hardGateThresholds"),
        "header.frontierPolicy.hardGateThresholds",
    )
    if not thresholds:
        raise ContractError("at least one hard-gate threshold is required")
    normalized_thresholds: dict[str, float] = {}
    for gate, threshold in thresholds.items():
        gate_id = require_identifier(gate, "hard-gate name")
        normalized_thresholds[gate_id] = require_finite(
            threshold, f"hard-gate threshold {gate_id}"
        )

    counterfactual = require_mapping(
        record.get("counterfactualPolicy"), "header.counterfactualPolicy"
    )
    require_exact_keys(
        counterfactual,
        {"requiredForMetaChanges", "minimumComparablePairs"},
        "header.counterfactualPolicy",
    )
    if counterfactual.get("requiredForMetaChanges") is not True:
        raise ContractError("counterfactualPolicy.requiredForMetaChanges must be true")
    minimum_pairs = require_integer(
        counterfactual.get("minimumComparablePairs"),
        "header.counterfactualPolicy.minimumComparablePairs",
    )

    return {
        "ledgerId": ledger_id,
        "evidenceRootRaw": raw_evidence_root,
        "evidenceRoot": evidence_root,
        "budget": {
            "unit": "candidate-evaluations",
            "totalUnits": total_units,
            "maximumChildrenPerNode": maximum_children,
        },
        "frontierPolicy": {
            "weights": dict(sorted(normalized_weights.items())),
            "minimumProductivitySupport": minimum_support,
            "hardGateThresholds": dict(sorted(normalized_thresholds.items())),
        },
        "counterfactualPolicy": {
            "requiredForMetaChanges": True,
            "minimumComparablePairs": minimum_pairs,
        },
    }


def read_evidence(
    binding_value: Any,
    evidence_root: Path,
    header: dict[str, Any],
    label: str,
) -> dict[str, Any]:
    binding = require_mapping(binding_value, label)
    require_exact_keys(binding, {"path", "sha256", "jsonPointer", "expectedValue"}, label)
    raw_path, observed_digest, raw_bytes = read_sha_bound_file(
        evidence_root,
        binding.get("path"),
        binding.get("sha256"),
        label,
    )
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError(f"{label}.path is not UTF-8") from error
    document = require_mapping(load_json_text(text, f"{label}.path"), f"{label}.path")
    require_exact_keys(document, EVIDENCE_KEYS, f"{label}.path projection")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        raise ContractError(f"{label}.path schemaVersion must be {SCHEMA_VERSION}")
    evidence_class = document.get("evidenceClass")
    if evidence_class not in EVIDENCE_CLASSES:
        raise ContractError(f"{label}.path evidenceClass is not Harbor-native development evidence")
    if document.get("publicEvidence") is not True:
        raise ContractError(f"{label}.path publicEvidence must be true")
    if document.get("split") != "development":
        raise ContractError(f"{label}.path split must be development; holdout is forbidden")
    status = document.get("evaluationStatus")
    if status not in EVALUATION_STATUSES:
        raise ContractError(f"{label}.path evaluationStatus is invalid: {status!r}")

    source_provenance = verify_source_receipt(document, evidence_root, label)

    evaluated_task_skill_digest = require_digest(
        document.get("evaluatedTaskSkillDigest"),
        f"{label}.evaluatedTaskSkillDigest",
    )
    profile_digest = require_digest(
        document.get("comparisonProfileDigest"), f"{label}.comparisonProfileDigest"
    )
    task_set_digest = require_digest(document.get("taskSetDigest"), f"{label}.taskSetDigest")
    metric_digest = require_digest(
        document.get("utilityMetricDigest"), f"{label}.utilityMetricDigest"
    )
    values = require_mapping(document.get("values"), f"{label}.values")
    if len(values) != 1:
        raise ContractError(f"{label}.values must contain exactly one utility entry")
    utility_name = next(iter(values))
    require_string(utility_name, f"{label}.values utility name")
    utility_pointer = canonical_pointer(
        binding.get("jsonPointer"), f"{label}.jsonPointer"
    )
    tokens = pointer_tokens(utility_pointer, f"{label}.jsonPointer")
    if tokens != ["values", utility_name]:
        raise ContractError(
            f"{label}.jsonPointer must address the sole /values/{utility_name} entry"
        )
    pointed_value = resolve_pointer(document, utility_pointer, f"{label}.jsonPointer")
    expected_value = binding.get("expectedValue")

    thresholds = header["frontierPolicy"]["hardGateThresholds"]
    hard_gates = require_mapping(document.get("hardGates"), f"{label}.hardGates")
    if set(hard_gates) != set(thresholds):
        raise ContractError(
            f"{label}.hardGates must contain exactly the configured hard-gate names"
        )

    utility: float | None
    gate_values: dict[str, float | None] = {}
    gate_failures: list[dict[str, Any]] = []
    if status == "evaluable":
        utility = require_finite(pointed_value, f"{label} pointed utility")
        expected_utility = require_finite(expected_value, f"{label}.expectedValue")
        if pointed_value != expected_value:
            raise ContractError(
                f"{label}.expectedValue does not equal the SHA-bound JSON Pointer value"
            )
        for gate, threshold in thresholds.items():
            actual = require_finite(hard_gates[gate], f"{label}.hardGates.{gate}")
            gate_values[gate] = actual
            if actual < threshold:
                gate_failures.append(
                    {
                        "gate": gate,
                        "actual": normalized_number(actual),
                        "threshold": normalized_number(threshold),
                    }
                )
    else:
        if pointed_value is not None or expected_value is not None:
            raise ContractError(
                f"{label} must bind null utility for {status} evidence"
            )
        utility = None
        for gate in thresholds:
            actual = hard_gates[gate]
            if actual is not None:
                raise ContractError(f"{label}.hardGates.{gate} must be null for {status}")
            gate_values[gate] = None

    comparison_identity = {
        "comparisonProfileDigest": profile_digest,
        "taskSetDigest": task_set_digest,
        "utilityMetricDigest": metric_digest,
    }
    observation_locator = {
        "sourceArtifactSha256": source_provenance["sourceArtifactSha256"],
        "sourceSelectors": source_provenance["sourceSelectors"],
        "evaluatedTaskSkillDigest": evaluated_task_skill_digest,
        **comparison_identity,
    }
    return {
        "path": raw_path,
        "sha256": observed_digest,
        "jsonPointer": utility_pointer,
        "observationIdentity": contract_digest(observation_locator),
        "observationLocator": observation_locator,
        "comparisonIdentityDigest": contract_digest(comparison_identity),
        "evidenceClass": evidence_class,
        "evaluationStatus": status,
        "evaluatedTaskSkillDigest": evaluated_task_skill_digest,
        "comparisonProfileDigest": profile_digest,
        "taskSetDigest": task_set_digest,
        "utilityMetricDigest": metric_digest,
        "utility": normalized_number(utility),
        "hardGateValues": {
            key: normalized_number(value) for key, value in sorted(gate_values.items())
        },
        "hardGateFailures": gate_failures,
        "hardGatesPassed": status == "evaluable" and not gate_failures,
        "sourceProvenance": source_provenance,
    }


def read_generation_receipt(
    binding_value: Any,
    evidence_root: Path,
    label: str,
) -> dict[str, Any]:
    binding = require_mapping(binding_value, label)
    require_exact_keys(binding, SOURCE_BINDING_KEYS, label)
    raw_path, observed_digest, raw_bytes = read_sha_bound_file(
        evidence_root,
        binding.get("path"),
        binding.get("sha256"),
        label,
    )
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError(f"{label}.path is not UTF-8") from error
    receipt = require_mapping(load_json_text(text, f"{label}.path"), f"{label}.path")
    require_exact_keys(receipt, GENERATION_RECEIPT_KEYS, f"{label}.path receipt")
    if receipt.get("schemaVersion") != SCHEMA_VERSION:
        raise ContractError(f"{label}.path schemaVersion must be {SCHEMA_VERSION}")
    if receipt.get("receiptClass") != "harbor-metaskill-generation-receipt":
        raise ContractError(f"{label}.path receiptClass is invalid")
    if receipt.get("split") != "development":
        raise ContractError(f"{label}.path split must be development")
    arm = receipt.get("arm")
    if arm not in {"adaptive-meta", "frozen-meta"}:
        raise ContractError(f"{label}.path arm is invalid")
    retrieval_value = receipt.get("retrievalOrderedArtifactDigests")
    if not isinstance(retrieval_value, list):
        raise ContractError(f"{label}.path retrievalOrderedArtifactDigests must be an array")
    retrieval = [
        require_digest(value, f"{label}.path retrievalOrderedArtifactDigests[{index}]")
        for index, value in enumerate(retrieval_value)
    ]
    if len(retrieval) != len(set(retrieval)):
        raise ContractError(f"{label}.path retrievalOrderedArtifactDigests has duplicates")
    digest_fields = (
        "generatorProfileDigest",
        "proposerProfileDigest",
        "generatorPromptDigest",
        "proposerPromptDigest",
        "parentTaskSkillDigest",
        "parentMetaDigest",
        "realizedChildTaskSkillDigest",
        "childProducingMetaDigest",
    )
    return {
        "path": raw_path,
        "sha256": observed_digest,
        "groupId": require_identifier(receipt.get("groupId"), f"{label}.path groupId"),
        "arm": arm,
        "slotIndex": require_integer(receipt.get("slotIndex"), f"{label}.path slotIndex"),
        "generatorSeed": require_integer(
            receipt.get("generatorSeed"), f"{label}.path generatorSeed"
        ),
        "proposerSeed": require_integer(
            receipt.get("proposerSeed"), f"{label}.path proposerSeed"
        ),
        "retrievalOrderedArtifactDigests": retrieval,
        **{
            field: require_digest(receipt.get(field), f"{label}.path {field}")
            for field in digest_fields
        },
        "parentNodeId": require_identifier(
            receipt.get("parentNodeId"), f"{label}.path parentNodeId"
        ),
    }


def parse_node(
    record: dict[str, Any],
    header: dict[str, Any],
    nodes_by_id: dict[str, dict[str, Any]],
    expected_sequence: int,
) -> dict[str, Any]:
    label = f"node record {expected_sequence}"
    require_exact_keys(record, NODE_KEYS, label)
    if record.get("recordType") != "node":
        raise ContractError(f"{label}.recordType must be node")
    sequence = require_integer(record.get("sequence"), f"{label}.sequence")
    if sequence != expected_sequence:
        raise ContractError(f"{label}.sequence must be {expected_sequence}")
    node_id = require_identifier(record.get("nodeId"), f"{label}.nodeId")
    if node_id in nodes_by_id:
        raise ContractError(f"duplicate nodeId: {node_id}")

    parent: dict[str, Any] | None = None
    parent_id = record.get("parentNodeId")
    if parent_id is not None:
        parent_id = require_identifier(parent_id, f"{label}.parentNodeId")
        if parent_id not in nodes_by_id:
            raise ContractError(f"{label}.parentNodeId must reference an earlier node")

    inspirations_value = record.get("inspirationNodeIds")
    if not isinstance(inspirations_value, list):
        raise ContractError(f"{label}.inspirationNodeIds must be an array")
    inspirations: list[str] = []
    for index, value in enumerate(inspirations_value):
        inspiration = require_identifier(value, f"{label}.inspirationNodeIds[{index}]")
        if inspiration not in nodes_by_id:
            raise ContractError(f"{label} inspiration {inspiration} must reference an earlier node")
        if inspiration in inspirations:
            raise ContractError(f"{label} has duplicate inspiration {inspiration}")
        inspirations.append(inspiration)

    task_skill_digest = require_digest(record.get("taskSkillDigest"), f"{label}.taskSkillDigest")
    inherited_meta_digest = require_digest(
        record.get("inheritedMetaDigest"), f"{label}.inheritedMetaDigest"
    )
    producing_meta_digest = record.get("producingMetaDigest")
    if parent_id is None:
        if producing_meta_digest is not None:
            raise ContractError(f"root {node_id} must use null producingMetaDigest")
    else:
        producing_meta_digest = require_digest(
            producing_meta_digest, f"{label}.producingMetaDigest"
        )
        parent = nodes_by_id[parent_id]
        if producing_meta_digest != parent["inheritedMetaDigest"]:
            raise ContractError(
                f"{label}.producingMetaDigest must equal parent inheritedMetaDigest"
            )

    meta_bundle = require_mapping(record.get("metaBundle"), f"{label}.metaBundle")
    require_exact_keys(meta_bundle, set(META_COMPONENTS), f"{label}.metaBundle")
    normalized_bundle = {
        component: require_digest(meta_bundle[component], f"{label}.metaBundle.{component}")
        for component in META_COMPONENTS
    }
    declared_bundle_digest = require_digest(
        record.get("metaBundleDigest"), f"{label}.metaBundleDigest"
    )
    observed_bundle_digest = contract_digest(normalized_bundle)
    if declared_bundle_digest != observed_bundle_digest:
        raise ContractError(
            f"{label}.metaBundleDigest mismatch: expected {observed_bundle_digest}"
        )
    if inherited_meta_digest != declared_bundle_digest:
        raise ContractError(f"{label}.inheritedMetaDigest must equal metaBundleDigest")

    budget_units = require_integer(
        record.get("budgetUnits"), f"{label}.budgetUnits", minimum=1
    )
    if budget_units != 1:
        raise ContractError(
            f"{label}.budgetUnits must equal 1 for candidate-evaluations"
        )
    allocated_units = require_integer(
        record.get("allocatedChildBudgetUnits"), f"{label}.allocatedChildBudgetUnits"
    )
    if allocated_units > header["budget"]["maximumChildrenPerNode"]:
        raise ContractError(
            f"{label}.allocatedChildBudgetUnits exceeds maximumChildrenPerNode"
        )

    counterfactual_value = record.get("counterfactual")
    counterfactual: dict[str, Any] | None
    if counterfactual_value is None:
        counterfactual = None
    else:
        counterfactual = require_mapping(counterfactual_value, f"{label}.counterfactual")
        require_exact_keys(counterfactual, COUNTERFACTUAL_KEYS, f"{label}.counterfactual")
        group_id = require_identifier(counterfactual.get("groupId"), f"{label}.counterfactual.groupId")
        arm = counterfactual.get("arm")
        if arm not in {"adaptive-meta", "frozen-meta"}:
            raise ContractError(f"{label}.counterfactual.arm is invalid")
        k = require_integer(counterfactual.get("k"), f"{label}.counterfactual.k", minimum=1)
        if k > header["budget"]["maximumChildrenPerNode"]:
            raise ContractError(f"{label}.counterfactual.k exceeds maximumChildrenPerNode")
        retrieval_value = counterfactual.get("retrievalOrderedArtifactDigests")
        if not isinstance(retrieval_value, list):
            raise ContractError(
                f"{label}.counterfactual.retrievalOrderedArtifactDigests must be an array"
            )
        retrieval = [
            require_digest(value, f"{label}.counterfactual.retrievalOrderedArtifactDigests[{index}]")
            for index, value in enumerate(retrieval_value)
        ]
        if len(set(retrieval)) != len(retrieval):
            raise ContractError(
                f"{label}.counterfactual.retrievalOrderedArtifactDigests must not contain duplicates"
            )
        digest_fields = (
            "generatorProfileDigest",
            "proposerProfileDigest",
            "generatorPromptDigest",
            "proposerPromptDigest",
            "downstreamEvaluationCohortDigest",
            "downstreamEvaluationProfileDigest",
        )
        normalized_context = {
            key: require_digest(counterfactual.get(key), f"{label}.counterfactual.{key}")
            for key in digest_fields
        }
        normalized_seeds: dict[str, list[int]] = {}
        for key in ("generatorSeeds", "proposerSeeds"):
            seed_value = counterfactual.get(key)
            if not isinstance(seed_value, list) or len(seed_value) != k:
                raise ContractError(f"{label}.counterfactual.{key} must contain exactly k seeds")
            normalized_seeds[key] = [
                require_integer(value, f"{label}.counterfactual.{key}[{index}]")
                for index, value in enumerate(seed_value)
            ]
        counterfactual = {
            "groupId": group_id,
            "arm": arm,
            "k": k,
            "retrievalOrderedArtifactDigests": retrieval,
            **normalized_context,
            **normalized_seeds,
        }

    changed_meta = producing_meta_digest is not None and inherited_meta_digest != producing_meta_digest
    if changed_meta and (counterfactual is None or counterfactual["arm"] != "adaptive-meta"):
        raise ContractError(f"meta-changing node {node_id} requires an adaptive-meta counterfactual")
    if counterfactual is not None:
        if parent_id is None:
            raise ContractError(f"root {node_id} cannot be a counterfactual arm")
        if counterfactual["arm"] == "adaptive-meta" and not changed_meta:
            raise ContractError(f"adaptive-meta node {node_id} must inherit a changed meta bundle")
        if counterfactual["arm"] == "frozen-meta" and inherited_meta_digest != producing_meta_digest:
            raise ContractError(f"frozen-meta node {node_id} must retain producingMetaDigest")

    evidence = read_evidence(
        record.get("utilityEvidence"),
        header["evidenceRoot"],
        header,
        f"{label}.utilityEvidence",
    )
    if evidence["evaluatedTaskSkillDigest"] != task_skill_digest:
        raise ContractError(
            f"node {node_id} taskSkillDigest does not match source-bound evaluatedTaskSkillDigest"
        )

    generation_value = record.get("generationReceipt")
    parent_counterfactual = parent["counterfactual"] if parent is not None else None
    generation_receipt: dict[str, Any] | None
    if parent_counterfactual is None:
        if generation_value is not None:
            raise ContractError(
                f"node {node_id} may use generationReceipt only as a direct counterfactual child"
            )
        generation_receipt = None
    else:
        if generation_value is None:
            raise ContractError(
                f"counterfactual child {node_id} requires a SHA-bound generationReceipt"
            )
        generation_receipt = read_generation_receipt(
            generation_value,
            header["evidenceRoot"],
            f"{label}.generationReceipt",
        )
        slot = generation_receipt["slotIndex"]
        if slot >= parent_counterfactual["k"]:
            raise ContractError(f"counterfactual child {node_id} generation slot is outside k")
        expected_values = {
            "groupId": parent_counterfactual["groupId"],
            "arm": parent_counterfactual["arm"],
            "generatorSeed": parent_counterfactual["generatorSeeds"][slot],
            "proposerSeed": parent_counterfactual["proposerSeeds"][slot],
            "retrievalOrderedArtifactDigests": parent_counterfactual[
                "retrievalOrderedArtifactDigests"
            ],
            "generatorProfileDigest": parent_counterfactual["generatorProfileDigest"],
            "proposerProfileDigest": parent_counterfactual["proposerProfileDigest"],
            "generatorPromptDigest": parent_counterfactual["generatorPromptDigest"],
            "proposerPromptDigest": parent_counterfactual["proposerPromptDigest"],
            "parentNodeId": parent["nodeId"],
            "parentTaskSkillDigest": parent["taskSkillDigest"],
            "parentMetaDigest": parent["inheritedMetaDigest"],
            "realizedChildTaskSkillDigest": task_skill_digest,
            "childProducingMetaDigest": producing_meta_digest,
        }
        for key, expected in expected_values.items():
            if generation_receipt[key] != expected:
                raise ContractError(
                    f"counterfactual child {node_id} generationReceipt {key} mismatch"
                )

    return {
        "sequence": sequence,
        "nodeId": node_id,
        "parentNodeId": parent_id,
        "inspirationNodeIds": inspirations,
        "taskSkillDigest": task_skill_digest,
        "producingMetaDigest": producing_meta_digest,
        "inheritedMetaDigest": inherited_meta_digest,
        "metaBundle": normalized_bundle,
        "metaBundleDigest": declared_bundle_digest,
        "budgetUnits": budget_units,
        "allocatedChildBudgetUnits": allocated_units,
        "utilityEvidence": evidence,
        "generationReceipt": generation_receipt,
        "counterfactual": counterfactual,
        "recordDigest": record["recordDigest"],
    }


def parse_selection(
    record: dict[str, Any],
    nodes_by_id: dict[str, dict[str, Any]],
    event_ids: set[str],
    expected_sequence: int,
) -> dict[str, Any]:
    label = f"selection record {expected_sequence}"
    require_exact_keys(record, SELECTION_KEYS, label)
    if record.get("recordType") != "selection":
        raise ContractError(f"{label}.recordType must be selection")
    sequence = require_integer(record.get("sequence"), f"{label}.sequence")
    if sequence != expected_sequence:
        raise ContractError(f"{label}.sequence must be {expected_sequence}")
    event_id = require_identifier(record.get("eventId"), f"{label}.eventId")
    if event_id in event_ids:
        raise ContractError(f"duplicate selection eventId: {event_id}")
    node_id = require_identifier(record.get("nodeId"), f"{label}.nodeId")
    if node_id not in nodes_by_id:
        raise ContractError(f"{label}.nodeId must reference an earlier node")
    return {
        "sequence": sequence,
        "eventId": event_id,
        "nodeId": node_id,
        "recordDigest": record["recordDigest"],
    }


def load_ledger(
    ledger_path: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    try:
        raw_bytes = ledger_path.read_bytes()
    except FileNotFoundError as error:
        raise ContractError(f"ledger does not exist: {ledger_path}") from error
    if ledger_path.is_symlink() or not ledger_path.is_file():
        raise ContractError("ledger must be a regular non-symlink file")
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError("ledger must be UTF-8") from error
    lines = [(index, line) for index, line in enumerate(text.splitlines(), start=1) if line.strip()]
    if not lines:
        raise ContractError("ledger is empty")

    records: list[dict[str, Any]] = []
    previous_digest: str | None = None
    for record_index, (line_number, line) in enumerate(lines):
        record = require_mapping(
            load_json_text(line, f"ledger line {line_number}"), f"ledger line {line_number}"
        )
        declared_digest = require_digest(
            record.get("recordDigest"), f"ledger line {line_number}.recordDigest"
        )
        observed_digest = record_digest(record)
        if declared_digest != observed_digest:
            raise ContractError(
                f"ledger line {line_number} recordDigest mismatch: expected {observed_digest}"
            )
        if record_index == 0:
            if record.get("previousRecordDigest") is not None:
                raise ContractError("ledger header previousRecordDigest must be null")
        elif record.get("previousRecordDigest") != previous_digest:
            raise ContractError(
                f"ledger line {line_number} does not extend the prior record digest"
            )
        previous_digest = declared_digest
        records.append(record)

    header = parse_header(records[0], ledger_path)
    nodes: list[dict[str, Any]] = []
    nodes_by_id: dict[str, dict[str, Any]] = {}
    selections: list[dict[str, Any]] = []
    event_ids: set[str] = set()
    for sequence, record in enumerate(records[1:]):
        if record.get("recordType") == "node":
            node = parse_node(record, header, nodes_by_id, sequence)
            nodes.append(node)
            nodes_by_id[node["nodeId"]] = node
        elif record.get("recordType") == "selection":
            selection = parse_selection(record, nodes_by_id, event_ids, sequence)
            selections.append(selection)
            event_ids.add(selection["eventId"])
        else:
            raise ContractError(
                f"ledger record {sequence} must have recordType node or selection"
            )
    if not nodes:
        raise ContractError("ledger must contain at least one node")

    selection_counts: dict[str, int] = defaultdict(int)
    for selection in selections:
        selection_counts[selection["nodeId"]] += 1
    for node in nodes:
        node["selectionCount"] = selection_counts[node["nodeId"]]

    spent_units = sum(node["budgetUnits"] for node in nodes)
    if spent_units > header["budget"]["totalUnits"]:
        raise ContractError(
            f"spent node budget {spent_units} exceeds totalUnits {header['budget']['totalUnits']}"
        )
    allocated_units = sum(node["allocatedChildBudgetUnits"] for node in nodes)
    if allocated_units > header["budget"]["totalUnits"]:
        raise ContractError(
            "declared child allocations exceed the fixed total budget; allocations are not spend"
        )

    ledger_identity = {
        "recordCount": len(records),
        "nodeCount": len(nodes),
        "selectionEventCount": len(selections),
        "finalRecordDigest": previous_digest,
        "ledgerFileSha256": sha256_bytes(raw_bytes),
    }
    return header, nodes, selections, ledger_identity


def validate_counterfactuals(
    nodes: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, set[str]]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    evidence_users: dict[str, list[dict[str, Any]]] = defaultdict(list)
    children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    generation_digest_users: dict[str, str] = {}
    generation_slot_users: dict[tuple[str, str, int], str] = {}
    for node in nodes:
        evidence_users[node["utilityEvidence"]["observationIdentity"]].append(node)
        if node["parentNodeId"] is not None:
            children[node["parentNodeId"]].append(node)
        if node["counterfactual"] is not None:
            groups[node["counterfactual"]["groupId"]].append(node)
        generation = node["generationReceipt"]
        if generation is not None:
            prior_digest_user = generation_digest_users.get(generation["sha256"])
            if prior_digest_user is not None:
                raise ContractError(
                    f"generation receipt is reused by {prior_digest_user} and {node['nodeId']}"
                )
            generation_digest_users[generation["sha256"]] = node["nodeId"]
            slot_key = (generation["groupId"], generation["arm"], generation["slotIndex"])
            prior_slot_user = generation_slot_users.get(slot_key)
            if prior_slot_user is not None:
                raise ContractError(
                    f"generation slot {slot_key} is reused by {prior_slot_user} and {node['nodeId']}"
                )
            generation_slot_users[slot_key] = node["nodeId"]

    structural_pairs: list[dict[str, Any]] = []
    allowed_duplicate_users: dict[str, set[str]] = {}
    for group_id in sorted(groups):
        members = groups[group_id]
        if len(members) != 2:
            raise ContractError(f"counterfactual group {group_id} must contain exactly two nodes")
        by_arm = {member["counterfactual"]["arm"]: member for member in members}
        if set(by_arm) != {"adaptive-meta", "frozen-meta"}:
            raise ContractError(f"counterfactual group {group_id} requires one node per arm")
        adaptive = by_arm["adaptive-meta"]
        frozen = by_arm["frozen-meta"]
        shared_keys = (
            "parentNodeId",
            "taskSkillDigest",
            "producingMetaDigest",
            "allocatedChildBudgetUnits",
        )
        for key in shared_keys:
            if adaptive[key] != frozen[key]:
                raise ContractError(f"counterfactual group {group_id} differs on {key}")
        parity_keys = tuple(sorted(COUNTERFACTUAL_KEYS - {"groupId", "arm"}))
        for key in parity_keys:
            if adaptive["counterfactual"][key] != frozen["counterfactual"][key]:
                raise ContractError(
                    f"counterfactual group {group_id} differs on explicit parity field {key}"
                )
        k = adaptive["counterfactual"]["k"]
        if adaptive["allocatedChildBudgetUnits"] != k:
            raise ContractError(
                f"counterfactual group {group_id} allocatedChildBudgetUnits must equal k"
            )
        evidence_keys = (
            "observationIdentity",
            "utility",
            "hardGateValues",
            "hardGatesPassed",
            "comparisonProfileDigest",
            "taskSetDigest",
            "utilityMetricDigest",
        )
        for key in evidence_keys:
            if adaptive["utilityEvidence"][key] != frozen["utilityEvidence"][key]:
                raise ContractError(f"counterfactual group {group_id} differs on evidence {key}")
        if frozen["inheritedMetaDigest"] != frozen["producingMetaDigest"]:
            raise ContractError(f"counterfactual group {group_id} frozen arm changed meta")
        if adaptive["inheritedMetaDigest"] == adaptive["producingMetaDigest"]:
            raise ContractError(f"counterfactual group {group_id} adaptive arm did not change meta")
        downstream_cohort = adaptive["counterfactual"]["downstreamEvaluationCohortDigest"]
        downstream_profile = adaptive["counterfactual"]["downstreamEvaluationProfileDigest"]
        for seed in (adaptive, frozen):
            if seed["utilityEvidence"]["taskSetDigest"] != downstream_cohort:
                raise ContractError(
                    f"counterfactual group {group_id} seed taskSetDigest differs from bound downstream cohort"
                )
            if seed["utilityEvidence"]["comparisonProfileDigest"] != downstream_profile:
                raise ContractError(
                    f"counterfactual group {group_id} seed comparisonProfileDigest differs from bound downstream profile"
                )
            for child in children.get(seed["nodeId"], []):
                if child["utilityEvidence"]["taskSetDigest"] != downstream_cohort:
                    raise ContractError(
                        f"counterfactual group {group_id} child {child['nodeId']} differs from bound downstream cohort"
                    )
                if child["utilityEvidence"]["comparisonProfileDigest"] != downstream_profile:
                    raise ContractError(
                        f"counterfactual group {group_id} child {child['nodeId']} differs from bound downstream profile"
                    )
        evidence_key = adaptive["utilityEvidence"]["observationIdentity"]
        allowed_duplicate_users[evidence_key] = {adaptive["nodeId"], frozen["nodeId"]}
        adaptive_child_count = len(
            {
                child["utilityEvidence"]["observationIdentity"]
                for child in children[adaptive["nodeId"]]
            }
        )
        frozen_child_count = len(
            {
                child["utilityEvidence"]["observationIdentity"]
                for child in children[frozen["nodeId"]]
            }
        )
        adaptive_child_task_count = len(
            {child["taskSkillDigest"] for child in children[adaptive["nodeId"]]}
        )
        frozen_child_task_count = len(
            {child["taskSkillDigest"] for child in children[frozen["nodeId"]]}
        )
        adaptive_slots = sorted(
            child["generationReceipt"]["slotIndex"]
            for child in children[adaptive["nodeId"]]
        )
        frozen_slots = sorted(
            child["generationReceipt"]["slotIndex"]
            for child in children[frozen["nodeId"]]
        )
        required_slots = list(range(k))
        structural_pairs.append(
            {
                "groupId": group_id,
                "adaptiveNodeId": adaptive["nodeId"],
                "frozenNodeId": frozen["nodeId"],
                "allocatedChildBudgetUnits": adaptive["allocatedChildBudgetUnits"],
                "adaptiveUniqueChildObservationCount": adaptive_child_count,
                "frozenUniqueChildObservationCount": frozen_child_count,
                "adaptiveUniqueChildTaskSkillCount": adaptive_child_task_count,
                "frozenUniqueChildTaskSkillCount": frozen_child_task_count,
                "adaptiveGenerationSlots": adaptive_slots,
                "frozenGenerationSlots": frozen_slots,
                "requiredGenerationSlots": required_slots,
                "parity": {
                    key: adaptive["counterfactual"][key]
                    for key in sorted(COUNTERFACTUAL_KEYS - {"groupId", "arm"})
                },
            }
        )

    for evidence_key, users in evidence_users.items():
        if len(users) == 1:
            continue
        user_ids = {node["nodeId"] for node in users}
        if len(users) != 2 or allowed_duplicate_users.get(evidence_key) != user_ids:
            raise ContractError(
                "authoritative observation identity may be reused only by one valid frozen/adaptive branch-seed pair"
            )
    return structural_pairs, allowed_duplicate_users


def comparison_reasons(parent: dict[str, Any], child: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if parent["taskSkillDigest"] == child["taskSkillDigest"]:
        reasons.append("unchanged-task-skill")
    if child["counterfactual"] is not None:
        reasons.append("counterfactual-branch-seed-structural-edge")
    parent_evidence = parent["utilityEvidence"]
    child_evidence = child["utilityEvidence"]
    if parent_evidence["evaluationStatus"] != "evaluable":
        reasons.append("parent-non-evaluable")
    if child_evidence["evaluationStatus"] != "evaluable":
        reasons.append("child-non-evaluable")
    if not parent_evidence["hardGatesPassed"]:
        reasons.append("parent-hard-gate-failed")
    if not child_evidence["hardGatesPassed"]:
        reasons.append("child-hard-gate-failed")
    for key, reason in (
        ("comparisonProfileDigest", "comparison-profile-mismatch"),
        ("taskSetDigest", "task-set-mismatch"),
        ("utilityMetricDigest", "utility-metric-mismatch"),
    ):
        if parent_evidence[key] != child_evidence[key]:
            reasons.append(reason)
    return reasons


def compute_productivity(
    nodes: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        if node["parentNodeId"] is not None:
            children[node["parentNodeId"]].append(node)

    results: list[dict[str, Any]] = []
    by_node: dict[str, dict[str, Any]] = {}
    for parent in nodes:
        comparisons: list[dict[str, Any]] = []
        eligible_deltas: list[float] = []
        seen_evidence: set[str] = set()
        seen_child_task_skills: set[str] = set()
        child_records = sorted(children.get(parent["nodeId"], []), key=lambda item: item["sequence"])
        unique_child_evidence = {
            child["utilityEvidence"]["observationIdentity"] for child in child_records
        }
        if len(unique_child_evidence) > parent["allocatedChildBudgetUnits"]:
            raise ContractError(
                f"node {parent['nodeId']} has more unique child observations than its declared allocation"
            )
        for child in child_records:
            reasons = comparison_reasons(parent, child)
            evidence_key = child["utilityEvidence"]["observationIdentity"]
            if evidence_key in seen_evidence:
                reasons.append("duplicate-evidence-for-parent")
            seen_evidence.add(evidence_key)
            if child["taskSkillDigest"] in seen_child_task_skills:
                reasons.append("duplicate-child-task-skill-for-parent")
            seen_child_task_skills.add(child["taskSkillDigest"])
            eligible = not reasons
            delta: float | None = None
            if eligible:
                delta = normalized_number(
                    child["utilityEvidence"]["utility"] - parent["utilityEvidence"]["utility"]
                )
                assert delta is not None
                eligible_deltas.append(delta)
            comparisons.append(
                {
                    "childNodeId": child["nodeId"],
                    "producingMetaDigest": child["producingMetaDigest"],
                    "observationIdentity": child["utilityEvidence"][
                        "observationIdentity"
                    ],
                    "evidenceSha256": child["utilityEvidence"]["sha256"],
                    "eligible": eligible,
                    "delta": delta,
                    "exclusionReasons": reasons,
                }
            )
        support = len(eligible_deltas)
        mean = normalized_number(sum(eligible_deltas) / support) if support else None
        result = {
            "nodeId": parent["nodeId"],
            "inheritedMetaDigest": parent["inheritedMetaDigest"],
            "support": support,
            "meanProductivity": mean,
            "comparisons": comparisons,
        }
        results.append(result)
        by_node[parent["nodeId"]] = result
    return results, by_node


def complete_counterfactuals(
    structural_pairs: list[dict[str, Any]],
    productivity: dict[str, dict[str, Any]],
    minimum_support: int,
) -> tuple[list[dict[str, Any]], int]:
    results: list[dict[str, Any]] = []
    eligible_count = 0
    for pair in structural_pairs:
        adaptive = productivity[pair["adaptiveNodeId"]]
        frozen = productivity[pair["frozenNodeId"]]
        k = pair["parity"]["k"]
        reasons: list[str] = []
        if pair["adaptiveGenerationSlots"] != pair["requiredGenerationSlots"]:
            reasons.append("adaptive-generation-slots-incomplete")
        if pair["frozenGenerationSlots"] != pair["requiredGenerationSlots"]:
            reasons.append("frozen-generation-slots-incomplete")
        if pair["adaptiveUniqueChildObservationCount"] != k:
            reasons.append("adaptive-child-count-not-k")
        if pair["frozenUniqueChildObservationCount"] != k:
            reasons.append("frozen-child-count-not-k")
        if pair["adaptiveUniqueChildTaskSkillCount"] != k:
            reasons.append("adaptive-unique-child-task-skill-count-not-k")
        if pair["frozenUniqueChildTaskSkillCount"] != k:
            reasons.append("frozen-unique-child-task-skill-count-not-k")
        if adaptive["support"] < minimum_support:
            reasons.append("adaptive-support-below-minimum")
        if frozen["support"] < minimum_support:
            reasons.append("frozen-support-below-minimum")
        if adaptive["support"] != frozen["support"]:
            reasons.append("support-count-mismatch")
        if adaptive["support"] != k:
            reasons.append("adaptive-support-does-not-equal-k")
        if frozen["support"] != k:
            reasons.append("frozen-support-does-not-equal-k")
        eligible = not reasons
        delta = None
        if eligible:
            eligible_count += 1
            delta = normalized_number(
                adaptive["meanProductivity"] - frozen["meanProductivity"]
            )
        results.append(
            {
                **pair,
                "adaptiveSupport": adaptive["support"],
                "frozenSupport": frozen["support"],
                "adaptiveMeanProductivity": adaptive["meanProductivity"],
                "frozenMeanProductivity": frozen["meanProductivity"],
                "adaptiveMinusFrozenProductivity": delta,
                "comparable": eligible,
                "exclusionReasons": reasons,
            }
        )
    return results, eligible_count


def compute_frontier(
    nodes: list[dict[str, Any]],
    productivity: dict[str, dict[str, Any]],
    header: dict[str, Any],
) -> dict[str, Any]:
    minimum_support = header["frontierPolicy"]["minimumProductivitySupport"]
    weights = header["frontierPolicy"]["weights"]
    rankings: dict[str, list[dict[str, Any]]] = defaultdict(list)
    identities: dict[str, dict[str, str]] = {}
    excluded: list[dict[str, Any]] = []
    for node in nodes:
        evidence = node["utilityEvidence"]
        identity_digest = evidence["comparisonIdentityDigest"]
        identities[identity_digest] = {
            "comparisonProfileDigest": evidence["comparisonProfileDigest"],
            "taskSetDigest": evidence["taskSetDigest"],
            "utilityMetricDigest": evidence["utilityMetricDigest"],
        }
        node_productivity = productivity[node["nodeId"]]
        reasons: list[str] = []
        if evidence["evaluationStatus"] != "evaluable":
            reasons.append("non-evaluable")
        if not evidence["hardGatesPassed"]:
            reasons.append("hard-gate-failed")
        if node_productivity["support"] < minimum_support:
            reasons.append("productivity-support-below-minimum")
        if reasons:
            excluded.append(
                {
                    "nodeId": node["nodeId"],
                    "comparisonIdentityDigest": identity_digest,
                    "reasons": reasons,
                }
            )
            continue
        novelty = normalized_number(1 / (1 + node["selectionCount"]))
        score = normalized_number(
            weights["utility"] * evidence["utility"]
            + weights["productivity"] * node_productivity["meanProductivity"]
            + weights["novelty"] * novelty
        )
        rankings[identity_digest].append(
            {
                "nodeId": node["nodeId"],
                "utility": evidence["utility"],
                "meanProductivity": node_productivity["meanProductivity"],
                "productivitySupport": node_productivity["support"],
                "selectionCount": node["selectionCount"],
                "novelty": novelty,
                "score": score,
            }
        )
    partitions: list[dict[str, Any]] = []
    for identity_digest in sorted(rankings):
        ranking = rankings[identity_digest]
        ranking.sort(
            key=lambda item: (
                -item["score"],
                -item["utility"],
                -item["meanProductivity"],
                -item["novelty"],
                item["nodeId"],
            )
        )
        partitions.append(
            {
                "comparisonIdentityDigest": identity_digest,
                "comparisonIdentity": identities[identity_digest],
                "ranking": ranking,
            }
        )
    return {
        "weights": weights,
        "minimumProductivitySupport": minimum_support,
        "partitionScope": "comparison-profile-task-set-utility-metric",
        "partitions": partitions,
        "rankedPartitionCount": len(partitions),
        "excluded": excluded,
        "crossIdentityRankingAuthorized": False,
        "selectionAuthorized": False,
    }


def build_report(ledger_path: Path) -> dict[str, Any]:
    header, nodes, selections, ledger_identity = load_ledger(ledger_path)
    structural_pairs, _ = validate_counterfactuals(nodes)
    productivity_rows, productivity_by_node = compute_productivity(nodes)
    counterfactual_rows, comparable_pair_count = complete_counterfactuals(
        structural_pairs,
        productivity_by_node,
        header["frontierPolicy"]["minimumProductivitySupport"],
    )
    required_pairs = header["counterfactualPolicy"]["minimumComparablePairs"]
    counterfactual_requirement_met = comparable_pair_count >= required_pairs
    frontier = compute_frontier(nodes, productivity_by_node, header)
    decision = (
        "frontiers-ranked-within-identities"
        if frontier["rankedPartitionCount"] > 0 and counterfactual_requirement_met
        else "insufficient-evidence"
    )

    node_rows = []
    lineage_edges = []
    inspiration_edges = []
    for node in nodes:
        evidence = node["utilityEvidence"]
        node_rows.append(
            {
                "sequence": node["sequence"],
                "nodeId": node["nodeId"],
                "parentNodeId": node["parentNodeId"],
                "inspirationNodeIds": node["inspirationNodeIds"],
                "taskSkillDigest": node["taskSkillDigest"],
                "producingMetaDigest": node["producingMetaDigest"],
                "inheritedMetaDigest": node["inheritedMetaDigest"],
                "metaBundle": node["metaBundle"],
                "metaBundleDigest": node["metaBundleDigest"],
                "selectionCount": node["selectionCount"],
                "budgetUnits": node["budgetUnits"],
                "allocatedChildBudgetUnits": node["allocatedChildBudgetUnits"],
                "generationReceipt": node["generationReceipt"],
                "counterfactual": node["counterfactual"],
                "recordDigest": node["recordDigest"],
                "utilityEvidence": {
                    key: evidence[key]
                    for key in (
                        "path",
                        "sha256",
                        "jsonPointer",
                        "observationIdentity",
                        "observationLocator",
                        "comparisonIdentityDigest",
                        "evidenceClass",
                        "evaluationStatus",
                        "evaluatedTaskSkillDigest",
                        "comparisonProfileDigest",
                        "taskSetDigest",
                        "utilityMetricDigest",
                        "utility",
                        "hardGateValues",
                        "hardGateFailures",
                        "hardGatesPassed",
                        "sourceProvenance",
                    )
                },
            }
        )
        if node["parentNodeId"] is not None:
            lineage_edges.append(
                {
                    "parentNodeId": node["parentNodeId"],
                    "childNodeId": node["nodeId"],
                    "producingMetaDigest": node["producingMetaDigest"],
                }
            )
        for inspiration_id in node["inspirationNodeIds"]:
            inspiration_edges.append(
                {"sourceNodeId": inspiration_id, "targetNodeId": node["nodeId"]}
            )

    spent_units = sum(node["budgetUnits"] for node in nodes)
    allocated_units = sum(node["allocatedChildBudgetUnits"] for node in nodes)
    root_ids = [node["nodeId"] for node in nodes if node["parentNodeId"] is None]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE,
        "mode": "analysis-only-replay",
        "trustLevel": TRUST_LEVEL,
        "decision": decision,
        "decisionScope": "within-comparison-identities-only",
        "capabilityBoundaries": {
            "harborExecution": False,
            "modelCalls": False,
            "candidateGeneration": False,
            "candidateMutation": False,
            "configuredHoldoutInput": False,
            "semanticHoldoutAbsenceVerified": False,
            "selectionAuthorized": False,
            "promotionAuthorized": False,
            "paperReproductionClaimed": False,
        },
        "ledger": {
            "ledgerId": header["ledgerId"],
            "split": "development",
            "appendOnly": True,
            "evidenceRoot": header["evidenceRootRaw"],
            "rootNodeIds": root_ids,
            **ledger_identity,
        },
        "budget": {
            **header["budget"],
            "spentNodeUnits": spent_units,
            "remainingAfterSpend": header["budget"]["totalUnits"] - spent_units,
            "declaredChildAllocationUnits": allocated_units,
            "childAllocationsCountAsSpend": False,
        },
        "frontierPolicy": header["frontierPolicy"],
        "nodes": node_rows,
        "dag": {
            "lineageEdges": lineage_edges,
            "inspirationEdges": inspiration_edges,
        },
        "selectionEvents": selections,
        "productivity": productivity_rows,
        "counterfactuals": {
            **header["counterfactualPolicy"],
            "structuralPairCount": len(structural_pairs),
            "comparablePairCount": comparable_pair_count,
            "requirementMet": counterfactual_requirement_met,
            "pairs": counterfactual_rows,
            "causalClaimAuthorized": False,
        },
        "frontier": frontier,
    }


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2, sort_keys=True) + "\n"


def read_report(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ContractError(f"report does not exist: {path}") from error
    return require_mapping(load_json_text(text, "report"), "report")


def write_new_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(pretty_json(report))
    except FileExistsError as error:
        raise ContractError(f"refusing to overwrite existing report: {path}") from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Replay a hash-chained development meta-skill ledger from immutable "
            "Harbor-native summary/projection evidence."
        )
    )
    parser.add_argument("ledger", type=Path, help="Append-only JSONL development ledger")
    parser.add_argument("--output", type=Path, help="Write a new deterministic JSON report")
    parser.add_argument(
        "--verify-report",
        type=Path,
        help="Recompute and verify an existing deterministic report without writing",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.output is not None and args.verify_report is not None:
        parser.error("--output and --verify-report are mutually exclusive")
    try:
        report = build_report(args.ledger)
        if args.verify_report is not None:
            observed = read_report(args.verify_report)
            if observed != report:
                raise ContractError("report does not match deterministic replay")
            receipt = {
                "schemaVersion": SCHEMA_VERSION,
                "source": SOURCE,
                "mode": "verify-report",
                "ledgerId": report["ledger"]["ledgerId"],
                "finalRecordDigest": report["ledger"]["finalRecordDigest"],
                "reportDigest": contract_digest(report),
                "valid": True,
            }
            sys.stdout.write(pretty_json(receipt))
            return 0
        if args.output is not None:
            write_new_report(args.output, report)
            receipt = {
                "schemaVersion": SCHEMA_VERSION,
                "source": SOURCE,
                "mode": "analysis-only-replay",
                "ledgerId": report["ledger"]["ledgerId"],
                "decision": report["decision"],
                "finalRecordDigest": report["ledger"]["finalRecordDigest"],
                "reportDigest": contract_digest(report),
            }
            sys.stdout.write(pretty_json(receipt))
            return 0
        sys.stdout.write(pretty_json(report))
        return 0
    except ContractError as error:
        print(f"harbor-metaskill-evolution: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
