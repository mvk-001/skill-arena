#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


REMOTE_PATTERNS = [
    re.compile(r"""<(?:script|link|img|image|iframe|source)\b[^>]*(?:src|href|xlink:href)\s*=\s*["'](?:https?:)?//""", re.I),
    re.compile(r"""@import\s+["'](?:https?:)?//""", re.I),
    re.compile(r"""url\(\s*["']?(?:https?:)?//""", re.I),
]


def check_file(path: Path) -> list[str]:
    findings: list[str] = []
    content = path.read_text(encoding="utf-8")

    for pattern in REMOTE_PATTERNS:
        for match in pattern.finditer(content):
            line = content.count("\n", 0, match.start()) + 1
            findings.append(f"{path}:{line}: external dependency found: {match.group(0)[:120]}")

    lower = content.lower()
    if "<svg" not in lower:
        findings.append(f"{path}: missing inline <svg>")
    if "<title" not in lower:
        findings.append(f"{path}: missing SVG/HTML <title>")
    if "<desc" not in lower:
        findings.append(f"{path}: missing SVG <desc>")
    if re.search(r"""<script\b[^>]+\bsrc\s*=""", content, re.I):
        findings.append(f"{path}: script src is not allowed in a self-contained artifact")
    if (
        "prefers-reduced-motion" in lower
        and re.search(r"animation\s*:\s*none", content, re.I)
        and re.search(r"opacity\s*:\s*0", content, re.I)
    ):
        reduced_motion_index = lower.find("prefers-reduced-motion")
        reduced_motion_block = content[reduced_motion_index : reduced_motion_index + 2000]
        if not re.search(r"opacity\s*:\s*1", reduced_motion_block, re.I):
            findings.append(
                f"{path}: reduced-motion fallback disables animation but does not restore opacity for initially hidden marks"
            )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Check that HTML artifacts are self-contained inline SVG deliverables.")
    parser.add_argument("paths", nargs="+", type=Path, help="HTML files to inspect.")
    args = parser.parse_args()

    all_findings: list[str] = []
    for path in args.paths:
        if not path.exists():
            all_findings.append(f"{path}: file not found")
            continue
        all_findings.extend(check_file(path))

    if all_findings:
        print("Self-contained HTML check failed:")
        for finding in all_findings:
            print(f"- {finding}")
        return 1

    print("Self-contained HTML check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
