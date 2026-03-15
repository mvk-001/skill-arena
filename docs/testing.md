# Testing

## Prerequisites

- Node.js 24 or newer
- `npm install`
- Local Codex CLI available on `PATH` as `codex`
- Local GitHub Copilot CLI available on `PATH` as `copilot` when testing `copilot-cli` scenarios
- Codex authenticated on the machine before running live benchmarks

## What to run

### 1. Run unit tests

These validate manifest parsing, Promptfoo config generation, workspace materialization, and result normalization.

```bash
npm test
```

### 2. Validate a benchmark manifest

Use this before running a live benchmark if the manifest changed.

```bash
npm run validate:manifest -- ./benchmarks/smoke-skill-following/manifest.yaml
```

YAML is the recommended manifest format. JSON also works if needed.

### 3. Run any benchmark manifest

The generic command is:

```bash
npm run run:benchmark -- ./benchmarks/<benchmark-id>/manifest.yaml
```

To run only one scenario:

```bash
npm run run:benchmark -- ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
```

To generate the intermediate Promptfoo config without executing the live eval:

```bash
npm run generate:config -- ./benchmarks/<benchmark-id>/manifest.yaml --scenario <scenario-id>
```

### 3a. Run a compare config

Use this when you want one file to drive one Promptfoo eval with multiple side-by-side providers across adapters, models, and skill modes.

```bash
npm run benchmark:compare -- ./benchmarks/<benchmark-id>/compare.yaml
```

To validate the scenario expansion without executing live evals:

```bash
npm run benchmark:compare -- ./benchmarks/<benchmark-id>/compare.yaml --dry-run
```

Behavior to expect in compare mode:

- skill modes appear as side-by-side columns in the same Promptfoo eval
- rows are variant and prompt pairs
- `evaluation.requests` controls the pass ratio denominator for each compare cell
- unsupported adapters such as reserved V1 adapters are listed as skipped entries in the merged report

For the smoke comparison across Codex and PI:

```bash
npm run benchmark:smoke:compare
```

For the minimal smoke comparison across `copilot-cli` with `no-skill` and `skill`:

```bash
npm run benchmark:copilot:compare
```

### 4. Run the current skill smoke benchmarks

The repository currently ships one live benchmark: `smoke-skill-following`.

Run the no-skill baseline:

```bash
npm run benchmark:smoke:no-skill
```

Run the skill-enabled variant:

```bash
npm run benchmark:smoke:skill
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

If your manifest uses Git-backed workspace or skill sources, the harness downloads them before the agent run. The agent itself still follows the scenario sandbox and network settings.

If your manifest uses `task.prompts`, Promptfoo evaluates every prompt variant and applies `requests` to each one.

If `maxConcurrency` is omitted in a manifest or compare config, the harness uses the local machine parallelism by default.

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

`summary.json` includes a `matrix` section with compare columns, rows, and per-cell pass ratios such as `40% (4/10)`.

## Latest validated results

Validated on March 15, 2026 in `America/New_York` on Windows with:

- Promptfoo `0.121.2`
- Node `v24.14.0`
- Codex via the `command` backend
- Copilot CLI via the `command` backend
- model `gpt-5.1-codex-mini`

The run artifact paths below are local validation outputs under the ignored `results/` directory.

### Unit and manifest checks

- `npm test`: passed, `40/40` tests
- `npm run validate:manifest -- ./benchmarks/smoke-skill-following/manifest.yaml`: passed

### Live smoke benchmark results

#### `codex-mini-no-skill`

- Result: passed
- Output: `ALPHA-42`
- Duration: `24,732 ms`
- Token usage:
  - prompt: `52,548`
  - completion: `1,396`
  - cached: `39,296`
  - total: `53,944`
- Summary path:
  - `results/smoke-skill-following/2026-03-14T00-05-41-853Z-codex-mini-no-skill/summary.json`

#### `codex-mini-with-skill`

- Result: passed
- Output: `ALPHA-42`
- Duration: `8,327 ms`
- Token usage:
  - prompt: `16,337`
  - completion: `78`
  - cached: `8,704`
  - total: `16,415`
- Summary path:
  - `results/smoke-skill-following/2026-03-14T00-05-41-889Z-codex-mini-with-skill/summary.json`

### Live Copilot compare result

#### `copilot-cli-smoke-compare`

- Result: passed
- Rows: `1`
- Requests per cell: `2`
- Matrix:
  - `no-skill`: `100% (2/2)`
  - `skill`: `100% (2/2)`
- Summary path:
  - `results/copilot-cli-smoke-compare/2026-03-15T16-10-05-720Z-compare/summary.json`

## Notes from validation

- The live benchmark now uses `reasoningEffort: "low"` because the active Codex backend in this environment rejected `"minimal"`.
- Codex emitted non-fatal warnings on stderr about PowerShell shell snapshots and model personality fallback. They did not prevent successful benchmark completion.
- The `copilot-cli` provider uses Copilot JSON output mode and extracts the final `assistant.message` content so Promptfoo assertions see only the terminal answer.
