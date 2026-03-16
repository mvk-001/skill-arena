---
name: skill-arena-compare
description: Author or refine a Skill Arena compare.yaml file. Use when Codex needs to create, repair, or review compare configs with correct task prompts, evaluation rules, variants, and explicit skill/no-skill setup, including workspace-overlay skill sources such as local-path, git, or inline-files.
---

# Skill Arena Compare

Author a `compare.yaml` file for Skill Arena.

## Goal

Produce a concise compare config that gives:

- skill-mode columns such as `no-skill` and `skill`
- rows by prompt and agent/configuration
- explicit repeated executions through `evaluation.requests`
- labels that read well in Promptfoo and in `merged/report.md`

## Rules

1. Keep the task prompt exact and benchmark-specific.
2. Prefer `task.prompts` over a single `task.prompt` when the benchmark should compare multiple prompt variants.
3. Set `evaluation.requests` explicitly. Use `10` unless the benchmark has a reason to use a different count.
4. Set `evaluation.maxConcurrency` explicitly when the benchmark should scale with local machine capacity. Prefer `80%` of the machine's available parallelism, rounded down, with a minimum of `1`.
5. Prefer two skill modes by default:
   - `no-skill`
   - `skill`
6. For every `skillMode: enabled` entry, define `comparison.skillModes[*].skill` explicitly. Use `source.type: system-installed` with `install.strategy: system-installed` for installed skills, or a concrete `local-path`, `git`, or `inline-files` source for workspace overlays.
7. Give every variant a stable slug id and a readable `output.labels.variantDisplayName`.
8. Keep shared checks in top-level `evaluation.assertions`. When different prompt rows need different checks, append row-specific assertions under `task.prompts[*].evaluation.assertions`.
9. Use prompt-level assertions to distinguish source-shape variants such as `local-path`, `git`, and `inline-files` without duplicating every shared assertion in every prompt.
10. Keep assertions strict enough to measure the benchmark goal, but avoid unnecessary harness instructions in the prompt.
11. Write the final config into the user's current working workspace at the path they requested, such as `./compare.yaml` or `./deliverables/compare.yaml`. Do not write outputs into the skill directory, the repository skill source, or any hidden helper location unless the user explicitly asks for that.
12. Reuse the template in `assets/compare-template.yaml` as the starting point, but replace any stale defaults that do not match the user request.
13. When the output must run outside the current repository root, prefer runtime-relative local paths such as `fixtures/...` when the installed compare runner is expected to bootstrap them into the current working directory, or use absolute paths when the user wants a fixed filesystem location.
14. Do not rely on package-relative path resolution. Compare local paths are only valid when they are absolute or relative to the command working directory at runtime.
15. Return raw YAML only. Do not add Markdown fences, prose before the YAML, or explanations after it unless the user explicitly asks for commentary.
16. Use exact compare schema keys. Do not invent aliases such as `llm-rubric`, `llmRubric`, top-level `skillModes`, top-level `variants`, `execution`, `sandbox`, `approval`, `webSearch`, or `network`.
17. When the brief gives exact prompt ids and exact prompt text, preserve them verbatim inside `task.prompts` list items. Do not rewrite `task.prompts` into a mapping.
18. Keep `task`, `workspace`, `evaluation`, and `comparison` as top-level keys. Do not nest them under `benchmark` and do not emit `benchmarks:` or `tasks:`.
19. If the task says to write a file and return only its contents, write the file first and then return only the raw YAML. Do not mention that you used the skill.

## Workflow

1. Read the benchmark brief or user requirements first.
2. Use the structure in `assets/compare-template.yaml` as the scaffold.
3. Replace the benchmark metadata, prompts, workspace, evaluation, skill modes, and variants with values from the brief.
4. If the task asks for multiple prompt variants that differ by expected skill source shape, keep one shared compare skeleton and vary only the prompt text plus `task.prompts[*].evaluation.assertions`.
5. If the benchmark asks for an explicit output path such as `deliverables/compare.yaml`, write the file there and return only the completed YAML unless the user asks for explanation.
6. Before returning, compare the final draft against the exact schema skeleton below and fix any invented keys or wrong nesting.

## Checklist

Before returning, verify all of these:

- `schemaVersion: 1`
- benchmark id, description, and tags match the task exactly
- `task.prompts` is a YAML list of prompt objects, not a mapping
- prompt ids and prompt text match the brief exactly
- `workspace` uses runtime-valid local paths
- `evaluation.requests` and `evaluation.maxConcurrency` match the task
- `evaluation.assertions` exists and contains the shared assertions
- every enabled skill mode has an explicit `skill` block
- `comparison.skillModes` and `comparison.variants` are nested under `comparison`
- the chosen skill source shape matches the prompt exactly
- variant agent settings use the exact keys `executionMethod`, `commandPath`, `sandboxMode`, `approvalPolicy`, `webSearchEnabled`, `networkAccessEnabled`, and `reasoningEffort`
- variant adapter, model, sandbox, approval, network, and labels are present
- the output file path is the one the user requested
- the answer starts with `schemaVersion: 1`
- the answer does not contain backticks

