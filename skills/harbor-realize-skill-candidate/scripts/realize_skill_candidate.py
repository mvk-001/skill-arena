#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# ///
"""Prepare, seal, and verify one mutation-bound skill candidate."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA_VERSION = 1
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
PORTABLE_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
WINDOWS_RESERVED = {
    "con",
    "prn",
    "aux",
    "nul",
    *(f"com{index}" for index in range(1, 10)),
    *(f"lpt{index}" for index in range(1, 10)),
}
SHELL_EXECUTABLES = {
    "bash",
    "cmd",
    "cmd.exe",
    "fish",
    "ksh",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "sh",
    "zsh",
}
OBVIOUS_FORBIDDEN_EVIDENCE_COMPONENTS = {"hard", "holdout"}
WORKSPACE_ENTRIES = {"baseline", "candidate", "mutation-contract.json"}
SEALED_ENTRIES = {
    *WORKSPACE_ENTRIES,
    "validation.json",
    "candidate-manifest.json",
    "operator-realization.json",
}
SANITIZED_ENVIRONMENT_POLICY = "sanitized-validation-v1"


class ContractError(ValueError):
    """Raised when an input or artifact violates the realization contract."""


@dataclass(frozen=True)
class TreeEntry:
    path: str
    kind: str
    sha256: str | None
    size: int | None


@dataclass(frozen=True)
class TreeSnapshot:
    sha256: str
    file_count: int
    directory_count: int
    total_bytes: int
    entries: tuple[TreeEntry, ...]

    def record(self) -> dict[str, Any]:
        return {
            "sha256": self.sha256,
            "fileCount": self.file_count,
            "directoryCount": self.directory_count,
            "totalBytes": self.total_bytes,
        }


@dataclass(frozen=True)
class Config:
    path: Path
    base: Path
    file_sha256: str
    realization_id: str
    candidate_id: str
    parent_skill_raw: str
    parent_skill: Path
    expected_parent_sha256: str
    workspace_raw: str
    workspace: Path
    output_raw: str
    output: Path
    operator: dict[str, Any]
    allowed_changes: tuple[str, ...]
    evidence: tuple[dict[str, Any], ...]
    validation_commands: tuple[dict[str, Any], ...]
    trusted_validation_commands: bool


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def object_sha256(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def seal_document(body: dict[str, Any], field: str) -> dict[str, Any]:
    result = copy.deepcopy(body)
    result[field] = object_sha256(body)
    return result


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def reject_json_constant(value: str) -> None:
    raise ContractError(f"JSON non-finite number is forbidden: {value}")


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"JSON duplicate key is forbidden: {key}")
        result[key] = value
    return result


def strict_json_loads(source: str, label: str) -> Any:
    try:
        return json.loads(
            source,
            object_pairs_hook=unique_json_object,
            parse_constant=reject_json_constant,
        )
    except json.JSONDecodeError as error:
        raise ContractError(f"{label} must be valid strict JSON: {error}") from error


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    observed = set(value)
    if observed != expected:
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        raise ContractError(f"{label} fields do not match; missing={missing}, extra={extra}")


def require_string(value: Any, label: str, *, nonempty: bool = True) -> str:
    if not isinstance(value, str) or "\x00" in value:
        raise ContractError(f"{label} must be a string without NUL bytes")
    if nonempty and not value.strip():
        raise ContractError(f"{label} must be non-empty")
    return value


def require_portable_id(value: Any, label: str) -> str:
    identifier = require_string(value, label)
    if len(identifier) > 64 or not PORTABLE_ID_RE.fullmatch(identifier):
        raise ContractError(f"{label} must be a portable lowercase hyphenated identifier")
    if identifier.casefold() in WINDOWS_RESERVED:
        raise ContractError(f"{label} uses a reserved Windows basename")
    return identifier


def require_sha256(value: Any, label: str) -> str:
    digest = require_string(value, label)
    if not SHA256_RE.fullmatch(digest):
        raise ContractError(f"{label} must be sha256: followed by 64 lowercase hex characters")
    return digest


def lexical_path(base: Path, raw: Any, label: str) -> tuple[str, Path]:
    value = require_string(raw, label)
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = base / candidate
    return value, Path(os.path.abspath(candidate))


def same_or_within(child: Path, parent: Path) -> bool:
    try:
        return os.path.commonpath(
            [os.path.normcase(os.path.abspath(child)), os.path.normcase(os.path.abspath(parent))]
        ) == os.path.normcase(os.path.abspath(parent))
    except ValueError:
        return False


def require_disjoint_paths(paths: list[tuple[str, Path]]) -> None:
    for index, (left_label, left) in enumerate(paths):
        for right_label, right in paths[index + 1 :]:
            if same_or_within(left, right) or same_or_within(right, left):
                raise ContractError(
                    f"{left_label} and {right_label} must be distinct and non-nested"
                )


def unsafe_reparse(st: os.stat_result) -> bool:
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return bool(getattr(st, "st_file_attributes", 0) & reparse_flag)


def reject_unsafe_node(path: Path, st: os.stat_result, label: str) -> None:
    if stat.S_ISLNK(st.st_mode) or unsafe_reparse(st):
        raise ContractError(f"{label} is a symbolic link, junction, or reparse point: {path}")


def assert_safe_existing_ancestors(path: Path, label: str) -> None:
    current = path if path.exists() else path.parent
    while True:
        if current.exists():
            st = os.lstat(current)
            reject_unsafe_node(current, st, label)
            if not stat.S_ISDIR(st.st_mode):
                raise ContractError(f"{label} ancestor is not a directory: {current}")
        if current.parent == current:
            break
        current = current.parent


def safe_tree(root: Path, label: str) -> TreeSnapshot:
    try:
        root_stat = os.lstat(root)
    except FileNotFoundError as error:
        raise ContractError(f"{label} does not exist: {root}") from error
    reject_unsafe_node(root, root_stat, label)
    if not stat.S_ISDIR(root_stat.st_mode):
        raise ContractError(f"{label} must be a directory: {root}")

    pending = [root]
    discovered: list[tuple[str, str, Path]] = []
    while pending:
        directory = pending.pop()
        try:
            children = list(os.scandir(directory))
        except OSError as error:
            raise ContractError(f"cannot enumerate {label}: {directory}: {error}") from error
        children.sort(key=lambda entry: entry.name.encode("utf-8"))
        for child in children:
            child_path = Path(child.path)
            st = child.stat(follow_symlinks=False)
            reject_unsafe_node(child_path, st, label)
            relative = child_path.relative_to(root).as_posix()
            if stat.S_ISDIR(st.st_mode):
                discovered.append((relative, "directory", child_path))
                pending.append(child_path)
            elif stat.S_ISREG(st.st_mode):
                discovered.append((relative, "file", child_path))
            else:
                raise ContractError(f"{label} contains a non-regular filesystem node: {child_path}")

    discovered.sort(key=lambda item: (item[0].encode("utf-8"), item[1]))
    tree_digest = hashlib.sha256()
    entries: list[TreeEntry] = []
    total_bytes = 0
    file_count = 0
    directory_count = 0
    for relative, kind, child_path in discovered:
        encoded = relative.encode("utf-8")
        if kind == "directory":
            tree_digest.update(b"D\x00")
            tree_digest.update(encoded)
            tree_digest.update(b"\x00")
            entries.append(TreeEntry(relative, kind, None, None))
            directory_count += 1
            continue

        file_digest = hashlib.sha256()
        size = 0
        tree_digest.update(b"F\x00")
        tree_digest.update(encoded)
        tree_digest.update(b"\x00")
        with child_path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                tree_digest.update(chunk)
                file_digest.update(chunk)
                size += len(chunk)
        tree_digest.update(b"\x00")
        entries.append(TreeEntry(relative, kind, f"sha256:{file_digest.hexdigest()}", size))
        file_count += 1
        total_bytes += size

    return TreeSnapshot(
        sha256=f"sha256:{tree_digest.hexdigest()}",
        file_count=file_count,
        directory_count=directory_count,
        total_bytes=total_bytes,
        entries=tuple(entries),
    )


def copy_safe_tree(source: Path, destination: Path, label: str) -> TreeSnapshot:
    snapshot = safe_tree(source, label)
    destination.mkdir(parents=False, exist_ok=False)
    for entry in snapshot.entries:
        target = destination / Path(*PurePosixPath(entry.path).parts)
        if entry.kind == "directory":
            target.mkdir(exist_ok=False)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / Path(*PurePosixPath(entry.path).parts), target)
    copied = safe_tree(destination, f"copied {label}")
    if copied.sha256 != snapshot.sha256:
        raise ContractError(f"{label} changed while it was copied")
    return snapshot


def parse_skill_name(root: Path) -> str:
    skill_path = root / "SKILL.md"
    try:
        source = skill_path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError) as error:
        raise ContractError(f"skill must contain UTF-8 SKILL.md: {root}") from error
    match = re.match(r"^---\r?\n(?P<body>[\s\S]*?)\r?\n---(?:\r?\n|$)", source)
    if not match:
        raise ContractError(f"SKILL.md has no YAML frontmatter: {skill_path}")
    names = re.findall(r"^name:\s*([^\r\n]+?)\s*$", match.group("body"), flags=re.MULTILINE)
    if len(names) != 1:
        raise ContractError(f"SKILL.md frontmatter must contain exactly one name: {skill_path}")
    name = names[0].strip().strip("'\"")
    if len(name) > 64 or not PORTABLE_ID_RE.fullmatch(name) or name.casefold() in WINDOWS_RESERVED:
        raise ContractError(f"SKILL.md name must be an exact portable lowercase basename: {name!r}")
    return name


def normalize_scope_pattern(value: Any, label: str) -> str:
    pattern = require_string(value, label)
    if "\\" in pattern or pattern.startswith("/") or re.match(r"^[A-Za-z]:", pattern):
        raise ContractError(f"{label} must be a POSIX relative path")
    suffix = pattern.endswith("/**")
    base = pattern[:-3] if suffix else pattern
    parts = PurePosixPath(base).parts
    if not base or any(part in {"", ".", ".."} for part in parts):
        raise ContractError(f"{label} contains an invalid path segment")
    if any(character in base for character in "*?[]{}"):
        raise ContractError(f"{label} supports only exact paths or a trailing /**")
    return f"{base}/**" if suffix else base


def scope_matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        prefix = pattern[:-3]
        return path == prefix or path.startswith(f"{prefix}/")
    return path == pattern


def normalize_evidence_path_components(raw: str) -> set[str]:
    return {part.casefold() for part in re.split(r"[\\/]", raw) if part}


def load_config(config_path: Path) -> Config:
    path = Path(os.path.abspath(config_path))
    try:
        raw_bytes = path.read_bytes()
        payload = strict_json_loads(raw_bytes.decode("utf-8"), "configuration")
    except FileNotFoundError as error:
        raise ContractError(f"configuration does not exist: {path}") from error
    except UnicodeDecodeError as error:
        raise ContractError(f"configuration must be valid UTF-8 JSON: {path}: {error}") from error
    root = require_mapping(payload, "configuration")
    require_exact_keys(root, {"schemaVersion", "realization"}, "configuration")
    if root["schemaVersion"] != SCHEMA_VERSION:
        raise ContractError(f"schemaVersion must equal {SCHEMA_VERSION}")
    realization = require_mapping(root["realization"], "realization")
    require_exact_keys(
        realization,
        {
            "id",
            "candidateId",
            "parentSkill",
            "expectedParentTreeSha256",
            "workspaceDir",
            "outputDir",
            "operator",
            "allowedChanges",
            "developmentEvidence",
            "validationCommands",
            "trustedValidationCommands",
        },
        "realization",
    )
    realization_id = require_portable_id(realization["id"], "realization.id")
    candidate_id = require_portable_id(realization["candidateId"], "realization.candidateId")
    base = path.parent
    parent_raw, parent = lexical_path(base, realization["parentSkill"], "realization.parentSkill")
    workspace_raw, workspace = lexical_path(base, realization["workspaceDir"], "realization.workspaceDir")
    output_raw, output = lexical_path(base, realization["outputDir"], "realization.outputDir")
    require_disjoint_paths(
        [("parentSkill", parent), ("workspaceDir", workspace), ("outputDir", output)]
    )
    expected_parent = require_sha256(
        realization["expectedParentTreeSha256"], "realization.expectedParentTreeSha256"
    )

    operator = require_mapping(realization["operator"], "realization.operator")
    require_exact_keys(
        operator,
        {"operatorId", "instruction", "origin", "parentOperatorIds"},
        "realization.operator",
    )
    operator_id = require_portable_id(operator["operatorId"], "realization.operator.operatorId")
    instruction = require_string(operator["instruction"], "realization.operator.instruction")
    origin = require_string(operator["origin"], "realization.operator.origin")
    parent_operator_ids_value = operator["parentOperatorIds"]
    if not isinstance(parent_operator_ids_value, list):
        raise ContractError("realization.operator.parentOperatorIds must be an array")
    parent_operator_ids = [
        require_portable_id(value, f"realization.operator.parentOperatorIds[{index}]")
        for index, value in enumerate(parent_operator_ids_value)
    ]
    if len(parent_operator_ids) != len(set(parent_operator_ids)):
        raise ContractError("realization.operator.parentOperatorIds must be unique")
    normalized_operator = {
        "operatorId": operator_id,
        "instruction": instruction,
        "instructionSha256": sha256_bytes(instruction.encode("utf-8")),
        "origin": origin,
        "parentOperatorIds": parent_operator_ids,
    }

    allowed_value = realization["allowedChanges"]
    if not isinstance(allowed_value, list) or not allowed_value:
        raise ContractError("realization.allowedChanges must be a non-empty array")
    allowed_changes = tuple(
        normalize_scope_pattern(value, f"realization.allowedChanges[{index}]")
        for index, value in enumerate(allowed_value)
    )
    if len(allowed_changes) != len(set(allowed_changes)):
        raise ContractError("realization.allowedChanges must not contain duplicates")

    evidence_value = realization["developmentEvidence"]
    if not isinstance(evidence_value, list):
        raise ContractError("realization.developmentEvidence must be an array")
    evidence: list[dict[str, Any]] = []
    evidence_ids: set[str] = set()
    evidence_paths: set[str] = set()
    for index, item in enumerate(evidence_value):
        entry = require_mapping(item, f"realization.developmentEvidence[{index}]")
        require_exact_keys(entry, {"id", "role", "path", "sha256"}, f"developmentEvidence[{index}]")
        evidence_id = require_portable_id(entry["id"], f"developmentEvidence[{index}].id")
        if entry["role"] != "development":
            raise ContractError(f"developmentEvidence[{index}].role must equal development")
        evidence_raw, evidence_path = lexical_path(
            base, entry["path"], f"developmentEvidence[{index}].path"
        )
        if normalize_evidence_path_components(evidence_raw) & OBVIOUS_FORBIDDEN_EVIDENCE_COMPONENTS:
            raise ContractError(
                f"developmentEvidence[{index}].path contains an obvious holdout or hard component"
            )
        normalized_path_key = os.path.normcase(os.path.abspath(evidence_path))
        if evidence_id in evidence_ids or normalized_path_key in evidence_paths:
            raise ContractError("development evidence IDs and paths must be unique")
        evidence_ids.add(evidence_id)
        evidence_paths.add(normalized_path_key)
        evidence.append(
            {
                "id": evidence_id,
                "role": "development",
                "path": evidence_raw,
                "resolvedPath": evidence_path,
                "sha256": require_sha256(entry["sha256"], f"developmentEvidence[{index}].sha256"),
            }
        )

    validation_value = realization["validationCommands"]
    if not isinstance(validation_value, list) or not validation_value:
        raise ContractError("realization.validationCommands must be a non-empty array")
    validation_commands: list[dict[str, Any]] = []
    command_ids: set[str] = set()
    for index, item in enumerate(validation_value):
        command = require_mapping(item, f"realization.validationCommands[{index}]")
        require_exact_keys(command, {"id", "argv", "timeoutSeconds"}, f"validationCommands[{index}]")
        command_id = require_portable_id(command["id"], f"validationCommands[{index}].id")
        if command_id in command_ids:
            raise ContractError("validation command IDs must be unique")
        command_ids.add(command_id)
        argv_value = command["argv"]
        if not isinstance(argv_value, list) or not argv_value:
            raise ContractError(f"validationCommands[{index}].argv must be a non-empty array")
        argv = [
            require_string(value, f"validationCommands[{index}].argv[{arg_index}]", nonempty=False)
            for arg_index, value in enumerate(argv_value)
        ]
        if not argv[0]:
            raise ContractError(f"validationCommands[{index}].argv[0] must be non-empty")
        executable = Path(argv[0]).name.casefold()
        if executable in SHELL_EXECUTABLES:
            raise ContractError(f"validationCommands[{index}] may not invoke a shell executable")
        timeout = command["timeoutSeconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 300:
            raise ContractError(f"validationCommands[{index}].timeoutSeconds must be an integer from 1 to 300")
        validation_commands.append({"id": command_id, "argv": argv, "timeoutSeconds": timeout})

    if realization["trustedValidationCommands"] is not True:
        raise ContractError(
            "realization.trustedValidationCommands must be true; argv commands are trusted code, not sandboxed"
        )

    return Config(
        path=path,
        base=base,
        file_sha256=sha256_bytes(raw_bytes),
        realization_id=realization_id,
        candidate_id=candidate_id,
        parent_skill_raw=parent_raw,
        parent_skill=parent,
        expected_parent_sha256=expected_parent,
        workspace_raw=workspace_raw,
        workspace=workspace,
        output_raw=output_raw,
        output=output,
        operator=normalized_operator,
        allowed_changes=allowed_changes,
        evidence=tuple(evidence),
        validation_commands=tuple(validation_commands),
        trusted_validation_commands=True,
    )


def assert_ordinary_file(path: Path, label: str) -> None:
    try:
        st = os.lstat(path)
    except FileNotFoundError as error:
        raise ContractError(f"{label} does not exist: {path}") from error
    reject_unsafe_node(path, st, label)
    if not stat.S_ISREG(st.st_mode):
        raise ContractError(f"{label} must be an ordinary file: {path}")


def verify_config_file(config: Config) -> None:
    assert_ordinary_file(config.path, "configuration")
    if sha256_file(config.path) != config.file_sha256:
        raise ContractError("configuration changed during the operation")


def verify_evidence(config: Config) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for entry in config.evidence:
        path = entry["resolvedPath"]
        assert_ordinary_file(path, f"development evidence {entry['id']}")
        observed = sha256_file(path)
        if observed != entry["sha256"]:
            raise ContractError(f"development evidence digest mismatch for {entry['id']}")
        records.append(
            {
                "id": entry["id"],
                "role": "development",
                "path": entry["path"],
                "sha256": entry["sha256"],
                "semanticRoleAttestedByCaller": True,
            }
        )
    return records


def require_expected_parent(config: Config) -> tuple[TreeSnapshot, str]:
    snapshot = safe_tree(config.parent_skill, "parent skill")
    if snapshot.sha256 != config.expected_parent_sha256:
        raise ContractError(
            "parent skill digest does not match realization.expectedParentTreeSha256"
        )
    logical_name = parse_skill_name(config.parent_skill)
    return snapshot, logical_name


def contract_document(
    config: Config, parent: TreeSnapshot, logical_name: str, evidence: list[dict[str, Any]]
) -> dict[str, Any]:
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "harbor-skill-candidate-mutation-contract",
        "realizationId": config.realization_id,
        "candidateId": config.candidate_id,
        "logicalName": logical_name,
        "config": {
            "fileSha256": config.file_sha256,
            "schemaVersion": SCHEMA_VERSION,
        },
        "parent": {
            "source": config.parent_skill_raw,
            "expectedTree": parent.record(),
        },
        "paths": {
            "workspaceDir": config.workspace_raw,
            "outputDir": config.output_raw,
        },
        "operator": copy.deepcopy(config.operator),
        "allowedChanges": list(config.allowed_changes),
        "developmentEvidence": evidence,
        "validationCommands": [copy.deepcopy(item) for item in config.validation_commands],
        "trustedValidationCommands": True,
        "boundaries": {
            "developmentEvidenceSemanticRole": "caller-attested-not-cryptographically-proven",
            "coreHarborCalls": 0,
            "coreModelCalls": 0,
            "coreHoldoutInputConfigured": False,
            "coreInstallationPerformed": False,
            "corePromotionPerformed": False,
            "coreScoringPerformed": False,
            "coreSelectionPerformed": False,
            "validationHarborCallsVerified": False,
            "validationModelCallsVerified": False,
            "validationHoldoutAccessVerified": False,
            "validationCommandsAreTrustedCode": True,
            "validationSandboxed": False,
        },
    }
    return seal_document(body, "mutationContractSha256")


def read_json(path: Path, label: str) -> dict[str, Any]:
    assert_ordinary_file(path, label)
    try:
        value = strict_json_loads(path.read_text(encoding="utf-8"), label)
    except UnicodeDecodeError as error:
        raise ContractError(f"{label} must be valid UTF-8 JSON: {error}") from error
    return require_mapping(value, label)


def write_json_exclusive(path: Path, value: dict[str, Any]) -> None:
    data = json_bytes(value)
    try:
        with path.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise ContractError(f"refusing to replace existing artifact: {path}") from error


def exact_children(path: Path, expected: set[str], label: str) -> None:
    try:
        observed = {entry.name for entry in os.scandir(path)}
    except FileNotFoundError as error:
        raise ContractError(f"{label} does not exist: {path}") from error
    if observed != expected:
        raise ContractError(
            f"{label} has unexpected layout; expected={sorted(expected)}, observed={sorted(observed)}"
        )


def skill_layout(root: Path, role: str, logical_name: str) -> Path:
    role_root = root / role
    exact_children(role_root, {"skills"}, f"{role} root")
    skills_root = role_root / "skills"
    exact_children(skills_root, {logical_name}, f"{role} skills root")
    return skills_root / logical_name


def diff_trees(before: TreeSnapshot, after: TreeSnapshot) -> list[dict[str, Any]]:
    before_map = {entry.path: entry for entry in before.entries}
    after_map = {entry.path: entry for entry in after.entries}
    changes: list[dict[str, Any]] = []
    for path_value in sorted(set(before_map) | set(after_map), key=lambda item: item.encode("utf-8")):
        left = before_map.get(path_value)
        right = after_map.get(path_value)
        if left is None:
            change = "created"
        elif right is None:
            change = "deleted"
        elif left.kind != right.kind:
            change = "type-changed"
        elif left.sha256 != right.sha256:
            change = "modified"
        else:
            continue
        changes.append(
            {
                "path": path_value,
                "change": change,
                "beforeKind": left.kind if left else None,
                "afterKind": right.kind if right else None,
                "beforeSha256": left.sha256 if left else None,
                "afterSha256": right.sha256 if right else None,
            }
        )
    return changes


def verify_diff_scope(changes: list[dict[str, Any]], allowed: tuple[str, ...]) -> None:
    for change in changes:
        if not any(scope_matches(change["path"], pattern) for pattern in allowed):
            raise ContractError(f"candidate change is outside allowedChanges: {change['path']}")


def verify_workspace(
    config: Config,
) -> tuple[dict[str, Any], TreeSnapshot, TreeSnapshot, str, list[dict[str, Any]]]:
    workspace_snapshot = safe_tree(config.workspace, "realization workspace")
    del workspace_snapshot
    exact_children(config.workspace, WORKSPACE_ENTRIES, "realization workspace")
    parent, logical_name = require_expected_parent(config)
    evidence = verify_evidence(config)
    expected_contract = contract_document(config, parent, logical_name, evidence)
    contract_path = config.workspace / "mutation-contract.json"
    observed_contract = read_json(contract_path, "workspace mutation contract")
    if observed_contract != expected_contract or contract_path.read_bytes() != json_bytes(expected_contract):
        raise ContractError("workspace mutation-contract.json does not match the current config and parent")
    baseline_root = skill_layout(config.workspace, "baseline", logical_name)
    candidate_root = skill_layout(config.workspace, "candidate", logical_name)
    baseline = safe_tree(baseline_root, "workspace baseline")
    if baseline.sha256 != parent.sha256:
        raise ContractError("workspace baseline drifted from the frozen parent")
    candidate = safe_tree(candidate_root, "workspace candidate")
    if parse_skill_name(candidate_root) != logical_name:
        raise ContractError("workspace candidate SKILL.md name drifted from the parent")
    changes = diff_trees(baseline, candidate)
    verify_diff_scope(changes, config.allowed_changes)
    verify_config_file(config)
    return expected_contract, baseline, candidate, logical_name, changes


def prepare(config: Config) -> dict[str, Any]:
    verify_config_file(config)
    assert_safe_existing_ancestors(config.workspace, "workspace path")
    assert_safe_existing_ancestors(config.output, "output path")
    if config.output.exists() or config.output.is_symlink():
        raise ContractError(f"sealed output destination already exists: {config.output}")
    if config.workspace.exists() or config.workspace.is_symlink():
        contract, baseline, candidate, logical_name, _ = verify_workspace(config)
        return {
            "mode": "existing",
            "logicalName": logical_name,
            "workspace": str(config.workspace),
            "candidate": str(config.workspace / "candidate" / "skills" / logical_name),
            "parentTreeSha256": baseline.sha256,
            "candidateTreeSha256": candidate.sha256,
            "mutationContractSha256": contract["mutationContractSha256"],
        }

    parent_before, logical_name = require_expected_parent(config)
    evidence = verify_evidence(config)
    contract = contract_document(config, parent_before, logical_name, evidence)
    config.workspace.parent.mkdir(parents=True, exist_ok=True)
    config.workspace.mkdir(exist_ok=False)
    baseline_parent = config.workspace / "baseline" / "skills"
    candidate_parent = config.workspace / "candidate" / "skills"
    baseline_parent.mkdir(parents=True)
    candidate_parent.mkdir(parents=True)
    baseline_root = baseline_parent / logical_name
    candidate_root = candidate_parent / logical_name
    copy_safe_tree(config.parent_skill, baseline_root, "parent skill for baseline")
    copy_safe_tree(config.parent_skill, candidate_root, "parent skill for candidate")
    parent_after, name_after = require_expected_parent(config)
    if parent_after.sha256 != parent_before.sha256 or name_after != logical_name:
        raise ContractError("parent skill changed during preparation")
    baseline = safe_tree(baseline_root, "prepared baseline")
    candidate = safe_tree(candidate_root, "prepared candidate")
    if baseline.sha256 != parent_before.sha256 or candidate.sha256 != parent_before.sha256:
        raise ContractError("prepared copies do not match the frozen parent")
    verify_evidence(config)
    verify_config_file(config)
    write_json_exclusive(config.workspace / "mutation-contract.json", contract)
    exact_children(config.workspace, WORKSPACE_ENTRIES, "prepared workspace")
    return {
        "mode": "prepared",
        "logicalName": logical_name,
        "workspace": str(config.workspace),
        "candidate": str(candidate_root),
        "parentTreeSha256": parent_before.sha256,
        "candidateTreeSha256": candidate.sha256,
        "mutationContractSha256": contract["mutationContractSha256"],
    }


def sanitized_validation_environment(home: Path, temporary: Path) -> dict[str, str]:
    folded = {key.casefold(): value for key, value in os.environ.items()}
    environment: dict[str, str] = {}
    for name in ("PATH", "PATHEXT", "SYSTEMROOT", "WINDIR"):
        if name.casefold() in folded:
            environment[name] = folded[name.casefold()]
    home.mkdir()
    temporary.mkdir()
    environment.update(
        {
            "HOME": str(home),
            "USERPROFILE": str(home),
            "TEMP": str(temporary),
            "TMP": str(temporary),
            "PYTHONDONTWRITEBYTECODE": "1",
            "NO_COLOR": "1",
        }
    )
    return environment


def bounded_failure_output(completed: subprocess.CompletedProcess[bytes]) -> str:
    raw = (completed.stderr or completed.stdout or b"")[:2000]
    return raw.decode("utf-8", errors="replace").strip()


def run_validations(config: Config, candidate_root: Path) -> list[dict[str, Any]]:
    assert_safe_existing_ancestors(config.workspace.parent, "validation staging parent")
    validation_root = Path(
        tempfile.mkdtemp(prefix=".harbor-realizer-validation-", dir=config.workspace.parent)
    )
    validation_candidate = validation_root / "candidate"
    try:
        copy_safe_tree(candidate_root, validation_candidate, "candidate validation copy")
        environment = sanitized_validation_environment(
            validation_root / "home", validation_root / "tmp"
        )
        receipts: list[dict[str, Any]] = []
        for command in config.validation_commands:
            try:
                completed = subprocess.run(
                    command["argv"],
                    cwd=validation_candidate,
                    env=environment,
                    shell=False,
                    capture_output=True,
                    timeout=command["timeoutSeconds"],
                    check=False,
                )
            except subprocess.TimeoutExpired as error:
                raise ContractError(
                    f"validation command {command['id']} timed out after {command['timeoutSeconds']} seconds"
                ) from error
            except OSError as error:
                raise ContractError(
                    f"validation command {command['id']} could not start: {error}"
                ) from error
            if completed.returncode != 0:
                detail = bounded_failure_output(completed)
                suffix = f": {detail}" if detail else ""
                raise ContractError(
                    f"validation command {command['id']} failed with exit code {completed.returncode}{suffix}"
                )
            receipts.append(
                {
                    "id": command["id"],
                    "argv": list(command["argv"]),
                    "timeoutSeconds": command["timeoutSeconds"],
                    "exitCode": 0,
                    "status": "passed",
                }
            )
        return receipts
    finally:
        expected_parent = Path(os.path.abspath(config.workspace.parent))
        actual_parent = Path(os.path.abspath(validation_root.parent))
        if actual_parent == expected_parent and validation_root.name.startswith(
            ".harbor-realizer-validation-"
        ):
            shutil.rmtree(validation_root, ignore_errors=True)


def validation_document(
    config: Config,
    logical_name: str,
    contract_file_sha256: str,
    parent: TreeSnapshot,
    baseline: TreeSnapshot,
    candidate: TreeSnapshot,
    commands: list[dict[str, Any]],
) -> dict[str, Any]:
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "harbor-skill-candidate-validation",
        "realizationId": config.realization_id,
        "candidateId": config.candidate_id,
        "logicalName": logical_name,
        "configFileSha256": config.file_sha256,
        "mutationContractFileSha256": contract_file_sha256,
        "status": "passed",
        "environmentPolicy": SANITIZED_ENVIRONMENT_POLICY,
        "trustedValidationCommands": True,
        "validationSandboxed": False,
        "commands": commands,
        "sourceIntegrity": {
            "parentBefore": parent.record(),
            "parentAfter": parent.record(),
            "baselineBefore": baseline.record(),
            "baselineAfter": baseline.record(),
            "candidateBefore": candidate.record(),
            "candidateAfter": candidate.record(),
        },
        "boundaries": {
            "disposableCandidateCopy": True,
            "coreHarborCalls": 0,
            "coreModelCalls": 0,
            "validationHarborCallsVerified": False,
            "validationModelCallsVerified": False,
            "validationHoldoutAccessVerified": False,
            "validationExternalEffectsVerified": False,
            "promotionDecision": False,
            "rawCommandOutputPersisted": False,
            "semanticDevelopmentEvidenceVerified": False,
            "timestampsOrDurationsPersisted": False,
        },
    }
    return seal_document(body, "validationSha256")


def candidate_manifest_document(
    config: Config,
    logical_name: str,
    contract_file_sha256: str,
    parent: TreeSnapshot,
    candidate: TreeSnapshot,
    changes: list[dict[str, Any]],
    validation_file_sha256: str,
) -> dict[str, Any]:
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "harbor-skill-candidate-manifest",
        "realizationId": config.realization_id,
        "candidateId": config.candidate_id,
        "logicalName": logical_name,
        "configFileSha256": config.file_sha256,
        "mutationContractFileSha256": contract_file_sha256,
        "validationFileSha256": validation_file_sha256,
        "parentTree": parent.record(),
        "candidateTree": candidate.record(),
        "allowedChanges": list(config.allowed_changes),
        "diff": changes,
        "state": "realized-evaluation-status-unverified",
        "boundaries": {
            "coreHarborEvaluationPerformed": False,
            "coreHoldoutInputConfigured": False,
            "coreInstallationPerformed": False,
            "corePromotionPerformed": False,
            "coreSelectionPerformed": False,
            "validationHarborEvaluationVerified": False,
            "validationHoldoutAccessVerified": False,
            "validationExternalEffectsVerified": False,
        },
    }
    return seal_document(body, "candidateManifestSha256")


def operator_realization_document(
    config: Config,
    logical_name: str,
    contract_file_sha256: str,
    candidate: TreeSnapshot,
    validation_file_sha256: str,
    manifest_file_sha256: str,
) -> dict[str, Any]:
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "harbor-skill-operator-realization",
        "realizationId": config.realization_id,
        "candidateId": config.candidate_id,
        "logicalName": logical_name,
        "configFileSha256": config.file_sha256,
        "mutationContractFileSha256": contract_file_sha256,
        "validationFileSha256": validation_file_sha256,
        "candidateManifestFileSha256": manifest_file_sha256,
        "candidateTree": candidate.record(),
        "operator": copy.deepcopy(config.operator),
        "state": "realized-fitness-status-unverified",
        "boundaries": {
            "coreFitnessAttributed": False,
            "coreHarborCalls": 0,
            "coreModelCalls": 0,
            "coreHoldoutInputConfigured": False,
            "corePromotionAuthorized": False,
            "validationHarborCallsVerified": False,
            "validationModelCallsVerified": False,
            "validationHoldoutAccessVerified": False,
            "validationExternalEffectsVerified": False,
        },
    }
    return seal_document(body, "operatorRealizationSha256")


def verify_sealed_output(config: Config, output: Path) -> dict[str, Any]:
    safe_tree(output, "sealed output")
    exact_children(output, SEALED_ENTRIES, "sealed output")
    verify_config_file(config)
    parent, logical_name = require_expected_parent(config)
    evidence = verify_evidence(config)
    expected_contract = contract_document(config, parent, logical_name, evidence)
    contract_path = output / "mutation-contract.json"
    observed_contract = read_json(contract_path, "sealed mutation contract")
    if observed_contract != expected_contract or contract_path.read_bytes() != json_bytes(expected_contract):
        raise ContractError("sealed mutation-contract.json was modified or does not match config")
    contract_file_sha256 = sha256_file(contract_path)

    baseline_root = skill_layout(output, "baseline", logical_name)
    candidate_root = skill_layout(output, "candidate", logical_name)
    baseline = safe_tree(baseline_root, "sealed baseline")
    if baseline.sha256 != parent.sha256:
        raise ContractError("sealed baseline does not match the expected parent")
    candidate = safe_tree(candidate_root, "sealed candidate")
    if parse_skill_name(candidate_root) != logical_name:
        raise ContractError("sealed candidate SKILL.md name drifted from the parent")
    changes = diff_trees(baseline, candidate)
    if not changes:
        raise ContractError("sealed candidate is unchanged from the parent")
    verify_diff_scope(changes, config.allowed_changes)

    command_receipts = [
        {
            "id": command["id"],
            "argv": list(command["argv"]),
            "timeoutSeconds": command["timeoutSeconds"],
            "exitCode": 0,
            "status": "passed",
        }
        for command in config.validation_commands
    ]
    expected_validation = validation_document(
        config,
        logical_name,
        contract_file_sha256,
        parent,
        baseline,
        candidate,
        command_receipts,
    )
    validation_path = output / "validation.json"
    observed_validation = read_json(validation_path, "sealed validation receipt")
    if observed_validation != expected_validation or validation_path.read_bytes() != json_bytes(
        expected_validation
    ):
        raise ContractError("validation.json was modified or does not match the sealed candidate")
    validation_file_sha256 = sha256_file(validation_path)

    expected_manifest = candidate_manifest_document(
        config,
        logical_name,
        contract_file_sha256,
        parent,
        candidate,
        changes,
        validation_file_sha256,
    )
    manifest_path = output / "candidate-manifest.json"
    observed_manifest = read_json(manifest_path, "sealed candidate manifest")
    if observed_manifest != expected_manifest or manifest_path.read_bytes() != json_bytes(
        expected_manifest
    ):
        raise ContractError("candidate-manifest.json was modified or does not match the candidate")
    manifest_file_sha256 = sha256_file(manifest_path)

    expected_realization = operator_realization_document(
        config,
        logical_name,
        contract_file_sha256,
        candidate,
        validation_file_sha256,
        manifest_file_sha256,
    )
    realization_path = output / "operator-realization.json"
    observed_realization = read_json(realization_path, "sealed operator realization")
    if observed_realization != expected_realization or realization_path.read_bytes() != json_bytes(
        expected_realization
    ):
        raise ContractError("operator-realization.json was modified or does not match the candidate")

    verify_evidence(config)
    verify_config_file(config)
    parent_after, name_after = require_expected_parent(config)
    if parent_after.sha256 != parent.sha256 or name_after != logical_name:
        raise ContractError("parent skill changed while sealed output was verified")
    return {
        "mode": "verified",
        "logicalName": logical_name,
        "output": str(output),
        "candidate": str(candidate_root),
        "parentTreeSha256": parent.sha256,
        "candidateTreeSha256": candidate.sha256,
        "mutationContractSha256": expected_contract["mutationContractSha256"],
        "candidateManifestSha256": expected_manifest["candidateManifestSha256"],
        "operatorRealizationSha256": expected_realization["operatorRealizationSha256"],
        "validationSha256": expected_validation["validationSha256"],
    }


def publication_lock_path(output: Path) -> Path:
    return output.parent / f".{output.name}.publish.lock"


def acquire_publication_lock(output: Path) -> tuple[int, Path]:
    lock = publication_lock_path(output)
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise ContractError(f"publication lock already exists and requires audit: {lock}") from error
    os.write(descriptor, b"harbor-realize-skill-candidate\n")
    os.fsync(descriptor)
    return descriptor, lock


def seal(config: Config) -> dict[str, Any]:
    if config.output.exists() or config.output.is_symlink():
        raise ContractError(f"refusing to replace existing sealed output: {config.output}")
    contract, baseline_before, candidate_before, logical_name, changes = verify_workspace(config)
    if not changes:
        raise ContractError("candidate is unchanged from the parent")
    parent_before, name_before = require_expected_parent(config)
    if name_before != logical_name or baseline_before.sha256 != parent_before.sha256:
        raise ContractError("frozen source identity changed before validation")
    evidence_before = verify_evidence(config)
    del evidence_before
    command_receipts = run_validations(
        config, config.workspace / "candidate" / "skills" / logical_name
    )
    verify_config_file(config)
    parent_after_validation, name_after_validation = require_expected_parent(config)
    _, baseline_after_validation, candidate_after_validation, workspace_name, changes_after = (
        verify_workspace(config)
    )
    verify_evidence(config)
    if (
        parent_after_validation.sha256 != parent_before.sha256
        or name_after_validation != logical_name
        or workspace_name != logical_name
        or baseline_after_validation.sha256 != baseline_before.sha256
        or candidate_after_validation.sha256 != candidate_before.sha256
        or changes_after != changes
    ):
        raise ContractError("frozen parent, baseline, or candidate changed during validation")

    config.output.parent.mkdir(parents=True, exist_ok=True)
    assert_safe_existing_ancestors(config.output, "output path")
    lock_descriptor, lock_path = acquire_publication_lock(config.output)
    os.close(lock_descriptor)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{config.output.name}.seal-", dir=config.output.parent)
    )
    published = False
    try:
        baseline_parent = staging / "baseline" / "skills"
        candidate_parent = staging / "candidate" / "skills"
        baseline_parent.mkdir(parents=True)
        candidate_parent.mkdir(parents=True)
        staged_baseline_root = baseline_parent / logical_name
        staged_candidate_root = candidate_parent / logical_name
        copy_safe_tree(
            config.workspace / "baseline" / "skills" / logical_name,
            staged_baseline_root,
            "workspace baseline for sealing",
        )
        copy_safe_tree(
            config.workspace / "candidate" / "skills" / logical_name,
            staged_candidate_root,
            "workspace candidate for sealing",
        )
        staged_baseline = safe_tree(staged_baseline_root, "staged sealed baseline")
        staged_candidate = safe_tree(staged_candidate_root, "staged sealed candidate")
        if (
            staged_baseline.sha256 != baseline_before.sha256
            or staged_candidate.sha256 != candidate_before.sha256
        ):
            raise ContractError("workspace changed while the sealed tree was staged")
        source_final, final_name = require_expected_parent(config)
        _, baseline_final, candidate_final, workspace_final_name, final_changes = verify_workspace(
            config
        )
        if (
            source_final.sha256 != parent_before.sha256
            or final_name != logical_name
            or workspace_final_name != logical_name
            or baseline_final.sha256 != baseline_before.sha256
            or candidate_final.sha256 != candidate_before.sha256
            or final_changes != changes
        ):
            raise ContractError("frozen source or workspace changed during sealed-tree staging")

        contract_path = staging / "mutation-contract.json"
        write_json_exclusive(contract_path, contract)
        contract_file_sha256 = sha256_file(contract_path)
        validation = validation_document(
            config,
            logical_name,
            contract_file_sha256,
            parent_before,
            staged_baseline,
            staged_candidate,
            command_receipts,
        )
        validation_path = staging / "validation.json"
        write_json_exclusive(validation_path, validation)
        validation_file_sha256 = sha256_file(validation_path)
        manifest = candidate_manifest_document(
            config,
            logical_name,
            contract_file_sha256,
            parent_before,
            staged_candidate,
            changes,
            validation_file_sha256,
        )
        manifest_path = staging / "candidate-manifest.json"
        write_json_exclusive(manifest_path, manifest)
        realization = operator_realization_document(
            config,
            logical_name,
            contract_file_sha256,
            staged_candidate,
            validation_file_sha256,
            sha256_file(manifest_path),
        )
        write_json_exclusive(staging / "operator-realization.json", realization)

        verify_sealed_output(config, staging)
        if config.output.exists() or config.output.is_symlink():
            raise ContractError(f"refusing to replace existing sealed output: {config.output}")
        os.rename(staging, config.output)
        published = True
        result = verify_sealed_output(config, config.output)
        lock_path.unlink()
        return {**result, "mode": "sealed"}
    finally:
        if not published and staging.exists():
            expected_parent = Path(os.path.abspath(config.output.parent))
            if (
                Path(os.path.abspath(staging.parent)) == expected_parent
                and staging.name.startswith(f".{config.output.name}.seal-")
            ):
                shutil.rmtree(staging, ignore_errors=True)


def verify(config: Config) -> dict[str, Any]:
    if not config.output.exists() and not config.output.is_symlink():
        raise ContractError(f"sealed output does not exist: {config.output}")
    return verify_sealed_output(config, config.output)


def digest_skill(path: Path) -> dict[str, Any]:
    root = Path(os.path.abspath(path))
    assert_safe_existing_ancestors(root, "skill path")
    snapshot = safe_tree(root, "skill bundle")
    logical_name = parse_skill_name(root)
    return {
        "logicalName": logical_name,
        "treeSha256": snapshot.sha256,
        "fileCount": snapshot.file_count,
        "directoryCount": snapshot.directory_count,
        "totalBytes": snapshot.total_bytes,
    }


def usage() -> str:
    script = Path(__file__).name
    return (
        "Usage:\n"
        f"  python {script} digest <skill-directory>\n"
        f"  python {script} prepare <realization.json>\n"
        f"  python {script} seal <realization.json>\n"
        f"  python {script} verify <realization.json>\n\n"
        "digest is read-only. prepare creates or verifies an editable workspace. "
        "seal validates in a disposable copy and exclusively publishes a sealed output. "
        "verify is read-only and reruns no validation command.\n"
    )


def emit(value: dict[str, Any]) -> None:
    sys.stdout.buffer.write(canonical_bytes(value) + b"\n")


def main(argv: list[str]) -> int:
    if sys.version_info < (3, 12):
        raise ContractError("Python 3.12 or newer is required")
    if argv in (["--help"], ["-h"]):
        sys.stdout.write(usage())
        return 0
    if len(argv) != 2 or argv[0] not in {"digest", "prepare", "seal", "verify"}:
        raise ContractError(usage().strip())
    command, argument = argv
    if command == "digest":
        emit(digest_skill(Path(argument)))
        return 0
    config = load_config(Path(argument))
    if command == "prepare":
        emit(prepare(config))
    elif command == "seal":
        emit(seal(config))
    else:
        emit(verify(config))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except ContractError as error:
        sys.stderr.write(f"error: {error}\n")
        raise SystemExit(1) from None
