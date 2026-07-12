#!/usr/bin/env python3
"""Parse local RDF graphs and validate them with SHACL deterministically."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


EXIT_OK = 0
EXIT_NONCONFORMANT = 1
EXIT_ERROR = 2
SCHEMA_VERSION = "1.0"
PINNED_VERSIONS = {"rdflib": "7.6.0", "pyshacl": "0.40.0", "owlrl": "7.6.2"}
GRAPH_FORMATS = ("auto", "turtle", "xml", "json-ld", "nt", "n3")
DATASET_FORMATS = frozenset({"trig", "nquads", "trix"})
URL_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://")


class ValidationInputError(Exception):
    """Describe an invalid or unsafe validation input."""


class ProcessorFailure(Exception):
    """Describe a SHACL processor failure rather than graph non-conformance."""


@dataclass(frozen=True)
class ParsedFile:
    """Record one parsed RDF file for reporting."""

    role: str
    path: str
    rdf_format: str
    triples: int


def build_parser() -> argparse.ArgumentParser:
    """Build the validator command-line parser."""

    parser = argparse.ArgumentParser(
        description=(
            "Parse local RDF graph files, meta-validate SHACL shapes, and run pySHACL. "
            "RDF datasets and remote resources are deliberately not supported."
        ),
    )
    parser.add_argument("--data", action="append", default=[], metavar="PATH")
    parser.add_argument("--ontology", action="append", default=[], metavar="PATH")
    parser.add_argument("--shapes", action="append", default=[], metavar="PATH")
    parser.add_argument("--data-format", choices=GRAPH_FORMATS, default="auto")
    parser.add_argument("--ontology-format", choices=GRAPH_FORMATS, default="auto")
    parser.add_argument("--shapes-format", choices=GRAPH_FORMATS, default="auto")
    parser.add_argument(
        "--inference",
        choices=("none", "rdfs", "owlrl", "both"),
        default="none",
        help="Entailment regime used during SHACL validation (default: none)",
    )
    parser.add_argument(
        "--meta-shacl",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Validate the shapes graph before data validation (default: enabled)",
    )
    parser.add_argument("--advanced", action="store_true", help="Enable SHACL Advanced Features")
    parser.add_argument(
        "--allow-shacl-sparql",
        action="store_true",
        help="Opt in to local SHACL-SPARQL constraints; remote dataset clauses remain blocked",
    )
    parser.add_argument("--abort-on-first", action="store_true")
    parser.add_argument("--allow-infos", action="store_true")
    parser.add_argument("--allow-warnings", action="store_true")
    parser.add_argument("--max-depth", type=int, default=15)
    parser.add_argument("--report", type=Path, help="Write the RDF SHACL report graph")
    parser.add_argument(
        "--report-format",
        choices=("turtle", "json-ld", "xml", "nt"),
        default="turtle",
    )
    parser.add_argument("--output-format", choices=("text", "json"), default="text")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument(
        "--allow-unpinned-dependencies",
        action="store_true",
        help="Run with versions other than the tested requirements lock and report a warning",
    )
    parser.add_argument("--version", action="version", version="semantic-artifact-validator 1.0")
    return parser


def dependency_versions() -> dict[str, str]:
    """Return installed semantic-tool versions or a `missing` marker."""

    versions: dict[str, str] = {}
    for distribution in ("rdflib", "pyshacl", "owlrl"):
        try:
            versions[distribution] = importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError:
            versions[distribution] = "missing"
    return versions


def load_dependencies() -> dict[str, Any]:
    """Import optional validator dependencies with one actionable error."""

    try:
        from pyshacl import validate
        from pyshacl.errors import ValidationFailure
        from rdflib import BNode, Graph, Literal, Namespace, URIRef
        from rdflib.compare import to_canonical_graph
        from rdflib.namespace import OWL, RDF
        from rdflib.util import guess_format
    except ImportError as exc:
        requirement = Path(__file__).with_name("requirements.txt")
        raise ValidationInputError(
            f"missing validator dependency ({exc.name}); install with "
            f"`python -m pip install -r {requirement}`"
        ) from exc
    return {
        "validate": validate,
        "ValidationFailure": ValidationFailure,
        "BNode": BNode,
        "Graph": Graph,
        "Literal": Literal,
        "Namespace": Namespace,
        "URIRef": URIRef,
        "to_canonical_graph": to_canonical_graph,
        "OWL": OWL,
        "RDF": RDF,
        "guess_format": guess_format,
    }


def local_file(raw: str) -> Path:
    """Resolve one existing local file while rejecting URL and UNC inputs."""

    if URL_RE.match(raw) or raw.startswith(("\\\\", "//")):
        raise ValidationInputError(f"remote input is disabled: {raw}")
    path = Path(raw).expanduser().resolve()
    if not path.exists():
        raise ValidationInputError(f"input does not exist: {raw}")
    if not path.is_file():
        raise ValidationInputError(f"input is not a file: {raw}")
    return path


def contains_external_jsonld_context(value: Any) -> bool:
    """Return true when a JSON-LD document references an external context."""

    if isinstance(value, list):
        return any(contains_external_jsonld_context(item) for item in value)
    if not isinstance(value, dict):
        return False
    for key, child in value.items():
        if key == "@context":
            contexts = child if isinstance(child, list) else [child]
            for context in contexts:
                if isinstance(context, str):
                    return True
                if isinstance(context, dict) and contains_external_jsonld_context(context):
                    return True
        elif key == "@import" and isinstance(child, str):
            return True
        elif isinstance(child, (dict, list)) and contains_external_jsonld_context(child):
            return True
    return False


def guard_jsonld(path: Path) -> None:
    """Reject external JSON-LD contexts before invoking RDFLib."""

    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValidationInputError(f"cannot read JSON-LD document {path}: {exc}") from exc
    if contains_external_jsonld_context(document):
        raise ValidationInputError(
            f"external JSON-LD contexts are disabled; inline the pinned context in {path}"
        )


def resolve_rdf_format(path: Path, requested: str, guess_format: Any) -> str:
    """Resolve one RDF graph format without silently unioning a dataset."""

    rdf_format = requested if requested != "auto" else guess_format(path.name)
    if rdf_format in DATASET_FORMATS:
        raise ValidationInputError(
            f"{path} is an RDF dataset ({rdf_format}); select and export the intended graph explicitly"
        )
    if rdf_format not in GRAPH_FORMATS[1:]:
        raise ValidationInputError(
            f"cannot determine a supported RDF graph format for {path}; use an explicit role format"
        )
    return str(rdf_format)


def parse_role(
    role: str,
    raw_paths: Iterable[str],
    requested_format: str,
    dependencies: dict[str, Any],
) -> tuple[Any, list[ParsedFile]]:
    """Parse and merge files belonging to one explicit artifact role."""

    graph = dependencies["Graph"]()
    parsed: list[ParsedFile] = []
    for raw in raw_paths:
        path = local_file(raw)
        rdf_format = resolve_rdf_format(path, requested_format, dependencies["guess_format"])
        if rdf_format == "json-ld":
            guard_jsonld(path)
        current = dependencies["Graph"]()
        try:
            with path.open("rb") as stream:
                current.parse(file=stream, publicID=path.as_uri(), format=rdf_format)
        except Exception as exc:
            raise ValidationInputError(f"failed to parse {role} file {path}: {exc}") from exc
        graph += current
        parsed.append(ParsedFile(role, str(path), rdf_format, len(current)))
    return graph, parsed


def local_name(term: Any) -> str | None:
    """Return a compact final fragment for an RDF term."""

    if term is None:
        return None
    value = str(term)
    return value.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def term_json(term: Any, dependencies: dict[str, Any]) -> dict[str, Any] | None:
    """Convert an RDF term to a stable JSON-friendly structure."""

    if term is None:
        return None
    if isinstance(term, dependencies["URIRef"]):
        return {"type": "iri", "value": str(term)}
    if isinstance(term, dependencies["BNode"]):
        return {"type": "blank-node", "value": str(term)}
    if isinstance(term, dependencies["Literal"]):
        result: dict[str, Any] = {"type": "literal", "value": str(term)}
        if term.language:
            result["language"] = term.language
        if term.datatype:
            result["datatype"] = str(term.datatype)
        return result
    return {"type": "term", "value": str(term)}


def report_results(report_graph: Any, dependencies: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract deterministic diagnostics from a SHACL report graph."""

    report_graph = dependencies["to_canonical_graph"](report_graph)
    sh = dependencies["Namespace"]("http://www.w3.org/ns/shacl#")
    rdf = dependencies["RDF"]
    results: list[dict[str, Any]] = []
    for node in report_graph.subjects(rdf.type, sh.ValidationResult):
        result = {
            "severity": local_name(report_graph.value(node, sh.resultSeverity)),
            "focus_node": term_json(report_graph.value(node, sh.focusNode), dependencies),
            "path": term_json(report_graph.value(node, sh.resultPath), dependencies),
            "value": term_json(report_graph.value(node, sh.value), dependencies),
            "source_shape": term_json(report_graph.value(node, sh.sourceShape), dependencies),
            "source_constraint_component": term_json(
                report_graph.value(node, sh.sourceConstraintComponent), dependencies
            ),
            "messages": sorted(str(message) for message in report_graph.objects(node, sh.resultMessage)),
        }
        results.append(result)
    return sorted(results, key=lambda item: json.dumps(item, sort_keys=True, ensure_ascii=False))


