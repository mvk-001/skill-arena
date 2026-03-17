# Skill Arena

## What this project is

Skill Arena is a CLI-first benchmark harness to compare agent behavior in controlled conditions.

It supports:

- scenario-based runs via `manifest.*` files
- matrix comparisons via `compare.*` files
- reproducible, isolated execution workspaces
- skill-enabled vs no-skill control paths
- deterministic output artifacts for review and reporting

Execution is routed through Promptfoo with custom local providers for supported adapters.

## Supported adapters

Current adapters:

- `codex`
- `copilot-cli`
- `pi`

## Requirements

- Node.js 24+
- Local `codex` CLI installed and authenticated
- Local `copilot` CLI on `PATH` (only for `copilot-cli` variants)
- `git` available in PATH (for git-based workspace/skill sources)

## Installation and invocation

### Repository development mode

```bash
git clone <your-fork-or-this-repo-url>
cd skill-arena
npm install
```

Run with one of:

```bash
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml
npm run benchmark:copilot:compare
node ./src/cli/skill-arena.js --help
```

### Published package

```bash
# global install
npm install -g skill-arena

# or one-off execution
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

## Quickstart

### 1) Create or load a benchmark definition

- `manifest.*` files define scenario runs.
- `compare.*` files define prompt × adapter/mode matrices.
- Both can be authored in YAML or JSON in the canonical project formats.

Useful references before authoring:

- [Architecture](./docs/architecture.md)
- [Specs](./docs/specs.md)
- [Usage guide](./docs/usage.md)
- [Testing](./docs/testing.md)

### 2) Generate a compare template

Use the built-in generator to bootstrap a `compare.yaml` with guided TODO fields:

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/my-benchmark/compare.yaml \
  --prompt "summarize file A" \
  --evaluation-type javascript \
  --evaluation-value @checks.js \
  --prompt "create an evaluation script" \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the script is present and correct." \
  --requests 3 \
  --maxConcurrency 8 \
  --skill-type git
```

### 3) Run an evaluation

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

### 4) Open the artifacts

Compare runs write:

- `results/<benchmark-id>/<timestamp>-compare/promptfooconfig.yaml`
- `results/<benchmark-id>/<timestamp>-compare/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-compare/summary.json`
- `results/<benchmark-id>/<timestamp>-compare/merged/report.md`

Open the latest merged report (PowerShell):

```powershell
$report = Get-ChildItem .\results\skill-arena-compare\*\merged\report.md |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
Start-Process $report
```

## Repository hygiene

The following paths are generated runtime artifacts and should not be pushed:

- `.tmp/`
- `tmp/`
- `coverage/`
- `reports/`
- `results/`
- `node_modules/`
- `deliverables/`
- `skill-arena-*.tgz`

These paths are ignored in `.gitignore`.

## CLI usage

```bash
skill-arena --help
skill-arena evaluate <manifest-or-compare-path> [--scenario <scenario-id>] [--dry-run]
skill-arena gen-conf --help
skill-arena val-conf --help
```

Useful aliases and one-off runs:

```bash
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx . evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
pnpm exec skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

## Runtime behavior highlights

- Isolation is workspace-centered and per scenario.
- Scenario skill mounting is deterministic and based on the manifest/compare specification.
- `system-installed` skills follow the explicit behavior documented in the manifest model.
- `codex` and `pi` adapters can run with strict default skill scope.
- No task-specific hidden instructions are injected by the harness outside benchmark-defined data.

## Output and reporting

Scenario runs create:

- `results/<benchmark-id>/<timestamp>-<scenario-id>/workspace/`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfooconfig.yaml`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/summary.json`

Compare runs include the merged report and merged summary under:

- `results/<benchmark-id>/<timestamp>-compare/merged/report.md`
- `results/<benchmark-id>/<timestamp>-compare/merged/merged-summary.json`

You can inspect Promptfoo output directly when needed:

```bash
npx promptfoo@latest view
```

## Legacy helper scripts

For workflows that still generate an intermediate Promptfoo config for single scenario manifests:

```bash
npm run generate:config -- ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
```

## Notes

- This repository intentionally ships the CLI runtime surface under `bin/` and `src/`.
- Artifact-driven runs are preferred: keep your benchmark definitions as the source of truth and avoid hidden prompt overrides.
