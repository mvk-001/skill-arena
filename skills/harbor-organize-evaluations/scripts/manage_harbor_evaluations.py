#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Organize append-only Harbor evaluation studies without scoring evidence."""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from typing import Any, Iterator


SCHEMA_VERSION = 1
STUDY_SCHEMA_VERSION = 2
ZERO_SHA256 = "0" * 64
ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
UTC_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

SPLITS = ("discovery", "development", "validation", "holdout")
EVOLUTION_VISIBLE_SPLITS = frozenset({"discovery", "development"})
DESIGN_REVIEW_CHECKS = (
    "provenanceAndContamination",
    "groupIsolation",
    "surfaceCues",
    "verifierQuality",
    "coverageAndPower",
    "accessIsolation",
)
EVOLUTION_EVALUATION_BOUNDARY = {
    "evolutionDatasetSplit": "development",
    "validationDatasetSplit": "validation",
    "validationOptimizerVisible": False,
    "candidateFreezeEvidenceKind": "candidate",
    "validationReleasePolicy": "after-completed-evolution",
    "postValidationEvolutionPolicy": "new-study-with-fresh-validation",
}
STATUSES = ("planned", "running", "blocked", "completed", "stopped")
TERMINAL_STATUSES = frozenset({"completed", "stopped"})
TRANSITIONS = {
    "planned": frozenset({"running", "stopped"}),
    "running": frozenset({"blocked", "completed", "stopped"}),
    "blocked": frozenset({"running", "stopped"}),
    "completed": frozenset(),
    "stopped": frozenset(),
}

STAGE_KINDS = (
    "baseline",
    "evaluation",
    "recovery",
    "realization",
    "evolution",
    "validation",
    "comparison",
    "holdout",
    "meta-analysis",
    "promotion",
    "publication",
)
DATASET_REQUIRED_KINDS = frozenset(
    {
        "baseline",
        "evaluation",
        "evolution",
        "validation",
        "comparison",
        "holdout",
        "meta-analysis",
    }
)
NO_DATASET_KINDS = frozenset({"realization", "promotion", "publication"})
EVOLUTION_VISIBLE_ONLY_KINDS = frozenset(
    {"baseline", "evaluation", "evolution", "meta-analysis"}
)

OWNER_KINDS = {
    "harbor-organize-evaluations": frozenset({"promotion", "publication"}),
    "harbor-run-results": frozenset(
        {
            "baseline",
            "evaluation",
            "validation",
            "comparison",
            "holdout",
            "publication",
        }
    ),
    "harbor-resume-external-failures": frozenset({"recovery"}),
    "harbor-realize-skill-candidate": frozenset({"realization"}),
    "harbor-population-search": frozenset({"evolution", "validation", "holdout"}),
    "harbor-trace-distillation": frozenset({"evolution", "validation", "holdout"}),
    "harbor-reflective-pareto-search": frozenset(
        {"evolution", "validation", "holdout"}
    ),
    "harbor-operator-coevolution": frozenset(
        {"evolution", "validation", "holdout"}
    ),
    "harbor-evolve-skill": frozenset({"evolution", "validation", "holdout"}),
    "harbor-metaskill-evolution": frozenset({"meta-analysis"}),
}

EVIDENCE_KINDS = (
    "native-job",
    "final-report",
    "evolution-report",
    "candidate",
    "lock",
    "recovery",
    "ledger",
    "decision",
    "other",
)
EVIDENCE_ROLES = (
    "development",
    "validation",
    "holdout",
    "recovery",
    "lineage",
    "comparison",
    "report",
    "decision",
    "publication",
    "diagnostic",
)
VISIBILITIES = ("private", "public")
PUBLICATION_POLICY = "indexes-and-result-tables-only-v1"
PUBLICATION_TABLE_PATTERN = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.table\.(?:csv|tsv|md)$"
)
PUBLICATION_GITIGNORE = """# Harbor study publication allowlist.
# Raw evaluations, datasets, locks, ledgers, status views, jobs, traces,
# candidates, diagnostics, and all other study artifacts stay local.
*
!/.gitignore
!/publication/
!/publication/index.json
!/publication/index.md
!/publication/tables/
!/publication/tables/*.table.csv
!/publication/tables/*.table.tsv
!/publication/tables/*.table.md
"""
PUBLICATION_TRACKED_FILES = frozenset(
    {".gitignore", "publication/index.json", "publication/index.md"}
)