def import_warnings(graphs: Iterable[Any], dependencies: dict[str, Any]) -> list[str]:
    """Report unresolved imports without dereferencing them."""

    owl = dependencies["OWL"]
    imports = sorted({str(value) for graph in graphs for value in graph.objects(None, owl.imports)})
    return [f"owl:imports not dereferenced; provide a pinned local --ontology file: {value}" for value in imports]


def enforce_shacl_sparql_policy(
    shapes_graph: Any,
    allow_shacl_sparql: bool,
    dependencies: dict[str, Any],
) -> None:
    """Require explicit opt-in and block network-capable SPARQL clauses."""

    sh = dependencies["Namespace"]("http://www.w3.org/ns/shacl#")
    query_predicates = (sh.select, sh.ask, sh.construct, sh.update)
    queries = [
        str(query)
        for predicate in query_predicates
        for query in shapes_graph.objects(None, predicate)
    ]
    if queries and not allow_shacl_sparql:
        raise ValidationInputError(
            "SHACL-SPARQL is disabled; review the shapes and pass --allow-shacl-sparql explicitly"
        )
    unsafe = re.compile(
        r"\b(?:SERVICE|FROM|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b",
        flags=re.IGNORECASE,
    )
    if any(unsafe.search(query) for query in queries):
        raise ValidationInputError(
            "SHACL-SPARQL contains a blocked remote-dataset or update clause"
        )


