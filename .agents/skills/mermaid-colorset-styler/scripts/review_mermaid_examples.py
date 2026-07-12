#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
STYLE_SCRIPT = SCRIPT_DIR / "style_mermaid_directory.py"
FIXTURE = SKILL_DIR / "assets" / "examples" / "base" / "all-types.md"
DEFAULT_MERMAID_PACKAGE = "@mermaid-js/mermaid-cli@11.16.0"
DEFAULT_THEME_TOKENS = {"#9370db", "#ececff"}


def load_styler():
    spec = importlib.util.spec_from_file_location("style_mermaid_directory", STYLE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load style_mermaid_directory.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def run_command(command: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=timeout,
    )


def find_npx() -> str:
    for name in ("npx.cmd", "npx", "npx.ps1"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("Could not find npx. Install Node.js to render Mermaid examples.")


def clean_for_compare(styler, source: str) -> str:
    cleaned = styler.strip_generated_class_defs(styler.remove_generated_styling(source))
    return cleaned.strip()


def slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-").lower() or "diagram"


def class_color_tokens(styler, colorset: str, class_name: str, family: str) -> set[str]:
    style = styler.class_style(colorset, class_name, family)
    return {token.lower() for token in re.findall(r"#[0-9a-fA-F]{6}", style)}


def inspect_rendered_svg(styler, colorset: str, example: dict[str, object], svg_path: Path) -> list[str]:
    findings: list[str] = []
    if not svg_path.exists() or svg_path.stat().st_size < 100:
        return [f"{colorset} render output is missing or too small"]
    svg = svg_path.read_text(encoding="utf-8", errors="replace").lower().replace(" ", "")
    svg = re.sub(
        r"rgb\((\d+),(\d+),(\d+)\)",
        lambda match: "#" + "".join(f"{int(match.group(index)):02x}" for index in (1, 2, 3)),
        svg,
    )
    if (
        'aria-roledescription="error"' in svg
        or 'class="error-icon"' in svg
        or 'class="error-text"' in svg
        or "syntaxerrorintext" in svg
    ):
        findings.append(f"{colorset} render produced Mermaid syntax-error SVG")
    if str(example["declaration"]) == "sequenceDiagram":
        hits = sorted(token for token in DEFAULT_THEME_TOKENS if token in svg)
        if hits:
            findings.append(f"{colorset} sequence render contains default Mermaid theme tokens: {', '.join(hits)}")
        for token in ("#ffccd5", "#9e1b32"):
            if token not in svg:
                findings.append(f"{colorset} sequence render missing expected primary theme token {token}")
    if example["classable"]:
        for class_name in example["referencedClasses"]:
            missing = sorted(
                token
                for token in class_color_tokens(styler, colorset, str(class_name), str(example["family"]))
                if token not in svg
            )
            if missing:
                findings.append(f"{colorset} render missing {class_name} color tokens: {', '.join(missing)}")
    return findings


def render_example(
    npx: str,
    package: str,
    source_path: Path,
    svg_path: Path,
    timeout: int,
    retries: int,
    reuse_existing: bool,
) -> dict[str, object]:
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path = svg_path.with_suffix(svg_path.suffix + ".render.json")
    source_sha256 = hashlib.sha256(source_path.read_bytes()).hexdigest()
    package_is_pinned = re.search(r"@\d+\.\d+\.\d+(?:[-+][A-Za-z0-9_.-]+)?$", package) is not None
    cached_metadata: dict[str, object] = {}
    if metadata_path.is_file():
        try:
            loaded_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if isinstance(loaded_metadata, dict):
                cached_metadata = loaded_metadata
        except (json.JSONDecodeError, OSError):
            cached_metadata = {}
    if (
        reuse_existing
        and package_is_pinned
        and svg_path.exists()
        and svg_path.stat().st_size >= 100
        and svg_path.stat().st_mtime_ns >= source_path.stat().st_mtime_ns
        and cached_metadata.get("schemaVersion") == 1
        and cached_metadata.get("package") == package
        and cached_metadata.get("sourceSha256") == source_sha256
    ):
        return {
            "command": None,
            "exitCode": 0,
            "stdout": "",
            "stderr": "",
            "svg": str(svg_path),
            "sizeBytes": svg_path.stat().st_size,
            "attemptCount": 0,
            "attempts": [],
            "reused": True,
        }
    attempts: list[dict[str, object]] = []
    result: subprocess.CompletedProcess[str] | None = None
    for attempt in range(1, retries + 1):
        if svg_path.exists():
            svg_path.unlink()
        if metadata_path.exists():
            metadata_path.unlink()
        result = run_command([npx, "-y", package, "-i", str(source_path), "-o", str(svg_path), "--quiet"], source_path.parent, timeout)
        attempts.append(
            {
                "attempt": attempt,
                "exitCode": result.returncode,
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "sizeBytes": svg_path.stat().st_size if svg_path.exists() else 0,
            }
        )
        if result.returncode == 0:
            break
    if result is None:
        raise RuntimeError("Render was not attempted.")
    if result.returncode == 0 and svg_path.exists():
        metadata_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "package": package,
                    "sourceSha256": source_sha256,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
    return {
        "command": f"npx -y {package} -i {source_path.name} -o {svg_path.name} --quiet",
        "exitCode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "svg": str(svg_path),
        "sizeBytes": svg_path.stat().st_size if svg_path.exists() else 0,
        "attemptCount": len(attempts),
        "attempts": attempts,
        "reused": False,
    }


def extract_examples(styler, fixture: Path) -> list[dict[str, object]]:
    text = fixture.read_text(encoding="utf-8")
    examples: list[dict[str, object]] = []
    for index, match in enumerate(styler.FENCE_RE.finditer(text), start=1):
        body = match.group("body")
        declaration = styler.first_declaration(body)
        family = styler.canonical_family(declaration)
        referenced = styler.referenced_color_classes(body)
        classable = family in styler.CLASSDEF_FAMILIES
        examples.append(
            {
                "index": index,
                "id": f"{slug(family)}--{slug(declaration)}",
                "line": text[: match.start("body")].count("\n") + 1,
                "declaration": declaration,
                "family": family,
                "classable": classable,
                "referencedClasses": referenced,
                "expectedClassDefs": referenced if classable else [],
                "expectedSkippedClasses": [] if classable else referenced,
                "source": body,
            }
        )
    return examples


def review_examples(args: argparse.Namespace) -> dict[str, object]:
    styler = load_styler()
    fixture = args.fixture.resolve()
    examples = extract_examples(styler, fixture)
    npx = find_npx() if args.render else ""
    output_dir = args.output.resolve() if args.output else None

    findings: list[str] = []
    declarations = [str(example["declaration"]) for example in examples]
    families = sorted({str(example["family"]) for example in examples})
    missing_declarations = [decl for decl in styler.OFFICIAL_DECLARATIONS if decl not in declarations]
    missing_supported_declarations = [decl for decl in styler.SUPPORTED_DECLARATIONS if decl not in declarations]
    duplicate_declarations = sorted({decl for decl in declarations if declarations.count(decl) > 1})
    unexpected_declarations = sorted(set(declarations) - set(styler.SUPPORTED_DECLARATIONS))
    missing_families = [family for family in styler.OFFICIAL_FAMILIES if family not in families]
    if missing_declarations:
        findings.append(f"Fixture missing current declarations: {', '.join(missing_declarations)}")
    if missing_supported_declarations:
        findings.append(f"Fixture missing accepted declarations: {', '.join(missing_supported_declarations)}")
    if duplicate_declarations:
        findings.append(f"Fixture has duplicate declarations: {', '.join(duplicate_declarations)}")
    if unexpected_declarations:
        findings.append(f"Fixture has unexpected declarations: {', '.join(unexpected_declarations)}")
    if missing_families:
        findings.append(f"Fixture missing public families: {', '.join(missing_families)}")

    referenced_classes = {class_name for example in examples for class_name in example["referencedClasses"]}
    missing_classes = sorted(styler.COLOR_CLASSES - referenced_classes)
    if missing_classes:
        findings.append(f"Fixture missing supported color classes: {', '.join(missing_classes)}")

    report_examples: list[dict[str, object]] = []
    for example in examples:
        source = str(example.pop("source"))
        example_findings: list[str] = []
        colorset_reviews: dict[str, object] = {}
        for colorset in ("colorset1", "colorset2"):
            styled, meta = styler.style_mermaid_block(source, colorset)
            inserted = list(meta["insertedClassDefs"])
            skipped = list(meta["skippedClassDefs"])
            expected_inserted = list(example["expectedClassDefs"])
            expected_skipped = list(example["expectedSkippedClasses"])
            directive = styler.colorset_directive(colorset, str(example["family"]))
            colorset_result: dict[str, object] = {
                "hasBaseTheme": 'theme: "base"' in directive,
                "hasFontFamilyThemeVariable": "fontFamily:" in directive,
                "usesYamlFrontmatter": directive.startswith("---\n") and "config:\n" in directive,
                "themeVariableCount": len(styler.theme_variables(colorset, str(example["family"]))),
                "insertedClassDefs": inserted,
                "skippedClassDefs": skipped,
                "sourcePreserved": clean_for_compare(styler, styled) == clean_for_compare(styler, source),
            }
            if not colorset_result["hasBaseTheme"]:
                example_findings.append(f"{colorset} missing base theme")
            if not colorset_result["usesYamlFrontmatter"]:
                example_findings.append(f"{colorset} did not use YAML frontmatter config")
            if colorset_result["hasFontFamilyThemeVariable"]:
                example_findings.append(f"{colorset} contains incompatible fontFamily theme variable")
            if inserted != expected_inserted:
                example_findings.append(f"{colorset} inserted {inserted}, expected {expected_inserted}")
            if skipped != expected_skipped:
                example_findings.append(f"{colorset} skipped {skipped}, expected {expected_skipped}")
            if not colorset_result["sourcePreserved"]:
                example_findings.append(f"{colorset} did not preserve source after removing generated styling")

            if args.render and output_dir:
                source_dir = output_dir / colorset / "source"
                svg_dir = output_dir / colorset / "svg"
                source_dir.mkdir(parents=True, exist_ok=True)
                source_path = source_dir / f"{example['id']}.mmd"
                svg_path = svg_dir / f"{example['id']}.svg"
                if not source_path.exists() or source_path.read_text(encoding="utf-8") != styled:
                    source_path.write_text(styled, encoding="utf-8")
                render = render_example(
                    npx,
                    args.mermaid_cli_package,
                    source_path,
                    svg_path,
                    args.render_timeout,
                    args.render_retries,
                    args.reuse_existing,
                )
                colorset_result["render"] = render
                if render["exitCode"] != 0:
                    example_findings.append(f"{colorset} render failed with exit {render['exitCode']}: {render['stderr']}")
                else:
                    example_findings.extend(inspect_rendered_svg(styler, colorset, example, svg_path))

            colorset_reviews[colorset] = colorset_result

        approved = not example_findings
        report_example = dict(example)
        report_example["approved"] = approved
        report_example["colorsets"] = colorset_reviews
        report_example["findings"] = example_findings
        report_examples.append(report_example)
        findings.extend(f"{example['id']}: {finding}" for finding in example_findings)

    return {
        "approved": not findings,
        "fixture": str(fixture),
        "exampleCount": len(examples),
        "mermaidVersion": styler.MERMAID_VERSION,
        "diagramTypeManifest": "references/diagram-types.json",
        "officialFamilyCount": len(styler.OFFICIAL_FAMILIES),
        "coveredFamilyCount": len(styler.OFFICIAL_FAMILIES) - len(missing_families),
        "familyCoveragePercent": round(
            ((len(styler.OFFICIAL_FAMILIES) - len(missing_families)) / len(styler.OFFICIAL_FAMILIES)) * 100,
            2,
        ),
        "officialDeclarationCount": len(styler.OFFICIAL_DECLARATIONS),
        "officialDeclarationCoveragePercent": round(
            ((len(styler.OFFICIAL_DECLARATIONS) - len(missing_declarations)) / len(styler.OFFICIAL_DECLARATIONS)) * 100,
            2,
        ),
        "supportedDeclarationCount": len(styler.SUPPORTED_DECLARATIONS),
        "supportedDeclarationCoveragePercent": round(
            ((len(styler.SUPPORTED_DECLARATIONS) - len(missing_supported_declarations)) / len(styler.SUPPORTED_DECLARATIONS)) * 100,
            2,
        ),
        "approvedExampleCount": sum(1 for example in report_examples if example["approved"]),
        "colorsetsReviewed": ["colorset1", "colorset2"],
        "rendered": bool(args.render),
        "mermaidCliPackage": args.mermaid_cli_package if args.render else None,
        "missingDeclarations": missing_declarations,
        "missingSupportedDeclarations": missing_supported_declarations,
        "duplicateDeclarations": duplicate_declarations,
        "unexpectedDeclarations": unexpected_declarations,
        "missingFamilies": missing_families,
        "missingColorClasses": missing_classes,
        "examples": report_examples,
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Review and approve every Mermaid colorset fixture example.")
    parser.add_argument("--fixture", type=Path, default=FIXTURE, help="Markdown fixture containing Mermaid examples.")
    parser.add_argument("--output", type=Path, help="Directory for rendered approval artifacts.")
    parser.add_argument("--report", type=Path, help="Write a JSON approval report.")
    parser.add_argument("--render", action="store_true", help="Render each styled example with Mermaid CLI and validate the SVG output.")
    parser.add_argument("--mermaid-cli-package", default=DEFAULT_MERMAID_PACKAGE, help="npx package spec for Mermaid CLI.")
    parser.add_argument("--render-timeout", type=int, default=60, help="Seconds to allow each Mermaid CLI render.")
    parser.add_argument("--render-retries", type=int, default=8, help="Attempts for each Mermaid CLI render before failing.")
    parser.add_argument(
        "--reuse-existing",
        action="store_true",
        help="Reuse an SVG only when a sidecar matches its source hash and exact pinned Mermaid CLI package.",
    )
    args = parser.parse_args()

    report = review_examples(args)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["approved"] else 1


if __name__ == "__main__":
    sys.exit(main())