## Exact schema guardrails

Use this exact shape when authoring compare configs:

```yaml
schemaVersion: 1
benchmark:
  id: ...
  description: ...
  tags:
    - ...
task:
  prompts:
    - id: ...
      description: ...
      prompt: ...
      evaluation:
        assertions:
          - type: contains
            value: ...
workspace:
  fixture: ...
  initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: ...
  requests: 10
  timeoutMs: 180000
  tracing: false
  maxConcurrency: 1
  noCache: true
comparison:
  skillModes:
    - id: no-skill
      description: ...
      skillMode: disabled
    - id: skill
      description: ...
      skillMode: enabled
      skill:
        source:
          type: local-path
          path: ...
          skillId: ...
        install:
          strategy: workspace-overlay
  variants:
    - id: codex-mini
      description: ...
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
        executionMethod: command
        commandPath: codex
        sandboxMode: workspace-write
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

If your draft contains any of the following, stop and correct it before returning:

- `task.prompts:` followed by `author-compare:` or any other direct mapping key
- top-level `benchmarks:` or `tasks:`
- `llm-rubric:` or `llmRubric:` outside `evaluation.assertions`
- top-level `skillModes:` or `variants:`
- top-level `modes:`
- `execution:` instead of `executionMethod` and `commandPath`
- `sandbox:` instead of `sandboxMode`
- `approval:` instead of `approvalPolicy`
- `webSearch:` instead of `webSearchEnabled`
- `networkAccess:` or `network:` instead of `networkAccessEnabled`

## Common failure patterns

- Returning commentary such as `Used the skill...` before the YAML.
- Moving `task`, `workspace`, or `evaluation` under `benchmark`.
- Emitting top-level `variants`, `skillModes`, or `modes` instead of nesting them under `comparison`.
- Rewriting `task.prompts` as a mapping keyed by prompt id instead of a YAML list of prompt objects.

## Source-shape patterns

Use the exact shape the task asks for:

### `local-path`

```yaml
skill:
  source:
    type: local-path
    path: fixtures/example/skills/my-skill
    skillId: my-skill
  install:
    strategy: workspace-overlay
```

### `git`

```yaml
skill:
  source:
    type: git
    repo: https://github.com/example/repo.git
    ref: main
    subpath: .
    skillPath: skills/my-skill
    skillId: my-skill
  install:
    strategy: workspace-overlay
```

### `inline-files`

```yaml
skill:
  source:
    type: inline-files
    files:
      - path: skills/my-skill/SKILL.md
        content: |
          ---
          name: my-skill
          description: Example skill.
          ---
  install:
    strategy: workspace-overlay
```

Prefer `inline-files` over `inline` when the benchmark explicitly asks for a workspace-overlay file set.

## Judge provider guidance

When the benchmark uses `llm-rubric`, prefer the local Skill Arena judge shorthand unless the user explicitly wants a hosted Promptfoo provider:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

These values belong in `evaluation.assertions[*].provider`.

Use the object form only when the benchmark needs judge-specific overrides such as `model`, `commandPath`, or `cliEnv`:

```yaml
provider:
  id: skill-arena:judge:copilot-cli
  config:
    model: gpt-5
    commandPath: copilot
```

If the benchmark specifically depends on a hosted judge, keep the provider in native Promptfoo form such as `openai:gpt-5-mini`.

## maxConcurrency guidance

When the user wants the compare config to use local machine capacity, calculate `evaluation.maxConcurrency` from Node.js and write the computed integer into the YAML.

Preferred Node.js snippet:

```js
import os from "node:os";

const capacity = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : os.cpus().length;

const maxConcurrency = Math.max(1, Math.floor(capacity * 0.8));
console.log(maxConcurrency);
```

PowerShell one-liner:

```powershell
node -e "const os=require('node:os'); const capacity=typeof os.availableParallelism==='function' ? os.availableParallelism() : os.cpus().length; console.log(Math.max(1, Math.floor(capacity * 0.8)));"
```

If the benchmark should stay portable across machines and the user does not want machine-specific numbers committed into the file, omit `evaluation.maxConcurrency` and note that the harness will use local machine parallelism by default.

## Benchmark-specific note

For the repository benchmark `benchmarks/skill-arena-compare/compare.yaml`, optimize for exact compare authoring:

- keep the generated file focused on compare configuration, not unrelated repository tasks
- preserve shared assertions at top-level
- use prompt-level assertions only for the source-shape differences
- prefer `skill-arena:judge:codex` when the benchmark brief asks for a local judge
- do not output commentary outside the final YAML

## Output

When writing files, treat the user's current workspace as the destination root.

Return only the completed `compare.yaml` content unless the user asks for explanation.
