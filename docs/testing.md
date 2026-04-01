# Testing

Read this after [Usage Guide](./usage.md). This page is the validation playbook for Skill Arena itself: runtime code, compare config generation, workspace materialization, and live evaluation checks. Use [Specs](./specs.md) for canonical fields and [Architecture](./architecture.md) when a failure looks like a runner or adapter problem.

## What To Verify

When you change Skill Arena, the goal is usually to verify three layers in order:

1. Unit-tested runtime behavior under `src/`
2. Config validation and Promptfoo generation
3. Optional live agent execution against a maintained compare benchmark

The default loop is:

```bash
npm test
skill-arena val-conf ./evaluations/skill-arena-config-author/evaluation.yaml
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run
```

Run the live evaluation only when that loop is clean:

```bash
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
```

## Prerequisites

- Node.js 24 or newer
- `npm install` or `pnpm install`
- local Codex CLI available on `PATH` as `codex`
- local GitHub Copilot CLI available on `PATH` as `copilot` when testing `copilot-cli` scenarios
- local OpenCode CLI available on `PATH` as `opencode` when testing `opencode` scenarios
- Codex authenticated on the machine before running live evaluations

## 1. Run Unit Tests

These tests cover manifest parsing, compare config generation, workspace materialization, adapter preparation, and result normalization.

```bash
npm test
```

With `pnpm`:

```bash
pnpm test
```

The repository test script intentionally targets `test/*.test.js` only so generated artifacts under `results/` are not picked up by Node's default test discovery.

### Coverage

When a change touches runtime behavior or the unit-testable surface, also run:

```bash
npm run test:coverage
```

This command enforces minimum thresholds:

- statements: `95%`
- lines: `95%`
- branches: `85%`
- functions: `95%`

Coverage scope includes `src/**/*.js` and excludes:

- `src/cli/**`
- `src/runner.js`
- `src/providers/codex-system-provider.js`
- `src/providers/pi-system-provider.js`

Those exclusions keep the threshold focused on the stable unit-testable runtime surface while live evaluations exercise command-oriented entrypoints separately.

## 2. Validate The Config

Before running a maintained benchmark, validate its config:

```bash
skill-arena val-conf ./evaluations/skill-arena-config-author/evaluation.yaml
```

This catches malformed YAML, invalid schema combinations, and unfinished `TODO:` fields from `gen-conf`.

## 3. Run A Dry-Run Evaluation

Use `--dry-run` to verify materialization and config generation without launching live agent executions:

```bash
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run
```

This is the fastest high-signal check after config or runtime changes because it confirms that Skill Arena can:

- load the compare config
- expand profiles and variants
- materialize isolated workspaces under `results/`
- resolve workspace and capability sources
- generate a Promptfoo config for the benchmark

## 4. Run A Live Evaluation

When the dry-run is clean, run the maintained compare benchmark:

```bash
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
```

Generic form:

```bash
skill-arena evaluate ./evaluations/<evaluation-id>/evaluation.yaml
```

Useful variants:

```bash
skill-arena evaluate ./evaluations/<evaluation-id>/evaluation.yaml --requests 2
skill-arena evaluate ./evaluations/<evaluation-id>/evaluation.yaml --max-concurrency 2
skill-arena evaluate ./evaluations/<evaluation-id>/evaluation.yaml --reuse-unchanged-profiles
```

Scaffold a config when you need a new benchmark:

```bash
skill-arena gen-conf --output ./evaluations/<evaluation-id>/evaluation.yaml --prompt "Describe the task." --skill-type local-path
```

## What A Compare Run Does

In compare mode, Skill Arena:

- materializes a separate isolated workspace for each supported scenario unit
- generates one Promptfoo config with profile columns and `prompt x variant` rows
- executes each matrix cell `evaluation.requests` times
- records unsupported adapters as skipped entries instead of aborting the whole run
- records unsupported capability bundles as `unsupported` cells instead of aborting the whole run

Behavior to expect:

