# Testing

Read this after [Usage Guide](./usage.md). Use [Specs](./specs.md) for canonical fields and [Architecture](./architecture.md) when a failure looks like a runner or adapter problem.

## Prerequisites

- Node.js 24 or newer
- `npm install` or `pnpm install`
- Local Codex CLI available on `PATH` as `codex`
- Local GitHub Copilot CLI available on `PATH` as `copilot` when testing `copilot-cli` scenarios
- Codex authenticated on the machine before running live benchmarks

## Recommended loop

Use this by default after runtime or benchmark changes:

```bash
npm test
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

Run the live compare only when the dry-run and unit tests look clean:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

## What to run

### 1. Run unit tests

These validate manifest parsing, Promptfoo config generation, workspace materialization, and result normalization.

```bash
npm test
```

The repository test scripts intentionally target `test/*.test.js` only. This keeps generated benchmark artifacts under `results/` from being picked up as accidental test inputs by Node's default test discovery.

With `pnpm`:

```bash
pnpm test
```

### 1a. Run coverage with enforced minimum thresholds

Use this command for repository changes that touch the runtime or test surface. It fails if coverage drops below the enforced minimum:

```bash
npm run test:coverage
```

Current enforced minimum thresholds:

- statements: `93%`
- lines: `93%`
- branches: `80%`
- functions: `95%`

Coverage scope for this threshold includes `src/**/*.js` and excludes:

- `src/cli/**`
- `src/runner.js`
- `src/providers/codex-system-provider.js`
- `src/providers/pi-system-provider.js`

These exclusions keep the quota focused on the unit-testable runtime surface while live benchmark flows continue to exercise the excluded command-oriented entrypoints.

This project currently requires:

- lines >= 93%
- statements >= 93%
- branches >= 80%
- functions >= 95%

All are above the requested 90% minimum.

### 2. Validate a benchmark manifest

Use this before running a live benchmark if the manifest changed.

```bash
npm run validate:manifest -- ./benchmarks/skill-arena-compare/compare.yaml
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

YAML is the recommended manifest format. JSON also works if needed.

### 3. Run any benchmark manifest

The generic command is:

```bash
npm run run:benchmark -- ./benchmarks/<benchmark-id>/manifest.yaml
skill-arena evaluate ./benchmarks/<benchmark-id>/manifest.yaml
```

To run only one scenario:

```bash
npm run run:benchmark -- ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
skill-arena evaluate ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
```

You can run the same command through auto-detect:

```bash
skill-arena evaluate ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
```

To generate the intermediate Promptfoo config without executing the live eval:

```bash
npm run generate:config -- ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
```

To scaffold a commented compare config quickly:

```bash
skill-arena gen-conf --output ./benchmarks/<benchmark-id>/compare.yaml --prompt "Describe the task." --skill-type local-path
```

### 3a. Run a compare config

Use this when you want one file to drive one Promptfoo eval with multiple side-by-side providers across adapters, models, and isolated capability profiles.

```bash
npm run benchmark:compare -- ./benchmarks/<benchmark-id>/compare.yaml
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml
```

You can also use the same path with auto-detect:

```bash
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml
```

To validate the scenario expansion without executing live evals:

```bash
npm run benchmark:compare -- ./benchmarks/<benchmark-id>/compare.yaml --dry-run
npm run benchmark:compare:dry-run -- ./benchmarks/<benchmark-id>/compare.yaml
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml --dry-run
```

Also for auto-detect:

```bash
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml --dry-run
```

Compare local path contract:

- absolute paths always work
- relative paths are resolved from the current command working directory
- compare configs must not depend on package-relative path resolution
- when a relative local path is missing, compare may bootstrap that source tree from packaged fixtures and then materialize a per-scenario workspace
- compare bootstrap excludes `AGENTS.md`

Behavior to expect in compare mode:

- profiles appear as side-by-side columns in the same Promptfoo eval
- rows are variant and prompt pairs
- `evaluation.requests` controls the pass ratio denominator for each compare cell
- compare cells report pass ratio plus total-token aggregates as average and standard deviation when token usage is available
- unsupported adapters are listed as skipped entries in the merged report
- unsupported profile capability bundles are rendered as `unsupported` cells instead of aborting the compare run

### 4. Run the maintained sample compare benchmark

Use the benchmark kept in this repository:

```bash
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml
```

### 4a. Recommended benchmark test flow after runtime changes

Use this short sequence when you change the runner, Promptfoo integration, workspace materialization, or assertion translation:

```bash
npm test
npm run validate:manifest -- ./benchmarks/skill-arena-compare/compare.yaml
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml
```

What this covers:

- `npm test` catches unit-level regressions in config generation and result normalization.
- `validate:manifest` confirms the benchmark input still parses cleanly.
For compare-mode validation after changing `src/cli/run-compare.js`, also run:

```bash
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml
```

All benchmark commands:

- materialize an isolated workspace under `results/`
- materialize `workspace.sources` in declaration order
- resolve the skill from local path, Git, inline files, or the system-installed environment when configured
- generate a Promptfoo config for the selected scenario
- execute Codex through the custom Promptfoo provider
- write `promptfoo-results.json` and `summary.json`
- write a benchmark-level `merged-summary.json` and `report.md` when multiple scenarios run in one command

If your manifest uses an `llm-rubric` assertion, Promptfoo also runs the judge model configured on that assertion.

If the assertion uses `skill-arena:judge:codex`, `skill-arena:judge:copilot-cli`, or `skill-arena:judge:pi`, Promptfoo runs the packaged local custom provider instead of a hosted model API.

If your manifest uses Git-backed workspace or skill sources, the harness downloads them before the agent run. The agent itself still follows the scenario sandbox and network settings.

If your manifest uses `task.prompts`, Promptfoo evaluates every prompt variant and applies `requests` to each one.

If `maxConcurrency` is omitted in a manifest or compare config, the harness uses the local machine parallelism by default. In compare mode, that resolved value also governs the pre-eval workspace materialization phase so setup and evaluation follow the same concurrency cap.

## `copilot-cli` adapter notes

- V1 supports `copilot-cli` through the local `copilot` command only.
- `executionMethod: "sdk"` is not supported for `copilot-cli`.
- Sandbox, network, web search, and approval settings are mapped on a best-effort basis because Copilot CLI does not expose the same control surface as Codex.
- If `copilot` is not installed or not on `PATH`, the scenario fails with a command execution error.

## Where to inspect results

Each run writes artifacts under:

```text
results/<benchmark-id>/<timestamp>-<scenario-id>/
```

The most useful files are:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`

`summary.json` is the normalized output to compare runs across scenarios.

For compare runs, inspect:

- `results/<benchmark-id>/<timestamp>-compare/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-compare/summary.json`
- `results/<benchmark-id>/<timestamp>-compare/merged/report.md`

At the end of `skill-arena evaluate` in compare mode, the CLI prints:

- the final merged markdown report
- the merged JSON summary
- explicit artifact paths for `Compare summary`, `Final merged summary`, and `Final merged report`

`summary.json` includes a `matrix` section with compare columns, rows, and per-cell summaries such as `40% (4/10)<br>tokens avg 120, sd 15.5`.

For profile-isolation validation after runtime changes, add at least one compare dry-run that:

- uses `comparison.profiles`
- includes one empty baseline profile with `inheritSystem: false`
- includes one explicit capability profile
- includes one intentionally unsupported capability family and verifies the cell is reported as `unsupported`

## Latest validated results

Use the maintained benchmark in this repository as the smoke-style baseline:

```bash
npm run validate:manifest -- ./benchmarks/skill-arena-compare/compare.yaml
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml
```

Run outputs are written under `results/skill-arena-compare/<timestamp>-compare/`.
