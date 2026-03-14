# Usage Guide

This guide shows the shortest path to benchmark a skill with:

- one task prompt
- one fixture workspace
- an optional skill overlay
- one or more agent/model scenarios
- repeated runs
- Promptfoo assertions, including an LLM judge

The goal is to let you define the benchmark once in a manifest and then run a single command.

## 1. Create a fixture workspace

Put the starting repository state under `fixtures/<benchmark-id>/base/`.

This directory is copied into an isolated run workspace for every scenario. The fixture must be safe to copy and must never be modified in place during benchmark execution.

Example:

```text
fixtures/repo-summary/base/
```

## 2. Add the skill overlay

If you want to measure a skill-enabled run, define a separate overlay that is copied on top of the base fixture only when a scenario uses `skillMode: "enabled"`.

You can source that overlay in two ways:

- local path inside the repository
- remote Git repository plus an optional `subpath`

This means you can benchmark a skill directly from a Git link without installing it globally on the machine first. The harness downloads the overlay, copies it into the isolated workspace, and then runs the agent against that workspace.

Typical contents:

```text
fixtures/repo-summary/skill-overlay/
  AGENTS.md
  skills/repo-summarizer/SKILL.md
```

Local overlay example:

```yaml
workspace:
  fixture: fixtures/repo-summary/base
  skillOverlay:
    path: fixtures/repo-summary/skill-overlay
  initializeGit: true
```

Remote Git overlay example:

```yaml
workspace:
  fixture: fixtures/repo-summary/base
  skillOverlay:
    git:
      repo: https://github.com/example/skills.git
      ref: main
      subpath: bundles/repo-summarizer
  initializeGit: true
```

## 3. Define the benchmark manifest

Create `benchmarks/<benchmark-id>/manifest.yaml`.

This file is the main authoring surface. YAML is the recommended format because it is easier to read and edit. JSON is also supported for compatibility. Put these pieces in it:

- `task.prompt`: the exact prompt sent to the agent
- `workspace.fixture`: the base fixture path
- `workspace.skillOverlay`: the local overlay path or remote Git overlay source for skill-enabled runs
- `scenarios[*].agent.model`: the model to benchmark
- `scenarios[*].skillMode`: whether the skill overlay is active
- `scenarios[*].evaluation.repeat`: how many times to repeat the scenario
- `scenarios[*].evaluation.assertions`: how Promptfoo scores the output

Example:

```yaml
schemaVersion: 1
benchmark:
  id: repo-summary
  description: Compare baseline and skill-assisted repository summaries.
  tags:
    - codex
    - skills
    - summary
task:
  prompt: >-
    Read the repository and write a concise summary of the architecture,
    the main commands, and the known risks.
workspace:
  fixture: fixtures/repo-summary/base
  skillOverlay:
    git:
      repo: https://github.com/example/skills.git
      ref: main
      subpath: bundles/repo-summarizer
  initializeGit: true
scenarios:
  - id: codex-mini-no-skill
    description: Baseline without the skill overlay.
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
          metric: expected-answer-quality
          threshold: 0.8
          provider: openai:gpt-5-mini
          value: >-
            Score 1.0 only if the answer covers the expected architecture,
            commands, and risks. The expected answer should mention the benchmark
            manifest as the authoring surface, isolated workspaces under results/,
            Promptfoo as the evaluation runtime, and the live run command pattern.
      repeat: 3
      timeoutMs: 180000
      tracing: false
      maxConcurrency: 1
      noCache: true
    output:
      tags:
        - baseline
        - mini
      labels:
        skill: off
  - id: codex-mini-with-skill
    description: Same task with the skill overlay.
    skillMode: enabled
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
          metric: expected-answer-quality
          threshold: 0.8
          provider: openai:gpt-5-mini
          value: >-
            Score 1.0 only if the answer covers the expected architecture,
            commands, and risks. The expected answer should mention the benchmark
            manifest as the authoring surface, isolated workspaces under results/,
            Promptfoo as the evaluation runtime, and the live run command pattern.
      repeat: 3
      timeoutMs: 180000
      tracing: false
      maxConcurrency: 1
      noCache: true
    output:
      tags:
        - skill
        - mini
      labels:
        skill: on
```

## 4. Validate the manifest

Run:

```bash
npm run validate:manifest -- ./benchmarks/repo-summary/manifest.yaml
```

This catches schema problems before you spend time on live evaluations.

## 5. Run one scenario or all scenarios

Run every scenario in the manifest:

```bash
npm run run:benchmark -- ./benchmarks/repo-summary/manifest.yaml
```

Run only one scenario:

```bash
npm run run:benchmark -- ./benchmarks/repo-summary/manifest.yaml --scenario codex-mini-with-skill
```

What happens during a run:

1. the fixture is copied into a fresh workspace under `results/`
2. if `skillMode` is enabled, the skill overlay is resolved from a local path or cloned from Git
3. a `promptfooconfig.yaml` file is generated for that scenario
4. `promptfoo eval` runs the agent
5. Promptfoo stores raw results
6. Skill Arena writes a normalized `summary.json`

If you set `repeat` to a value greater than `1`, Promptfoo executes repeated trials for that same scenario.

## 6. Inspect the artifacts

Each scenario run writes:

```text
results/<benchmark-id>/<timestamp>-<scenario-id>/
```

The important files are:

- `workspace/`
- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`

`promptfoo-results.json` is the raw Promptfoo export.

`summary.json` is the stable machine-readable file for comparing scenarios, models, and skill modes.

## 7. View the results in Promptfoo

After at least one run, open the Promptfoo web viewer:

```bash
npx promptfoo@latest view
```

The viewer lets you inspect pass/fail status, scores, latency, token usage, and metadata filters.

## Recommended pattern

For most benchmarks, keep configuration in the manifest instead of spreading it across CLI flags. A good default is:

- define the task prompt in `task.prompt`
- define the expected quality in one `llm-rubric` assertion
- define baseline and skill-enabled scenarios side by side
- use `repeat` to measure consistency
- run all scenarios with one command

This keeps the benchmark reproducible and easy to compare across skills and models.

## References

- Promptfoo model-graded metrics: [promptfoo.dev/docs/configuration/expected-outputs/model-graded](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/)
- Promptfoo G-Eval: [promptfoo.dev/docs/configuration/expected-outputs/model-graded/g-eval](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/g-eval/)
- Promptfoo web viewer: [promptfoo.dev/docs/usage/web-ui](https://www.promptfoo.dev/docs/usage/web-ui/)