- profiles appear as side-by-side columns
- rows are variant and prompt pairs
- matrix cells report pass ratio against the requested execution count
- when token usage is available, cells also report average and standard deviation aggregates
- when `rust-code-analysis` is installed, cells may also report changed-code metrics for modified original files only

## Local Path And Reuse Rules

For matrix evaluation configs:

- absolute paths always work
- relative paths resolve from the current command working directory
- matrix configs must not depend on package-relative path resolution
- when a relative local path is missing, the evaluator may bootstrap that source tree from packaged fixtures
- compare-mode bootstrap excludes `AGENTS.md`

Reuse behavior:

- `--reuse-unchanged-profiles` reuses the latest matching outputs when the scenario fingerprint still matches
- changing inline skill content invalidates reuse
- changing local-path skill files, bundled references, or bundled scripts also invalidates reuse
- Git-backed reuse is best-effort because mutable refs are not always content-addressed at authoring time

## Inspect The Results

Each compare run writes artifacts under:

```text
results/<benchmark-id>/<timestamp>-compare/
```

The most useful outputs are:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`
- `merged/report.md`
- `merged/merged-summary.json`

For hook and execution-event inspection, also check:

- `results/<benchmark-id>/<timestamp>-compare/workspace/.skill-arena/hooks/execution-events/*.json`

At the end of `skill-arena evaluate` in compare mode, the CLI prints the important artifact paths for the summary and merged report.

## Optional `rust-code-analysis`

Use `rust-code-analysis` only when you want standalone complexity and maintainability metrics in addition to test coverage. Skill Arena also uses it opportunistically during compare runs to report changed-code metrics.

This tool is optional.

Recommended Windows install flow:

```powershell
$toolDir = Join-Path $env:LOCALAPPDATA "skill-arena\\tools\\rust-code-analysis"
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
Invoke-WebRequest `
  -Uri "https://github.com/mozilla/rust-code-analysis/releases/latest/download/rust-code-analysis-win-cli-x86_64.zip" `
  -OutFile "$toolDir/rust-code-analysis-win-cli-x86_64.zip"
Expand-Archive `
  -Path "$toolDir/rust-code-analysis-win-cli-x86_64.zip" `
  -DestinationPath $toolDir `
  -Force
```

Run it directly against this repository:

```powershell
& (Join-Path $toolDir "target\\release\\rust-code-analysis-cli.exe") `
  -m --pr -O json `
  -p src -p test -p bin `
  -I "*.js" `
  -o .tmp\rca-js
```

To force a specific binary path:

```powershell
$env:SKILL_ARENA_RUST_CODE_ANALYSIS_BIN = "C:\tools\rust-code-analysis-cli.exe"
```

Useful follow-up checks:

- inspect generated JSON for `cognitive`, `cyclomatic`, `halstead`, and `loc` metrics
- rank hotspots by cognitive complexity
- rerun after a refactor and compare the changed metric deltas

## Closeout Guardrail

Before closing an autonomous improvement loop in this repository, run:

```bash
node skills/skill-arena-config-author/scripts/run-rust-analyzer-hook.js
```

This is the required repository closeout guardrail for autonomous loops. It writes JSON artifacts under `.tmp/rust-code-analysis-loop/`.

Pass `--strict` when the loop must fail if the binary is unavailable.

## Recommended Validation Sequence After Runtime Changes

Use this short sequence when you change the runner, Promptfoo integration, workspace materialization, or assertion translation:

```bash
npm test
skill-arena val-conf ./evaluations/skill-arena-config-author/evaluation.yaml
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run
```

What this covers:

- `npm test` catches unit-level regressions
- `val-conf` confirms the maintained config still parses cleanly
- `evaluate --dry-run` confirms workspace materialization and Promptfoo config generation still work

For profile-isolation validation after runtime changes, add at least one compare dry-run that:

- uses `comparison.profiles`
- includes one empty `no-skill` control profile with `inheritSystem: false`
- includes one explicit capability profile
- includes one intentionally unsupported capability family and confirms the cell is reported as `unsupported`
