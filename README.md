# Skill Arena

Skill Arena is a CLI-first benchmark harness for comparing coding agents under the same task, workspace, and constraint conditions.

Its main job is to answer questions like:

- Does this agent do better with a skill than without one?
- Which of several skill bundles performs best on the same task?
- How does the same benchmark behave across adapters such as `codex`, `copilot-cli`, or `pi`?

Skill Arena uses Promptfoo as the execution engine, but benchmark authors work in Skill Arena configs instead of raw Promptfoo YAML.

## What Skill Arena Evaluates

Skill Arena is compare-first. The common unit is a `compare.yaml` file that defines:

- the benchmark prompt or prompt set
- the workspace files each run receives
- the evaluation assertions
- one or more agent variants
- one or more isolated capability profiles, such as `no-skill` and one or more skill-enabled alternatives

At runtime, Skill Arena expands that config into a matrix:

- rows: `prompt x variant`
- columns: profiles
- cells: repeated executions plus normalized pass/fail and artifact output

This makes it easy to compare a control profile against several competing skill bundles in one run.

## Quick Start

### Requirements

- Node.js 24+
- `git` on `PATH`
- local `codex` CLI installed and authenticated
- optional: local `copilot` CLI on `PATH` for `copilot-cli` variants

### Install

```bash
git clone <repo-url>
cd skill-arena
npm install
```

### Validate the maintained example

```bash
npx . val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

### Generate the Promptfoo config without running agents

```bash
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

### Run the maintained example

```bash
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
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

## Mental Model

If you are new to the repo, keep these four terms straight:

- `workspace`: the files materialized into the isolated run directory
- `profile`: the capability bundle being compared, such as `no-skill` or `skill-alternative-1`
- `variant`: the agent setup being tested, such as `codex` with a specific model
- `requests`: how many repeated executions each matrix cell runs

The most common workflow is:

1. Author or edit one `compare.yaml`.
2. Run `skill-arena val-conf`.
3. Run `skill-arena evaluate --dry-run`.
4. Run `skill-arena evaluate`.
5. Inspect `results/<benchmark-id>/<timestamp>-compare/summary.json` and `merged/report.md`.

## Start Here

Use this reading order:

1. [Usage Guide](./docs/usage.md) for the day-to-day workflow.
2. [Architecture](./docs/architecture.md) for the execution model.
3. [Specs](./docs/specs.md) for the canonical schema and normalization rules.
4. [Testing](./docs/testing.md) for the validation loop after code or config changes.

Concrete repository examples:

- [Maintained compare config](./benchmarks/skill-arena-compare/compare.yaml)
- [Smoke compare config](./benchmarks/smoke-skill-following/compare.yaml)
- [Copilot compare config](./benchmarks/copilot-cli-smoke-compare/compare.yaml)

## Common Commands

Validate a config:

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

Run a dry-run:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

Run a live compare:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Override repeat count or concurrency for one local run:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 2 --max-concurrency 2
```

Reuse unchanged profile outputs in compare mode:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --reuse-unchanged-profiles
```

## Result Artifacts

Compare runs write predictable artifacts under:

```text
results/<benchmark-id>/<timestamp>-compare/
```

The most useful files are:

- `promptfooconfig.yaml`: the generated Promptfoo config
- `promptfoo-results.json`: raw Promptfoo output
- `summary.json`: normalized machine-readable Skill Arena summary
- `merged/report.md`: human-readable compare report
- `merged/merged-summary.json`: merged compare summary payload

## Repository Map

The repository is intentionally CLI-first:

- `bin/skill-arena.js`: installed CLI entrypoint
- `src/`: runtime code for config loading, workspace materialization, adapters, Promptfoo config generation, and result normalization
- `benchmarks/`: maintained benchmark examples
- `docs/`: user and contributor documentation
- `test/`: unit tests for the runtime surface
- `results/`: generated run artifacts

## Supported Adapters

V1 supports these benchmarked agent adapters:

- `codex`
- `copilot-cli`
- `pi`
