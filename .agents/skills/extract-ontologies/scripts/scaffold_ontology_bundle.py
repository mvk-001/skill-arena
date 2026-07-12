#!/usr/bin/env python3
"""Create a minimal, auditable RDF/OWL/SHACL extraction bundle."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


TARGET_FILES = (
    "scope.md",
    "evidence.csv",
    "ontology.ttl",
    "data.ttl",
    "shapes.ttl",
    "competency-questions.rq",
)
PREFIX_RE = re.compile(r"^[A-Za-z_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$")
FORBIDDEN_IRI_CHARS = frozenset('<>"{}|^`\\')


def absolute_iri(value: str) -> str:
    """Return *value* when it is a conservative absolute HTTP(S) or URN IRI."""

    if not value or any(char.isspace() or char in FORBIDDEN_IRI_CHARS for char in value):
        raise argparse.ArgumentTypeError("IRI contains whitespace or Turtle-forbidden characters")
    parsed = urlsplit(value)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return value
    if parsed.scheme == "urn" and parsed.path:
        return value
    raise argparse.ArgumentTypeError("IRI must be an absolute http, https, or urn IRI")


def turtle_literal(value: str) -> str:
    """Escape a Python string as a short Turtle string literal."""

    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\t", "\\t")
        .replace("\b", "\\b")
        .replace("\f", "\\f")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
    )


def namespace_for(ontology_iri: str) -> str:
    """Derive a local-term namespace without changing the ontology IRI."""

    return ontology_iri if ontology_iri.endswith(("#", "/")) else f"{ontology_iri}#"


def build_files(args: argparse.Namespace, created: date | None = None) -> dict[str, str]:
    """Build the scaffold file payloads for parsed CLI *args*."""

    created = created or date.today()
    namespace = namespace_for(args.ontology_iri)
    title = turtle_literal(args.title)
    version_line = (
        f"    owl:versionIRI <{args.version_iri}> ;\n" if args.version_iri else ""
    )
    profile = args.owl_profile.upper()

    scope = f"""# {args.title}

## Scope

- Ontology IRI: `{args.ontology_iri}`
- Version IRI: `{args.version_iri or 'Assign before release'}`
- Local prefix: `{args.prefix}`
- Intended OWL 2 profile: `{profile}`
- Created: `{created.isoformat()}`

## Intended Consumers

- TODO

## Source Inventory

- TODO: Record each immutable source identifier, version, locator policy, and license.

## Competency Questions

1. TODO: Write a question with an observable expected result.

## Validation Contract

- Data graph construction: TODO
- Shapes graph: `shapes.ttl`
- Entailment regime: `none`
- SHACL version and processor: TODO

## Assumptions and Exclusions

- TODO
"""

    ontology = f"""@prefix {args.prefix}: <{namespace}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<{args.ontology_iri}> a owl:Ontology ;
{version_line}    dcterms:title "{title}" ;
    dcterms:created "{created.isoformat()}"^^xsd:date .

# Declare reviewed classes, properties, and axioms below.
"""

    data = f"""@prefix {args.prefix}: <{namespace}> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Add accepted instance assertions below. Keep unreviewed candidates separate.
"""

    shapes = f"""@prefix {args.prefix}: <{namespace}> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Add SHACL Core node and property shapes with explicit targets below.
"""

    queries = f"""PREFIX {args.prefix}: <{namespace}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

# CQ-01: Replace with the first competency question and its expected result.
# ASK {{ ... }}
"""

    return {
        "scope.md": scope,
        "evidence.csv": "",
        "ontology.ttl": ontology,
        "data.ttl": data,
        "shapes.ttl": shapes,
        "competency-questions.rq": queries,
    }


def write_bundle(output: Path, payloads: dict[str, str], force: bool) -> None:
    """Write *payloads* to *output* without partial overwrite surprises."""

    conflicts = [output / name for name in payloads if (output / name).exists()]
    if conflicts and not force:
        joined = ", ".join(path.name for path in conflicts)
        raise FileExistsError(f"refusing to overwrite existing files: {joined}")

    output.mkdir(parents=True, exist_ok=True)
    for name, content in payloads.items():
        target = output / name
        if name == "evidence.csv":
            with target.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream, lineterminator="\n")
                writer.writerow(
                    [
                        "assertion_id",
                        "kind",
                        "subject",
                        "predicate",
                        "object",
                        "source_id",
                        "source_locator",
                        "evidence_text",
                        "interpretation",
                        "confidence",
                        "status",
                        "review_note",
                    ]
                )
        else:
            target.write_text(content, encoding="utf-8", newline="\n")


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""

    parser = argparse.ArgumentParser(
        description="Create a minimal RDF/OWL/SHACL ontology-extraction bundle.",
    )
    parser.add_argument("output", type=Path, help="Directory to create or populate")
    parser.add_argument("--ontology-iri", required=True, type=absolute_iri)
    parser.add_argument("--version-iri", type=absolute_iri)
    parser.add_argument("--prefix", default="ex", help="Conservative ASCII Turtle prefix")
    parser.add_argument("--title", required=True)
    parser.add_argument(
        "--owl-profile",
        choices=("el", "ql", "rl", "dl"),
        default="rl",
        help="Intended profile recorded in scope.md (default: rl)",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite scaffold target files")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the scaffold command."""

    parser = build_parser()
    args = parser.parse_args(argv)
    if not PREFIX_RE.fullmatch(args.prefix):
        parser.error("--prefix must start with a letter or underscore and use ASCII name characters")
    if args.version_iri and args.version_iri == args.ontology_iri:
        parser.error("--version-iri must be distinct from --ontology-iri")

    try:
        write_bundle(args.output, build_files(args), args.force)
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"Created ontology extraction bundle in {args.output.resolve()}")
    for name in TARGET_FILES:
        print(f"- {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
