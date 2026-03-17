# Usage Guide

Use `manifest.yaml` when you want scenario-oriented runs. Use `compare.yaml` when you want one Promptfoo eval with:

- skill-mode columns such as `no-skill` and `skill`
- rows by `prompt x agent/configuration`
- per-cell pass ratios such as `40% (4/10)`

In both formats, `evaluation.requests` is the execution count. For compare configs, it defaults to `10` when omitted. `evaluation.maxConcurrency` is optional; when omitted, the harness uses the local machine parallelism.

Use the packaged CLI directly when you prefer a single command shape:

```bash
skill-arena evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
npx . evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
npx skill-arena evaluate ./benchmarks/repo-summary/compare.yaml --dry-run
pnpm exec skill-arena evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
```

## Installation and execution options

- npm install from registry:

```bash
npm install -g skill-arena
skill-arena val-conf ./benchmarks/repo-summary/manifest.yaml
```

- pnpm install from registry:

```bash
pnpm add -g skill-arena
skill-arena val-conf ./benchmarks/repo-summary/manifest.yaml
```

- Local checkout via `npx`:

```bash
npx . evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-with-skill
npx . evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
```

- Local checkout via `pnpm exec` (after `npm install` / `pnpm install`):

```bash
pnpm exec skill-arena evaluate ./benchmarks/repo-summary/compare.yaml --dry-run
pnpm exec skill-arena evaluate ./benchmarks/repo-summary/compare.yaml
```

You can keep one command for both config types:

```bash
skill-arena evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
skill-arena evaluate ./benchmarks/repo-summary/compare.yaml
```

Every command also accepts `--help`:

```bash
skill-arena evaluate --help
skill-arena gen-conf --help
skill-arena val-conf --help
```

`gen-conf` is the compare authoring helper. It writes a commented `compare.yaml` starter with `TODO:` notes for the fields you still need to customize:

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/repo-summary/compare.yaml \
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

For exploratory runs, you can override `evaluation.requests` and `evaluation.maxConcurrency` directly from
the command line:

```bash
skill-arena evaluate ./benchmarks/repo-summary/manifest.yaml --requests 2 --max-concurrency 2 --scenario codex-mini-no-skill
```

Example for the requested exploratory compare run:

```bash
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 1 --maxConcurrency 2
```

Command reference:

- `--requests <n>`: override how many times each prompt is repeated for that run.
- `--max-concurrency <n>`: override `evaluation.maxConcurrency` for that run.
- `--maxConcurrency <n>`: alias accepted by the evaluator CLI for convenience.

`skill-arena --help` prints the top-level help, and `skill-arena help <command>` prints per-command usage.

## Benchmark manifest

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
npm run validate:manifest -- ./benchmarks/repo-summary/manifest.yaml
npm run run:benchmark -- ./benchmarks/repo-summary/manifest.yaml
skill-arena evaluate ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-no-skill
```

If `requests` is greater than `1`, Promptfoo repeats each prompt that many times for the scenario.
In compare mode, the resolved concurrency now applies to both workspace materialization and `promptfoo eval`. If `maxConcurrency` is omitted, the harness uses the local machine parallelism for both phases. Set it explicitly only when you need a stricter cap.

## Compare config

Create `benchmarks/<benchmark-id>/compare.yaml` when you want one Promptfoo eval with multiple skill-mode columns.

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
  skillModes:
    - id: no-skill
      description: Baseline
      skillMode: disabled
    - id: skill
      description: Skill enabled
      skillMode: enabled
      skill:
        source:
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
npm run benchmark:compare -- ./benchmarks/repo-summary/compare.yaml
skill-arena evaluate ./benchmarks/repo-summary/compare.yaml
```

Use `--dry-run` to generate the Promptfoo config without live evaluation:

```bash
npm run benchmark:compare -- ./benchmarks/repo-summary/compare.yaml --dry-run
skill-arena evaluate ./benchmarks/repo-summary/compare.yaml --dry-run
```

For repeated local runs, keep installation out of the hot path. Install once, then run the CLI directly:

```powershell
npm install
npx . evaluate .\benchmarks\repo-summary\compare.yaml --dry-run
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

For compare configs, local paths follow a runtime contract:

- absolute paths are valid
- relative paths are resolved from the current command working directory
- package-relative fallback is not supported
- if a relative local path is missing, compare can bootstrap the runtime-relative directory from a unique packaged fixture match
- bootstrap excludes `AGENTS.md`

If you plan to run `compare.yaml` outside the repository root, use either absolute paths or relative paths that the installed package can bootstrap into the current working directory.

When a compare benchmark needs different checks per prompt row, keep shared assertions at top-level `evaluation.assertions` and add prompt-specific assertions under `task.prompts[*].evaluation.assertions`. Prompt-level assertions are appended to the shared set for that row.

The repository also includes a versioned minimal `copilot-cli` compare benchmark:

```bash
npm run benchmark:copilot:compare
```

It uses one prompt with `requests: 2` and compares `no-skill` versus `skill` against the smoke marker fixture.

What compare mode produces:

- Promptfoo columns by skill mode
- Promptfoo rows by variant and prompt
- `summary.json` with a `matrix` section
- `merged/report.md` with cells like `40% (4/10)`

Legacy compatibility:

- `workspace.fixture` normalizes to the first `workspace.sources` entry
- `workspace.skillOverlay` can still supply the default enabled skill
- `task.prompt` still works and normalizes to a single prompt entry

Preferred explicit skill source options:

- `local-path`: point to one local skill folder containing `SKILL.md`
- `inline`: define one `SKILL.md` directly in YAML
- `git`: clone a repo and select one skill folder with optional `skillPath`

## Repository hygiene

Scenario and compare outputs are generated in `results/` and are not intended to be committed. Do not push the following generated paths:

- `.tmp/`
- `tmp/`
- `coverage/`
- `reports/`
- `results/`
- `node_modules/`
- `deliverables/`
- `skill-arena-*.tgz`
- These paths are ignored in `.gitignore`.

## Artifacts

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
- `merged/merged-summary.json`
- `merged/report.md`

After at least one run, open the Promptfoo web viewer:

```bash
npx promptfoo@latest view
```

## Reusable config-author skill

The repository includes a reusable skill overlay for authoring `compare.yaml` files:

```text
fixtures/skill-arena-compare/skill-overlay/
```

Use it when you want a workspace skill that helps produce:

- a concise compare config
- clear `variantDisplayName` labels
- explicit `evaluation.requests`
- `no-skill` and `skill` columns by default
