# Skill Arena

Skill Arena is a CLI-first evaluation harness for comparing coding agents under the same task, workspace, and constraint conditions.

Use it to measure whether an agent performs better:

- with or without a skill
- across multiple skill alternatives in the same compare run
- across different adapters or models
- under isolated capability profiles such as `no-skill`, `skill-alternative-1`, and `skill-alternative-2`
- with reproducible workspaces and stable result artifacts

Execution runs through Promptfoo, but authoring stays in Skill Arena configs.

## What You Can Do

- Run side-by-side evaluations from `compare.yaml` files.
- Compare one control profile against several competing skill bundles in the same matrix.
- Materialize clean per-run workspaces from local, inline, or Git sources.
- Materialize full skill bundles, not just standalone `SKILL.md` files.
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
  --output ./benchmarks/my-eval/compare.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the answer covers the main architecture." \
  --requests 3 \
  --skill-type local-path
```

## Start Here

If you are new to the repository, this is the shortest path:

1. Read [Usage Guide](./docs/usage.md) for the common workflows.
2. Open [maintained compare config](./benchmarks/skill-arena-compare/compare.yaml) for a concrete example.
3. Use [Specs](./docs/specs.md) when you need field-level rules.
4. Use [Testing](./docs/testing.md) when you are changing runtime code or config definitions.

## Config Shape

- Use `compare.yaml` for evaluations with profile columns and variant/prompt rows.

Examples in this repository:

- [Maintained compare config](./benchmarks/skill-arena-compare/compare.yaml)
- [Smoke compare config](./benchmarks/smoke-skill-following/compare.yaml)
- [Copilot smoke compare config](./benchmarks/copilot-cli-smoke-compare/compare.yaml)

## Result Artifacts

Runs write predictable artifacts under `results/`.

Runs write to:

```text
results/<benchmark-id>/<timestamp>-compare/
```

Most useful files:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`
- `merged/report.md`

## Documentation

- [Usage Guide](./docs/usage.md): common `evaluate` and authoring flow
- [Specs](./docs/specs.md): canonical schema and normalization rules
- [Architecture](./docs/architecture.md): execution model and adapter/runtime design
- [Testing](./docs/testing.md): validation loop, coverage, and live evaluation checks

## Supported Adapters

- `codex`
- `copilot-cli`
- `pi`
