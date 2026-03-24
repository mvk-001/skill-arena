# Testing

Read this after [Usage Guide](./usage.md). This page is the validation and verification playbook. Use [Specs](./specs.md) for canonical fields and [Architecture](./architecture.md) when a failure looks like a runner or adapter problem.

## Prerequisites

- Node.js 24 or newer
- `npm install` or `pnpm install`
- Local Codex CLI available on `PATH` as `codex`
- Local GitHub Copilot CLI available on `PATH` as `copilot` when testing `copilot-cli` scenarios
- Codex authenticated on the machine before running live evaluations

## Recommended Loop

Use this by default after runtime or config changes:

```bash
npm test
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

Run the live evaluation only when the dry-run and unit tests look clean:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

## What To Run

### 1. Run unit tests

These validate manifest parsing, Promptfoo config generation, workspace materialization, and result normalization.

```bash
npm test
```

The repository test scripts intentionally target `test/*.test.js` only. This keeps generated run artifacts under `results/` from being picked up as accidental test inputs by Node's default test discovery.

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

These exclusions keep the quota focused on the unit-testable runtime surface while live evaluation flows continue to exercise the excluded command-oriented entrypoints.

### 1b. Optional `rust-code-analysis` usage

Use `rust-code-analysis` only when you want standalone complexity and maintainability metrics in addition to test coverage. Skill Arena also uses this tool opportunistically during matrix evaluation runs to report changed code metrics for modified original files.

This tool is optional. Do not install it unless you specifically want those extra metrics.

Recommended approach:

- Prebuilt release binary:

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

This writes one JSON metrics file per analyzed source file under `.tmp/rca-js/`.

If the binary is on `PATH`, compare evaluations automatically pick it up. If it is not installed, evaluations continue without these code metrics. To force a specific binary path, set:

```powershell
$env:SKILL_ARENA_RUST_CODE_ANALYSIS_BIN = "C:\tools\rust-code-analysis-cli.exe"
```

Useful follow-up checks:

- inspect the generated JSON for file-level `cognitive`, `cyclomatic`, `halstead`, and `loc` metrics
- rank hotspots by cognitive complexity to identify refactor targets
- rerun after a refactor and compare the changed metric deltas in the merged compare report

### 2. Validate a config

Use this before running a live evaluation if the config changed:

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

### 3. Run an evaluation

Use the main command:

```bash
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml
```

Generate the Promptfoo config without executing the live eval:

```bash
skill-arena evaluate ./benchmarks/<benchmark-id>/compare.yaml --dry-run
```

Scaffold a compare config quickly:

```bash
skill-arena gen-conf --output ./benchmarks/<benchmark-id>/compare.yaml --prompt "Describe the task." --skill-type local-path
```

Matrix evaluation local path contract:

- absolute paths always work
- relative paths are resolved from the current command working directory
- matrix evaluation configs must not depend on package-relative path resolution
- when a relative local path is missing, the evaluator may bootstrap that source tree from packaged fixtures and then materialize a per-scenario workspace
- matrix evaluation bootstrap excludes `AGENTS.md`

Behavior to expect in matrix evaluation mode:

- profiles appear as side-by-side columns in the same Promptfoo eval
- rows are variant and prompt pairs
- `evaluation.requests` controls the pass ratio denominator for each matrix cell
- matrix cells report pass ratio plus total-token aggregates as average and standard deviation when token usage is available
- when `rust-code-analysis` is installed, matrix cells also report changed code metrics for modified original files only, aggregated as average and standard deviation per changed metric
- unsupported adapters are listed as skipped entries in the merged report
- unsupported profile capability bundles are rendered as `unsupported` cells instead of aborting the evaluation run

### 4. Run the maintained sample config

Use the config kept in this repository:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

### 4a. Recommended validation flow after runtime changes

Use this short sequence when you change the runner, Promptfoo integration, workspace materialization, or assertion translation:

```bash
npm test
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

What this covers:

- `npm test` catches unit-level regressions in config generation and result normalization
- `val-conf` confirms the config still parses cleanly
- `evaluate --dry-run` confirms workspace materialization and Promptfoo config generation still work

All evaluation commands:

- materialize an isolated workspace under `results/`
- materialize `workspace.sources` in declaration order
- resolve the skill from local path, Git, inline files, or the system-installed environment when configured
- generate a Promptfoo config for the selected evaluation
- execute the configured adapter through the custom Promptfoo provider
- write `promptfoo-results.json` and `summary.json`
- write a merged summary and report for compare runs

If your config uses an `llm-rubric` assertion, Promptfoo also runs the judge model configured on that assertion.

If the assertion uses `skill-arena:judge:codex`, `skill-arena:judge:copilot-cli`, or `skill-arena:judge:pi`, Promptfoo runs the packaged local custom provider instead of a hosted model API.

If your config uses Git-backed workspace or skill sources, the harness downloads them before the agent run. The agent itself still follows the declared sandbox and network settings.

If your config uses `task.prompts`, Promptfoo evaluates every prompt variant and applies `requests` to each one.

If `maxConcurrency` is omitted in a compare config, the harness uses the local machine parallelism by default. That resolved value also governs the pre-eval workspace materialization phase.

## Where To Inspect Results

Each run writes artifacts under:

```text
results/<benchmark-id>/<timestamp>-compare/
```

The most useful files are:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`

For matrix evaluation runs, inspect:

- `results/<benchmark-id>/<timestamp>-compare/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-compare/summary.json`
- `results/<benchmark-id>/<timestamp>-compare/merged/report.md`

At the end of `skill-arena evaluate` in matrix evaluation mode, the CLI prints the artifact paths for the summary and merged report.

For profile-isolation validation after runtime changes, add at least one matrix-evaluation dry-run that:

- uses `comparison.profiles`
- includes one empty baseline profile with `inheritSystem: false`
- includes one explicit capability profile
- includes one intentionally unsupported capability family and verifies the cell is reported as `unsupported`