class ContractError(RuntimeError):
    """Raised when the study contract would be violated."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def validate_id(value: str, label: str) -> str:
    if not ID_PATTERN.fullmatch(value):
        raise ContractError(
            f"{label} must contain 1-64 lowercase letters, digits, or interior hyphens"
        )
    return value


def timestamp(value: str | None) -> str:
    if value is None:
        return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        )
    if not UTC_PATTERN.fullmatch(value):
        raise ContractError("recorded-at must use YYYY-MM-DDTHH:MM:SSZ")
    try:
        dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise ContractError(f"invalid recorded-at value: {value}") from error
    return value


def _object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json_bytes(raw: bytes, label: str) -> Any:
    try:
        return json.loads(raw, object_pairs_hook=_object_without_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError(f"{label} is not valid UTF-8 JSON: {error}") from error


def load_json(path: Path) -> Any:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise ContractError(f"cannot read {path}: {error}") from error
    return load_json_bytes(raw, str(path))


def _is_reparse_point(path: Path) -> bool:
    attributes = getattr(path.lstat(), "st_file_attributes", 0)
    flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return bool(attributes & flag)


def _validate_regular_node(path: Path, *, directory: bool) -> None:
    if path.is_symlink() or _is_reparse_point(path):
        raise ContractError(f"links and reparse points are not allowed: {path}")
    mode = path.lstat().st_mode
    expected = stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)
    if not expected:
        kind = "directory" if directory else "regular file"
        raise ContractError(f"expected {kind}: {path}")


def safe_resolve_input(path: str | Path, *, directory: bool) -> Path:
    absolute = Path(os.path.abspath(os.fspath(path)))
    if not absolute.exists() and not absolute.is_symlink():
        raise ContractError(f"artifact does not exist: {absolute}")
    _validate_regular_node(absolute, directory=directory)
    resolved = absolute.resolve(strict=True)
    _validate_regular_node(resolved, directory=directory)
    return resolved


def list_tree_files(root: Path) -> list[Path]:
    root = safe_resolve_input(root, directory=True)
    files: list[Path] = []
    for current, directories, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        directories.sort()
        filenames.sort()
        for name in directories:
            _validate_regular_node(current_path / name, directory=True)
        for name in filenames:
            path = current_path / name
            _validate_regular_node(path, directory=False)
            files.append(path)
    return sorted(files, key=lambda path: path.relative_to(root).as_posix())


def hash_tree(root: Path) -> dict[str, Any]:
    root = safe_resolve_input(root, directory=True)
    digest = hashlib.sha256()
    digest.update(b"harbor-evaluation-tree-v1\0")
    file_count = 0
    byte_count = 0
    for path in list_tree_files(root):
        relative = path.relative_to(root).as_posix()
        size = path.stat().st_size
        content_sha256 = sha256_file(path)
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(size).encode("ascii"))
        digest.update(b"\0")
        digest.update(content_sha256.encode("ascii"))
        digest.update(b"\n")
        file_count += 1
        byte_count += size
    return {
        "artifactType": "directory",
        "sha256": digest.hexdigest(),
        "fileCount": file_count,
        "byteCount": byte_count,
    }


def hash_artifact(path: Path) -> dict[str, Any]:
    absolute = Path(os.path.abspath(os.fspath(path)))
    if absolute.is_dir():
        path = safe_resolve_input(absolute, directory=True)
        result = hash_tree(path)
    else:
        path = safe_resolve_input(absolute, directory=False)
        result = {
            "artifactType": "file",
            "sha256": sha256_file(path),
            "fileCount": 1,
            "byteCount": path.stat().st_size,
        }
    return {"source": str(path), **result}


def discover_tasks(source: Path) -> list[dict[str, Any]]:
    source = safe_resolve_input(source, directory=True)
    task_roots = sorted(
        {path.parent for path in list_tree_files(source) if path.name == "task.toml"},
        key=lambda path: path.relative_to(source).as_posix(),
    )
    if not task_roots:
        raise ContractError(f"dataset contains no Harbor task.toml files: {source}")
    for index, task_root in enumerate(task_roots):
        for other in task_roots[index + 1 :]:
            if task_root in other.parents:
                raise ContractError(
                    f"nested Harbor task roots are ambiguous: {task_root} and {other}"
                )
    tasks = []
    for task_root in task_roots:
        relative = task_root.relative_to(source).as_posix()
        task_id = relative if relative != "." else source.name
        tasks.append({"taskId": task_id, "relativePath": relative, **hash_tree(task_root)})
    return tasks


def write_json_exclusive(path: Path, value: Any) -> bytes:
    raw = pretty_json(value).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise ContractError(f"refusing to overwrite existing file: {path}") from error
    return raw


def write_text_atomic(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporary)
        raise


def require_study_root(value: str | Path) -> Path:
    root = Path(value).resolve()
    required = (root / "study.json", root / "ledger.jsonl", root / "datasets")
    if not root.is_dir() or any(not path.exists() for path in required):
        raise ContractError(f"not an initialized Harbor evaluation study: {root}")
    return root


@contextlib.contextmanager
def study_lock(root: Path) -> Iterator[None]:
    lock_path = root / ".ledger.lock"
    handle = lock_path.open("a+b")
    try:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            with contextlib.suppress(OSError):
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            with contextlib.suppress(OSError):
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def event_sha256(record: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in record.items() if key != "eventSha256"}
    return sha256_bytes(canonical_json(unsigned).encode("utf-8"))


def load_events(root: Path) -> list[dict[str, Any]]:
    path = root / "ledger.jsonl"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise ContractError(f"cannot read ledger: {error}") from error
    if not lines:
        raise ContractError("ledger is empty")
    events: list[dict[str, Any]] = []
    previous = ZERO_SHA256
    for index, line in enumerate(lines, start=1):
        if not line:
            raise ContractError(f"ledger line {index} is blank")
        value = load_json_bytes(line.encode("utf-8"), f"ledger line {index}")
        if not isinstance(value, dict):
            raise ContractError(f"ledger line {index} must be a JSON object")
        if canonical_json(value) != line:
            raise ContractError(f"ledger line {index} is not canonical JSON")
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractError(f"ledger line {index} has an unsupported schemaVersion")
        if value.get("sequence") != index:
            raise ContractError(f"ledger line {index} has an invalid sequence")
        if value.get("previousSha256") != previous:
            raise ContractError(f"ledger line {index} breaks the hash chain")
        if value.get("eventSha256") != event_sha256(value):
            raise ContractError(f"ledger line {index} has an invalid eventSha256")
        if not isinstance(value.get("payload"), dict):
            raise ContractError(f"ledger line {index} has a non-object payload")
        if not UTC_PATTERN.fullmatch(value.get("recordedAt", "")):
            raise ContractError(f"ledger line {index} has an invalid recordedAt")
        previous = value["eventSha256"]
        events.append(value)
    return events


def append_event(
    root: Path, state: dict[str, Any], event_type: str, payload: dict[str, Any], recorded_at: str
) -> dict[str, Any]:
    record = {
        "schemaVersion": SCHEMA_VERSION,
        "sequence": len(state["events"]) + 1,
        "previousSha256": state["headSha256"],
        "recordedAt": recorded_at,
        "event": event_type,
        "payload": payload,
    }
    record["eventSha256"] = event_sha256(record)
    line = canonical_json(record) + "\n"
    with (root / "ledger.jsonl").open("ab") as handle:
        handle.write(line.encode("utf-8"))
        handle.flush()
        os.fsync(handle.fileno())
    return record


def _require_fields(payload: dict[str, Any], fields: tuple[str, ...], event: str) -> None:
    for field in fields:
        if field not in payload:
            raise ContractError(f"{event} payload is missing {field}")


def validate_stage_definition(
    payload: dict[str, Any], datasets: dict[str, dict[str, Any]], stages: dict[str, Any]
) -> None:
    _require_fields(
        payload,
        ("stageId", "label", "kind", "ownerSkill", "datasetIds", "dependsOn"),
        "stage_added",
    )
    stage_id = validate_id(payload["stageId"], "stage id")
    if payload["kind"] not in STAGE_KINDS:
        raise ContractError(f"unsupported stage kind: {payload['kind']}")
    owner = payload["ownerSkill"]
    if owner not in OWNER_KINDS:
        raise ContractError(f"unsupported Harbor owner skill: {owner}")
    if payload["kind"] not in OWNER_KINDS[owner]:
        raise ContractError(f"{owner} cannot own a {payload['kind']} stage")
    if stage_id in stages:
        raise ContractError(f"duplicate stage id: {stage_id}")
    dataset_ids = payload["datasetIds"]
    dependency_ids = payload["dependsOn"]
    if not isinstance(dataset_ids, list) or len(set(dataset_ids)) != len(dataset_ids):
        raise ContractError(f"{stage_id} datasetIds must be a unique list")
    if not isinstance(dependency_ids, list) or len(set(dependency_ids)) != len(dependency_ids):
        raise ContractError(f"{stage_id} dependsOn must be a unique list")
    missing_datasets = [item for item in dataset_ids if item not in datasets]
    if missing_datasets:
        raise ContractError(f"{stage_id} references unknown datasets: {missing_datasets}")
    missing_dependencies = [item for item in dependency_ids if item not in stages]
    if missing_dependencies:
        raise ContractError(f"{stage_id} references unknown prior stages: {missing_dependencies}")
    kind = payload["kind"]
    if kind in DATASET_REQUIRED_KINDS and not dataset_ids:
        raise ContractError(f"{stage_id} requires at least one dataset")
    if kind in NO_DATASET_KINDS and dataset_ids:
        raise ContractError(f"{stage_id} must not bind datasets")
    splits = {datasets[item]["split"] for item in dataset_ids}
    if kind in EVOLUTION_VISIBLE_ONLY_KINDS and not splits.issubset(
        EVOLUTION_VISIBLE_SPLITS
    ):
        raise ContractError(
            f"{stage_id} cannot use sealed validation or holdout datasets"
        )
    if kind == "evolution" and splits != {"development"}:
        raise ContractError(
            f"{stage_id} must use only development datasets for evolution"
        )
    if kind == "evolution":
        if payload.get("evaluationBoundary") != EVOLUTION_EVALUATION_BOUNDARY:
            raise ContractError(
                f"{stage_id} must declare the independent validation boundary"
            )
    elif "evaluationBoundary" in payload:
        raise ContractError(
            f"{stage_id} must not declare an evolution evaluation boundary"
        )
    if kind == "validation" and splits != {"validation"}:
        raise ContractError(f"{stage_id} must use only validation datasets")
    if kind == "holdout" and splits != {"holdout"}:
        raise ContractError(f"{stage_id} must use only holdout datasets")
    if kind == "comparison" and (
        ("validation" in splits and splits != {"validation"})
        or ("holdout" in splits and splits != {"holdout"})
    ):
        raise ContractError(
            f"{stage_id} cannot mix sealed and optimizer-visible datasets"
        )


def _verify_artifact(metadata: dict[str, Any], label: str) -> None:
    current = hash_artifact(Path(metadata["source"]))
    for field in ("artifactType", "sha256", "fileCount", "byteCount"):
        if current[field] != metadata.get(field):
            raise ContractError(f"{label} drifted: {field} changed")


def _paths_overlap(left: Path, right: Path) -> bool:
    left = left.resolve()
    right = right.resolve()
    return left == right or left in right.parents or right in left.parents


def build_state(root: Path, *, verify_sources: bool = False) -> dict[str, Any]:
    events = load_events(root)
    study_path = root / "study.json"
    study_raw = study_path.read_bytes()
    study = load_json_bytes(study_raw, str(study_path))
    if not isinstance(study, dict) or study.get("schemaVersion") not in (1, STUDY_SCHEMA_VERSION):
        raise ContractError("study.json has an unsupported schema")

    state: dict[str, Any] = {
        "study": study,
        "events": [],
        "headSha256": ZERO_SHA256,
        "datasets": {},
        "stages": {},
        "stageOrder": [],
        "evidence": {},
        "designSeal": None,
        "validationRelease": None,
        "holdoutRelease": None,
    }

    for event in events:
        event_type = event["event"]
        payload = event["payload"]
        if event_type == "study_initialized":
            if state["events"]:
                raise ContractError("study_initialized must be the first ledger event")
            _require_fields(payload, ("studyId", "studySha256"), event_type)
            if payload["studyId"] != study.get("studyId"):
                raise ContractError("study_initialized studyId does not match study.json")
            if payload["studySha256"] != sha256_bytes(study_raw):
                raise ContractError("study.json drifted after initialization")
        elif not state["events"]:
            raise ContractError("the first ledger event must be study_initialized")
        elif event_type == "dataset_registered":
            _apply_dataset_event(root, state, payload, verify_sources=verify_sources)
        elif event_type == "stage_added":
            validate_stage_addition(state, payload)
            stage = {
                **payload,
                "order": len(state["stageOrder"]) + 1,
                "status": "planned",
                "evidenceIds": [],
                "lastNote": "",
            }
            state["stages"][stage["stageId"]] = stage
            state["stageOrder"].append(stage["stageId"])
        elif event_type == "stage_transitioned":
            _apply_transition(state, payload)
        elif event_type == "evidence_recorded":
            _apply_evidence(state, payload, verify_sources=verify_sources)
        elif event_type == "design_sealed":
            _apply_design_seal(state, payload, verify_sources=verify_sources)
        elif event_type == "validation_released":
            _apply_validation_release(state, payload, verify_sources=verify_sources)
        elif event_type == "holdout_released":
            _apply_holdout_release(state, payload, verify_sources=verify_sources)
        else:
            raise ContractError(f"unsupported ledger event: {event_type}")
        state["events"].append(event)
        state["headSha256"] = event["eventSha256"]

    registered_locks = {
        Path(dataset["_lockPath"]).resolve() for dataset in state["datasets"].values()
    }
    observed_locks = {path.resolve() for path in (root / "datasets").glob("*.lock.json")}
    unexpected = observed_locks - registered_locks
    if unexpected:
        raise ContractError(
            "unregistered dataset locks exist: "
            + ", ".join(str(path.name) for path in sorted(unexpected))
        )
    return state


def _apply_dataset_event(
    root: Path, state: dict[str, Any], payload: dict[str, Any], *, verify_sources: bool
) -> None:
    _require_fields(payload, ("datasetId", "split", "lockFile", "lockSha256"), "dataset_registered")
    dataset_id = validate_id(payload["datasetId"], "dataset id")
    if dataset_id in state["datasets"]:
        raise ContractError(f"duplicate dataset id: {dataset_id}")
    if any(stage["status"] != "planned" for stage in state["stages"].values()):
        raise ContractError("datasets cannot be registered after study execution starts")
    if state["designSeal"] is not None:
        raise ContractError("datasets cannot be registered after design sealing")
    lock_path = (root / payload["lockFile"]).resolve()
    expected_parent = (root / "datasets").resolve()
    if lock_path.parent != expected_parent or lock_path.name != f"{dataset_id}.lock.json":
        raise ContractError(f"invalid dataset lock path for {dataset_id}")
    raw = lock_path.read_bytes()
    if sha256_bytes(raw) != payload["lockSha256"]:
        raise ContractError(f"dataset lock drifted: {dataset_id}")
    lock = load_json_bytes(raw, str(lock_path))
    if (
        not isinstance(lock, dict)
        or lock.get("schemaVersion") != SCHEMA_VERSION
        or lock.get("datasetId") != dataset_id
        or lock.get("split") != payload["split"]
    ):
        raise ContractError(f"invalid dataset lock: {dataset_id}")
    if lock["split"] not in SPLITS:
        raise ContractError(f"invalid dataset split: {lock['split']}")
    if not isinstance(lock.get("tasks"), list) or not lock["tasks"]:
        raise ContractError(f"dataset lock has no tasks: {dataset_id}")
    source = Path(lock["source"])
    for existing in state["datasets"].values():
        if _paths_overlap(source, Path(existing["source"])):
            raise ContractError(
                f"dataset source overlaps {existing['datasetId']}: {dataset_id}"
            )
        existing_ids = {task["taskId"].casefold() for task in existing["tasks"]}
        existing_digests = {task["sha256"] for task in existing["tasks"]}
        for task in lock["tasks"]:
            if task["taskId"].casefold() in existing_ids:
                raise ContractError(
                    f"task id overlaps {existing['datasetId']}: {dataset_id}"
                )
            if task["sha256"] in existing_digests:
                raise ContractError(
                    f"task content overlaps {existing['datasetId']}: {dataset_id}"
                )
    if verify_sources:
        current = hash_tree(source)
        for field in ("sha256", "fileCount", "byteCount"):
            if current[field] != lock.get(field):
                raise ContractError(f"dataset drifted: {dataset_id} {field} changed")
        current_tasks = discover_tasks(source)
        if canonical_json(current_tasks) != canonical_json(lock["tasks"]):
            raise ContractError(f"dataset task inventory drifted: {dataset_id}")
    state["datasets"][dataset_id] = {**lock, "_lockPath": str(lock_path)}


def _stage_uses_split(
    state: dict[str, Any], stage: dict[str, Any], split: str
) -> bool:
    return any(
        state["datasets"][dataset_id]["split"] == split
        for dataset_id in stage["datasetIds"]
    )


def _stage_uses_validation(state: dict[str, Any], stage: dict[str, Any]) -> bool:
    return _stage_uses_split(state, stage, "validation")


def _stage_uses_holdout(state: dict[str, Any], stage: dict[str, Any]) -> bool:
    return _stage_uses_split(state, stage, "holdout")


def _stage_depends_on(
    state: dict[str, Any], stage_id: str, ancestor_id: str
) -> bool:
    pending = list(state["stages"][stage_id]["dependsOn"])
    seen: set[str] = set()
    while pending:
        dependency = pending.pop()
        if dependency == ancestor_id:
            return True
        if dependency in seen:
            continue
        seen.add(dependency)
        pending.extend(state["stages"][dependency]["dependsOn"])
    return False


def _downstream_validation_stages(
    state: dict[str, Any], evolution_stage_id: str
) -> list[dict[str, Any]]:
    return [
        stage
        for stage in state["stages"].values()
        if stage["kind"] == "validation"
        and stage["status"] != "stopped"
        and _stage_depends_on(state, stage["stageId"], evolution_stage_id)
    ]


def _evolution_start_blockers(
    state: dict[str, Any], stage: dict[str, Any]
) -> list[str]:
    blockers: list[str] = []
    if state["validationRelease"] is not None:
        blockers.append(
            "validation was already released; start a new study with a fresh "
            "validation dataset"
        )
    if not any(
        dataset["split"] == "validation" for dataset in state["datasets"].values()
    ):
        blockers.append("at least one independent validation dataset is required")
    if not _downstream_validation_stages(state, stage["stageId"]):
        blockers.append(
            "a downstream validation stage depending on this evolution must be planned"
        )
    return blockers


def _requires_design(state: dict[str, Any]) -> bool:
    return state["study"]["schemaVersion"] >= STUDY_SCHEMA_VERSION


def validate_stage_addition(state: dict[str, Any], payload: dict[str, Any]) -> None:
    validate_stage_definition(payload, state["datasets"], state["stages"])
    if _requires_design(state) and payload["kind"] == "recovery":
        splits = {state["datasets"][item]["split"] for item in payload["datasetIds"]}
        if ("validation" in splits or "holdout" in splits) and len(splits) > 1:
            raise ContractError("recovery cannot mix sealed and optimizer-visible datasets or private splits")
    if state["designSeal"] is not None and payload["kind"] != "recovery" and (
        _stage_uses_validation(state, payload) or _stage_uses_holdout(state, payload)
    ):
        raise ContractError("sealed-dataset stages must be planned before design sealing")


def _validate_design_review(state: dict[str, Any], artifact: dict[str, Any]) -> None:
    """Check a curator's private receipt, never infer semantic quality from task text."""
    if artifact.get("artifactType") != "directory":
        raise ContractError("design review must be a directory with review.json and evidence files")
    _verify_artifact(artifact, "design review")
    review_root = Path(artifact["source"])
    review = load_json(review_root / "review.json")
    if not isinstance(review, dict) or review.get("schemaVersion") != 1:
        raise ContractError("unsupported design review schema")
    if not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
        raise ContractError("design review requires a reviewer identity")
    checks = review.get("checks")
    if not isinstance(checks, dict) or set(checks) != set(DESIGN_REVIEW_CHECKS):
        raise ContractError("design review must include all six required quality checks")
    for name in DESIGN_REVIEW_CHECKS:
        check = checks[name]
        if not isinstance(check, dict) or check.get("status") != "pass":
            raise ContractError(f"design review check must pass before sealing: {name}")
        relative = check.get("evidenceFile")
        if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
            raise ContractError(f"design review evidenceFile must be relative: {name}")
        evidence_path = (review_root / relative).resolve()
        if review_root.resolve() not in evidence_path.parents or evidence_path.name == "review.json":
            raise ContractError(f"design review evidenceFile must identify supporting evidence: {name}")
        _validate_regular_node(evidence_path, directory=False)
        if not evidence_path.stat().st_size:
            raise ContractError(f"design review evidenceFile is empty: {name}")
    reviews = review.get("datasets")
    if not isinstance(reviews, list) or len(reviews) != len(state["datasets"]):
        raise ContractError("design review must cover every registered dataset exactly once")
    seen_datasets: set[str] = set()
    group_datasets: dict[str, str] = {}
    for dataset_review in reviews:
        if not isinstance(dataset_review, dict):
            raise ContractError("design review dataset entry must be an object")
        dataset_id = dataset_review.get("datasetId")
        if not isinstance(dataset_id, str) or dataset_id not in state["datasets"] or dataset_id in seen_datasets:
            raise ContractError("design review contains an unknown or repeated dataset")
        seen_datasets.add(dataset_id)
        dataset = state["datasets"][dataset_id]
        if dataset_review.get("datasetSha256") != dataset["sha256"]:
            raise ContractError(f"design review dataset digest does not match: {dataset_id}")
        tasks = dataset_review.get("tasks")
        expected = {task["taskId"]: task["sha256"] for task in dataset["tasks"]}
        if not isinstance(tasks, list) or len(tasks) != len(expected):
            raise ContractError(f"design review must cover every task exactly once: {dataset_id}")
        seen_tasks: set[str] = set()
        for task in tasks:
            if not isinstance(task, dict):
                raise ContractError(f"design review task entry must be an object: {dataset_id}")
            task_id = task.get("taskId")
            if not isinstance(task_id, str) or task_id not in expected or task_id in seen_tasks:
                raise ContractError(f"design review contains an unknown or repeated task: {dataset_id}")
            seen_tasks.add(task_id)
            if task.get("taskSha256") != expected[task_id]:
                raise ContractError(f"design review task digest does not match: {dataset_id}")
            groups = task.get("groupIds")
            if (not isinstance(groups, list) or not groups
                    or any(not isinstance(group, str) or not ID_PATTERN.fullmatch(group) for group in groups)
                    or len(set(groups)) != len(groups)):
                raise ContractError(f"each task needs unique opaque groupIds: {dataset_id}")
            for group in groups:
                prior = group_datasets.setdefault(group, dataset_id)
                if prior != dataset_id:
                    raise ContractError(f"declared independence group overlaps datasets: {prior}, {dataset_id}")