def write_report(report_graph: Any, path: Path, rdf_format: str) -> None:
    """Serialize a SHACL report graph to a separate artifact."""

    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        report_graph.serialize(destination=str(path), format=rdf_format, encoding="utf-8")
    except Exception as exc:
        raise ValidationInputError(f"failed to write report {path}: {exc}") from exc


def base_payload(args: argparse.Namespace, versions: dict[str, str]) -> dict[str, Any]:
    """Create the wrapper-owned machine result envelope."""

    return {
        "schema_version": SCHEMA_VERSION,
        "status": "error",
        "exit_code": EXIT_ERROR,
        "versions": versions,
        "configuration": {
            "inference": args.inference,
            "imports": False,
            "network": False,
            "meta_shacl": args.meta_shacl,
            "advanced": args.advanced,
            "shacl_sparql": args.allow_shacl_sparql,
            "allow_infos": args.allow_infos,
            "allow_warnings": args.allow_warnings,
            "pinned_dependencies": not args.allow_unpinned_dependencies,
        },
        "files": [],
        "summary": {},
        "results": [],
        "warnings": [],
        "errors": [],
    }


def execute(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    """Execute parsing and optional SHACL validation."""

    versions = dependency_versions()
    payload = base_payload(args, versions)
    if not any((args.data, args.ontology, args.shapes)):
        raise ValidationInputError("provide at least one --data, --ontology, or --shapes file")
    if args.max_depth < 1:
        raise ValidationInputError("--max-depth must be at least 1")
    if args.report and not args.shapes:
        raise ValidationInputError("--report requires at least one --shapes file")
    if args.inference != "none" and not args.shapes:
        raise ValidationInputError("--inference requires SHACL validation with --shapes")

    dependencies = load_dependencies()
    version_mismatches = [
        f"{name}={versions[name]} (tested {expected})"
        for name, expected in PINNED_VERSIONS.items()
        if versions.get(name) != expected
    ]
    if version_mismatches and not args.allow_unpinned_dependencies:
        raise ValidationInputError(
            "validator dependency versions do not match the tested lock: "
            + ", ".join(version_mismatches)
        )
    version_warnings = (
        ["running with unpinned validator dependencies: " + ", ".join(version_mismatches)]
        if version_mismatches
        else []
    )
    data_graph, data_files = parse_role(
        "data", args.data, args.data_format, dependencies
    )
    ontology_graph, ontology_files = parse_role(
        "ontology", args.ontology, args.ontology_format, dependencies
    )
    shapes_graph, shapes_files = parse_role(
        "shapes", args.shapes, args.shapes_format, dependencies
    )
    enforce_shacl_sparql_policy(shapes_graph, args.allow_shacl_sparql, dependencies)
    parsed_files = data_files + ontology_files + shapes_files
    if args.report:
        input_paths = {Path(item.path) for item in parsed_files}
        if args.report.expanduser().resolve() in input_paths:
            raise ValidationInputError("--report must not overwrite an input artifact")
    payload["files"] = [item.__dict__ for item in parsed_files]
    payload["warnings"] = version_warnings + import_warnings(
        (data_graph, ontology_graph, shapes_graph), dependencies
    )
    payload["summary"] = {
        "files": len(parsed_files),
        "data_triples": len(data_graph),
        "ontology_triples": len(ontology_graph),
        "shape_triples": len(shapes_graph),
        "conforms": None,
        "results": 0,
        "violations": 0,
        "warnings": 0,
        "infos": 0,
        "owl_profile_conformance": "not_checked",
        "owl_consistency": "not_checked",
    }

    if not args.shapes:
        payload["status"] = "valid"
        payload["exit_code"] = EXIT_OK
        return EXIT_OK, payload

    validate = dependencies["validate"]
    try:
        conforms, report_graph, _report_text = validate(
            data_graph,
            shacl_graph=shapes_graph,
            ont_graph=ontology_graph if args.ontology else None,
            inference=args.inference,
            advanced=args.advanced,
            abort_on_first=args.abort_on_first,
            allow_infos=args.allow_infos,
            allow_warnings=args.allow_warnings,
            max_validation_depth=args.max_depth,
            meta_shacl=args.meta_shacl,
            do_owl_imports=False,
            iterate_rules=False,
            js=False,
            debug=args.debug,
        )
    except Exception as exc:
        raise ProcessorFailure(f"SHACL processor failure: {exc}") from exc

    if isinstance(report_graph, dependencies["ValidationFailure"]):
        raise ProcessorFailure(f"SHACL validation failure: {report_graph}")

    results = report_results(report_graph, dependencies)
    severity_counts = {"Violation": 0, "Warning": 0, "Info": 0}
    for result in results:
        severity = result["severity"]
        if severity in severity_counts:
            severity_counts[severity] += 1

    if args.report:
        write_report(report_graph, args.report, args.report_format)

    payload["results"] = results
    payload["summary"].update(
        {
            "conforms": bool(conforms),
            "results": len(results),
            "violations": severity_counts["Violation"],
            "warnings": severity_counts["Warning"],
            "infos": severity_counts["Info"],
        }
    )
    exit_code = EXIT_OK if conforms else EXIT_NONCONFORMANT
    payload["status"] = "conformant" if conforms else "nonconformant"
    payload["exit_code"] = exit_code
    return exit_code, payload


def emit(payload: dict[str, Any], output_format: str) -> None:
    """Emit one text or JSON result."""

    if output_format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return

    summary = payload.get("summary", {})
    print(f"Semantic artifact validation: {payload['status']}")
    if summary:
        print(
            "Files/triples: "
            f"{summary.get('files', 0)} files; "
            f"data={summary.get('data_triples', 0)}, "
            f"ontology={summary.get('ontology_triples', 0)}, "
            f"shapes={summary.get('shape_triples', 0)}"
        )
        if summary.get("conforms") is not None:
            print(
                "SHACL: "
                f"conforms={str(summary['conforms']).lower()}, "
                f"violations={summary['violations']}, "
                f"warnings={summary['warnings']}, infos={summary['infos']}"
            )
        print("OWL profile conformance: not checked")
        print("OWL consistency: not checked")
    for warning in payload.get("warnings", []):
        print(f"warning: {warning}", file=sys.stderr)
    for error in payload.get("errors", []):
        print(f"error: {error}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    """Run the semantic artifact validator."""

    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        exit_code, payload = execute(args)
    except (ValidationInputError, ProcessorFailure) as exc:
        payload = base_payload(args, dependency_versions())
        payload["errors"] = [str(exc)]
        if args.debug:
            traceback.print_exc(file=sys.stderr)
        exit_code = EXIT_ERROR
    except Exception as exc:  # defensive conversion to a processor error contract
        payload = base_payload(args, dependency_versions())
        payload["errors"] = [f"unexpected validator failure: {exc}"]
        if args.debug:
            traceback.print_exc(file=sys.stderr)
        exit_code = EXIT_ERROR
    emit(payload, args.output_format)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
