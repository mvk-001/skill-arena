#!/usr/bin/env python3
"""Build a coherent OKF + OWL + SHACL bundle with deterministic Python adapters."""

from __future__ import annotations

import argparse
import csv
import glob
import hashlib
import html
import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import unquote, urlsplit

from _semantic_okf import (
    BundleError,
    CSV_READER_OPTIONS,
    JSON_READER_OPTIONS,
    ManifestError,
    canonical_json,
    configure_utf8_output,
    finalize_record,
    load_manifest,
    materialize_bundle,
    normalize_text,
    sha256_json,
    source_by_id,
)


CSV_OPTIONS = CSV_READER_OPTIONS
JSON_OPTIONS = JSON_READER_OPTIONS
INTEGER_MIN = -(2**31)
INTEGER_MAX = 2**31 - 1
LONG_MIN = -(2**63)
LONG_MAX = 2**63 - 1


@dataclass(frozen=True)
class TextRow:
    """Represent one whole-text input without coupling adapters to a framework."""

    source_path: str
    value: str


def _local_path_from_uri(value: str) -> Path:
    """Convert a file URI or local path into a local Path."""
    parsed = urlsplit(value)
    if parsed.scheme == "file":
        raw = unquote(parsed.path)
        if re.match(r"^/[A-Za-z]:", raw):
            raw = raw[1:]
        return Path(raw)
    return Path(value)


def _strip_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Return parsed YAML frontmatter and the remaining Markdown body."""
    import yaml

    lines = normalize_text(content).splitlines()
    if not lines or lines[0] != "---":
        return {}, normalize_text(content)
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("Markdown frontmatter is unterminated") from exc
    try:
        payload = yaml.safe_load("\n".join(lines[1:end])) or {}
    except yaml.YAMLError as exc:
        raise ValueError(f"Markdown frontmatter is invalid YAML: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("Markdown frontmatter must be an object")
    return payload, "\n".join(lines[end + 1 :]).lstrip("\n")


def _markdown_table_cell(value: Any) -> str:
    """Escape one untrusted RDF term for a generated Markdown table cell."""
    escaped = html.escape(normalize_text(str(value)), quote=False)
    return escaped.replace("`", "&#96;").replace("|", "\\|").replace("\n", " ↵ ")


def _frontmatter_scalar(value: Any, field_name: str) -> str | int | float | bool:
    """Normalize a mapped YAML scalar to deterministic JSON-compatible data."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"mapped Markdown field {field_name!r} must be finite")
    if isinstance(value, (str, int, float, bool)):
        return value
    raise ValueError(f"mapped Markdown field {field_name!r} must be a scalar")


