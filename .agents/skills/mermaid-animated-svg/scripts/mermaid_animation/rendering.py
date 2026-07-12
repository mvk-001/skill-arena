#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from mermaid_animation.common import class_tokens


def write_stderr(text: str) -> None:
    encoding = sys.stderr.encoding or "utf-8"
    sys.stderr.write(text.encode(encoding, errors="replace").decode(encoding))


def renderer_base_command() -> list[str]:
    mmdc = shutil.which("mmdc")
    if mmdc:
        return [mmdc]

    npx = shutil.which("npx")
    if npx:
        return [npx, "-y", "@mermaid-js/mermaid-cli@11.16.0"]

    raise RuntimeError(
        "Neither 'mmdc' nor 'npx' was found. Install @mermaid-js/mermaid-cli or pass --svg-input."
    )


def render_mermaid(source: Path, output: Path, args: argparse.Namespace) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = renderer_base_command()

    if args.config_file:
        command.extend(["--configFile", str(args.config_file)])
    if args.css_file:
        command.extend(["--cssFile", str(args.css_file)])
    if args.theme:
        command.extend(["--theme", args.theme])
    if args.background:
        command.extend(["--backgroundColor", args.background])
    command.extend(args.mmdc_arg)
    command.extend(["-i", str(source), "-o", str(output)])

    completed = subprocess.run(
        command,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if completed.returncode != 0:
        write_stderr(completed.stdout)
        write_stderr(completed.stderr)
        raise RuntimeError(
            "Mermaid rendering failed. Re-run with the same Mermaid options manually, "
            "then pass the rendered SVG with --svg-input."
        )


def assert_not_mermaid_error_svg(root: ET.Element, static_path: Path) -> None:
    if root.get("aria-roledescription") == "error":
        raise RuntimeError(f"Mermaid rendered an error SVG instead of a diagram: {static_path}")
    for element in root.iter():
        tokens = {token.lower() for token in class_tokens(element)}
        if "error-icon" in tokens or "error-text" in tokens:
            raise RuntimeError(f"Mermaid rendered an error SVG instead of a diagram: {static_path}")


def static_svg_path(args: argparse.Namespace, temporary_dir: Path) -> Path:
    if args.svg_input is not None:
        return args.svg_input
    if args.source is None:
        raise ValueError("Provide a Mermaid source file or --svg-input.")
    if args.source.suffix.lower() == ".svg":
        return args.source
    if args.static_output is not None:
        return args.static_output
    if args.keep_static and args.output is not None:
        return args.output.with_suffix(".static.svg")
    return temporary_dir / "mermaid.static.svg"
