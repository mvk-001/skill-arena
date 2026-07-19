#!/usr/bin/env python3
"""Read-only support for consulting a validated Semantic OKF snapshot."""

from __future__ import annotations

import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from rdflib import Graph


GRAPH_FILES = {
    "data": "semantic/data.ttl",
    "ontology": "semantic/ontology.ttl",
    "shapes": "semantic/shapes.ttl",
    "provenance": "semantic/provenance.ttl",
    "validation": "semantic/validation-report.ttl",
}
REQUIRED_QUERY_FILES = {
    "semantic/build-report.json",
    "semantic/records.jsonl",
    "semantic/semantic-plan.json",
    *GRAPH_FILES.values(),
}


class SnapshotError(RuntimeError):
    """Describe an invalid or unsafe read-only consultation surface."""


def configure_utf8_output() -> None:
    """Emit knowledge losslessly even when Windows defaults to cp1252."""

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8")
            except (AttributeError, OSError, ValueError):
                pass


def read_json_object(path: Path, label: str) -> dict[str, Any]:
    """Read one required JSON object from the local snapshot."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"cannot read {label} at {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SnapshotError(f"{label} at {path} must be a JSON object")
    return payload


def ontology_namespace(plan: Mapping[str, Any]) -> str:
    """Return the local ontology term namespace from the generated plan."""

    bundle = plan.get("bundle")
    if not isinstance(bundle, Mapping):
        raise SnapshotError("semantic plan has no bundle object")
    ontology_iri = bundle.get("ontology_iri")
    if not isinstance(ontology_iri, str) or not ontology_iri:
        raise SnapshotError("semantic plan has no ontology_iri")
    return ontology_iri if ontology_iri.endswith(("#", "/")) else f"{ontology_iri}#"


def snapshot_file(root: Path, relative: str) -> Path:
    """Resolve one declared snapshot artifact without following it outside the bundle."""

    pure = PurePosixPath(relative)
    if pure.is_absolute() or ".." in pure.parts or not pure.parts:
        raise SnapshotError(f"unsafe query artifact path: {relative!r}")
    target = root.joinpath(*pure.parts)
    try:
        resolved = target.resolve(strict=True)
        resolved.relative_to(root.resolve(strict=True))
    except (OSError, ValueError) as exc:
        raise SnapshotError(f"required query artifact escapes or is missing: {relative}") from exc
    if target.is_symlink() or not resolved.is_file():
        raise SnapshotError(f"required query artifact is not a regular local file: {relative}")
    return resolved


def safe_concept_path(root: Path, value: Any) -> Path:
    """Resolve an exact ledger concept path without allowing escape."""

    if not isinstance(value, str) or "\\" in value:
        raise SnapshotError("record contains an unsafe concept_path")
    pure = PurePosixPath(value)
    if pure.is_absolute() or ".." in pure.parts or not pure.parts or pure.parts[0] != "concepts":
        raise SnapshotError(f"unsafe concept_path: {value!r}")
    if pure.suffix.lower() != ".md":
        raise SnapshotError(f"concept_path is not Markdown: {value!r}")
    target = root.joinpath(*pure.parts)
    try:
        resolved = target.resolve(strict=True)
        resolved.relative_to(root.resolve())
    except (OSError, ValueError) as exc:
        raise SnapshotError(f"concept_path escapes or is missing: {value!r}") from exc
    if not resolved.is_file():
        raise SnapshotError(f"concept_path does not identify a local file: {value!r}")
    return resolved


def validate_snapshot(root: Path, *, full_read_surface: bool) -> None:
    """Require a published passing snapshot and optionally parse its read surface."""

    if not root.exists() or not root.is_dir() or root.is_symlink():
        raise SnapshotError(f"bundle must be an existing local directory: {root}")
    report_path = snapshot_file(root, "semantic/build-report.json")
    report = read_json_object(report_path, "build report")
    if report.get("valid") is not True or report.get("status") != "pass":
        raise SnapshotError("build report does not identify a passing snapshot")
    for relative in sorted(REQUIRED_QUERY_FILES):
        snapshot_file(root, relative)
    if not full_read_surface:
        return

    plan = read_json_object(snapshot_file(root, "semantic/semantic-plan.json"), "semantic plan")
    ontology_namespace(plan)
    ledger = snapshot_file(root, "semantic/records.jsonl")
    try:
        lines = ledger.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise SnapshotError(f"cannot read record ledger: {exc}") from exc
    if not lines:
        raise SnapshotError("records.jsonl must not be empty")
    for number, line in enumerate(lines, start=1):
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SnapshotError(f"invalid records.jsonl line {number}: {exc}") from exc
        if not isinstance(record, dict):
            raise SnapshotError(f"records.jsonl line {number} must be an object")
        safe_concept_path(root, record.get("concept_path"))

    for graph_name, relative in GRAPH_FILES.items():
        try:
            Graph().parse(snapshot_file(root, relative), format="turtle")
        except Exception as exc:
            raise SnapshotError(f"cannot parse {graph_name} graph at {relative}: {exc}") from exc