def _planned_gate_ids(state: dict[str, Any]) -> list[str]:
    return [stage_id for stage_id in state["stageOrder"]
            if state["stages"][stage_id]["kind"] != "recovery" and (
                _stage_uses_validation(state, state["stages"][stage_id])
                or _stage_uses_holdout(state, state["stages"][stage_id]))]


def _validate_gate_coverage(state: dict[str, Any]) -> None:
    for split in ("validation", "holdout"):
        expected = {key for key, dataset in state["datasets"].items() if dataset["split"] == split}
        bound = {dataset_id for stage in state["stages"].values()
                 if stage["kind"] == split and stage["status"] != "stopped"
                 for dataset_id in stage["datasetIds"]}
        if expected != bound:
            raise ContractError(f"every registered {split} dataset needs a planned {split} stage")
    for stage in state["stages"].values():
        if stage["kind"] == "evolution":
            blockers = _evolution_start_blockers(state, stage)
            if blockers:
                raise ContractError("cannot seal evolution design: " + "; ".join(blockers))
    evolution_ids = [stage["stageId"] for stage in state["stages"].values() if stage["kind"] == "evolution"]
    validation_gates = [stage_id for stage_id in _planned_gate_ids(state)
                        if _stage_uses_validation(state, state["stages"][stage_id])]
    if validation_gates and not any(
        all(_stage_depends_on(state, gate_id, evolution_id) for gate_id in validation_gates)
        for evolution_id in evolution_ids
    ):
        raise ContractError("all private validation gates need a common evolution selection ancestor before sealing")
    holdout_gates = [stage_id for stage_id in _planned_gate_ids(state)
                     if _stage_uses_holdout(state, state["stages"][stage_id])]
    selection_kinds = {"validation"} if evolution_ids else {"evaluation", "comparison"}
    selection_ids = [stage["stageId"] for stage in state["stages"].values()
                     if stage["kind"] in selection_kinds and not _stage_uses_holdout(state, stage)]
    if holdout_gates and not any(
        all(_stage_depends_on(state, gate_id, selection_id) for gate_id in holdout_gates)
        for selection_id in selection_ids
    ):
        raise ContractError("all private holdout gates need a common pre-holdout selection ancestor before sealing")


