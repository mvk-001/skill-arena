#!/usr/bin/env python3
"""Reprocess every source and transactionally refresh an existing Semantic OKF bundle."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterator, Mapping


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _semantic_okf import (  # noqa: E402
    BundleError,
    canonical_json,
    configure_utf8_output,
    load_manifest,
    sha256_bytes,
    sha256_json,
    validate_semantic_bundle,
)
from build_semantic_okf import (  # noqa: E402
    _error_code,
    build,
    discover_source_files,
)


TRANSACTION_SCHEMA_VERSION = "1.0"
MANAGED_SEMANTIC_FILES = {
    "semantic/ontology.ttl",
    "semantic/data.ttl",
    "semantic/shapes.ttl",
    "semantic/provenance.ttl",
    "semantic/validation-report.ttl",
    "semantic/semantic-plan.json",
    "semantic/source-manifest.json",
    "semantic/records.jsonl",
    "semantic/build-report.json",
}


class RefreshError(RuntimeError):
    """A classified refresh or recovery failure suitable for CLI output."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _is_link(path: Path) -> bool:
    """Return whether *path* is a symbolic link or Windows junction."""

    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    return bool(is_junction and is_junction())


def _json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RefreshError("current-invalid", f"cannot read {label} at {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RefreshError("current-invalid", f"{label} at {path} must be a JSON object")
    return payload


def _fsync_directory(path: Path) -> None:
    """Best-effort fsync for a directory on platforms that support it."""

    if os.name == "nt":
        return
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    """Write one durable JSON object through a sibling temporary file."""

    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    data = (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    try:
        with temporary.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
        _fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _safe_concept_path(value: Any) -> str:
    if not isinstance(value, str) or "\\" in value:
        raise RefreshError("current-diverged", "record ledger contains an unsafe concept_path")
    pure = PurePosixPath(value)
    if pure.is_absolute() or ".." in pure.parts or len(pure.parts) < 3:
        raise RefreshError("current-diverged", f"unsafe concept_path in record ledger: {value!r}")
    if pure.parts[0] != "concepts" or pure.suffix.lower() != ".md":
        raise RefreshError("current-diverged", f"unexpected concept_path in record ledger: {value!r}")
    return pure.as_posix()


def _records_by_id(root: Path) -> dict[str, dict[str, Any]]:
    path = root / "semantic" / "records.jsonl"
    records: dict[str, dict[str, Any]] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise RefreshError("current-invalid", f"cannot read record ledger: {exc}") from exc
    for number, line in enumerate(lines, start=1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise RefreshError("current-invalid", f"invalid records.jsonl line {number}: {exc}") from exc
        if not isinstance(value, dict) or not isinstance(value.get("concept_id"), str):
            raise RefreshError("current-invalid", f"invalid records.jsonl entry on line {number}")
        concept_id = value["concept_id"]
        if concept_id in records:
            raise RefreshError("current-invalid", f"duplicate concept_id in record ledger: {concept_id}")
        _safe_concept_path(value.get("concept_path"))
        records[concept_id] = value
    return records


def _assert_managed_tree(root: Path) -> dict[str, dict[str, Any]]:
    """Reject links, missing managed files, and unmanaged files that refresh would erase."""

    if _is_link(root):
        raise RefreshError("current-diverged", f"bundle root cannot be a link or junction: {root}")
    records = _records_by_id(root)
    expected = {"index.md", *MANAGED_SEMANTIC_FILES}
    expected.update(_safe_concept_path(record["concept_path"]) for record in records.values())
    actual: set[str] = set()
    for path in root.rglob("*"):
        if _is_link(path):
            raise RefreshError("current-diverged", f"bundle contains a link or junction: {path}")
        if path.is_file():
            actual.add(path.relative_to(root).as_posix())
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing managed files: {', '.join(missing)}")
        if extra:
            details.append(f"unmanaged files would be removed: {', '.join(extra)}")
        raise RefreshError("current-diverged", "; ".join(details))
    return records


def _tree_sha256(root: Path) -> str:
    """Hash every relative file path and raw file digest in one snapshot."""

    entries = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.relative_to(root).as_posix()):
        if _is_link(path):
            raise RefreshError("current-diverged", f"cannot hash linked bundle file: {path}")
        entries.append(
            {
                "path": path.relative_to(root).as_posix(),
                "sha256": sha256_bytes(path.read_bytes()),
            }
        )
    return sha256_json(entries)


def _source_manifest(root: Path) -> dict[str, Any]:
    return _json_object(root / "semantic" / "source-manifest.json", "source manifest")


def _semantic_plan(root: Path) -> dict[str, Any]:
    return _json_object(root / "semantic" / "semantic-plan.json", "semantic plan")


def _logical_revision(source_manifest: Mapping[str, Any], records: Mapping[str, Mapping[str, Any]]) -> str:
    """Hash logical knowledge independently from processor runtime metadata."""

    sources = []
    for source in source_manifest.get("sources", []):
        if isinstance(source, dict):
            sources.append(
                {
                    key: source.get(key)
                    for key in ("id", "kind", "path", "content_sha256", "records_sha256", "record_count")
                }
            )
    ledger = [
        {
            "concept_id": concept_id,
            "subject_iri": record.get("subject_iri"),
            "record_sha256": record.get("record_sha256"),
        }
        for concept_id, record in sorted(records.items())
    ]
    return sha256_json(
        {
            "plan_sha256": source_manifest.get("plan_sha256"),
            "sources": sorted(sources, key=lambda item: str(item.get("id"))),
            "records": ledger,
        }
    )


def _semantic_signature(plan: Mapping[str, Any]) -> str:
    """Hash plan fields that change ontology or normalized graph meaning."""

    bundle = plan.get("bundle", {})
    semantic_sources = []
    for source in plan.get("sources", []):
        if isinstance(source, dict):
            semantic_sources.append(
                {
                    key: value
                    for key, value in source.items()
                    if key not in {"path", "allow_empty"}
                }
            )
    return sha256_json(
        {
            "bundle": {
                key: bundle.get(key)
                for key in ("base_iri", "ontology_iri", "prefix", "owl_profile")
            },
            "ontology": plan.get("ontology"),
            "rules": plan.get("rules"),
            "sources": semantic_sources,
        }
    )


def _validate_snapshot(root: Path, code: str) -> dict[str, Any]:
    result = validate_semantic_bundle(root)
    if not result.valid:
        messages = "; ".join(item["message"] for item in result.errors)
        raise RefreshError(code, f"semantic validation failed for {root}: {messages}")
    validator = SCRIPT_DIR.parent.parent / "open-knowledge-format" / "scripts" / "validate_okf_bundle.py"
    completed = subprocess.run(
        [sys.executable, str(validator), str(root)],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "OKF validation failed"
        raise RefreshError(code, message)
    return result.to_dict()


def _source_snapshot(manifest_path: Path, manifest: Mapping[str, Any]) -> dict[str, str]:
    """Re-discover and hash all declared files after candidate materialization."""

    root = manifest_path.parent.resolve()
    result: dict[str, str] = {}
    for source in manifest["sources"]:
        paths = discover_source_files(root, source)
        payload = [
            {
                "path": path.relative_to(root).as_posix(),
                "sha256": sha256_bytes(path.read_bytes()),
            }
            for path in paths
        ]
        result[source["id"]] = sha256_json(sorted(payload, key=lambda item: item["path"]))
    return result


def _assert_sources_stable(
    manifest_path: Path,
    manifest: Mapping[str, Any],
    candidate_manifest: Mapping[str, Any],
) -> None:
    observed = _source_snapshot(manifest_path, manifest)
    recorded = {
        source.get("id"): source.get("content_sha256")
        for source in candidate_manifest.get("sources", [])
        if isinstance(source, dict)
    }
    if observed != recorded:
        raise RefreshError("source-changed", "source file membership or content changed during refresh")


def _changes(
    before_manifest: Mapping[str, Any],
    after_manifest: Mapping[str, Any],
    before_records: Mapping[str, Mapping[str, Any]],
    after_records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Return a stable machine-readable diff between two snapshots."""

    def index(items: Any, key: str) -> dict[str, Mapping[str, Any]]:
        return {
            str(item[key]): item
            for item in items or []
            if isinstance(item, dict) and key in item
        }

    before_sources = index(before_manifest.get("sources"), "id")
    after_sources = index(after_manifest.get("sources"), "id")
    before_artifacts = before_manifest.get("artifacts", {})
    after_artifacts = after_manifest.get("artifacts", {})

    def classified(before: Mapping[str, Any], after: Mapping[str, Any]) -> dict[str, Any]:
        old = set(before)
        new = set(after)
        changed = sorted(key for key in old & new if canonical_json(before[key]) != canonical_json(after[key]))
        return {
            "added": sorted(new - old),
            "removed": sorted(old - new),
            "changed": changed,
            "unchanged_count": len((old & new) - set(changed)),
        }

    record_before = {
        key: {
            "subject_iri": value.get("subject_iri"),
            "record_sha256": value.get("record_sha256"),
            "concept_path": value.get("concept_path"),
        }
        for key, value in before_records.items()
    }
    record_after = {
        key: {
            "subject_iri": value.get("subject_iri"),
            "record_sha256": value.get("record_sha256"),
            "concept_path": value.get("concept_path"),
        }
        for key, value in after_records.items()
    }
    return {
        "plan_changed": before_manifest.get("plan_sha256") != after_manifest.get("plan_sha256"),
        "sources": classified(before_sources, after_sources),
        "records": classified(record_before, record_after),
        "artifacts": classified(before_artifacts, after_artifacts),
    }


def _transaction_path(parent: Path, name: Any, suffix: str) -> Path:
    if not isinstance(name, str) or Path(name).name != name:
        raise RefreshError("recovery-required", "transaction journal contains an unsafe path")
    if not name.startswith(".sokf-") or not name.endswith(suffix):
        raise RefreshError("recovery-required", f"transaction path has an unexpected name: {name!r}")
    return parent / name


def _remove_owned_tree(path: Path, parent: Path) -> None:
    """Remove a generated sibling tree without following links."""

    if path.parent != parent or not path.name.startswith(".sokf-"):
        raise RefreshError("cleanup-failed", f"refusing to remove unowned path: {path}")
    if not path.exists():
        return
    if _is_link(path):
        raise RefreshError("cleanup-failed", f"refusing to remove linked transaction path: {path}")
    shutil.rmtree(path)


@contextlib.contextmanager
def _refresh_lock(output: Path) -> Iterator[Path]:
    """Serialize refresh and recovery operations for one output path."""

    lock = output.parent / f".{output.name}.refresh.lock"
    payload = json.dumps({"pid": os.getpid(), "output": output.name}, sort_keys=True).encode("utf-8")
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RefreshError("concurrent-update", f"refresh lock already exists: {lock}") from exc
    try:
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        yield lock
    finally:
        lock.unlink(missing_ok=True)
        _fsync_directory(output.parent)


def _journal_path(output: Path) -> Path:
    return output.parent / f".{output.name}.refresh.json"


def _snapshot_matches(path: Path, expected_hash: str) -> bool:
    if not path.exists() or not path.is_dir() or _is_link(path):
        return False
    try:
        if _tree_sha256(path) != expected_hash:
            return False
        _validate_snapshot(path, "recovery-required")
        return True
    except (OSError, RefreshError):
        return False


def _recover_unlocked(output: Path, journal_path: Path) -> dict[str, Any]:
    journal = _json_object(journal_path, "refresh journal")
    if journal.get("schema_version") != TRANSACTION_SCHEMA_VERSION or journal.get("output") != output.name:
        raise RefreshError("recovery-required", "refresh journal identity does not match the output")
    parent = output.parent
    candidate = _transaction_path(parent, journal.get("candidate"), ".stage")
    backup = _transaction_path(parent, journal.get("backup"), ".backup")
    old_hash = str(journal.get("old_tree_sha256") or "")
    new_hash = str(journal.get("new_tree_sha256") or "")
    output_old = _snapshot_matches(output, old_hash)
    output_new = _snapshot_matches(output, new_hash)
    backup_old = _snapshot_matches(backup, old_hash)
    candidate_new = _snapshot_matches(candidate, new_hash)

    if output_new:
        if backup.exists() and not backup_old:
            raise RefreshError("recovery-required", "backup does not match the journaled old snapshot")
        if candidate.exists() and not candidate_new:
            raise RefreshError("recovery-required", "candidate does not match the journaled new snapshot")
        _remove_owned_tree(backup, parent)
        _remove_owned_tree(candidate, parent)
        journal_path.unlink(missing_ok=True)
        _fsync_directory(parent)
        return {"status": "recovered", "resolution": "commit", "output": str(output)}

    if output_old:
        if backup.exists() and not backup_old:
            raise RefreshError("recovery-required", "backup does not match the journaled old snapshot")
        if candidate.exists() and not candidate_new:
            raise RefreshError("recovery-required", "candidate does not match the journaled new snapshot")
        _remove_owned_tree(backup, parent)
        _remove_owned_tree(candidate, parent)
        journal_path.unlink(missing_ok=True)
        _fsync_directory(parent)
        return {"status": "recovered", "resolution": "rollback", "output": str(output)}

    if not output.exists() and backup_old:
        if candidate.exists() and not candidate_new:
            raise RefreshError("recovery-required", "candidate does not match the journaled new snapshot")
        backup.replace(output)
        if not _snapshot_matches(output, old_hash):
            raise RefreshError("rollback-failed", "restored backup failed validation")
        _remove_owned_tree(candidate, parent)
        journal_path.unlink(missing_ok=True)
        _fsync_directory(parent)
        return {"status": "recovered", "resolution": "rollback", "output": str(output)}

    raise RefreshError(
        "recovery-required",
        "transaction state is ambiguous; preserve output, candidate, backup, and journal for review",
    )


def recover_bundle(output: Path) -> dict[str, Any]:
    """Recover one interrupted journaled refresh without rebuilding sources."""

    output = output.expanduser().absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    with _refresh_lock(output):
        journal = _journal_path(output)
        if not journal.exists():
            raise RefreshError("recovery-not-needed", f"no refresh journal exists for {output}")
        return _recover_unlocked(output, journal)


def _promote(output: Path, candidate: Path, old_hash: str, new_hash: str) -> dict[str, Any]:
    token = candidate.name.removeprefix(".sokf-").removesuffix(".stage")
    backup = output.parent / f".sokf-{token}.backup"
    journal_path = _journal_path(output)
    journal: dict[str, Any] = {
        "schema_version": TRANSACTION_SCHEMA_VERSION,
        "output": output.name,
        "candidate": candidate.name,
        "backup": backup.name,
        "old_tree_sha256": old_hash,
        "new_tree_sha256": new_hash,
        "state": "prepared",
    }
    _write_json_atomic(journal_path, journal)
    try:
        output.replace(backup)
        journal["state"] = "old_moved"
        _write_json_atomic(journal_path, journal)
        candidate.replace(output)
        journal["state"] = "new_promoted"
        _write_json_atomic(journal_path, journal)
        _validate_snapshot(output, "promotion-failed")
        if _tree_sha256(output) != new_hash:
            raise RefreshError("promotion-failed", "promoted snapshot hash differs from candidate")
        journal["state"] = "committed"
        _write_json_atomic(journal_path, journal)
        _remove_owned_tree(backup, output.parent)
        journal_path.unlink(missing_ok=True)
        _fsync_directory(output.parent)
        return {
            "mode": "journaled-two-rename",
            "rollback": "not-needed",
            "cleanup_required": False,
        }
    except Exception as exc:
        try:
            recovery = _recover_unlocked(output, journal_path)
        except Exception as recovery_exc:
            raise RefreshError(
                "rollback-failed",
                f"promotion failed ({exc}); automatic recovery also failed ({recovery_exc})",
            ) from recovery_exc
        raise RefreshError(
            "promotion-failed",
            f"promotion failed and was resolved by {recovery['resolution']}: {exc}",
        ) from exc


def refresh_bundle(
    manifest_path: Path,
    output: Path,
    *,
    check: bool = False,
    allow_plan_change: bool = False,
    allow_record_removals: bool = False,
    expected_current_tree_sha256: str | None = None,
    expected_candidate_tree_sha256: str | None = None,
    build_fn: Callable[[Path, Path], dict[str, Any]] = build,
) -> dict[str, Any]:
    """Build, compare, and optionally promote a complete replacement snapshot."""

    manifest_path = manifest_path.expanduser().resolve()
    output = output.expanduser().absolute()
    if _is_link(output):
        raise RefreshError("current-diverged", f"output cannot be a link or junction: {output}")
    if not output.exists() or not output.is_dir():
        raise RefreshError("current-missing", f"refresh requires an existing bundle: {output}")
    try:
        manifest_path.relative_to(output.resolve())
    except ValueError:
        pass
    else:
        raise RefreshError("manifest-inside-output", "the source manifest cannot live inside the replaced bundle")
    if os.name == "nt" and str(output).startswith("\\\\"):
        raise RefreshError("unsupported-filesystem", "UNC refresh targets are not supported")

    with _refresh_lock(output):
        journal_path = _journal_path(output)
        if journal_path.exists():
            raise RefreshError("recovery-required", f"recover the interrupted refresh recorded at {journal_path}")

        current_validation = _validate_snapshot(output, "current-invalid")
        before_records = _assert_managed_tree(output)
        before_manifest = _source_manifest(output)
        before_plan = _semantic_plan(output)
        before_tree = _tree_sha256(output)
        if expected_current_tree_sha256 and before_tree != expected_current_tree_sha256.lower():
            raise RefreshError("current-diverged", "current tree hash does not match the expected CAS value")
        before_revision = _logical_revision(before_manifest, before_records)

        token = uuid.uuid4().hex
        candidate = output.parent / f".sokf-{token}.stage"
        if candidate.exists():
            raise RefreshError("candidate-invalid", f"candidate path already exists: {candidate}")
        manifest = load_manifest(manifest_path)
        try:
            try:
                build_report = build_fn(manifest_path, candidate)
            except Exception as exc:
                if isinstance(exc, RefreshError):
                    raise
                code = _error_code(exc) or "candidate-invalid"
                raise RefreshError(code, str(exc)) from exc
            candidate_validation = _validate_snapshot(candidate, "candidate-invalid")
            after_records = _assert_managed_tree(candidate)
            after_manifest = _source_manifest(candidate)
            after_plan = _semantic_plan(candidate)
            _assert_sources_stable(manifest_path, manifest, after_manifest)

            for field in ("base_iri", "ontology_iri"):
                if before_manifest.get(field) != after_manifest.get(field):
                    raise RefreshError("identity-change", f"refresh cannot change {field}; build a new bundle")

            changes = _changes(before_manifest, after_manifest, before_records, after_records)
            blockers: list[dict[str, str]] = []
            if changes["plan_changed"] and not allow_plan_change:
                blockers.append(
                    {"code": "plan-change-not-allowed", "message": "use --allow-plan-change after review"}
                )
            if _semantic_signature(before_plan) != _semantic_signature(after_plan):
                old_version = before_plan.get("bundle", {}).get("version_iri")
                new_version = after_plan.get("bundle", {}).get("version_iri")
                if old_version == new_version:
                    blockers.append(
                        {
                            "code": "ontology-version-reuse",
                            "message": "semantic mappings, ontology, or rules changed without a new version_iri",
                        }
                    )
            removals = changes["records"]["removed"]
            if removals and not allow_record_removals:
                blockers.append(
                    {
                        "code": "record-removal-not-allowed",
                        "message": "use --allow-record-removals after reviewing removed concepts",
                    }
                )

            after_tree = _tree_sha256(candidate)
            after_revision = _logical_revision(after_manifest, after_records)
            if (
                expected_candidate_tree_sha256
                and after_tree != expected_candidate_tree_sha256.lower()
            ):
                raise RefreshError(
                    "candidate-diverged",
                    "rebuilt candidate tree does not match the reviewed preview",
                )
            if _tree_sha256(output) != before_tree:
                raise RefreshError("current-diverged", "current bundle changed while the candidate was building")

            report: dict[str, Any] = {
                "schema_version": TRANSACTION_SCHEMA_VERSION,
                "operation": "refresh",
                "status": "unchanged",
                "valid": True,
                "output": str(output),
                "previous": {
                    "tree_sha256": before_tree,
                    "revision_sha256": before_revision,
                    "plan_sha256": before_manifest.get("plan_sha256"),
                },
                "current": {
                    "tree_sha256": after_tree,
                    "revision_sha256": after_revision,
                    "plan_sha256": after_manifest.get("plan_sha256"),
                },
                "changes": changes,
                "blockers": blockers,
                "build": {
                    "summary": build_report.get("summary", {}),
                    "processor": build_report.get("processor", {}),
                },
                "validation": {
                    "previous": current_validation.get("status"),
                    "candidate": candidate_validation.get("status"),
                },
            }
            if before_tree == after_tree:
                return report
            if check:
                report["status"] = "changes-pending"
                return report
            if blockers:
                first = blockers[0]
                raise RefreshError(first["code"], first["message"])

            report["promotion"] = _promote(output, candidate, before_tree, after_tree)
            report["status"] = "updated"
            report["valid"] = True
            return report
        finally:
            if candidate.exists() and not _journal_path(output).exists():
                _remove_owned_tree(candidate, output.parent)


def build_parser() -> argparse.ArgumentParser:
    """Build the refresh/recovery command-line parser."""

    parser = argparse.ArgumentParser(description="Refresh or recover a Semantic OKF snapshot.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    update = subparsers.add_parser("update", help="Reprocess all sources and refresh an existing bundle.")
    update.add_argument("manifest", type=Path)
    update.add_argument("output", type=Path)
    update.add_argument("--check", action="store_true", help="Build and compare without promotion.")
    update.add_argument("--allow-plan-change", action="store_true")
    update.add_argument("--allow-record-removals", action="store_true")
    update.add_argument("--expected-current-tree-sha256")
    update.add_argument("--expected-candidate-tree-sha256")
    update.add_argument("--output-format", choices=("text", "json"), default="text")

    recover = subparsers.add_parser("recover", help="Recover an interrupted journaled refresh.")
    recover.add_argument("output", type=Path)
    recover.add_argument("--output-format", choices=("text", "json"), default="text")
    return parser


def _print_report(report: Mapping[str, Any], output_format: str) -> None:
    if output_format == "json":
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        return
    print(f"Semantic OKF refresh: {report['status']}")
    print(f"Output: {report['output']}")
    if "changes" in report:
        records = report["changes"]["records"]
        print(
            f"Records: +{len(records['added'])} ~{len(records['changed'])} "
            f"-{len(records['removed'])}"
        )
    for blocker in report.get("blockers", []):
        print(f"blocker [{blocker['code']}]: {blocker['message']}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    """Run refresh or recovery and emit a stable status code."""

    configure_utf8_output()
    args = build_parser().parse_args(argv)
    output_format = args.output_format
    try:
        if args.command == "recover":
            report = recover_bundle(args.output)
        else:
            report = refresh_bundle(
                args.manifest,
                args.output,
                check=args.check,
                allow_plan_change=args.allow_plan_change,
                allow_record_removals=args.allow_record_removals,
                expected_current_tree_sha256=args.expected_current_tree_sha256,
                expected_candidate_tree_sha256=args.expected_candidate_tree_sha256,
            )
    except RefreshError as exc:
        payload = {"status": "error", "code": exc.code, "error": str(exc)}
        if output_format == "json":
            print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        else:
            print(f"{exc.code}: {exc}", file=sys.stderr)
        return 2
    _print_report(report, output_format)
    return 3 if report.get("status") == "changes-pending" else 0


if __name__ == "__main__":
    raise SystemExit(main())
