# Skill Arena

Skill Arena is a CLI-first benchmark harness for comparing coding agents under the same task, workspace, and constraint conditions.

Use it to measure whether an agent performs better:

- with or without a skill
- across different adapters or models
- under isolated capability profiles such as `baseline` and `skill`
- with reproducible workspaces and stable result artifacts

Execution runs through Promptfoo, but benchmark authoring stays in Skill Arena manifests and compare configs.

## What You Can Do

- Run scenario benchmarks from `manifest.yaml` files.
- Run side-by-side matrix evaluations from `compare.yaml` files.
- Materialize clean per-run workspaces from local, inline, or Git sources.
- Compare adapters such as `codex`, `copilot-cli`, and `pi`.
- Generate deterministic artifacts under `results/` for review and reporting.

## Quick Start

### Requirements

- Node.js 24+
- `git` on `PATH`
- Local `codex` CLI installed and authenticated
- Optional: local `copilot` CLI on `PATH` for `copilot-cli` variants

### Install

```bash
git clone <repo-url>
cd skill-arena
npm install
```

### Run the maintained example

```bash
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

### Validate a config

```bash
npx . val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

### Generate a starter compare config

```bash
npx . gen-conf \
  --output ./benchmarks/my-benchmark/compare.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the answer covers the main architecture." \
  --requests 3 \
  --skill-type local-path
```

## Start Here

If you are new to the repository, this is the shortest path:

1. Read [Usage Guide](./docs/usage.md) for the common workflows.
2. Open [maintained compare benchmark](./benchmarks/skill-arena-compare/compare.yaml) for a concrete example.
3. Use [Specs](./docs/specs.md) when you need field-level rules.
4. Use [Testing](./docs/testing.md) when you are changing runtime code or benchmark definitions.

## Choose The Config Shape

- Use `manifest.yaml` for scenario-oriented runs.
- Use `compare.yaml` for one matrix evaluation with profile columns and variant/prompt rows.

Examples in this repository:

- [Maintained compare benchmark](./benchmarks/skill-arena-compare/compare.yaml)
- [Smoke benchmark](./benchmarks/smoke-skill-following/compare.yaml)
- [Copilot smoke benchmark](./benchmarks/copilot-cli-smoke-compare/compare.yaml)

## Result Artifacts

Runs write predictable artifacts under `results/`.

Scenario runs write to:

```text
results/<benchmark-id>/<timestamp>-<scenario-id>/
```

Compare runs write to:

```text
results/<benchmark-id>/<timestamp>-compare/
```

Most useful files:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`
- `merged/report.md` for compare runs

## Documentation

- [Usage Guide](./docs/usage.md): common commands and authoring flow
- [Specs](./docs/specs.md): canonical schema and normalization rules
- [Architecture](./docs/architecture.md): execution model and adapter/runtime design
- [Testing](./docs/testing.md): validation loop, coverage, and live benchmark checks

## Supported Adapters

- `codex`
- `copilot-cli`
- `pi`
