#!/usr/bin/env python3
"""Verify the read-only Semantic OKF consultation runtime."""

from __future__ import annotations

import argparse
import json
import platform


def build_parser() -> argparse.ArgumentParser:
    """Build the runtime smoke-test command-line parser."""
    return argparse.ArgumentParser(description=__doc__)


def runtime_report() -> dict[str, object]:
    """Import required libraries and return their runtime versions."""
    import pyparsing
    import rdflib

    return {
        "status": "pass",
        "mode": "read-only",
        "network": "none",
        "python_implementation": platform.python_implementation(),
        "python_version": platform.python_version(),
        "dependencies": {
            "pyparsing": pyparsing.__version__,
            "rdflib": rdflib.__version__,
        },
    }


def main(argv: list[str] | None = None) -> int:
    """Run the dependency smoke test and print one JSON document."""
    build_parser().parse_args(argv)
    print(json.dumps(runtime_report(), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