def _markdown_record(row: TextRow, source: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize one whole Markdown file into a raw record dictionary."""
    metadata, body = _strip_markdown_frontmatter(row.value)
    path = _local_path_from_uri(row.source_path)
    manifest_root = Path(str(source["_manifest_root"])).resolve()
    try:
        relative = path.resolve().relative_to(manifest_root).as_posix()
    except (OSError, ValueError) as exc:
        raise ValueError(f"Markdown source {source['id']} escapes the manifest directory") from exc
    heading = next(
        (line[2:].strip() for line in body.splitlines() if line.startswith("# ") and line[2:].strip()),
        "",
    )
    title = str(metadata.get("title") or heading or path.stem)
    record_id = relative.removesuffix(path.suffix)
    attributes = {
        input_name: _frontmatter_scalar(metadata[input_name], input_name)
        for input_name in sorted(source.get("fields", {}))
        if input_name in metadata and metadata[input_name] is not None
    }
    return {
        "source_id": source["id"],
        "source_kind": source["kind"],
        "source_path": row.source_path,
        "record_id": record_id,
        "subject_iri": "",
        "title": title,
        "body": body or f"# {title}",
        "attributes": attributes,
    }


def _rdf_records(row: TextRow, source: Mapping[str, Any]) -> Iterable[dict[str, Any]]:
    """Normalize URI subjects from one RDF document into raw record dictionaries."""
    from rdflib import BNode, Graph, URIRef
    from rdflib.namespace import RDFS

    graph = Graph()
    path = _local_path_from_uri(row.source_path)
    graph.parse(data=row.value, format=source["format"], publicID=path.resolve().as_uri())
    blank_nodes = {term for triple in graph for term in triple if isinstance(term, BNode)}
    if blank_nodes:
        raise ValueError(f"RDF source {source['id']} contains blank nodes; skolemize them before ingestion")
    title_predicate = URIRef(source.get("title_predicate") or str(RDFS.label))
    field_map = {URIRef(key): value for key, value in source.get("fields", {}).items()}
    for subject in sorted({item for item in graph.subjects() if isinstance(item, URIRef)}, key=str):
        title_values = sorted(graph.objects(subject, title_predicate), key=lambda value: value.n3())
        title_value = title_values[0] if title_values else None
        title = (
            str(title_value)
            if title_value is not None
            else str(subject).rstrip("/#").rsplit("/", 1)[-1].rsplit("#", 1)[-1]
        )
        attributes: dict[str, Any] = {}
        for predicate in sorted(field_map, key=str):
            values = [
                str(value)
                for value in sorted(graph.objects(subject, predicate), key=lambda value: value.n3())
            ]
            if values:
                attributes[str(predicate)] = values[0] if len(values) == 1 else values
        statements = sorted((str(predicate), str(value)) for predicate, value in graph.predicate_objects(subject))
        body_lines = [f"# {_markdown_table_cell(title)}", "", "| Predicate | Value |", "|---|---|"]
        body_lines.extend(
            f"| {_markdown_table_cell(predicate)} | {_markdown_table_cell(value)} |"
            for predicate, value in statements
        )
        yield {
            "source_id": source["id"],
            "source_kind": source["kind"],
            "source_path": row.source_path,
            "record_id": str(subject),
            "subject_iri": str(subject),
            "title": title,
            "body": "\n".join(body_lines),
            "attributes": attributes,
        }


def discover_source_files(manifest_root: Path, source: Mapping[str, Any]) -> list[Path]:
    """Resolve a local source glob without allowing traversal outside the manifest tree."""
    raw_path = str(source["path"])
    if "\\" in raw_path or Path(raw_path).is_absolute() or Path(raw_path).drive or ".." in Path(raw_path).parts:
        raise BundleError(f"source {source['id']!r} path must be manifest-relative and cannot traverse")
    pattern = str((manifest_root / raw_path).resolve(strict=False))
    matches = sorted(Path(item).resolve() for item in glob.glob(pattern, recursive=True) if Path(item).is_file())
    safe: list[Path] = []
    for path in matches:
        try:
            path.relative_to(manifest_root.resolve())
        except ValueError as exc:
            raise BundleError(f"source {source['id']!r} escapes the manifest directory: {path}") from exc
        safe.append(path)
    if not safe and not source.get("allow_empty", False):
        raise BundleError(f"source {source['id']!r} path matched no files")
    return safe


def _filter_options(source: Mapping[str, Any], allowed: frozenset[str]) -> dict[str, str]:
    """Return normalized adapter options after rejecting unknown keys."""
    options = source.get("options", {})
    if not isinstance(options, dict):
        raise BundleError(f"source {source['id']!r} options must be an object")
    unknown = set(options) - allowed
    if unknown:
        raise BundleError(f"source {source['id']!r} uses unsupported options: {', '.join(sorted(unknown))}")
    invalid = sorted(str(key) for key, value in options.items() if value is None or isinstance(value, (dict, list)))
    if invalid:
        raise BundleError(
            f"source {source['id']!r} options must contain scalar values: {', '.join(invalid)}"
        )
    return {str(key): str(value).lower() if isinstance(value, bool) else str(value) for key, value in options.items()}


def _boolean_option(
    source: Mapping[str, Any], options: Mapping[str, str], name: str, default: bool
) -> bool:
    """Parse one true/false reader option without silently accepting misspellings."""
    lexical = options.get(name, "true" if default else "false").lower()
    if lexical not in {"true", "false"}:
        raise BundleError(f"source {source['id']!r} option {name} must be true or false")
    return lexical == "true"


def _encoding_name(value: str) -> str:
    """Normalize the common UTF-8 label while retaining explicit codecs."""
    if value.lower().replace("-", "").replace("_", "") == "utf8":
        return "utf-8-sig"
    return value


def _csv_reader_options(source: Mapping[str, Any], options: Mapping[str, str]) -> dict[str, Any]:
    """Translate manifest CSV options into strict stdlib reader options."""
    delimiter = options.get("sep", ",")
    quote_character = options.get("quote", '"')
    escape_character = options.get("escape", "\\")
    for option_name, value, allow_empty in (
        ("sep", delimiter, False),
        ("quote", quote_character, True),
        ("escape", escape_character, True),
    ):
        if (not value and not allow_empty) or len(value) > 1:
            raise ValueError(f"CSV source {source['id']!r} option {option_name} must be one character")
    reader_options: dict[str, Any] = {"delimiter": delimiter, "strict": True}
    if quote_character:
        reader_options.update({"quotechar": quote_character, "quoting": csv.QUOTE_MINIMAL})
    else:
        reader_options.update({"quotechar": None, "quoting": csv.QUOTE_NONE})
    if escape_character:
        reader_options["escapechar"] = escape_character
    return reader_options


def _csv_header(path: Path, source: Mapping[str, Any], options: Mapping[str, str]) -> list[str]:
    """Read one physical CSV header without rewriting duplicate names."""
    reader_options = _csv_reader_options(source, options)
    encoding = _encoding_name(options.get("encoding", "UTF-8"))
    try:
        with path.open("r", encoding=encoding, newline="") as handle:
            header = next(csv.reader(handle, **reader_options), None)
    except (LookupError, UnicodeError, csv.Error, OSError) as exc:
        raise ValueError(f"CSV source {source['id']!r} header cannot be read from {path}: {exc}") from exc
    if header is None:
        raise ValueError(f"CSV source {source['id']!r} is empty and has no header: {path}")
    return header


def _parse_date(value: str) -> str:
    """Parse one strict date and return canonical ISO lexical form."""
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
    if not match:
        raise ValueError("date must use YYYY-MM-DD")
    return date(*(int(match.group(index)) for index in range(1, 4))).isoformat()


def _validate_timezone(value: str | None) -> None:
    """Reject timezone offsets outside the conservative XSD range."""
    if value in {None, "Z"}:
        return
    hours, minutes = (int(part) for part in value[1:].split(":"))
    if hours > 14 or minutes > 59 or (hours == 14 and minutes != 0):
        raise ValueError("timezone offset must be between -14:00 and +14:00")


def _parse_timestamp(value: str) -> str:
    """Parse one strict timestamp and return canonical ISO lexical form."""
    match = re.fullmatch(
        r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})"
        r"(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?",
        value,
    )
    if not match:
        raise ValueError(
            "timestamp must use YYYY-MM-DDTHH:MM:SS with optional fractional seconds and timezone"
        )
    _validate_timezone(match.group(8))
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return parsed.isoformat()


def _typed_value(value: Any, type_name: str, field_name: str, options: Mapping[str, str]) -> Any:
    """Convert one scalar using strict, deterministic schema semantics."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        raise ValueError(f"field {field_name!r} must be a scalar {type_name}")
    if type_name == "string":
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)
    if type_name in {"integer", "long"}:
        lexical = str(value)
        if isinstance(value, bool) or not re.fullmatch(r"[+-]?\d+", lexical):
            raise ValueError(f"field {field_name!r} must be a strict {type_name}")
        number = int(lexical)
        lower, upper = (INTEGER_MIN, INTEGER_MAX) if type_name == "integer" else (LONG_MIN, LONG_MAX)
        if not lower <= number <= upper:
            raise ValueError(f"field {field_name!r} exceeds the {type_name} range")
        return number
    if type_name == "double":
        if isinstance(value, bool):
            raise ValueError(f"field {field_name!r} must be a strict double")
        lexical = str(value)
        if not re.fullmatch(r"[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)", lexical):
            raise ValueError(f"field {field_name!r} must be a strict double")
        try:
            number = float(lexical)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"field {field_name!r} must be a strict double") from exc
        if not math.isfinite(number):
            raise ValueError(f"field {field_name!r} must be a finite double")
        return number
    if type_name == "boolean":
        if isinstance(value, bool):
            return value
        lexical = str(value).casefold()
        if lexical not in {"true", "false"}:
            raise ValueError(f"field {field_name!r} must be true or false")
        return lexical == "true"
    if type_name == "date":
        try:
            return _parse_date(str(value))
        except ValueError as exc:
            raise ValueError(f"field {field_name!r} must be a valid date") from exc
    if type_name == "timestamp":
        try:
            return _parse_timestamp(str(value))
        except ValueError as exc:
            raise ValueError(f"field {field_name!r} must be a valid timestamp") from exc
    raise BundleError(f"unsupported schema type {type_name!r}")


