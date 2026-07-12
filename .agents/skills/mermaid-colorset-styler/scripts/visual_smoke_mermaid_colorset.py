#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
STYLE_SCRIPT = SCRIPT_DIR / "style_mermaid_directory.py"
DEFAULT_MERMAID_PACKAGE = "@mermaid-js/mermaid-cli@11.16.0"

SAMPLES = {
    "flow-all-classes.mmd": """flowchart TD
  A[Primary]:::csPrimary --> B[Accent]:::csAccent
  B --> C[Muted]:::csMuted
  C --> D[Critical]:::csCritical
  D --> E[Warning]:::csWarning
  E --> F[Success]:::csSuccess
  F --> G[Info]:::csInfo
  G --> H[Special]:::csSpecial
  H --> I[Neutral]:::csNeutral
""",
    "sequence-theme.mmd": """sequenceDiagram
  participant User
  participant System
  User->>System: Request
  activate System
  System-->>User: Response
  deactivate System
""",
    "state-classes.mmd": """stateDiagram-v2
  [*] --> Idle
  Idle --> Active
  Active --> Failed
  class Idle csPrimary
  class Active csSuccess
  class Failed csCritical
""",
}

DEFAULT_THEME_TOKENS = {"#9370db", "#ececff"}
COLORSET2_REQUIRED_FLOW_TOKENS = {
    "#9e1b32",
    "#007298",
    "#e77204",
    "#45842a",
    "#00ace6",
    "#652f6c",
    "#e8002a",
}
COLORSET1_FORBIDDEN_FULL_COLOR_TOKENS = {
    "#007298",
    "#e77204",
    "#45842a",
    "#00ace6",
    "#652f6c",
}


def run_command(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True, check=False)


def find_npx() -> str:
    for name in ("npx.cmd", "npx", "npx.ps1"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("Could not find npx. Install Node.js or pass a Mermaid renderer through npx.")


def normalized_svg(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace").lower().replace(" ", "")


def write_samples(source_dir: Path) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    for name, source in SAMPLES.items():
        (source_dir / name).write_text(source, encoding="utf-8")


def style_samples(source_dir: Path, colorset: str, report_path: Path) -> None:
    result = run_command(
        [
            sys.executable,
            str(STYLE_SCRIPT),
            str(source_dir),
            "--colorset",
            colorset,
            "--write",
            "--report",
            str(report_path),
        ],
        cwd=source_dir.parent,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or f"Styler failed for {colorset}")


def render_with_retries(command: list[str], cwd: Path, output_path: Path, retries: int) -> subprocess.CompletedProcess[str]:
    result: subprocess.CompletedProcess[str] | None = None
    for _attempt in range(retries):
        if output_path.exists():
            output_path.unlink()
        result = run_command(command, cwd=cwd)
        if result.returncode == 0:
            return result
    if result is None:
        raise RuntimeError("Render was not attempted.")
    return result


def render_samples(npx: str, package: str, source_dir: Path, svg_dir: Path, png_dir: Path | None, retries: int) -> list[dict[str, str]]:
    svg_dir.mkdir(parents=True, exist_ok=True)
    if png_dir:
        png_dir.mkdir(parents=True, exist_ok=True)
    rendered: list[dict[str, str]] = []
    for source_path in sorted(source_dir.glob("*.mmd")):
        svg_path = svg_dir / f"{source_path.stem}.svg"
        result = render_with_retries([npx, "-y", package, "-i", str(source_path), "-o", str(svg_path), "--quiet"], source_dir.parent, svg_path, retries)
        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout or f"Mermaid render failed for {source_path.name}")
        record = {"source": str(source_path), "svg": str(svg_path)}
        if png_dir:
            png_path = png_dir / f"{source_path.stem}.png"
            result = render_with_retries(
                [npx, "-y", package, "-i", str(source_path), "-o", str(png_path), "--quiet", "--scale", "2"],
                source_dir.parent,
                png_path,
                retries,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr or result.stdout or f"Mermaid PNG render failed for {source_path.name}")
            record["png"] = str(png_path)
        rendered.append(record)
    return rendered


def collect_findings(output_dir: Path) -> list[str]:
    findings: list[str] = []

    for colorset in ("colorset1", "colorset2"):
        sequence_svg = normalized_svg(output_dir / colorset / "svg" / "sequence-theme.svg")
        default_hits = sorted(token for token in DEFAULT_THEME_TOKENS if token in sequence_svg)
        if default_hits:
            findings.append(f"{colorset} sequence render still contains Mermaid default theme tokens: {', '.join(default_hits)}")
        for token in ("#ffccd5", "#9e1b32"):
            if token not in sequence_svg:
                findings.append(f"{colorset} sequence render is missing expected primary theme token {token}")

    colorset2_flow = normalized_svg(output_dir / "colorset2" / "svg" / "flow-all-classes.svg")
    missing = sorted(token for token in COLORSET2_REQUIRED_FLOW_TOKENS if token not in colorset2_flow)
    if missing:
        findings.append(f"colorset2 flow render is missing class color tokens: {', '.join(missing)}")

    colorset1_flow = normalized_svg(output_dir / "colorset1" / "svg" / "flow-all-classes.svg")
    forbidden = sorted(token for token in COLORSET1_FORBIDDEN_FULL_COLOR_TOKENS if token in colorset1_flow)
    if forbidden:
        findings.append(f"colorset1 flow render contains colorset2-only tokens: {', '.join(forbidden)}")

    colorset2_state = normalized_svg(output_dir / "colorset2" / "svg" / "state-classes.svg")
    for token in ("#9e1b32", "#45842a", "#e8002a"):
        if token not in colorset2_state:
            findings.append(f"colorset2 state render is missing class color token {token}")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a Mermaid colorset smoke test and verify final SVG colors.")
    parser.add_argument("--output", type=Path, default=Path("mermaid-colorset-visual-smoke"), help="Directory for generated sources and renders.")
    parser.add_argument("--report", type=Path, help="Write a JSON smoke-test report.")
    parser.add_argument("--mermaid-cli-package", default=DEFAULT_MERMAID_PACKAGE, help="npx package spec for Mermaid CLI.")
    parser.add_argument("--png", action="store_true", help="Also render PNGs for manual visual inspection.")
    parser.add_argument("--render-retries", type=int, default=3, help="Attempts for each Mermaid CLI render before failing.")
    args = parser.parse_args()

    npx = find_npx()
    output_dir = args.output.resolve()
    renders: list[dict[str, str]] = []
    findings: list[str] = []

    try:
        for colorset in ("colorset1", "colorset2"):
            source_dir = output_dir / colorset / "source"
            report_path = output_dir / colorset / "style-report.json"
            write_samples(source_dir)
            style_samples(source_dir, colorset, report_path)
            renders.extend(
                render_samples(
                    npx,
                    args.mermaid_cli_package,
                    source_dir,
                    output_dir / colorset / "svg",
                    output_dir / colorset / "png" if args.png else None,
                    args.render_retries,
                )
            )
        findings = collect_findings(output_dir)
    except Exception as exc:
        findings.append(str(exc))

    report = {
        "passed": not findings,
        "mermaidCliPackage": args.mermaid_cli_package,
        "output": str(output_dir),
        "renders": renders,
        "findings": findings,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
