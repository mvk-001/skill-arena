#!/usr/bin/env python3
"""Query a validated Semantic OKF snapshot through its ledger or local RDF graphs."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping

from pyparsing import ParseResults
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, XSD
from rdflib.plugins.sparql.parser import parseQuery, parseUpdate
from rdflib.plugins.sparql.parserutils import CompValue


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _consult_semantic_okf import (  # noqa: E402
    GRAPH_FILES,
    SnapshotError,
    configure_utf8_output,
    ontology_namespace,
    read_json_object,
    safe_concept_path,
    validate_snapshot,
)


MAX_QUERY_BYTES = 64 * 1024


class QueryError(RuntimeError):
    """A classified local query or snapshot failure."""

    def __init__(self, code: str, message: str, *, exit_code: int = 2) -> None:
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


def _json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        return read_json_object(path, label)
    except SnapshotError as exc:
        raise QueryError("bundle-invalid", str(exc)) from exc


def _check_snapshot(root: Path, *, full_validation: bool) -> None:
    """Apply a cheap publication gate or parse the complete read surface."""

    try:
        validate_snapshot(root, full_read_surface=full_validation)
    except SnapshotError as exc:
        raise QueryError("bundle-invalid", str(exc)) from exc


def _iter_records(root: Path) -> Iterator[dict[str, Any]]:
    path = root / "semantic" / "records.jsonl"
    try:
        handle = path.open("r", encoding="utf-8")
    except OSError as exc:
        raise QueryError("bundle-invalid", f"cannot open record ledger: {exc}") from exc
    with handle:
        for number, line in enumerate(handle, start=1):
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise QueryError("bundle-invalid", f"invalid records.jsonl line {number}: {exc}") from exc
            if not isinstance(record, dict):
                raise QueryError("bundle-invalid", f"records.jsonl line {number} must be an object")
            yield record


def _parse_attribute_value(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _record_matches(record: Mapping[str, Any], args: argparse.Namespace) -> bool:
    exact = {
        "concept_id": args.concept_id,
        "subject_iri": args.subject_iri,
        "source_id": args.source_id,
        "record_id": args.record_id,
        "concept_type": args.concept_type,
    }
    if any(expected is not None and record.get(field) != expected for field, expected in exact.items()):
        return False
    attributes = record.get("attributes")
    if not isinstance(attributes, dict):
        attributes = {}
    for name, raw_value in args.attribute or []:
        if name not in attributes or attributes[name] != _parse_attribute_value(raw_value):
            return False
    if args.contains:
        needle = args.contains.casefold()
        haystack = "\n".join(
            [
                str(record.get("title") or ""),
                str(record.get("record_id") or ""),
                str(record.get("body") or ""),
                json.dumps(attributes, ensure_ascii=False, sort_keys=True),
            ]
        ).casefold()
        if needle not in haystack:
            return False
    return True


def _concept_content(root: Path, record: Mapping[str, Any]) -> str:
    value = record.get("concept_path")
    try:
        path = safe_concept_path(root, value)
        return path.read_text(encoding="utf-8")
    except SnapshotError as exc:
        raise QueryError("bundle-invalid", str(exc)) from exc
    except (OSError, UnicodeError) as exc:
        raise QueryError("bundle-invalid", f"cannot read concept {value!r}: {exc}") from exc


def _record_projection(record: Mapping[str, Any], *, include_content: bool, root: Path) -> dict[str, Any]:
    projected = dict(record)
    if not include_content:
        projected.pop("body", None)
    else:
        projected["content"] = _concept_content(root, record)
    return projected


def _limit_value(args: argparse.Namespace) -> int | None:
    if args.all:
        return None
    if args.limit < 1:
        raise QueryError("invalid-arguments", "--limit must be at least 1")
    return args.limit


def ledger_query(root: Path, args: argparse.Namespace) -> dict[str, Any]:
    """Stream ledger records through exact and fixed-substring filters."""

    limit = _limit_value(args)
    returned: list[dict[str, Any]] = []
    truncated = False
    for record in _iter_records(root):
        if not _record_matches(record, args):
            continue
        if limit is not None and len(returned) >= limit:
            truncated = True
            break
        returned.append(_record_projection(record, include_content=args.show_content, root=root))
    return {
        "status": "pass",
        "mode": "ledger",
        "matched": None if truncated else len(returned),
        "returned": len(returned),
        "truncated": truncated,
        "records": returned,
    }


def _walk_comp_names(value: Any, names: set[str]) -> None:
    if isinstance(value, CompValue):
        names.add(value.name)
        for child in value.values():
            _walk_comp_names(child, names)
    elif isinstance(value, (list, tuple, ParseResults)):
        for child in value:
            _walk_comp_names(child, names)
    elif isinstance(value, dict):
        for child in value.values():
            _walk_comp_names(child, names)


def _validate_query_text(query_text: str) -> str:
    if len(query_text.encode("utf-8")) > MAX_QUERY_BYTES:
        raise QueryError("query-rejected", "SPARQL query exceeds the 64 KiB limit", exit_code=3)
    try:
        parsed = parseQuery(query_text)
    except Exception as exc:
        try:
            parseUpdate(query_text)
        except Exception:
            raise QueryError("query-invalid", f"cannot parse SPARQL query: {exc}", exit_code=3) from exc
        raise QueryError("query-rejected", "SPARQL update operations are disabled", exit_code=3) from exc
    root_name = getattr(parsed[1], "name", "")
    if root_name not in {"SelectQuery", "AskQuery"}:
        raise QueryError("query-rejected", "only SPARQL SELECT and ASK are allowed", exit_code=3)
    names: set[str] = set()
    _walk_comp_names(parsed, names)
    forbidden = sorted(names & {"ServiceGraphPattern", "DatasetClause"})
    if forbidden:
        raise QueryError(
            "query-rejected",
            f"federation and dataset clauses are disabled: {', '.join(forbidden)}",
            exit_code=3,
        )
    return "SELECT" if root_name == "SelectQuery" else "ASK"


def _query_text(args: argparse.Namespace) -> str:
    if args.query is not None:
        return args.query
    try:
        return args.query_file.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise QueryError("query-invalid", f"cannot read query file: {exc}", exit_code=3) from exc


def _prefixes(root: Path) -> dict[str, Namespace]:
    plan = _json_object(root / "semantic" / "semantic-plan.json", "semantic plan")
    bundle = plan.get("bundle")
    if not isinstance(bundle, dict) or not isinstance(bundle.get("prefix"), str):
        raise QueryError("bundle-invalid", "semantic plan has no bundle prefix")
    return {
        "rdf": RDF,
        "rdfs": RDFS,
        "owl": OWL,
        "xsd": XSD,
        "dcterms": DCTERMS,
        "prov": Namespace("http://www.w3.org/ns/prov#"),
        bundle["prefix"]: Namespace(ontology_namespace(plan)),
    }


def _term_json(term: Any) -> dict[str, Any] | None:
    if term is None:
        return None
    if isinstance(term, URIRef):
        return {"type": "uri", "value": str(term)}
    if isinstance(term, BNode):
        return {"type": "bnode", "value": str(term)}
    if isinstance(term, Literal):
        payload: dict[str, Any] = {"type": "literal", "value": str(term)}
        if term.datatype:
            payload["datatype"] = str(term.datatype)
        if term.language:
            payload["language"] = term.language
        return payload
    return {"type": "unknown", "value": str(term)}


def _term_text(term: Any, graph: Graph) -> str:
    if term is None:
        return ""
    n3 = getattr(term, "n3", None)
    return n3(namespace_manager=graph.namespace_manager) if n3 else str(term)


def sparql_query(root: Path, args: argparse.Namespace) -> tuple[dict[str, Any], Graph]:
    """Execute one local SELECT or ASK over explicitly selected graphs."""

    query_text = _query_text(args)
    query_type = _validate_query_text(query_text)
    graph_names = list(dict.fromkeys(args.graph or ["data"]))
    graph = Graph()
    for name in graph_names:
        path = root / GRAPH_FILES[name]
        try:
            graph.parse(path, format="turtle")
        except Exception as exc:
            raise QueryError("bundle-invalid", f"cannot parse {GRAPH_FILES[name]}: {exc}") from exc
    prefixes = _prefixes(root)
    for prefix, namespace in prefixes.items():
        graph.bind(prefix, namespace)
    try:
        result = graph.query(query_text, initNs=prefixes)
    except Exception as exc:
        raise QueryError("query-failed", f"SPARQL evaluation failed: {exc}", exit_code=3) from exc

    payload: dict[str, Any] = {
        "status": "pass",
        "mode": "sparql",
        "query_type": query_type,
        "graphs": graph_names,
        "entailment": "none",
        "prefixes": {key: str(value) for key, value in prefixes.items()},
    }
    if query_type == "ASK":
        payload["boolean"] = bool(result.askAnswer)
        return payload, graph

    limit = _limit_value(args)
    columns = [str(value) for value in result.vars]
    rows: list[dict[str, Any]] = []
    raw_rows: list[list[Any]] = []
    truncated = False
    for row in result:
        if limit is not None and len(rows) >= limit:
            truncated = True
            break
        values = [row[index] for index in range(len(columns))]
        raw_rows.append(values)
        rows.append({column: _term_json(value) for column, value in zip(columns, values, strict=True)})
    payload.update(
        {
            "columns": columns,
            "rows": rows,
            "_raw_rows": raw_rows,
            "returned": len(rows),
            "truncated": truncated,
        }
    )
    return payload, graph


def _print_ledger(payload: Mapping[str, Any], output_format: str) -> None:
    records = payload["records"]
    if output_format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return
    if output_format == "paths":
        for record in records:
            print(record.get("concept_path", ""))
        return
    print("concept_id\ttype\ttitle\tsource_id\tconcept_path")
    for record in records:
        print(
            "\t".join(
                str(record.get(field, ""))
                for field in ("concept_id", "concept_type", "title", "source_id", "concept_path")
            )
        )
        if "content" in record:
            print(f"\n--- {record.get('concept_id', '')} ---\n{record['content']}\n")


def _print_sparql(payload: dict[str, Any], graph: Graph, output_format: str) -> None:
    raw_rows = payload.pop("_raw_rows", [])
    if output_format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return
    if payload["query_type"] == "ASK":
        value = "true" if payload["boolean"] else "false"
        if output_format in {"csv", "tsv"}:
            print("boolean")
        print(value)
        return
    delimiter = "," if output_format == "csv" else "\t"
    writer = csv.writer(sys.stdout, delimiter=delimiter, lineterminator="\n")
    writer.writerow(payload["columns"])
    for row in raw_rows:
        writer.writerow([_term_text(value, graph) for value in row])


def build_parser() -> argparse.ArgumentParser:
    """Build the layer-aware query command-line parser."""

    parser = argparse.ArgumentParser(description="Query a Semantic OKF snapshot efficiently.")
    parser.add_argument("bundle", type=Path)
    subparsers = parser.add_subparsers(dest="command", required=True)

    ledger = subparsers.add_parser("ledger", help="Stream filters over semantic/records.jsonl.")
    ledger.add_argument("--concept-id")
    ledger.add_argument("--subject-iri")
    ledger.add_argument("--source-id")
    ledger.add_argument("--record-id")
    ledger.add_argument("--type", dest="concept_type")
    ledger.add_argument("--attribute", nargs=2, action="append", metavar=("NAME", "VALUE"))
    ledger.add_argument("--contains")
    ledger.add_argument("--limit", type=int, default=50)
    ledger.add_argument("--all", action="store_true")
    ledger.add_argument("--show-content", action="store_true")
    ledger.add_argument("--validate", action="store_true")
    ledger.add_argument("--format", choices=("text", "json", "paths"), default="text")

    sparql = subparsers.add_parser("sparql", help="Run local read-only SPARQL SELECT or ASK.")
    query_source = sparql.add_mutually_exclusive_group(required=True)
    query_source.add_argument("--query")
    query_source.add_argument("--query-file", type=Path)
    sparql.add_argument("--graph", action="append", choices=tuple(GRAPH_FILES))
    sparql.add_argument("--limit", type=int, default=1000)
    sparql.add_argument("--all", action="store_true")
    sparql.add_argument("--validate", action="store_true")
    sparql.add_argument("--format", choices=("text", "json", "csv", "tsv"), default="text")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run a ledger or SPARQL query without mutating the snapshot."""

    configure_utf8_output()
    args = build_parser().parse_args(argv)
    output_format = args.format
    root = args.bundle.expanduser().resolve()
    try:
        _check_snapshot(root, full_validation=args.validate)
        if args.command == "ledger":
            payload = ledger_query(root, args)
            _print_ledger(payload, output_format)
        else:
            payload, graph = sparql_query(root, args)
            _print_sparql(payload, graph, output_format)
    except QueryError as exc:
        if output_format == "json":
            print(
                json.dumps(
                    {"status": "error", "code": exc.code, "error": str(exc)},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
        else:
            print(f"{exc.code}: {exc}", file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
