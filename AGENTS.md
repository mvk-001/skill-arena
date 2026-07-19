# Skill Arena Agent Guide

## User Preferences
if there is another step to improve your progress, another stage, a validation that can be done, coverage test, unit testing, manual verification using playwright, research to understand better best way to go, do not ask it for confirmation, just do it, do your best effort to have your work as polished as possible.

## Decision Records

- Record durable technical or workflow decisions as ADRs under `.specs/adr/*.md`.
- Read existing ADRs before changing a previously chosen technical direction.

## Design Information

- Keep the canonical current runtime design and module boundaries in
  `docs/architecture.md`.
- Keep configuration, adapter, workspace, and result contracts in
  `docs/specs.md`; do not duplicate field-level contracts in design notes.
- Record durable design decisions and their consequences in `.specs/adr/*.md`.
- Keep active, verification-backed implementation plans in
  `.specs/plans/*.md`. Plans may describe work in progress, but they do not
  override the canonical architecture, specs, or accepted ADRs.
- Update the relevant canonical document in the same change whenever an
  implementation change makes it inaccurate.


## Project goal

This repository is a CLI-first benchmark harness for measuring whether Codex/Copilot/PI agents perform better with or without skills under the same task, workspace, and constraint conditions.
The package goal is to generate and execute reproducible, declarative evaluation runs (`manifest` and `compare` configs) and compare skill-mode behavior across variants.

## Packaging and runtime scope

The npm package intentionally ships only the CLI runtime surface:
- `bin/skill-arena.js`
- `src/**/*.js` (including manifests, workspace materialization, adapters, Promptfoo config building, and result normalization)

This keeps installation focused on what the CLI needs to:
- create prompt evaluation configs,
- materialize run workspaces,
- execute evaluations, and
- report deterministic skill vs no-skill outcomes.

## Deprecated Skill Arena skill logic

The repository-maintained `skill-arena-*` skill bundles are deprecated and
frozen. Keep them only for reproducing or migrating legacy workflows; do not
use them for new work, add features to them, or duplicate their logic elsewhere.

Use Harbor-native skills as the only maintained skill workflow surface:

- Author native Harbor `JobConfig` files and use `harbor-run-results` instead
  of `skill-arena-config-author`, `skill-arena-run-results`, or the legacy
  `harbor-runner` Skill Arena reporting bridge.
- Use `harbor-population-search` instead of `skill-arena-population-search`.
- Use `harbor-trace-distillation` instead of
  `skill-arena-trace-distillation`.
- Use `harbor-reflective-pareto-search` instead of
  `skill-arena-reflective-pareto-search`.
- Use `harbor-operator-coevolution` instead of
  `skill-arena-operator-coevolution`.
- Use `harbor-evolve-skill` or the appropriate Harbor-native strategy instead
  of `skill-arena-strategy-evaluator`.

Do not revive `skill-arena-compare-batch` or add another Skill Arena-backed
skill orchestrator. Implement evaluation execution, artifact validation,
reporting, ranking, selection, and evolution changes once in the relevant
Harbor-native bundle. Changes to deprecated bundles are limited to removal,
migration aids, or critical security and compatibility fixes required to read
existing evidence. This deprecation applies to the skill bundles, not to the
public Skill Arena CLI runtime, which remains supported until a separate
decision changes its status.

## Language policy

All repository artifacts must be written in English. This includes code, comments, documentation, configuration keys, prompt templates stored in the repo, fixture instructions, and benchmark metadata.

## Read this first

1. `README.md`
2. `docs/architecture.md`
3. `docs/specs.md`
4. `docs/testing.md`
5. `evaluations/` configs and manifests for concrete scenarios

## Canonical sources of truth

- `docs/architecture.md` defines the system design and execution flow.
- `docs/specs.md` defines the benchmark manifest, adapter contract, workspace rules, and result expectations.
- `evaluations/` configs and manifests define concrete benchmark scenarios.

## Contributor rules

- Do not introduce undocumented benchmark formats. Extend the manifest schema and specs first.
- Keep agent-specific behavior inside the adapter layer instead of scattering it across scripts.
- Keep Codex execution on the local system path through the custom Promptfoo provider; do not switch benchmark scenarios back to direct hosted Promptfoo Codex providers.
- When a benchmark uses a system-installed skill, record that in the manifest with `skillSource: "system-installed"` instead of pretending the skill came from a workspace overlay.
- Preserve the minimal-context goal: benchmark prompts should contain the task, not extra harness instructions, unless the benchmark explicitly measures those instructions.
- Preserve strict benchmark scope: do not append hidden instructions to prompts and do not rely on knowledge or files outside the exact prompt plus the folders explicitly shared with the agent for that run.

## Codex Loop Closeout

Codex does not have a native stable hook surface in this repository, so use the project closeout script as the required equivalent hook for autonomous loops.

- Before closing an autonomous improvement loop or declaring an agent iteration complete, run `node scripts/run-rust-analyzer-hook.js`.
- Treat a non-zero exit from that script as a failed closeout check.
- If `rust-code-analysis` is not installed locally, install or point `SKILL_ARENA_RUST_CODE_ANALYSIS_BIN` at the binary when the loop depends on this guardrail.