def _apply_design_seal(
    state: dict[str, Any], payload: dict[str, Any], *, verify_sources: bool
) -> None:
    _require_fields(payload, ("protocol", "baseline", "review", "datasetDigests", "gateStageIds"), "design_sealed")
    if not _requires_design(state):
        raise ContractError("legacy studies cannot acquire a new design retrospectively; initialize a new study")
    if state["designSeal"] is not None:
        raise ContractError("study design can be sealed only once")
    if not state["datasets"] or not state["stages"]:
        raise ContractError("register datasets and stages before design sealing")
    if any(stage["status"] != "planned" for stage in state["stages"].values()):
        raise ContractError("design must be sealed before study execution starts")
    expected_digests = {key: dataset["sha256"] for key, dataset in state["datasets"].items()}
    if payload["datasetDigests"] != expected_digests or payload["gateStageIds"] != _planned_gate_ids(state):
        raise ContractError("design seal must bind all dataset digests and sealed-dataset stages")
    _validate_gate_coverage(state)
    _validate_design_review(state, payload["review"])
    if payload["protocol"].get("artifactType") != "file" or not payload["protocol"].get("byteCount"):
        raise ContractError("design protocol must be a non-empty file")
    if not payload["baseline"].get("byteCount"):
        raise ContractError("design baseline must be a non-empty artifact")
    if verify_sources:
        for name in ("protocol", "baseline"):
            _verify_artifact(payload[name], f"design {name}")
    state["designSeal"] = payload


def _consumed_private_gate_blocks(state: dict[str, Any], stage: dict[str, Any]) -> bool:
    released = state["validationRelease"] is not None or state["holdoutRelease"] is not None
    return bool(_requires_design(state) and released and (
        any(state["datasets"][item]["split"] in EVOLUTION_VISIBLE_SPLITS for item in stage["datasetIds"])
        or stage["kind"] in {"evolution", "realization", "meta-analysis"}
        or (stage["kind"] == "recovery" and not stage["datasetIds"])
    ))


