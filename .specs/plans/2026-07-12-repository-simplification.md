# Repository Simplification Plan

Date: 2026-07-12

## Goal

Reduce Skill Arena's implementation and skill-maintenance surface without
changing the documented manifest, compare, adapter, workspace, or result
contracts.

Baseline: `npm test` passes 368 tests before the simplification work.

## Audit Findings

- The removed `skill-arena-compare-batch` workflow still leaves tracked
  historical logs behind.
- `skill-arena-config-author` maintains its own 780-line config generator and a
  regex validator even though the core CLI already owns `gen-conf` and
  schema-backed `val-conf`.
- YAML/JSON parsing and Zod error formatting are duplicated across manifest,
  compare, and CLI config loaders.
- Manifest and compare execution duplicate Promptfoo command construction and
  process management.
- Three internal entrypoints and five npm aliases expose undocumented paths
  around the three-command public CLI.
- String option parsing is duplicated between the manifest and compare runners.

## Tasks And Verification

1. Clarify design ownership in `AGENTS.md`, `docs/README.md`, and the accepted
   documentation information-architecture ADR.
   - Verify with `npm run docs:check`.
2. Complete removal of the benchmark-specific batch skill and historical
   learning logs. Keep only generic, transferable authoring guidance.
   - Verify no active references with
     `rg "skill-arena-compare-batch|learning\\.log" README.md docs skills evaluations test package.json`.
3. Make `skill-arena-config-author` reuse `skill-arena gen-conf` and
   `skill-arena val-conf`; remove its duplicate scaffold generator, regex
   validator, and unreferenced overlapping reference assets.
   - Verify every remaining local skill reference resolves.
   - Run the maintained evaluation-design validator and its unit tests.
   - Smoke-test generated config creation and schema validation through the
     public CLI.
4. Consolidate config file loading, schema error formatting, CLI string option
   parsing, and Promptfoo process execution into shared runtime modules.
   - Add focused unit tests for the shared helpers.
   - Run manifest, compare, CLI-option, runner, and dry-run tests.
5. Remove undocumented wrapper entrypoints and npm aliases, leaving the public
   `evaluate`, `gen-conf`, and `val-conf` commands as the only user-facing
   command surface.
   - Verify `skill-arena --help` and all three command help pages.
   - Verify package contents with `npm pack --dry-run`.
6. Validate the integrated result.
   - Run `npm run check`.
   - Run `npm run test:coverage`.
   - Validate and dry-run the maintained config-author evaluation.
   - Run `node skills/skill-arena-config-author/scripts/run-rust-analyzer-hook.js`.
   - Review `git diff --check`, the final diff, and the remaining file/reference
     graph.

## Non-Goals

- Removing either documented V1 authoring format.
- Changing adapter capability claims or isolation semantics.
- Changing evaluation result schemas.
- Rewriting large runtime modules solely to reduce line count.

## Execution Result

Status: completed.

- Design ownership is explicit in `AGENTS.md`, the documentation index, and the
  accepted documentation information-architecture ADR.
- The benchmark-specific batch skill, historical logs, copied evaluation
  overlay, duplicate authoring generator, regex validator, and overlapping
  config-author references were removed.
- Manifest and compare loaders now share `src/config-file.js`; both execution
  paths share `src/promptfoo-runner.js`; CLI runners share string option
  parsing.
- Undocumented config-generation and dry-run wrappers plus their npm aliases
  were removed. The package exposes the documented `evaluate`, `gen-conf`, and
  `val-conf` surface.

Verification completed:

- `npm run check`: 388 tests passed and documentation links passed.
- `npm run test:coverage`: 95.61% statements, 85.79% branches, 97.23%
  functions, and 95.61% lines.
- Config-author evaluation design audit: 8 prompts, 8 task families, all three
  required case kinds, maximum 42 words, and maximum pairwise Jaccard 0.292.
- `skill-arena val-conf` and `skill-arena evaluate --dry-run` passed for the
  maintained config-author evaluation.
- Top-level and command-specific help passed for all three public commands.
- `npm pack --dry-run` produced the expected 51-file runtime package surface.
- `git diff --check` passed.
