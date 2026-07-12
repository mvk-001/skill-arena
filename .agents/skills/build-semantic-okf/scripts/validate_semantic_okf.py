#!/usr/bin/env python3
"""Validate OKF, OWL/RDF, SHACL, provenance, and cross-layer coherence."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from _semantic_okf import configure_utf8_output, validate_semantic_bundle


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""

    parser = argparse.ArgumentParser(description="Validate a semantic OKF bundle.")
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--output-format", choices=("text", "json"), default="text")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run semantic OKF validation."""

    configure_utf8_output()
    args = build_parser().parse_args(argv)
    result = validate_semantic_bundle(args.bundle)
    if args.output_format == "json":
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(f"Semantic OKF validation: {result.status}")
        print(
            f"Concepts={result.summary.get('concepts', 0)}, "
            f"records={result.summary.get('records', 0)}, "
            f"sources={result.summary.get('sources', 0)}"
        )
        for warning in result.warnings:
            print(f"warning: {warning}", file=sys.stderr)
        for error in result.errors:
            print(f"error [{error['code']}] {error['path']}: {error['message']}", file=sys.stderr)
    return 0 if result.valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
