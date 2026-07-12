# Skill Arena

Skill Arena is a CLI-first benchmark harness for measuring whether coding
agents perform better with or without explicit capability bundles under the
same task, workspace, and execution constraints.

It uses Promptfoo as the execution engine, but benchmark authors work with
declarative Skill Arena YAML instead of raw Promptfoo configuration.

## What it compares

A compare evaluation defines:

- one or more exact task prompts
- an isolated workspace assembled from declared sources
- assertions that determine success
- capability profiles such as `no-skill` and `skill`
- agent variants such as Codex, Copilot CLI, Pi, OpenCode, Claude Code, or
  Gemini CLI
- a request count for repeated executions

The runtime expands those inputs into a matrix:

- rows: `prompt x variant`
- columns: profiles
- cells: repeated executions with normalized results and artifacts

The recommended checked-in filename is
`evaluations/<benchmark-id>/evaluation.yaml`. `compare.yaml` remains a valid
name when a standalone workflow calls for it.

## Quick start

### Requirements

- Node.js 24 or newer
- Git on `PATH`
- at least one supported local agent CLI installed and authenticated

```bash
git clone <repo-url>
cd skill-arena
npm install
```

Validate and dry-run the maintained example:

```bash
npx . val-conf ./evaluations/skill-arena-config-author/evaluation.yaml
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run
```

Run it when the dry-run is clean:

```bash
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
```

Generate a starter config:

```bash
npx . gen-conf \
  --output ./evaluations/my-benchmark/evaluation.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the main architecture is covered." \
  --requests 3 \
  --skill-type local-path
```

## Core concepts

| Term | Meaning |
| --- | --- |
| Workspace | Files materialized into a fresh isolated run directory. |
| Profile | The capability bundle under comparison, such as `no-skill` or `skill`. |
| Variant | The agent adapter, model, and runtime settings used for a row. |
| Requests | The repeated executions performed for each matrix cell. |

The normal workflow is:

1. Author or update one evaluation config.
2. Run `skill-arena val-conf`.
3. Run `skill-arena evaluate --dry-run`.
4. Run `skill-arena evaluate`.
5. Inspect the normalized report under `results/`.

## Documentation

Start at the [documentation index](./docs/README.md), or go directly to:

- [Usage guide](./docs/usage.md) for the authoring and execution workflow
- [CLI reference](./docs/cli-reference.md) for commands and options
- [Architecture](./docs/architecture.md) for runtime design
- [Configuration specs](./docs/specs.md) for canonical contracts
- [Testing](./docs/testing.md) for validation sequences

Executable examples:

- [Maintained compare evaluation](./evaluations/skill-arena-config-author/evaluation.yaml)
- [Skill-following smoke evaluation](./evaluations/smoke-skill-following/evaluation.yaml)
- [Copilot CLI smoke evaluation](./evaluations/copilot-cli-smoke-compare/evaluation.yaml)

## Result artifacts

Compare runs write to:

```text
results/<benchmark-id>/<timestamp>-compare/
├── promptfooconfig.yaml
├── promptfoo-results.json
├── summary.json
└── merged/
    ├── merged-summary.json
    └── report.md
```

`summary.json` is the stable machine-readable result. `merged/report.md` is the
primary human-readable comparison.

## Repository map

| Path | Responsibility |
| --- | --- |
| `bin/skill-arena.js` | Installed CLI entry point. |
| `src/` | Runtime, adapters, materialization, Promptfoo generation, and normalization. |
| `test/` | Unit and integration-style CLI tests. |
| `evaluations/` | Maintained benchmark configs, fixtures, and report snapshots. |
| `skills/` | Skills maintained and benchmarked by this repository. |
| `docs/` | User and contributor documentation. |
| `.specs/adr/` | Architecture decision records. |
| `results/` | Generated run artifacts; ignored by Git. |

## Supported adapters

- `codex`
- `copilot-cli`
- `pi`
- `opencode`
- `claude-code`
- `gemini-cli`

Adapter control surfaces are not identical. See
[effective runtime isolation](./docs/architecture.md#effective-runtime-isolation)
and [compare capability families](./docs/specs.md#compare-capability-families)
before interpreting cross-agent results as equivalent.
