# Usage Guide

Read this after [README.md](../README.md). This page covers the common workflows. Use [Specs](./specs.md) for canonical fields, [Architecture](./architecture.md) for internals, and [Testing](./testing.md) for the validation loop.

Use `manifest.yaml` for scenario-oriented runs. Use `compare.yaml` for one matrix evaluation with profile columns and variant/prompt rows.

## Fast Path

Start with the maintained example:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
pnpm exec skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Useful examples:

- [Maintained evaluation benchmark](../benchmarks/skill-arena-compare/compare.yaml)
- [Smoke evaluation benchmark](../benchmarks/smoke-skill-following/compare.yaml)
- [Copilot evaluation benchmark](../benchmarks/copilot-cli-smoke-compare/compare.yaml)

Every command also accepts `--help`:

```bash
skill-arena evaluate --help
skill-arena gen-conf --help
skill-arena val-conf --help
```

## Common Workflows

### Validate a config

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

### Generate a starter config

`gen-conf` writes a commented `compare.yaml` starter with `TODO:` markers for fields you still need to customize:

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/skill-arena-compare/compare.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the answer covers the main architecture." \
  --requests 3 \
  --skill-type local-path
```

Useful `gen-conf` flags:

- `--prompt <text>`: repeat to create multiple `task.prompts` rows
- `--prompt-description <text>`: optional description for the next prompt
- `--evaluation-type <type>` and `--evaluation-value <value>`: repeat to prefill shared assertions
- `--skill-type <type>`: `git`, `local-path`, `system-installed`, or `inline-files`
- `--workspace-source-type <type>`: `local-path`, `git`, `inline-files`, or `empty`
- `--requests <n>` and `--max-concurrency <n>` / `--maxConcurrency <n>`: prefill evaluation settings
- `--adapter <id>` and `--model <id>`: prefill the first variant

### Override requests or concurrency for a local run

For exploratory runs, override `evaluation.requests` and `evaluation.maxConcurrency` directly from the command line:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 2 --max-concurrency 2
```

Example:

```bash
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 1 --maxConcurrency 2
```

Command reference:

- `--requests <n>`: override how many times each prompt is repeated for that run
- `--max-concurrency <n>`: override `evaluation.maxConcurrency` for that run
- `--maxConcurrency <n>`: alias accepted by the evaluator CLI

## Choose A Config Shape

Use [Specs](./specs.md) for the canonical schema. The examples below are intentionally minimal and focus on authoring shape rather than every supported field.

## Benchmark Manifest

Preferred shape: declare the workspace with `workspace.sources` and declare the skill explicitly per scenario. Legacy `fixture` and `skillOverlay` fields still work, but they are compatibility inputs now.

Minimal shape:

```yaml
schemaVersion: 1
benchmark:
  id: repo-summary
  description: Compare baseline and skill-assisted summaries.
  tags:
    - codex
    - summary
task:
  prompts:
    - id: architecture
      description: Architecture summary
      prompt: Read the repository and summarize the architecture.
      evaluation:
        assertions:
          - type: contains
            value: architecture
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/repo-summary/base
      target: /
  setup:
    initializeGit: true
scenarios:
  - id: codex-mini-no-skill
    description: Baseline
    skillMode: disabled
    agent:
      adapter: codex
      model: gpt-5.1-codex-mini
      executionMethod: command
      commandPath: codex
      sandboxMode: read-only
      approvalPolicy: never
      webSearchEnabled: false
      networkAccessEnabled: false
      reasoningEffort: low
      additionalDirectories: []
      cliEnv: {}
      config: {}
    evaluation:
      assertions:
        - type: llm-rubric
          provider: skill-arena:judge:codex
          value: Score 1.0 only if the answer covers the main architecture.
      requests: 3
      timeoutMs: 180000
      tracing: false
      noCache: true
  - id: codex-mini-with-skill
    description: Skill enabled
    skillMode: enabled
    skill:
      source:
        type: local-path
        path: fixtures/repo-summary/skill-overlay/skills/repo-summary
      install:
        strategy: workspace-overlay
    agent:
      adapter: codex
      model: gpt-5.1-codex-mini
      executionMethod: command
      commandPath: codex
      sandboxMode: read-only
      approvalPolicy: never
      webSearchEnabled: false
      networkAccessEnabled: false
      reasoningEffort: low
      additionalDirectories: []
      cliEnv: {}
      config: {}
    evaluation:
      assertions:
        - type: llm-rubric
          provider: skill-arena:judge:codex
          value: Score 1.0 only if the answer covers the main architecture.
      requests: 3
      timeoutMs: 180000
      tracing: false
      noCache: true
```

