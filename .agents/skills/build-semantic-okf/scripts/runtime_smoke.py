#!/usr/bin/env python3
"""Verify the pure-Python Semantic OKF runtime and its locked dependencies."""

from __future__ import annotations

import argparse
import json
import platform


def build_parser() -> argparse.ArgumentParser:
    """Build the runtime smoke-test command-line parser."""
    return argparse.ArgumentParser(description=__doc__)


def runtime_report() -> dict[str, object]:
    """Import required libraries and return their pinned runtime versions."""
    import pyshacl
    import rdflib
    import yaml

    return {
        "status": "pass",
        "processor": "python",
        "python_implementation": platform.python_implementation(),
        "python_version": platform.python_version(),
        "dependencies": {
            "pyshacl": pyshacl.__version__,
            "pyyaml": yaml.__version__,
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
