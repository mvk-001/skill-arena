# Skill Arena Agent Guide

## Project goal

This repository benchmarks coding agents on reproducible workspace fixtures so we can compare skill usage, no-skill baselines, and agent-specific overhead with minimal execution context.

## Language policy

All repository artifacts must be written in English. This includes code, comments, documentation, configuration keys, prompt templates stored in the repo, fixture instructions, and benchmark metadata.

## Read this first

1. `README.md`
2. `docs/architecture.md`
3. `docs/specs.md`
4. `docs/testing.md`
5. `benchmarks/` manifests for concrete scenarios

## Canonical sources of truth

- `docs/architecture.md` defines the system design and execution flow.
- `docs/specs.md` defines the benchmark manifest, adapter contract, workspace rules, and result expectations.
- `benchmarks/` manifests define concrete benchmark scenarios.

## Contributor rules

- Do not introduce undocumented benchmark formats. Extend the manifest schema and specs first.
- Keep agent-specific behavior inside the adapter layer instead of scattering it across scripts.
- Keep Codex execution on the local system path through the custom Promptfoo provider; do not switch benchmark scenarios back to direct hosted Promptfoo Codex providers.
- When a benchmark uses a system-installed skill, record that in the manifest with `skillSource: "system-installed"` instead of pretending the skill came from a workspace overlay.
- Preserve the minimal-context goal: benchmark prompts should contain the task, not extra harness instructions, unless the benchmark explicitly measures those instructions.