def _markdown_scalar(value: Any) -> str:
    """Render one normalized scalar consistently in generated Markdown."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _structured_record(
    source: Mapping[str, Any], path: Path, values: Mapping[str, Any], options: Mapping[str, str]
) -> dict[str, Any]:
    """Normalize one CSV or JSON object into a raw record dictionary."""
    normalized = {
        name: _typed_value(values.get(name), type_name, name, options)
        for name, type_name in source["schema"].items()
    }
    required = {source["id_field"], source["title_field"], *source.get("fields", {}).keys()}
    missing = required - set(normalized)
    if missing:
        raise BundleError(f"source {source['id']!r} is missing columns: {', '.join(sorted(missing))}")
    selected_fields = sorted(source.get("fields", {}))
    attributes = {name: normalized.get(name) for name in selected_fields}
    title = _markdown_scalar(normalized.get(source["title_field"]))
    body_parts = [
        f"- **{name}**: {html.escape(_markdown_scalar(normalized.get(name)), quote=False).replace(chr(10), ' ↵ ')}"
        for name in selected_fields
    ]
    return {
        "source_id": source["id"],
        "source_kind": source["kind"],
        "source_path": str(path.resolve()),
        "record_id": _markdown_scalar(normalized.get(source["id_field"])),
        "subject_iri": "",
        "title": title,
        "body": f"# {html.escape(title, quote=False)}\n\n" + "\n".join(body_parts),
        "attributes": attributes,
    }


def _csv_records(source: Mapping[str, Any], paths: list[Path]) -> list[dict[str, Any]]:
    """Read exact-header CSV files with strict typed conversion."""
    configured = _filter_options(source, CSV_OPTIONS)
    if configured.get("mode", "FAILFAST").upper() != "FAILFAST":
        raise BundleError(f"source {source['id']!r} must use mode FAILFAST")
    if not _boolean_option(source, configured, "header", True):
        raise ValueError(f"CSV source {source['id']!r} must use header=true")
    allow_multiline = _boolean_option(source, configured, "multiLine", False)
    _boolean_option(source, configured, "enforceSchema", True)
    options = {"header": "true", "encoding": "UTF-8", "mode": "FAILFAST", **configured}
    expected_columns = set(source["schema"])
    records: list[dict[str, Any]] = []
    for path in paths:
        observed_columns = _csv_header(path, source, options)
        if len(observed_columns) != len(set(observed_columns)):
            raise ValueError(f"CSV source {source['id']!r} has duplicate header names in {path}")
        observed = set(observed_columns)
        if observed != expected_columns:
            missing = ", ".join(sorted(expected_columns - observed)) or "none"
            extra = ", ".join(sorted(observed - expected_columns)) or "none"
            raise ValueError(
                f"CSV source {source['id']!r} header/schema mismatch in {path}: missing={missing}; extra={extra}"
            )
        reader_options = _csv_reader_options(source, options)
        encoding = _encoding_name(options.get("encoding", "UTF-8"))
        null_value = options.get("nullValue", "")
        empty_value = options.get("emptyValue")
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.reader(handle, **reader_options)
                next(reader)
                for line_number, row in enumerate(reader, start=2):
                    if not row:
                        continue
                    if not allow_multiline and any("\n" in value or "\r" in value for value in row):
                        raise ValueError(
                            f"CSV source {source['id']!r} row {line_number} contains a multiline field; "
                            "set multiLine=true to accept it"
                        )
                    if len(row) != len(observed_columns):
                        raise ValueError(
                            f"CSV source {source['id']!r} row {line_number} has {len(row)} fields; "
                            f"expected {len(observed_columns)}"
                        )
                    values: dict[str, Any] = {}
                    for name, raw in zip(observed_columns, row, strict=True):
                        if raw == null_value:
                            values[name] = None
                        elif empty_value is not None and raw == empty_value:
                            values[name] = ""
                        else:
                            values[name] = raw
                    records.append(_structured_record(source, path, values, options))
        except (LookupError, UnicodeError, csv.Error, OSError) as exc:
            raise ValueError(f"CSV source {source['id']!r} cannot be read from {path}: {exc}") from exc
    return records


def _json_loads(text: str, *, allow_non_numeric: bool) -> Any:
    """Parse strict JSON while rejecting non-standard numeric constants by default."""
    def reject_constant(value: str) -> Any:
        raise ValueError(f"non-standard JSON number {value!r} is not allowed")

    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON member {key!r} is ambiguous")
            result[key] = value
        return result

    options: dict[str, Any] = {"object_pairs_hook": reject_duplicates}
    if not allow_non_numeric:
        options["parse_constant"] = reject_constant
    return json.loads(text, **options)


def _json_records(source: Mapping[str, Any], paths: list[Path]) -> list[dict[str, Any]]:
    """Read JSON objects or JSONL with strict typed conversion."""
    configured = _filter_options(source, JSON_OPTIONS)
    if configured.get("mode", "FAILFAST").upper() != "FAILFAST":
        raise BundleError(f"source {source['id']!r} must use mode FAILFAST")
    options = {
        "multiLine": "false",
        "encoding": "UTF-8",
        "mode": "FAILFAST",
        **configured,
    }
    multiline = _boolean_option(source, options, "multiLine", False)
    allow_non_numeric = False
    records: list[dict[str, Any]] = []
    for path in paths:
        encoding = _encoding_name(options["encoding"])
        try:
            text = path.read_text(encoding=encoding)
        except (LookupError, UnicodeError, OSError) as exc:
            raise ValueError(f"JSON source {source['id']!r} cannot be read from {path}: {exc}") from exc
        try:
            if multiline:
                payload = _json_loads(text, allow_non_numeric=allow_non_numeric)
                values = payload if isinstance(payload, list) else [payload]
            else:
                values = [
                    _json_loads(line, allow_non_numeric=allow_non_numeric)
                    for line in text.splitlines()
                    if line.strip()
                ]
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"JSON source {source['id']!r} is invalid in {path}: {exc}") from exc
        for index, value in enumerate(values, start=1):
            if not isinstance(value, dict):
                raise ValueError(f"JSON source {source['id']!r} record {index} in {path} must be an object")
            records.append(_structured_record(source, path, value, options))
    return records


def source_records(
    source: Mapping[str, Any], paths: list[Path], manifest_root: Path
) -> list[dict[str, Any]]:
    """Load one source through its deterministic Python adapter."""
    if source["kind"] == "csv":
        return _csv_records(source, paths)
    if source["kind"] == "json":
        return _json_records(source, paths)
    worker_source = {**source, "_manifest_root": str(manifest_root.resolve())}
    records: list[dict[str, Any]] = []
    for path in paths:
        try:
            content = path.read_text(encoding="utf-8-sig")
        except (UnicodeError, OSError) as exc:
            raise ValueError(f"source {source['id']!r} cannot read {path}: {exc}") from exc
        row = TextRow(source_path=str(path.resolve()), value=content)
        if source["kind"] == "markdown":
            records.append(_markdown_record(row, worker_source))
        else:
            records.extend(_rdf_records(row, worker_source))
    return records


def _source_content_digests(
    paths_by_source: Mapping[str, list[Path]], manifest_root: Path
) -> dict[str, str]:
    """Hash a deterministic source snapshot before or after normalization."""
    observed = {
        path.resolve(): hashlib.sha256(path.read_bytes()).hexdigest()
        for paths in paths_by_source.values()
        for path in paths
    }
    root = manifest_root.resolve()
    digests: dict[str, str] = {}
    for source_id, paths in paths_by_source.items():
        payload = [
            {"path": path.resolve().relative_to(root).as_posix(), "sha256": observed[path.resolve()]}
            for path in paths
        ]
        digests[source_id] = sha256_json(sorted(payload, key=lambda item: item["path"]))
    return digests


def _source_content_digest(paths: list[Path], manifest_root: Path) -> str:
    """Compatibility wrapper for one source digest."""
    return _source_content_digests({"source": paths}, manifest_root)["source"]


def build(manifest_path: Path, output: Path) -> dict[str, Any]:
    """Reprocess every declared source and atomically materialize one bundle."""
    manifest_path = manifest_path.expanduser().resolve()
    manifest = load_manifest(manifest_path)
    root = manifest_path.parent
    raw_records: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    paths_by_source: dict[str, list[Path]] = {}
    for source in manifest["sources"]:
        paths = discover_source_files(root, source)
        paths_by_source[source["id"]] = paths
        summaries.append(
            {
                "id": source["id"],
                "kind": source["kind"],
                "path": source["path"],
                "content_sha256": "",
                "allow_empty": bool(source.get("allow_empty", False)),
            }
        )
    initial_digests = _source_content_digests(paths_by_source, root)
    for summary in summaries:
        summary["content_sha256"] = initial_digests[summary["id"]]
    for source in manifest["sources"]:
        raw_records.extend(source_records(source, paths_by_source[source["id"]], root))
    raw_records.sort(
        key=lambda row: (str(row["source_id"]), str(row["record_id"]), str(row["source_path"]))
    )
    source_specs = source_by_id(manifest)
    summary_by_id = {item["id"]: item for item in summaries}
    records = [
        finalize_record(
            row,
            source_specs[str(row["source_id"])],
            summary_by_id[str(row["source_id"])],
            manifest,
            root,
        )
        for row in raw_records
    ]
    final_paths_by_source = {
        source["id"]: discover_source_files(root, source) for source in manifest["sources"]
    }
    for source_id, initial_paths in paths_by_source.items():
        if [path.resolve() for path in final_paths_by_source[source_id]] != [
            path.resolve() for path in initial_paths
        ]:
            raise BundleError(f"source {source_id!r} membership changed while it was being normalized")
    final_digests = _source_content_digests(final_paths_by_source, root)
    for summary in summaries:
        if final_digests[summary["id"]] != summary["content_sha256"]:
            raise BundleError(f"source {summary['id']!r} changed while it was being normalized")
    processor_info = {
        "name": "semantic-okf-python",
        "contract_version": "1.0",
        "records": len(records),
        "sources": len(summaries),
    }
    return materialize_bundle(output, manifest, records, summaries, processor_info)


def build_parser() -> argparse.ArgumentParser:
    """Build the pure-Python corpus builder command-line parser."""
    parser = argparse.ArgumentParser(
        description="Build a coherent OKF/OWL/SHACL bundle with deterministic Python adapters."
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--output-format", choices=("text", "json"), default="text")
    return parser


def _error_code(exc: Exception) -> str:
    """Classify one user-facing build failure."""
    if isinstance(exc, ManifestError):
        return "manifest-error"
    if isinstance(exc, BundleError):
        return "shacl-nonconformant" if "SHACL non-conformant" in str(exc) else "semantic-error"
    if isinstance(exc, (OSError, ValueError, csv.Error, json.JSONDecodeError)):
        return "source-error"
    if type(exc).__module__.startswith(("pyshacl", "rdflib")):
        return "processor-failure"
    return ""


def main(argv: list[str] | None = None) -> int:
    """Run the builder and emit stable human or JSON output."""
    configure_utf8_output()
    args = build_parser().parse_args(argv)
    try:
        report = build(args.manifest, args.output)
    except Exception as exc:
        code = _error_code(exc)
        if not code:
            raise
        if args.output_format == "json":
            print(json.dumps({"status": "error", "code": code, "error": str(exc)}, sort_keys=True))
        else:
            print(f"{code}: {exc}", file=sys.stderr)
        return 2
    if args.output_format == "json":
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    else:
        print(f"Semantic OKF build passed: {args.output.resolve()}")
        print(f"Concepts: {report['summary']['concepts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
