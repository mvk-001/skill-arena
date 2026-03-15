# Usage Guide

Use `manifest.yaml` when you want scenario-oriented runs. Use `compare.yaml` when you want one Promptfoo eval with:

- skill-mode columns such as `no-skill` and `skill`
- rows by `prompt x agent/configuration`
- per-cell pass ratios such as `40% (4/10)`

In both formats, `evaluation.requests` is the execution count. `evaluation.maxConcurrency` is optional; when omitted, the harness uses the local machine parallelism.

## Benchmark manifest

Create a fixture under `fixtures/<benchmark-id>/base/`. Add a skill overlay only if the benchmark needs a workspace-injected skill.

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
workspace:
  fixture: fixtures/repo-summary/base
  skillOverlay:
    path: fixtures/repo-summary/skill-overlay
  initializeGit: true
scenarios:
  - id: codex-mini-no-skill
    description: Baseline
    skillMode: disabled
    skillSource: none
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
          provider: openai:gpt-5-mini
          value: Score 1.0 only if the answer covers the main architecture.
      requests: 3
      timeoutMs: 180000
      tracing: false
      noCache: true
  - id: codex-mini-with-skill
    description: Skill enabled
    skillMode: enabled
    skillSource: workspace-overlay
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
          provider: openai:gpt-5-mini
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
```

If `requests` is greater than `1`, Promptfoo repeats each prompt that many times for the scenario.
If `maxConcurrency` is omitted, Promptfoo jobs default to the local machine parallelism. Set it explicitly only when you need a stricter cap.

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
  fixture: fixtures/repo-summary/base
  initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: openai:gpt-5-mini
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
      skillSource: system-installed
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
```

Use `--dry-run` to generate the Promptfoo config without live evaluation:

```bash
npm run benchmark:compare -- ./benchmarks/repo-summary/compare.yaml --dry-run
```

What compare mode produces:

- Promptfoo columns by skill mode
- Promptfoo rows by variant and prompt
- `summary.json` with a `matrix` section
- `merged/report.md` with cells like `40% (4/10)`

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
templates/skill-overlays/compare-config-author/
```

Use it when you want a workspace skill that helps produce:

- a concise compare config
- clear `variantDisplayName` labels
- explicit `evaluation.requests`
- `no-skill` and `skill` columns by default