def _apply_transition(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_fields(payload, ("stageId", "fromStatus", "toStatus", "note"), "stage_transitioned")
    stage_id = payload["stageId"]
    if stage_id not in state["stages"]:
        raise ContractError(f"transition references unknown stage: {stage_id}")
    stage = state["stages"][stage_id]
    if payload["fromStatus"] != stage["status"]:
        raise ContractError(f"{stage_id} transition has the wrong fromStatus")
    target = payload["toStatus"]
    if target not in STATUSES or target not in TRANSITIONS[stage["status"]]:
        raise ContractError(f"illegal stage transition: {stage['status']} -> {target}")
    if target in {"running", "completed"}:
        incomplete = [
            dependency
            for dependency in stage["dependsOn"]
            if state["stages"][dependency]["status"] != "completed"
        ]
        if incomplete:
            raise ContractError(f"{stage_id} has incomplete dependencies: {incomplete}")
    if target == "running" and stage["kind"] == "evolution":
        blockers = _evolution_start_blockers(state, stage)
        if blockers:
            raise ContractError(
                f"{stage_id} cannot start evolution: " + "; ".join(blockers)
            )
    if target == "running" and _requires_design(state) and state["designSeal"] is None:
        raise ContractError("seal-design is required before study execution starts")
    if target == "running" and _consumed_private_gate_blocks(state, stage):
        raise ContractError("optimizer-visible work cannot resume after private release; use a new study with fresh private verification data")
    if target == "running" and _stage_uses_validation(state, stage):
        if state["validationRelease"] is None:
            raise ContractError(f"{stage_id} cannot run before validation release")
    if target == "running" and _stage_uses_holdout(state, stage):
        if state["holdoutRelease"] is None:
            raise ContractError(f"{stage_id} cannot run before holdout release")
    if target == "completed" and not stage["evidenceIds"]:
        raise ContractError(f"{stage_id} cannot complete without recorded evidence")
    stage["status"] = target
    stage["lastNote"] = payload["note"]


def _apply_evidence(
    state: dict[str, Any], payload: dict[str, Any], *, verify_sources: bool
) -> None:
    _require_fields(
        payload,
        (
            "evidenceId",
            "stageId",
            "kind",
            "role",
            "visibility",
            "source",
            "artifactType",
            "sha256",
            "fileCount",
            "byteCount",
        ),
        "evidence_recorded",
    )
    evidence_id = validate_id(payload["evidenceId"], "evidence id")
    if evidence_id in state["evidence"]:
        raise ContractError(f"duplicate evidence id: {evidence_id}")
    stage_id = payload["stageId"]
    if stage_id not in state["stages"]:
        raise ContractError(f"evidence references unknown stage: {stage_id}")
    stage = state["stages"][stage_id]
    if stage["status"] not in {"running", "blocked"}:
        raise ContractError(f"evidence can be recorded only for running or blocked stages: {stage_id}")
    if payload["kind"] not in EVIDENCE_KINDS:
        raise ContractError(f"unsupported evidence kind: {payload['kind']}")
    if payload["role"] not in EVIDENCE_ROLES:
        raise ContractError(f"unsupported evidence role: {payload['role']}")
    if payload["visibility"] not in VISIBILITIES:
        raise ContractError(f"unsupported evidence visibility: {payload['visibility']}")
    if payload["kind"] == "native-job" and payload["visibility"] != "private":
        raise ContractError("native Harbor jobs must remain private")
    if _requires_design(state) and payload["role"] in {"validation", "holdout"}:
        if not _stage_uses_split(state, stage, payload["role"]):
            raise ContractError("sealed evidence roles require a stage bound to that split")
    if _requires_design(state) and payload["role"] == "development" and (
        _stage_uses_validation(state, stage) or _stage_uses_holdout(state, stage)
    ):
        raise ContractError("private gate evidence cannot be labeled development")
    if (
        payload["role"] == "validation" or _stage_uses_validation(state, stage)
    ) and state["validationRelease"] is None:
        raise ContractError("validation evidence cannot be recorded before release")
    if (
        payload["role"] == "holdout" or _stage_uses_holdout(state, stage)
    ) and state["holdoutRelease"] is None:
        raise ContractError("holdout evidence cannot be recorded before release")
    if verify_sources:
        _verify_artifact(payload, f"evidence {evidence_id}")
    state["evidence"][evidence_id] = payload
    stage["evidenceIds"].append(evidence_id)


def _apply_validation_release(
    state: dict[str, Any], payload: dict[str, Any], *, verify_sources: bool
) -> None:
    _require_fields(
        payload,
        (
            "selectionId",
            "selectedStageId",
            "source",
            "artifactType",
            "sha256",
            "fileCount",
            "byteCount",
        ),
        "validation_released",
    )
    if state["validationRelease"] is not None:
        raise ContractError("validation can be released only once")
    validate_id(payload["selectionId"], "selection id")
    selected_stage_id = payload["selectedStageId"]
    if selected_stage_id not in state["stages"]:
        raise ContractError(
            f"validation release references unknown stage: {selected_stage_id}"
        )
    selected_stage = state["stages"][selected_stage_id]
    if selected_stage["status"] != "completed" or selected_stage["kind"] != "evolution":
        raise ContractError(
            "validation release requires a completed evolution selection stage"
        )
    matching_evidence = [
        state["evidence"][evidence_id]
        for evidence_id in selected_stage["evidenceIds"]
        if state["evidence"][evidence_id]["source"] == payload["source"]
        and state["evidence"][evidence_id]["sha256"] == payload["sha256"]
        and state["evidence"][evidence_id]["kind"] == "candidate"
    ]
    if not matching_evidence:
        raise ContractError(
            "validation candidate evidence must already be recorded with kind candidate "
            "on the selected evolution stage"
        )
    if not any(
        dataset["split"] == "validation" for dataset in state["datasets"].values()
    ):
        raise ContractError("validation release requires a registered validation dataset")
    if not _downstream_validation_stages(state, selected_stage_id):
        raise ContractError(
            "validation release requires a downstream validation stage for the selection"
        )
    unfinished_evolution = [
        stage["stageId"]
        for stage in state["stages"].values()
        if stage["kind"] == "evolution"
        and stage["stageId"] != selected_stage_id
        and stage["status"] not in TERMINAL_STATUSES
    ]
    if unfinished_evolution:
        raise ContractError(
            "validation release requires every other evolution stage to be terminal: "
            f"{unfinished_evolution}"
        )
    if _requires_design(state):
        if state["designSeal"] is None:
            raise ContractError("validation release requires a sealed design")
        for stage_id in state["designSeal"]["gateStageIds"]:
            gate = state["stages"][stage_id]
            if _stage_uses_validation(state, gate) and (
                gate["status"] != "planned" or not _stage_depends_on(state, stage_id, selected_stage_id)
            ):
                raise ContractError("all planned validation gates must depend on the frozen selection and remain planned")
        if any(stage["status"] in {"running", "blocked"} for stage in state["stages"].values()):
            raise ContractError("finish or stop all active work before validation release")
    if verify_sources:
        _verify_artifact(payload, "validation candidate evidence")
    state["validationRelease"] = payload


def _apply_holdout_release(
    state: dict[str, Any], payload: dict[str, Any], *, verify_sources: bool
) -> None:
    _require_fields(
        payload,
        (
            "selectionId",
            "selectedStageId",
            "source",
            "artifactType",
            "sha256",
            "fileCount",
            "byteCount",
        ),
        "holdout_released",
    )
    if state["holdoutRelease"] is not None:
        raise ContractError("holdout can be released only once")
    validate_id(payload["selectionId"], "selection id")
    selected_stage_id = payload["selectedStageId"]
    if selected_stage_id not in state["stages"]:
        raise ContractError(f"holdout release references unknown stage: {selected_stage_id}")
    if state["stages"][selected_stage_id]["status"] != "completed":
        raise ContractError("holdout release requires a completed development selection stage")
    selected_stage = state["stages"][selected_stage_id]
    has_evolution = any(
        stage["kind"] == "evolution" for stage in state["stages"].values()
    )
    if has_evolution and state["validationRelease"] is None:
        raise ContractError(
            "holdout release requires the independent validation gate to be released first"
        )
    allowed_selection_kinds = (
        {"validation"} if has_evolution else {"evaluation", "comparison"}
    )
    if selected_stage["kind"] not in allowed_selection_kinds:
        raise ContractError(
            "holdout release after evolution requires a completed validation stage"
            if has_evolution
            else "holdout release requires an evaluation or comparison selection stage"
        )
    if _stage_uses_holdout(state, selected_stage):
        raise ContractError("holdout release selection must use pre-holdout evidence")
    matching_evidence = [
        state["evidence"][evidence_id]
        for evidence_id in selected_stage["evidenceIds"]
        if state["evidence"][evidence_id]["source"] == payload["source"]
        and state["evidence"][evidence_id]["sha256"] == payload["sha256"]
    ]
    if not matching_evidence:
        raise ContractError(
            "holdout selection evidence must already be recorded on the selected stage"
        )
    if not any(dataset["split"] == "holdout" for dataset in state["datasets"].values()):
        raise ContractError("holdout release requires a registered holdout dataset")
    if _requires_design(state):
        if state["designSeal"] is None:
            raise ContractError("holdout release requires a sealed design")
        gates = [state["stages"][item] for item in state["designSeal"]["gateStageIds"]]
        if any(_stage_uses_validation(state, gate) and gate["status"] != "completed" for gate in gates):
            raise ContractError("holdout release requires every planned validation gate to complete")
        if any(_stage_uses_holdout(state, gate) and (
                gate["status"] != "planned"
                or not _stage_depends_on(state, gate["stageId"], selected_stage_id)) for gate in gates):
            raise ContractError("all planned holdout gates must depend on the selected gate and remain planned")
        if any(stage["status"] in {"running", "blocked"} for stage in state["stages"].values()):
            raise ContractError("finish or stop all active work before holdout release")
    if verify_sources:
        _verify_artifact(payload, "holdout selection evidence")
    state["holdoutRelease"] = payload


def register_dataset(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    dataset_id = validate_id(args.dataset_id, "dataset id")
    source = safe_resolve_input(args.source, directory=True)
    summary = hash_tree(source)
    tasks = discover_tasks(source)
    lock = {
        "schemaVersion": SCHEMA_VERSION,
        "datasetId": dataset_id,
        "split": args.split,
        "source": str(source),
        **summary,
        "tasks": tasks,
    }
    lock_path = root / "datasets" / f"{dataset_id}.lock.json"
    with study_lock(root):
        state = build_state(root)
        if dataset_id in state["datasets"]:
            raise ContractError(f"duplicate dataset id: {dataset_id}")
        if any(stage["status"] != "planned" for stage in state["stages"].values()):
            raise ContractError("datasets cannot be registered after study execution starts")
        if state["designSeal"] is not None:
            raise ContractError("datasets cannot be registered after design sealing")
        for existing in state["datasets"].values():
            if _paths_overlap(source, Path(existing["source"])):
                raise ContractError(f"dataset source overlaps {existing['datasetId']}")
            existing_ids = {task["taskId"].casefold() for task in existing["tasks"]}
            existing_digests = {task["sha256"] for task in existing["tasks"]}
            for task in tasks:
                if task["taskId"].casefold() in existing_ids:
                    raise ContractError(
                        f"task id overlaps {existing['datasetId']}: {dataset_id}"
                    )
                if task["sha256"] in existing_digests:
                    raise ContractError(
                        f"task content overlaps {existing['datasetId']}: {dataset_id}"
                    )
        lock_raw = write_json_exclusive(lock_path, lock)
        event = append_event(
            root,
            state,
            "dataset_registered",
            {
                "datasetId": dataset_id,
                "split": args.split,
                "lockFile": f"datasets/{dataset_id}.lock.json",
                "lockSha256": sha256_bytes(lock_raw),
            },
            timestamp(args.recorded_at),
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {"ok": True, "event": event, "dataset": public_dataset(lock)}


def add_stage(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    payload = {
        "stageId": validate_id(args.stage_id, "stage id"),
        "label": args.label or args.stage_id,
        "kind": args.kind,
        "ownerSkill": args.owner_skill,
        "datasetIds": args.dataset_id or [],
        "dependsOn": args.depends_on or [],
    }
    if args.kind == "evolution":
        payload["evaluationBoundary"] = dict(EVOLUTION_EVALUATION_BOUNDARY)
    with study_lock(root):
        state = build_state(root)
        validate_stage_addition(state, payload)
        event = append_event(
            root, state, "stage_added", payload, timestamp(args.recorded_at)
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {"ok": True, "event": event, "stage": public_stage(new_state["stages"][payload["stageId"]])}


def transition_stage(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    with study_lock(root):
        state = build_state(root, verify_sources=args.status == "running")
        if args.stage_id not in state["stages"]:
            raise ContractError(f"unknown stage: {args.stage_id}")
        stage = state["stages"][args.stage_id]
        payload = {
            "stageId": args.stage_id,
            "fromStatus": stage["status"],
            "toStatus": args.status,
            "note": args.note or "",
        }
        preview = json.loads(json.dumps(state))
        _apply_transition(preview, payload)
        event = append_event(
            root, state, "stage_transitioned", payload, timestamp(args.recorded_at)
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {"ok": True, "event": event, "stage": public_stage(new_state["stages"][args.stage_id])}


def seal_design(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    with study_lock(root):
        state = build_state(root, verify_sources=True)
        payload = {
            "protocol": hash_artifact(Path(args.protocol)),
            "baseline": hash_artifact(Path(args.baseline)),
            "review": hash_artifact(Path(args.review)),
            "datasetDigests": {key: dataset["sha256"] for key, dataset in state["datasets"].items()},
            "gateStageIds": _planned_gate_ids(state),
        }
        preview = json.loads(json.dumps(state))
        _apply_design_seal(preview, payload, verify_sources=True)
        append_event(root, state, "design_sealed", payload, timestamp(args.recorded_at))
        new_state = build_state(root)
        render_status(root, new_state)
    return {"ok": True, "design": public_design(new_state)}


def record_evidence(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    evidence_id = validate_id(args.evidence_id, "evidence id")
    artifact = hash_artifact(Path(args.path))
    payload = {
        "evidenceId": evidence_id,
        "stageId": args.stage_id,
        "kind": args.kind,
        "role": args.role,
        "visibility": args.visibility,
        **artifact,
    }
    with study_lock(root):
        state = build_state(root)
        preview = json.loads(json.dumps(state))
        _apply_evidence(preview, payload, verify_sources=False)
        event = append_event(
            root, state, "evidence_recorded", payload, timestamp(args.recorded_at)
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {"ok": True, "event": event, "evidence": public_evidence(payload)}


def release_validation(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    selection_id = validate_id(args.selection_id, "selection id")
    artifact = hash_artifact(Path(args.candidate_evidence))
    payload = {
        "selectionId": selection_id,
        "selectedStageId": args.selected_stage,
        **artifact,
    }
    with study_lock(root):
        state = build_state(root, verify_sources=True)
        preview = json.loads(json.dumps(state))
        _apply_validation_release(preview, payload, verify_sources=False)
        event = append_event(
            root, state, "validation_released", payload, timestamp(args.recorded_at)
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {
        "ok": True,
        "event": event,
        "validation": public_validation_release(payload),
    }


def release_holdout(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    selection_id = validate_id(args.selection_id, "selection id")
    artifact = hash_artifact(Path(args.selection_evidence))
    payload = {
        "selectionId": selection_id,
        "selectedStageId": args.selected_stage,
        **artifact,
    }
    with study_lock(root):
        state = build_state(root, verify_sources=True)
        preview = json.loads(json.dumps(state))
        _apply_holdout_release(preview, payload, verify_sources=False)
        event = append_event(
            root, state, "holdout_released", payload, timestamp(args.recorded_at)
        )
        new_state = build_state(root)
        render_status(root, new_state)
    return {
        "ok": True,
        "event": event,
        "holdout": public_holdout_release(payload),
    }


def public_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    return {
        "datasetId": dataset["datasetId"],
        "split": dataset["split"],
        "access": "public" if dataset["split"] in EVOLUTION_VISIBLE_SPLITS else "private",
        "optimizerVisible": dataset["split"] in EVOLUTION_VISIBLE_SPLITS,
        "sha256": dataset["sha256"],
        "taskCount": len(dataset["tasks"]),
        "fileCount": dataset["fileCount"],
        "byteCount": dataset["byteCount"],
    }


def public_design(state: dict[str, Any]) -> dict[str, Any]:
    seal = state["designSeal"]
    return {
        "required": _requires_design(state),
        "sealed": seal is not None,
        "protocolSha256": seal["protocol"]["sha256"] if seal else None,
        "baselineSha256": seal["baseline"]["sha256"] if seal else None,
        "reviewSha256": seal["review"]["sha256"] if seal else None,
        "gateStageIds": seal["gateStageIds"] if seal else [],
    }


def public_stage(stage: dict[str, Any]) -> dict[str, Any]:
    result = {
        key: stage[key]
        for key in (
            "order",
            "stageId",
            "label",
            "kind",
            "ownerSkill",
            "datasetIds",
            "dependsOn",
            "status",
            "evidenceIds",
            "lastNote",
        )
    }
    if stage["kind"] == "evolution":
        result["evaluationBoundary"] = stage["evaluationBoundary"]
    return result


def public_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        key: evidence[key]
        for key in (
            "evidenceId",
            "stageId",
            "kind",
            "role",
            "visibility",
            "artifactType",
            "sha256",
            "fileCount",
            "byteCount",
        )
    }


def public_release(release: dict[str, Any] | None) -> dict[str, Any] | None:
    if release is None:
        return None
    return {
        key: release[key]
        for key in (
            "selectionId",
            "selectedStageId",
            "artifactType",
            "sha256",
            "fileCount",
            "byteCount",
        )
    }


def public_validation_release(
    release: dict[str, Any] | None,
) -> dict[str, Any] | None:
    return public_release(release)


def public_holdout_release(release: dict[str, Any] | None) -> dict[str, Any] | None:
    return public_release(release)


def publication_tables(root: Path) -> list[dict[str, Any]]:
    publication_root = root / "publication"
    tables_root = publication_root / "tables"
    _validate_regular_node(publication_root, directory=True)
    _validate_regular_node(tables_root, directory=True)

    allowed_publication_entries = {"index.json", "index.md", "tables"}
    unexpected_publication = sorted(
        entry.name
        for entry in publication_root.iterdir()
        if entry.name not in allowed_publication_entries
    )
    if unexpected_publication:
        raise ContractError(
            "unexpected publication artifact: " + ", ".join(unexpected_publication)
        )

    tables: list[dict[str, Any]] = []
    for entry in sorted(tables_root.iterdir(), key=lambda path: path.name):
        if not PUBLICATION_TABLE_PATTERN.fullmatch(entry.name):
            raise ContractError(
                "result tables must be flat files named "
                f"<id>.table.csv, <id>.table.tsv, or <id>.table.md: {entry.name}"
            )
        _validate_regular_node(entry, directory=False)
        tables.append(
            {
                "path": f"tables/{entry.name}",
                "sha256": sha256_file(entry),
                "byteCount": entry.stat().st_size,
            }
        )
    return tables


def publication_snapshot(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    stages = [state["stages"][stage_id] for stage_id in state["stageOrder"]]
    completed = sum(stage["status"] == "completed" for stage in stages)
    public_results = [
        public_evidence(evidence)
        for evidence in state["evidence"].values()
        if evidence["visibility"] == "public"
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "publicationPolicy": PUBLICATION_POLICY,
        "study": {
            key: state["study"][key]
            for key in ("studyId", "title", "comparisonProfile", "createdAt")
        },
        "ledger": {
            "eventCount": len(state["events"]),
            "headSha256": state["headSha256"],
        },
        "progress": {
            "stageCount": len(stages),
            "completedCount": completed,
            "completionPercent": (
                round(100 * completed / len(stages), 2) if stages else 0.0
            ),
        },
        "validationReleased": state["validationRelease"] is not None,
        "holdoutReleased": state["holdoutRelease"] is not None,
        "resultIndex": public_results,
        "resultTables": publication_tables(root),
    }


def publication_markdown(snapshot: dict[str, Any]) -> str:
    study = snapshot["study"]
    progress = snapshot["progress"]
    lines = [
        f"# {study['title']} — Publication Index",
        "",
        f"- Study: `{study['studyId']}`",
        f"- Comparison profile: `{study['comparisonProfile']}`",
        f"- Publication policy: `{snapshot['publicationPolicy']}`",
        (
            f"- Progress: {progress['completedCount']}/{progress['stageCount']} completed "
            f"({progress['completionPercent']:.2f}%)"
        ),
        f"- Validation released: {'yes' if snapshot['validationReleased'] else 'no'}",
        f"- Holdout released: {'yes' if snapshot['holdoutReleased'] else 'no'}",
        "",
        "Raw Harbor evaluations, datasets, task content, jobs, traces, candidates, "
        "diagnostics, and local paths are intentionally excluded.",
        "",
        "## Public result index",
        "",
        "| Evidence | Kind | Role | SHA-256 | Files | Bytes |",
        "| --- | --- | --- | --- | ---: | ---: |",
    ]
    for evidence in snapshot["resultIndex"]:
        lines.append(
            f"| {markdown_escape(evidence['evidenceId'])} | "
            f"{markdown_escape(evidence['kind'])} | "
            f"{markdown_escape(evidence['role'])} | "
            f"`{evidence['sha256']}` | {evidence['fileCount']} | "
            f"{evidence['byteCount']} |"
        )
    if not snapshot["resultIndex"]:
        lines.append("| _None_ |  |  |  | 0 | 0 |")

    lines.extend(
        [
            "",
            "## Reviewed aggregate result tables",
            "",
            "| Table | SHA-256 | Bytes |",
            "| --- | --- | ---: |",
        ]
    )
    for table in snapshot["resultTables"]:
        lines.append(
            f"| `{markdown_escape(table['path'])}` | `{table['sha256']}` | "
            f"{table['byteCount']} |"
        )
    if not snapshot["resultTables"]:
        lines.append("| _None_ |  | 0 |")
    lines.append("")
    return "\n".join(lines)


def render_publication(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    snapshot = publication_snapshot(root, state)
    write_text_atomic(root / "publication" / "index.json", pretty_json(snapshot))
    write_text_atomic(root / "publication" / "index.md", publication_markdown(snapshot))
    return snapshot


def verify_publication_policy(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    ignore_path = root / ".gitignore"
    if not ignore_path.is_file() or ignore_path.read_text(encoding="utf-8") != PUBLICATION_GITIGNORE:
        raise ContractError("publication Git allowlist drifted")

    expected = publication_snapshot(root, state)
    expected_json = pretty_json(expected)
    expected_markdown = publication_markdown(expected)
    index_json = root / "publication" / "index.json"
    index_markdown = root / "publication" / "index.md"
    if not index_json.is_file() or index_json.read_text(encoding="utf-8") != expected_json:
        raise ContractError("publication/index.json is missing or stale; run verify --render")
    if (
        not index_markdown.is_file()
        or index_markdown.read_text(encoding="utf-8") != expected_markdown
    ):
        raise ContractError("publication/index.md is missing or stale; run verify --render")
    return expected


def _tracked_study_files(root: Path) -> tuple[Path | None, list[str]]:
    try:
        repository = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            text=True,
        )
    except FileNotFoundError:
        return None, []
    if repository.returncode != 0:
        return None, []
    repository_root = Path(repository.stdout.strip()).resolve()
    try:
        study_relative = root.resolve().relative_to(repository_root).as_posix()
    except ValueError as error:
        raise ContractError("study root is outside its reported Git repository") from error
    tracked = subprocess.run(
        [
            "git",
            "-C",
            str(repository_root),
            "ls-files",
            "--cached",
            "-z",
            "--",
            study_relative,
        ],
        capture_output=True,
        check=False,
    )
    if tracked.returncode != 0:
        raise ContractError("cannot inspect tracked study files with Git")
    prefix = f"{study_relative}/" if study_relative != "." else ""
    relative_files = []
    for raw in tracked.stdout.split(b"\0"):
        if not raw:
            continue
        path = raw.decode("utf-8").replace("\\", "/")
        if prefix and not path.startswith(prefix):
            raise ContractError(f"Git returned a path outside the study: {path}")
        relative_files.append(path[len(prefix) :] if prefix else path)
    return repository_root, sorted(relative_files)


def verify_git_tracking(root: Path, *, require_clean: bool) -> dict[str, Any]:
    repository_root, tracked = _tracked_study_files(root)
    disallowed = []
    for path in tracked:
        if path in PUBLICATION_TRACKED_FILES:
            continue
        if path.startswith("publication/tables/") and PUBLICATION_TABLE_PATTERN.fullmatch(
            path.removeprefix("publication/tables/")
        ):
            continue
        disallowed.append(path)
    if disallowed:
        raise ContractError(
            "Git tracks non-public Harbor study artifacts: " + ", ".join(disallowed)
        )
    if repository_root is not None and require_clean:
        study_relative = root.resolve().relative_to(repository_root).as_posix()
        worktree_diff = subprocess.run(
            [
                "git",
                "-C",
                str(repository_root),
                "diff",
                "--quiet",
                "--",
                study_relative,
            ],
            check=False,
        )
        if worktree_diff.returncode == 1:
            raise ContractError(
                "tracked publication files differ between the Git index and worktree; "
                "stage the refreshed indexes and tables, then verify again"
            )
        if worktree_diff.returncode != 0:
            raise ContractError("cannot compare tracked publication files with Git")
    return {
        "repositoryDetected": repository_root is not None,
        "trackedFileCount": len(tracked),
    }


def status_snapshot(state: dict[str, Any]) -> dict[str, Any]:
    stages = [state["stages"][stage_id] for stage_id in state["stageOrder"]]
    counts = {status: sum(stage["status"] == status for stage in stages) for status in STATUSES}
    total = len(stages)
    completed = counts["completed"]
    terminal = completed + counts["stopped"]

    next_stage = next(
        (stage for stage in stages if stage["status"] in {"running", "blocked"}), None
    )
    if next_stage is None:
        next_stage = next(
            (
                stage
                for stage in stages
                if stage["status"] == "planned"
                and (not _requires_design(state) or state["designSeal"] is not None)
                and not _consumed_private_gate_blocks(state, stage)
                and all(
                    state["stages"][dependency]["status"] == "completed"
                    for dependency in stage["dependsOn"]
                )
                and (
                    not _stage_uses_validation(state, stage)
                    or state["validationRelease"] is not None
                )
                and (
                    not _stage_uses_holdout(state, stage)
                    or state["holdoutRelease"] is not None
                )
                and not (
                    stage["kind"] == "evolution"
                    and _evolution_start_blockers(state, stage)
                )
            ),
            None,
        )

    evidence = [
        public_evidence(state["evidence"][evidence_id])
        for stage in stages
        for evidence_id in stage["evidenceIds"]
    ]
    datasets = [
        public_dataset(state["datasets"][dataset_id])
        for dataset_id in sorted(state["datasets"])
    ]
    validation_count = sum(dataset["split"] == "validation" for dataset in datasets)
    holdout_count = sum(dataset["split"] == "holdout" for dataset in datasets)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "study": {
            key: state["study"][key]
            for key in (
                "studyId",
                "title",
                "objective",
                "comparisonProfile",
                "createdAt",
            )
        },
        "ledger": {
            "eventCount": len(state["events"]),
            "headSha256": state["headSha256"],
        },
        "datasets": datasets,
        "design": public_design(state),
        "validation": {
            "datasetCount": validation_count,
            "released": state["validationRelease"] is not None,
            "selection": public_validation_release(state["validationRelease"]),
            "optimizerVisible": False,
        },
        "holdout": {
            "datasetCount": holdout_count,
            "released": state["holdoutRelease"] is not None,
            "selection": public_holdout_release(state["holdoutRelease"]),
        },
        "progress": {
            "stageCount": total,
            "counts": counts,
            "completionPercent": round(100 * completed / total, 2) if total else 0.0,
            "terminalPercent": round(100 * terminal / total, 2) if total else 0.0,
        },
        "stages": [public_stage(stage) for stage in stages],
        "evidence": evidence,
        "nextAction": (
            {
                "stageId": next_stage["stageId"],
                "ownerSkill": next_stage["ownerSkill"],
                "status": next_stage["status"],
            }
            if next_stage
            else None
        ),
    }


def markdown_escape(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def status_markdown(snapshot: dict[str, Any]) -> str:
    study = snapshot["study"]
    progress = snapshot["progress"]
    lines = [
        f"# {study['title']}",
        "",
        study["objective"],
        "",
        f"- Study: `{study['studyId']}`",
        f"- Comparison profile: `{study['comparisonProfile']}`",
        (
            f"- Progress: {progress['counts']['completed']}/{progress['stageCount']} completed "
            f"({progress['completionPercent']:.2f}%)"
        ),
        (
            f"- Ledger: {snapshot['ledger']['eventCount']} events; "
            f"head `{snapshot['ledger']['headSha256']}`"
        ),
        (
            "- Design: protocol, baseline, and curator review sealed"
            if snapshot["design"]["sealed"] else (
                "- Design: run seal-design before execution"
                if snapshot["design"]["required"] else "- Design: legacy schema 1; no reviewed design seal"
            )
        ),
        (
            "- Validation: released for the frozen candidate"
            if snapshot["validation"]["released"]
            else "- Validation: sealed and unavailable to evolution"
        ),
        (
            "- Holdout: released"
            if snapshot["holdout"]["released"]
            else "- Holdout: sealed and unreleased"
        ),
        "",
        "## Datasets",
        "",
        "| Dataset | Split | Optimizer access | Tasks | SHA-256 |",
        "| --- | --- | --- | ---: | --- |",
    ]
    for dataset in snapshot["datasets"]:
        lines.append(
            "| {datasetId} | {split} | {access} | {taskCount} | `{sha256}` |".format(
                **{key: markdown_escape(value) for key, value in dataset.items()}
            )
        )
    if not snapshot["datasets"]:
        lines.append("| _None_ |  |  | 0 |  |")

    lines.extend(
        [
            "",
            "## Stages",
            "",
            "| # | Stage | Kind | Owner | Status | Evidence |",
            "| ---: | --- | --- | --- | --- | ---: |",
        ]
    )
    for stage in snapshot["stages"]:
        lines.append(
            f"| {stage['order']} | {markdown_escape(stage['stageId'])} | "
            f"{markdown_escape(stage['kind'])} | `{markdown_escape(stage['ownerSkill'])}` | "
            f"{markdown_escape(stage['status'])} | {len(stage['evidenceIds'])} |"
        )
    if not snapshot["stages"]:
        lines.append("|  | _None_ |  |  |  | 0 |")

    lines.extend(
        [
            "",
            "## Evidence index",
            "",
            "| Evidence | Stage | Kind | Role | Visibility | SHA-256 |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for evidence in snapshot["evidence"]:
        lines.append(
            f"| {markdown_escape(evidence['evidenceId'])} | "
            f"{markdown_escape(evidence['stageId'])} | "
            f"{markdown_escape(evidence['kind'])} | "
            f"{markdown_escape(evidence['role'])} | "
            f"{markdown_escape(evidence['visibility'])} | "
            f"`{evidence['sha256']}` |"
        )
    if not snapshot["evidence"]:
        lines.append("| _None_ |  |  |  |  |  |")

    lines.extend(["", "## Next action", ""])
    if snapshot["nextAction"]:
        next_action = snapshot["nextAction"]
        lines.append(
            f"Continue `{next_action['stageId']}` with "
            f"`{next_action['ownerSkill']}` (status: `{next_action['status']}`)."
        )
    else:
        lines.append("No runnable stage remains.")
    lines.append("")
    return "\n".join(lines)


def render_status(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    snapshot = status_snapshot(state)
    write_text_atomic(root / "status.json", pretty_json(snapshot))
    write_text_atomic(root / "status.md", status_markdown(snapshot))
    render_publication(root, state)
    return snapshot


def initialize_study(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.study_root).resolve()
    if root.exists():
        if not root.is_dir():
            raise ContractError(f"study root is not a directory: {root}")
        if any(root.iterdir()):
            raise ContractError(f"study root must be absent or empty: {root}")
    else:
        root.mkdir(parents=True)
    validate_id(args.study_id, "study id")
    created_at = timestamp(args.recorded_at)
    study = {
        "schemaVersion": STUDY_SCHEMA_VERSION,
        "studyId": args.study_id,
        "title": args.title,
        "objective": args.objective,
        "comparisonProfile": args.comparison_profile,
        "createdAt": created_at,
    }
    study_raw = write_json_exclusive(root / "study.json", study)
    (root / "datasets").mkdir()
    write_text_atomic(root / ".gitignore", PUBLICATION_GITIGNORE)
    (root / "publication" / "tables").mkdir(parents=True)
    initial_state = {"events": [], "headSha256": ZERO_SHA256}
    event = append_event(
        root,
        initial_state,
        "study_initialized",
        {"studyId": args.study_id, "studySha256": sha256_bytes(study_raw)},
        created_at,
    )
    state = build_state(root)
    snapshot = render_status(root, state)
    return {"ok": True, "root": str(root), "event": event, "status": snapshot}


def verify_study(root: Path, *, render: bool) -> dict[str, Any]:
    with study_lock(root):
        state = build_state(root, verify_sources=True)
        snapshot = status_snapshot(state)
        if render:
            render_status(root, state)
        publication = verify_publication_policy(root, state)
        git_tracking = verify_git_tracking(root, require_clean=not render)
    return {
        "ok": True,
        "studyId": state["study"]["studyId"],
        "eventCount": len(state["events"]),
        "headSha256": state["headSha256"],
        "datasetCount": len(state["datasets"]),
        "stageCount": len(state["stages"]),
        "evidenceCount": len(state["evidence"]),
        "validationReleased": state["validationRelease"] is not None,
        "holdoutReleased": state["holdoutRelease"] is not None,
        "statusRendered": render,
        "completionPercent": snapshot["progress"]["completionPercent"],
        "publicationPolicy": publication["publicationPolicy"],
        "publicationTableCount": len(publication["resultTables"]),
        "gitRepositoryDetected": git_tracking["repositoryDetected"],
        "trackedStudyFileCount": git_tracking["trackedFileCount"],
    }


def add_common_recorded_at(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--recorded-at",
        help="UTC event time in YYYY-MM-DDTHH:MM:SSZ; defaults to current UTC",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Track ordered Harbor study stages, frozen dataset manifests, evidence "
            "digests, validation and holdout release, and progressive status without "
            "scoring results."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="initialize an empty study")
    init_parser.add_argument("study_root")
    init_parser.add_argument("--study-id", required=True)
    init_parser.add_argument("--title", required=True)
    init_parser.add_argument("--objective", required=True)
    init_parser.add_argument(
        "--comparison-profile",
        default="declared-native-harbor-profile",
        help="stable identity for the task, agent, model, metric, attempts, and gates",
    )
    add_common_recorded_at(init_parser)

    dataset_parser = subparsers.add_parser(
        "add-dataset", help="freeze and register one Harbor task dataset"
    )
    dataset_parser.add_argument("study_root")
    dataset_parser.add_argument("--dataset-id", required=True)
    dataset_parser.add_argument("--split", choices=SPLITS, required=True)
    dataset_parser.add_argument("--source", required=True)
    add_common_recorded_at(dataset_parser)

    stage_parser = subparsers.add_parser("add-stage", help="append one ordered stage")
    stage_parser.add_argument("study_root")
    stage_parser.add_argument("--stage-id", required=True)
    stage_parser.add_argument("--label")
    stage_parser.add_argument("--kind", choices=STAGE_KINDS, required=True)
    stage_parser.add_argument("--owner-skill", choices=tuple(OWNER_KINDS), required=True)
    stage_parser.add_argument("--dataset-id", action="append")
    stage_parser.add_argument("--depends-on", action="append")
    add_common_recorded_at(stage_parser)

    design_parser = subparsers.add_parser(
        "seal-design", help="freeze the protocol, baseline, private quality review, and dataset gate plan"
    )
    design_parser.add_argument("study_root")
    design_parser.add_argument("--protocol", required=True)
    design_parser.add_argument("--baseline", required=True)
    design_parser.add_argument("--review", required=True, help="private directory containing review.json and supporting evidence")
    add_common_recorded_at(design_parser)

    transition_parser = subparsers.add_parser(
        "transition", help="append a legal stage status transition"
    )
    transition_parser.add_argument("study_root")
    transition_parser.add_argument("--stage-id", required=True)
    transition_parser.add_argument("--status", choices=STATUSES, required=True)
    transition_parser.add_argument("--note")
    add_common_recorded_at(transition_parser)

    evidence_parser = subparsers.add_parser(
        "record-evidence", help="bind an immutable artifact digest to a running stage"
    )
    evidence_parser.add_argument("study_root")
    evidence_parser.add_argument("--evidence-id", required=True)
    evidence_parser.add_argument("--stage-id", required=True)
    evidence_parser.add_argument("--kind", choices=EVIDENCE_KINDS, required=True)
    evidence_parser.add_argument("--role", choices=EVIDENCE_ROLES, required=True)
    evidence_parser.add_argument("--visibility", choices=VISIBILITIES, default="private")
    evidence_parser.add_argument("--path", required=True)
    add_common_recorded_at(evidence_parser)

    validation_release_parser = subparsers.add_parser(
        "release-validation",
        help=(
            "release independent validation only after digest-binding the frozen "
            "candidate from a completed evolution"
        ),
    )
    validation_release_parser.add_argument("study_root")
    validation_release_parser.add_argument("--selection-id", required=True)
    validation_release_parser.add_argument("--selected-stage", required=True)
    validation_release_parser.add_argument("--candidate-evidence", required=True)
    add_common_recorded_at(validation_release_parser)

    release_parser = subparsers.add_parser(
        "release-holdout",
        help="release registered holdout only after digest-binding a completed selection",
    )
    release_parser.add_argument("study_root")
    release_parser.add_argument("--selection-id", required=True)
    release_parser.add_argument("--selected-stage", required=True)
    release_parser.add_argument("--selection-evidence", required=True)
    add_common_recorded_at(release_parser)

    status_parser = subparsers.add_parser("status", help="print derived study status")
    status_parser.add_argument("study_root")
    status_parser.add_argument("--format", choices=("json", "markdown"), default="json")

    verify_parser = subparsers.add_parser(
        "verify", help="verify the ledger, locks, datasets, and evidence sources"
    )
    verify_parser.add_argument("study_root")
    verify_parser.add_argument(
        "--render", action="store_true", help="refresh status.json and status.md after verification"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "init":
            result = initialize_study(args)
        else:
            root = require_study_root(args.study_root)
            if args.command == "add-dataset":
                result = register_dataset(root, args)
            elif args.command == "add-stage":
                result = add_stage(root, args)
            elif args.command == "transition":
                result = transition_stage(root, args)
            elif args.command == "seal-design":
                result = seal_design(root, args)
            elif args.command == "record-evidence":
                result = record_evidence(root, args)
            elif args.command == "release-validation":
                result = release_validation(root, args)
            elif args.command == "release-holdout":
                result = release_holdout(root, args)
            elif args.command == "status":
                state = build_state(root)
                snapshot = status_snapshot(state)
                if args.format == "markdown":
                    print(status_markdown(snapshot), end="")
                    return 0
                result = snapshot
            elif args.command == "verify":
                result = verify_study(root, render=args.render)
            else:
                raise ContractError(f"unsupported command: {args.command}")
        print(pretty_json(result), end="")
        return 0
    except (ContractError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
