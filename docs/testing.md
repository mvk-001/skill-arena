# Testing

## Prerequisites

- Node.js 24 or newer
- `npm install`
- Local Codex CLI available on `PATH` as `codex`
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
- resolve the skill overlay from a local path or clone it from Git when configured
- generate a Promptfoo config for the selected scenario
- execute Codex through the custom Promptfoo provider
- write `promptfoo-results.json` and `summary.json`

If your manifest uses an `llm-rubric` assertion, Promptfoo also runs the judge model configured on that assertion.

If your manifest uses a Git skill overlay, the harness downloads it before the agent run. The agent itself still follows the scenario sandbox and network settings.

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

## Latest validated results

Validated on March 13, 2026 in `America/New_York` on Windows with:

- Promptfoo `0.121.2`
- Node `v24.14.0`
- Codex via the `command` backend
- model `gpt-5.1-codex-mini`

The run artifact paths below are local validation outputs under the ignored `results/` directory.

### Unit and manifest checks

- `npm test`: passed, `9/9` tests
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

## Notes from validation

- The live benchmark now uses `reasoningEffort: "low"` because the active Codex backend in this environment rejected `"minimal"`.
- Codex emitted non-fatal warnings on stderr about PowerShell shell snapshots and model personality fallback. They did not prevent successful benchmark completion.
