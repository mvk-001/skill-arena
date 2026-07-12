#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable


SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate_mermaid_render_coverage.py"
VALID_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" '
    'viewBox="0 0 120 80"><rect width="120" height="80" fill="#123456"/>'
    '<text x="10" y="40">valid Mermaid render</text></svg>\n'
)


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_mermaid_render_coverage", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load validate_mermaid_render_coverage.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeRenderer:
    def __init__(
        self,
        styler,
        behavior: Callable[[int, list[str]], tuple[set[int], int, bool]],
    ) -> None:
        self.styler = styler
        self.behavior = behavior
        self.calls: list[list[str]] = []
        self.puppeteer_configs: list[dict[str, object] | None] = []

    def __call__(self, command: list[str], **kwargs):
        input_path = Path(command[command.index("-i") + 1])
        output_path = Path(command[command.index("-o") + 1])
        source = input_path.read_text(encoding="utf-8")
        declarations = [
            self.styler.first_declaration(match.group("body"))
            for match in self.styler.FENCE_RE.finditer(source)
        ]
        self.calls.append(declarations)
        if "--puppeteerConfigFile" in command:
            config_path = Path(command[command.index("--puppeteerConfigFile") + 1])
            self.puppeteer_configs.append(json.loads(config_path.read_text(encoding="utf-8")))
        else:
            self.puppeteer_configs.append(None)
        approved, exit_code, timed_out = self.behavior(len(self.calls), declarations)
        for index in approved:
            output_path.with_name(f"{output_path.stem}-{index + 1}.svg").write_text(
                VALID_SVG, encoding="utf-8"
            )
        if timed_out:
            raise subprocess.TimeoutExpired(command, kwargs["timeout"])
        return subprocess.CompletedProcess(command, exit_code, stdout="", stderr="")


def run_case(behavior, *, disable_browser_sandbox: bool = False):
    validator = load_validator()
    styler = validator.load_styler()
    source = validator.FIXTURE.read_text(encoding="utf-8")
    renderer = FakeRenderer(styler, behavior)
    original_run = validator.subprocess.run
    validator.subprocess.run = renderer
    try:
        with tempfile.TemporaryDirectory(prefix="mermaid-chunk-test-") as temporary:
            result = validator.render_colorsets(
                styler,
                "npx",
                validator.DEFAULT_MERMAID_PACKAGE,
                source,
                Path(temporary),
                timeout=10,
                retries=3,
                jobs=1,
                render_chunk_size=8,
                overall_timeout=600,
                disable_browser_sandbox=disable_browser_sandbox,
            )
    finally:
        validator.subprocess.run = original_run
    return result, renderer, styler


def test_all_diagrams_start_in_small_chunks() -> None:
    (colorsets, findings, batch), renderer, _styler = run_case(
        lambda _call, declarations: (set(range(len(declarations))), 0, False)
    )
    calls = renderer.calls
    assert not findings
    assert batch["ok"]
    assert batch["renderMode"] == "chunk-first"
    assert batch["renderChunkCount"] == 12
    assert batch["promotedSvgCount"] == 96
    assert batch["timedOutAttemptCount"] == 0
    assert batch["unresolvedCount"] == 0
    assert len(calls) == 12
    assert max(map(len, calls)) == 8
    assert all(attempt["phase"] == "chunk" for attempt in batch["attempts"])
    assert batch["browserSandboxMode"] == "default"
    assert renderer.puppeteer_configs == [None] * 12
    assert sum(int(item["approvedRenderCount"]) for item in colorsets) == 96


def test_partial_timeout_is_promoted_then_unresolved_items_are_isolated() -> None:
    def behavior(call: int, declarations: list[str]) -> tuple[set[int], int, bool]:
        if call == 1:
            return set(range(3)), 1, True
        if call == 2:
            return set(), 1, False
        return set(range(len(declarations))), 0, False

    (_colorsets, findings, batch), renderer, _styler = run_case(behavior)
    calls = renderer.calls
    assert not findings
    assert batch["ok"]
    assert batch["promotedSvgCount"] == 96
    assert batch["timedOutAttemptCount"] == 1
    assert batch["unresolvedCount"] == 0
    assert batch["attempts"][0]["timedOut"] is True
    assert batch["attempts"][0]["approvedSvgCount"] == 3
    assert batch["attempts"][1]["approvedSvgCount"] == 0
    assert [len(call) for call in calls[2:7]] == [1, 1, 1, 1, 1]


def test_unrenderable_singletons_fail_the_gate() -> None:
    blocked: str | None = None

    def behavior(_call: int, declarations: list[str]) -> tuple[set[int], int, bool]:
        approved = {index for index, declaration in enumerate(declarations) if declaration != blocked}
        return approved, 0 if len(approved) == len(declarations) else 1, False

    validator = load_validator()
    styler = validator.load_styler()
    blocked = styler.SUPPORTED_DECLARATIONS[-1]
    (colorsets, findings, batch), _renderer, _styler = run_case(behavior)
    assert findings
    assert not batch["ok"]
    assert batch["promotedSvgCount"] == 94
    assert batch["unresolvedCount"] == 2
    assert sum(int(item["approvedRenderCount"]) for item in colorsets) == 94
    assert any("retries exhausted" in finding for finding in batch["findings"])


def test_trusted_ci_mode_passes_explicit_no_sandbox_config() -> None:
    (_colorsets, findings, batch), renderer, _styler = run_case(
        lambda _call, declarations: (set(range(len(declarations))), 0, False),
        disable_browser_sandbox=True,
    )
    assert not findings
    assert batch["ok"]
    assert batch["browserSandboxMode"] == "disabled"
    assert renderer.puppeteer_configs == [
        {"args": ["--no-sandbox", "--disable-setuid-sandbox"]}
    ] * 12


def main() -> int:
    test_all_diagrams_start_in_small_chunks()
    test_partial_timeout_is_promoted_then_unresolved_items_are_isolated()
    test_unrenderable_singletons_fail_the_gate()
    test_trusted_ci_mode_passes_explicit_no_sandbox_config()
    print("Mermaid chunk-first render coverage tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
