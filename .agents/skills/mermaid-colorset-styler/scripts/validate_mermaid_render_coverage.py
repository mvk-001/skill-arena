#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
STYLE_SCRIPT = SCRIPT_DIR / "style_mermaid_directory.py"
FIXTURE = SKILL_DIR / "assets" / "examples" / "base" / "all-types.md"
DEFAULT_MERMAID_PACKAGE = "@mermaid-js/mermaid-cli@11.16.0"
ERROR_CLASSES = {"error-icon", "error-text"}


def load_styler():
    spec = importlib.util.spec_from_file_location("style_mermaid_directory", STYLE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load style_mermaid_directory.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def find_npx() -> str:
    for name in ("npx.cmd", "npx", "npx.ps1"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("Could not find npx. Install Node.js to render Mermaid examples.")


def class_tokens(element: ET.Element) -> set[str]:
    return {token for token in element.get("class", "").split() if token}


def inspect_svg(path: Path) -> list[str]:
    if not path.is_file() or path.stat().st_size < 100:
        return ["render output is missing or too small"]
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as error:
        return [f"render output is invalid XML: {error}"]
    findings: list[str] = []
    if not root.tag.endswith("svg"):
        findings.append("render output root is not svg")
    if root.get("aria-roledescription", "").lower() == "error":
        findings.append("render output is a Mermaid error SVG")
    if any(class_tokens(element) & ERROR_CLASSES for element in root.iter()):
        findings.append("render output contains Mermaid error classes")
    text = path.read_text(encoding="utf-8", errors="replace").lower()
    if "syntaxerrorintext" in text:
        findings.append("render output contains Mermaid syntax-error text")
    return findings


def style_fixture(styler, source: str, colorset: str) -> tuple[str, list[dict[str, str]]]:
    examples: list[dict[str, str]] = []

    def replace(match: re.Match[str]) -> str:
        body = match.group("body")
        declaration = styler.first_declaration(body)
        family = styler.canonical_family(declaration)
        styled, _metadata = styler.style_mermaid_block(body, colorset)
        examples.append({"declaration": declaration, "family": family})
        return match.group("open") + styled + match.group("close")

    return styler.FENCE_RE.sub(replace, source), examples


def validate_fixture_examples(styler, examples: list[dict[str, str]]) -> list[str]:
    findings: list[str] = []
    declarations = [example["declaration"] for example in examples]
    if len(declarations) != len(styler.SUPPORTED_DECLARATIONS):
        findings.append(
            f"fixture has {len(declarations)} diagrams; expected {len(styler.SUPPORTED_DECLARATIONS)}"
        )
    if set(declarations) != set(styler.SUPPORTED_DECLARATIONS):
        findings.append(
            "fixture declaration set differs from the renderable manifest: "
            f"missing={sorted(set(styler.SUPPORTED_DECLARATIONS) - set(declarations))}, "
            f"unexpected={sorted(set(declarations) - set(styler.SUPPORTED_DECLARATIONS))}"
        )
    duplicate_declarations = sorted(
        declaration for declaration in set(declarations) if declarations.count(declaration) > 1
    )
    if duplicate_declarations:
        findings.append(f"fixture has duplicate declarations: {duplicate_declarations}")
    return findings


def attempts_for_colorset(
    attempts: list[dict[str, object]], colorset: str
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for attempt in attempts:
        result = dict(attempt)
        attempt_colorsets = result.get("colorsets")
        if isinstance(attempt_colorsets, list) and colorset not in attempt_colorsets:
            continue
        counts = result.pop("colorsetRenderedSvgCounts", {})
        if isinstance(counts, dict):
            result["renderedSvgCount"] = int(counts.get(colorset, 0))
        approved_counts = result.pop("colorsetApprovedSvgCounts", None)
        if isinstance(approved_counts, dict):
            result["approvedSvgCount"] = int(approved_counts.get(colorset, 0))
        results.append(result)
    return results


def render_colorsets(
    styler,
    npx: str,
    package: str,
    source: str,
    workspace: Path,
    timeout: int,
    retries: int,
    jobs: int,
    render_chunk_size: int,
    overall_timeout: int,
    disable_browser_sandbox: bool = False,
) -> tuple[list[dict[str, object]], list[str], dict[str, object]]:
    def remaining_timeout(limit: int) -> int | None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        return max(1, min(limit, int(remaining)))

    colorset_inputs: list[dict[str, object]] = []
    render_units: list[dict[str, object]] = []
    next_global_index = 1
    for colorset in ("colorset1", "colorset2"):
        styled, examples = style_fixture(styler, source, colorset)
        start_index = next_global_index
        end_index = start_index + len(examples) - 1
        next_global_index = end_index + 1
        fences = [match.group(0) for match in styler.FENCE_RE.finditer(styled)]
        fixture_findings = validate_fixture_examples(styler, examples)
        if len(fences) != len(examples):
            fixture_findings.append(
                f"styled fixture has {len(fences)} Mermaid fences; expected {len(examples)}"
            )
        colorset_inputs.append(
            {
                "colorset": colorset,
                "examples": examples,
                "startIndex": start_index,
                "endIndex": end_index,
                "findings": fixture_findings,
            }
        )
        for local_index, (example, fence) in enumerate(
            zip(examples, fences, strict=False), start=1
        ):
            render_units.append(
                {
                    "colorset": colorset,
                    "localIndex": local_index,
                    "globalIndex": start_index + local_index - 1,
                    "example": example,
                    "fence": fence,
                }
            )
    puppeteer_config_path: Path | None = None
    if disable_browser_sandbox:
        puppeteer_config_path = workspace / "puppeteer-ci.json"
        puppeteer_config_path.write_text(
            json.dumps({"args": ["--no-sandbox", "--disable-setuid-sandbox"]}) + "\n",
            encoding="utf-8",
        )

    # Render in small batches from the outset. A single Mermaid CLI process can
    # exhaust a constrained CI runner after a healthy prefix and leave later
    # Chromium launches unhealthy. Starting each batch in a fresh process avoids
    # that cumulative pressure while still requiring 96 fresh valid artifacts.
    def command_for(batch_input: Path, batch_output: Path) -> list[str]:
        command = [
            npx,
            "-y",
            package,
            "-i",
            str(batch_input),
            "-o",
            str(batch_output),
            "--quiet",
            "--jobs",
            str(jobs),
        ]
        if puppeteer_config_path is not None:
            command.extend(["--puppeteerConfigFile", str(puppeteer_config_path)])
        return command

    render_count = next_global_index - 1
    expected_names = {f"rendered-{index}.svg" for index in range(1, render_count + 1)}
    for stale_path in workspace.glob("rendered-*.svg"):
        stale_path.unlink()

    started_at = time.monotonic()
    deadline = started_at + overall_timeout
    attempts: list[dict[str, object]] = []
    render_chunks = [
        render_units[index : index + render_chunk_size]
        for index in range(0, len(render_units), render_chunk_size)
    ]
    chunk_failures: list[str] = []
    batch_timeout = min(timeout, 60)
    render_invocation = 0

    for chunk_number, chunk in enumerate(render_chunks, start=1):
        pending_groups: list[list[dict[str, object]]] = [chunk]
        budget_exhausted = False
        for attempt_round in range(1, retries + 1):
            if not pending_groups:
                break
            next_groups: list[list[dict[str, object]]] = []
            for group_position, group in enumerate(pending_groups):
                call_timeout = remaining_timeout(batch_timeout)
                if call_timeout is None:
                    next_groups.extend(pending_groups[group_position:])
                    budget_exhausted = True
                    break
                render_invocation += 1
                scratch_input = workspace / f"batch-{render_invocation:03d}.md"
                scratch_output = workspace / f"batch-{render_invocation:03d}-rendered.md"
                scratch_input.write_text(
                    "\n\n".join(str(unit["fence"]) for unit in group) + "\n",
                    encoding="utf-8",
                    newline="\n",
                )
                scratch_prefix = scratch_output.stem
                for stale_path in workspace.glob(f"{scratch_prefix}-*.svg"):
                    stale_path.unlink()
                scratch_output.unlink(missing_ok=True)
                completed: subprocess.CompletedProcess[str] | None = None
                timed_out = False
                try:
                    completed = subprocess.run(
                        command_for(scratch_input, scratch_output),
                        cwd=workspace,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        capture_output=True,
                        check=False,
                        timeout=call_timeout,
                    )
                except subprocess.TimeoutExpired:
                    timed_out = True

                scratch_names = {
                    path.name for path in workspace.glob(f"{scratch_prefix}-*.svg")
                }
                scratch_expected = {
                    f"{scratch_prefix}-{index}.svg"
                    for index in range(1, len(group) + 1)
                }
                unexpected_scratch = sorted(scratch_names - scratch_expected)
                colorset_counts = {"colorset1": 0, "colorset2": 0}
                approved_counts = {"colorset1": 0, "colorset2": 0}
                unresolved: list[dict[str, object]] = []
                for local_index, unit in enumerate(group, start=1):
                    scratch_name = f"{scratch_prefix}-{local_index}.svg"
                    scratch_path = workspace / scratch_name
                    colorset = str(unit["colorset"])
                    if scratch_name in scratch_names:
                        colorset_counts[colorset] += 1
                    if (
                        not unexpected_scratch
                        and scratch_name in scratch_names
                        and not inspect_svg(scratch_path)
                    ):
                        target_path = workspace / f"rendered-{int(unit['globalIndex'])}.svg"
                        scratch_path.replace(target_path)
                        approved_counts[colorset] += 1
                    else:
                        unresolved.append(unit)

                attempts.append(
                    {
                        "phase": "chunk",
                        "chunk": chunk_number,
                        "attempt": attempt_round,
                        "invocation": render_invocation,
                        "exitCode": completed.returncode if completed is not None else None,
                        "jobs": jobs,
                        "colorsets": sorted({str(unit["colorset"]) for unit in group}),
                        "globalIndices": [int(unit["globalIndex"]) for unit in group],
                        "renderedSvgCount": len(scratch_names),
                        "approvedSvgCount": sum(approved_counts.values()),
                        "unexpectedSvgNames": unexpected_scratch,
                        "colorsetRenderedSvgCounts": colorset_counts,
                        "colorsetApprovedSvgCounts": approved_counts,
                        "stdout": completed.stdout.strip()[-1000:] if completed is not None else "",
                        "stderr": (
                            completed.stderr.strip()[-1000:]
                            if completed is not None
                            else f"timed out after {call_timeout} seconds"
                        ),
                        "timedOut": timed_out,
                    }
                )
                if unresolved:
                    if attempt_round == retries - 1 and len(unresolved) > 1:
                        next_groups.extend([[unit] for unit in unresolved])
                    else:
                        next_groups.append(unresolved)
            pending_groups = next_groups
            if budget_exhausted:
                break

        unresolved_units = [unit for group in pending_groups for unit in group]
        if unresolved_units:
            global_indices = [int(unit["globalIndex"]) for unit in unresolved_units]
            reason = "overall timeout exhausted" if budget_exhausted else "retries exhausted"
            chunk_failures.append(
                f"render chunk {chunk_number} left unresolved global indices {global_indices}: {reason}"
            )

    actual_names = {path.name for path in workspace.glob("rendered-*.svg")}
    batch_findings: list[str] = list(chunk_failures)
    unresolved = [
        {
            "globalIndex": int(unit["globalIndex"]),
            "colorset": str(unit["colorset"]),
            "declaration": str(unit["example"]["declaration"]),
        }
        for unit in render_units
        if f"rendered-{int(unit['globalIndex'])}.svg" not in actual_names
    ]

    if actual_names != expected_names:
        batch_findings.append(
            f"rendered SVG set differs: missing={sorted(expected_names - actual_names)}, "
            f"unexpected={sorted(actual_names - expected_names)}"
        )
    final_exit_code = 0 if not batch_findings else 1

    colorset_results: list[dict[str, object]] = []
    prefixed_findings: list[str] = list(batch_findings)
    for colorset_input in colorset_inputs:
        colorset = str(colorset_input["colorset"])
        examples = colorset_input["examples"]
        assert isinstance(examples, list)
        start_index = int(colorset_input["startIndex"])
        colorset_findings = list(colorset_input["findings"])
        render_results: list[dict[str, object]] = []
        for index, example in enumerate(examples, start=1):
            assert isinstance(example, dict)
            global_index = start_index + index - 1
            svg_findings = inspect_svg(workspace / f"rendered-{global_index}.svg")
            render_results.append(
                {
                    "index": index,
                    "globalIndex": global_index,
                    "declaration": example["declaration"],
                    "family": example["family"],
                    "approved": not svg_findings,
                    "findings": svg_findings,
                }
            )
            colorset_findings.extend(
                f"{example['declaration']}: {finding}" for finding in svg_findings
            )
        findings = [*batch_findings, *colorset_findings]
        colorset_attempts = attempts_for_colorset(attempts, colorset)
        colorset_results.append(
            {
                "colorset": colorset,
                "ok": not findings and not batch_findings,
                "exitCode": final_exit_code,
                "jobs": jobs,
                "attemptCount": len(colorset_attempts),
                "attempts": colorset_attempts,
                "startIndex": start_index,
                "endIndex": int(colorset_input["endIndex"]),
                "diagramCount": len(examples),
                "approvedRenderCount": sum(1 for result in render_results if result["approved"]),
                "renders": render_results,
                "findings": findings,
            }
        )
        prefixed_findings.extend(
            f"{colorset}: {finding}" for finding in colorset_findings
        )

    batch = {
        "ok": not batch_findings,
        "exitCode": final_exit_code,
        "jobs": jobs,
        "renderMode": "chunk-first",
        "browserSandboxMode": "disabled" if disable_browser_sandbox else "default",
        "attemptCount": len(attempts),
        "attempts": attempts,
        "renderChunkSize": render_chunk_size,
        "renderChunkCount": len(render_chunks),
        "promotedSvgCount": len(actual_names & expected_names),
        "timedOutAttemptCount": sum(bool(attempt.get("timedOut")) for attempt in attempts),
        "nonzeroAttemptCount": sum(
            attempt.get("exitCode") not in (None, 0) for attempt in attempts
        ),
        "unresolvedCount": len(unresolved),
        "unresolved": unresolved,
        "overallTimeout": overall_timeout,
        "elapsedSeconds": round(time.monotonic() - started_at, 3),
        "renderCount": render_count,
        "renderedSvgCount": len(actual_names),
        "findings": batch_findings,
    }
    return colorset_results, prefixed_findings, batch


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fresh chunk-render every Mermaid colorset declaration and reject error SVGs."
    )
    parser.add_argument("--fixture", type=Path, default=FIXTURE, help="Markdown coverage fixture.")
    parser.add_argument("--mermaid-cli-package", default=DEFAULT_MERMAID_PACKAGE, help="Exact npx Mermaid CLI package spec.")
    parser.add_argument("--timeout", type=int, default=180, help="Seconds allowed for each Mermaid CLI process.")
    parser.add_argument("--render-retries", type=int, default=3, help="Attempts per unresolved render chunk.")
    parser.add_argument(
        "--render-chunk-size",
        "--recovery-chunk-size",
        dest="render_chunk_size",
        type=int,
        default=8,
        help="Diagrams per independently retried fresh render batch.",
    )
    parser.add_argument(
        "--overall-timeout",
        type=int,
        default=600,
        help="Maximum seconds for all fresh render batches and retries.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=1,
        help="Parallel Mermaid renders per batch. Keep 1 for deterministic CI coverage.",
    )
    parser.add_argument(
        "--disable-browser-sandbox",
        action="store_true",
        help="Disable Chromium's sandbox only in a trusted, isolated CI runner.",
    )
    parser.add_argument("--report", type=Path, help="Write the validation report as JSON.")
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be at least 1")
    if args.jobs < 1:
        parser.error("--jobs must be at least 1")
    if args.render_retries < 1:
        parser.error("--render-retries must be at least 1")
    if args.render_chunk_size < 1:
        parser.error("--render-chunk-size must be at least 1")
    if args.overall_timeout < 1:
        parser.error("--overall-timeout must be at least 1")

    styler = load_styler()
    npx = find_npx()
    findings: list[str] = []
    version = subprocess.run(
        [npx, "-y", args.mermaid_cli_package, "--version"],
        cwd=SKILL_DIR,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=args.timeout,
    )
    observed_version = version.stdout.strip()
    if version.returncode != 0 or observed_version != styler.MERMAID_VERSION:
        findings.append(
            f"Mermaid CLI version is {observed_version!r} with exit {version.returncode}; expected {styler.MERMAID_VERSION!r}"
        )

    source = args.fixture.resolve().read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="mermaid-render-coverage-") as temporary:
        workspace = Path(temporary)
        colorset_results, render_findings, batch = render_colorsets(
            styler,
            npx,
            args.mermaid_cli_package,
            source,
            workspace,
            args.timeout,
            args.render_retries,
            args.jobs,
            args.render_chunk_size,
            args.overall_timeout,
            args.disable_browser_sandbox,
        )
        findings.extend(render_findings)

    report = {
        "ok": not findings,
        "mermaidVersion": styler.MERMAID_VERSION,
        "observedMermaidCliVersion": observed_version,
        "familyCount": len(styler.OFFICIAL_FAMILIES),
        "currentDeclarationCount": len(styler.OFFICIAL_DECLARATIONS),
        "renderableDeclarationCount": len(styler.SUPPORTED_DECLARATIONS),
        "colorsetCount": len(colorset_results),
        "jobs": args.jobs,
        "renderMode": "chunk-first",
        "renderChunkSize": args.render_chunk_size,
        "browserSandboxMode": "disabled" if args.disable_browser_sandbox else "default",
        "overallTimeout": args.overall_timeout,
        "batch": batch,
        "renderCount": sum(int(result["diagramCount"]) for result in colorset_results),
        "approvedRenderCount": sum(int(result["approvedRenderCount"]) for result in colorset_results),
        "colorsets": colorset_results,
        "findings": findings,
    }
    if args.report:
        report_path = args.report.resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    if findings:
        failed_attempts = [
            attempt
            for attempt in batch["attempts"]
            if attempt.get("timedOut")
            or attempt.get("exitCode") not in (None, 0)
            or int(attempt.get("approvedSvgCount", 0))
            != len(attempt.get("globalIndices", []))
        ]
        sampled_attempts = failed_attempts[:1]
        if len(failed_attempts) > 1:
            sampled_attempts.append(failed_attempts[-1])
        failure_summary = {
            "renderMode": batch["renderMode"],
            "browserSandboxMode": batch["browserSandboxMode"],
            "attemptCount": batch["attemptCount"],
            "timedOutAttemptCount": batch["timedOutAttemptCount"],
            "nonzeroAttemptCount": batch["nonzeroAttemptCount"],
            "unresolvedCount": batch["unresolvedCount"],
            "unresolved": batch["unresolved"][:4],
            "findings": batch["findings"][:2],
            "sampledFailedAttempts": [
                {
                    "chunk": attempt.get("chunk"),
                    "attempt": attempt.get("attempt"),
                    "exitCode": attempt.get("exitCode"),
                    "timedOut": attempt.get("timedOut"),
                    "globalIndices": attempt.get("globalIndices"),
                    "renderedSvgCount": attempt.get("renderedSvgCount"),
                    "approvedSvgCount": attempt.get("approvedSvgCount"),
                    "unexpectedSvgNames": attempt.get("unexpectedSvgNames"),
                    "stdout": attempt.get("stdout"),
                    "stderr": attempt.get("stderr"),
                }
                for attempt in sampled_attempts
            ],
        }
        print(
            "Mermaid render coverage failure summary: "
            + json.dumps(failure_summary, sort_keys=True),
            file=sys.stderr,
        )
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