Run it:

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

If `requests` is greater than `1`, Promptfoo repeats each prompt that many times for the scenario.
In matrix evaluation mode, the resolved concurrency also applies to workspace materialization. If `maxConcurrency` is omitted, the harness uses the local machine parallelism for both phases.

## Matrix Evaluation Config

Create `benchmarks/<benchmark-id>/compare.yaml` when you want one Promptfoo eval with multiple isolated profile columns.

Minimal shape:

```yaml
schemaVersion: 1
benchmark:
  id: repo-summary-compare
  description: Compare baseline and skill-enabled runs.
  tags:
    - compare
task:
  prompts:
    - id: architecture
      description: Architecture summary
      prompt: Read the repository and summarize the architecture.
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/repo-summary/base
      target: /
  setup:
    initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: Score 1.0 only if the answer covers the main architecture.
  requests: 10
  timeoutMs: 180000
  tracing: false
  noCache: true
comparison:
  profiles:
    - id: baseline
      description: Fully isolated control
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill
      description: Only the declared repo-summary skill
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
              type: inline
              skillId: repo-summary
              content: |
                ---
                name: repo-summary
                ---
                Summarize the repository using the provided workspace files only.
            install:
              strategy: workspace-overlay
  variants:
    - id: codex-mini
      description: Codex mini
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
        executionMethod: command
        commandPath: codex
        sandboxMode: read-only
        approvalPolicy: never
        webSearchEnabled: false
        networkAccessEnabled: false
        reasoningEffort: low
        additionalDirectories: []
        cliEnv: {}
        config: {}
      output:
        labels:
          variantDisplayName: codex mini
```

Run it:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Use `--dry-run` to generate the Promptfoo config without live evaluation:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

If you want to force one machine-wide cap without editing YAML, set `SKILL_ARENA_MAX_PARALLELISM` before running the command.

`llm-rubric` can use either a native Promptfoo provider such as `openai:gpt-5-mini` or a local Skill Arena judge provider:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

You can also use the object form when you need overrides such as `model` or `commandPath`:

```yaml
provider:
  id: skill-arena:judge:copilot-cli
  config:
    model: gpt-5
    commandPath: copilot
```

For matrix evaluation configs, local paths follow a runtime contract:

- absolute paths are valid
- relative paths are resolved from the current command working directory
- package-relative fallback is not supported
- if a relative local path is missing, the evaluator can bootstrap the runtime-relative directory from a unique packaged fixture match
- bootstrap excludes `AGENTS.md`

When a matrix evaluation benchmark needs different checks per prompt row, keep shared assertions at top-level `evaluation.assertions` and add prompt-specific assertions under `task.prompts[*].evaluation.assertions`.

Legacy compatibility:

- `workspace.fixture` normalizes to the first `workspace.sources` entry
- `workspace.skillOverlay` can still supply the default enabled skill
- `task.prompt` still works and normalizes to a single prompt entry
- Legacy `comparison.skillModes` still parses, but new authoring should use `comparison.profiles`

Preferred explicit skill source options:

- `local-path`: point to one local skill folder containing `SKILL.md`
- `inline`: define one `SKILL.md` directly in YAML
- `git`: clone a repo and select one skill folder with optional `skillPath`

## Artifacts

Scenario runs write to:

```text
results/<benchmark-id>/<timestamp>-<scenario-id>/
```

Matrix evaluation runs write to:

```text
results/<benchmark-id>/<timestamp>-compare/
```

Most useful files:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`
- `merged/merged-summary.json`
- `merged/report.md`

After at least one run, open the Promptfoo web viewer:

```bash
npx promptfoo@latest view
```
