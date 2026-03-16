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
17. Prefer `workspace.sources` plus `workspace.setup.initializeGit` over legacy `workspace.fixture` examples unless the task explicitly asks for the legacy form.

## Workflow

1. Read the benchmark brief or user requirements first.
2. If shell access works, inspect the requested workspace files immediately.
3. If shell access is unavailable, blocked, or flaky, switch to offline authoring immediately. Do not ask the user to unblock the shell when the available prompt, skill, AGENTS instructions, or benchmark-specific note already provide enough information to draft the YAML.
4. Use the structure in `assets/compare-template.yaml` as the scaffold.
5. If the benchmark uses a Git workspace-overlay skill source, copy the block shape from `assets/git-workspace-overlay-reference.md` and then replace only the benchmark-specific values.
6. If the task asks for multiple prompt variants that differ by expected skill source shape, keep one shared compare skeleton and vary only the prompt text plus `task.prompts[*].evaluation.assertions`. Use `assets/prompt-assertions-reference.md` for row-specific assertion patterns.
7. Replace the benchmark metadata, prompts, workspace, evaluation, skill modes, and variants with values from the brief or from the benchmark-specific offline recipe below when that recipe matches the task exactly.
8. If the benchmark asks for an explicit output path such as `deliverables/compare.yaml`, write the file there before preparing the final answer.
9. If shell commands are available, run the smallest useful validation you can:
   - preferred cheap guardrail for this repository benchmark: `node skills/skill-arena-compare/scripts/validate-compare-output.js <path> --benchmark skill-arena-compare`
   - otherwise use the generic guardrail: `node skills/skill-arena-compare/scripts/validate-compare-output.js <path>`
   - only then escalate to the exact benchmark-requested compare command
10. If shell commands are unavailable, blocked, or flaky, continue with offline authoring:
   - use `assets/fallback-checklist.md`
   - for the repository `skill-arena-compare` benchmark, use `assets/gws-calendar-agenda-benchmark-reference.md` as the exact-value source
   - use `assets/git-workspace-overlay-reference.md` for remote skill blocks
   - use `assets/prompt-assertions-reference.md` for prompt-level checks
   - validate against the checklist in this file and the benchmark brief or benchmark-specific offline recipe
   - do not abandon the task just because validation could not run
11. Before returning, compare the final draft against the exact schema skeleton below and fix any invented keys or wrong nesting.
12. When the user asked for the file contents only, return raw YAML only even if validation failed or could not run. Do not prepend status notes, testing summaries, apologies, or fenced code blocks.

## No-Shell Rule

If every shell command fails, do not return a blocker message by default.

- Use the benchmark brief, the current user request, the skill assets, and the benchmark-specific note in this file to draft the YAML offline.
- Only mention a shell problem when the task truly depends on unknown values that are not available anywhere in the prompt, skill, workspace instructions, or embedded benchmark recipe.
- For file-writing tasks, still produce the requested file content even if local file creation could not be verified.
- Prefer one complete best-effort `compare.yaml` over a prose explanation of why shell commands failed.

## Benchmark-Specific Offline Recipe

Use this only when the task matches the repository benchmark `benchmarks/skill-arena-compare/compare.yaml`.

The required output is one compare config for the remote `gws-calendar-agenda` skill with these exact facts:

- `schemaVersion: 1`
- benchmark id `gws-calendar-agenda-compare-generated`
- benchmark description `Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.`
- benchmark tags `compare`, `calendar`, `gws`, `codex`
- exactly two prompts under `task.prompts`:
  - `today-json`
  - `week-markdown`
- `today-json` asks for today's agenda across all calendars, explicitly prefers `gws calendar +agenda` in read-only mode, and requires JSON only
- `week-markdown` asks for this week's agenda across all calendars, explicitly prefers `gws calendar +agenda` in read-only mode, and requires Markdown only
- top-level keys must be exactly:
  - `schemaVersion`
  - `benchmark`
  - `task`
  - `workspace`
  - `evaluation`
  - `comparison`
- `workspace.sources` contains one runtime-relative `local-path` source with:
  - `path: fixtures/gws-calendar-agenda-compare/base`
  - `target: /`
- `workspace.setup.initializeGit: true`
- shared evaluation includes one `llm-rubric` assertion with provider `skill-arena:judge:codex`
- prompt-level evaluation differs by format:
  - `today-json` includes `type: is-json`
  - `week-markdown` uses supported V1 assertions such as `regex` and/or `llm-rubric` for Markdown-shaped output instead of JSON
- `evaluation.requests: 2`
- `evaluation.timeoutMs: 1200000`
- `evaluation.maxConcurrency: 1`
- skill modes:
  - `no-skill` with `skillMode: disabled`
  - `skill` with `skillMode: enabled` and explicit `skill.install.strategy: workspace-overlay`
- enabled skill source uses exactly:
  - `type: git`
  - `repo: https://github.com/googleworkspace/cli.git`
  - `ref: main`
  - `subpath: .`
  - `skillPath: skills/gws-calendar-agenda`
  - `skillId: gws-calendar-agenda`
- one variant `codex-mini` with:
  - `adapter: codex`
  - `model: gpt-5.1-codex-mini`
  - `executionMethod: command`
  - `commandPath: codex`
  - `sandboxMode: danger-full-access`
  - `approvalPolicy: never`
  - `webSearchEnabled: false`
  - `networkAccessEnabled: true`
  - `reasoningEffort: low`
  - `output.labels.variantDisplayName: codex mini`

If this benchmark-specific recipe matches the current task, draft the YAML directly from it instead of replying with a shell-error explanation.

When this benchmark-specific recipe applies and shell access is blocked, prefer copying the exact schema structure from a benchmark-specific skeleton or reference asset rather than drafting the structure from memory. Do not rename keys into aliases such as `instructions`, `request`, `responseFormat`, `shared`, `enabled`, or nested `reasoning` blocks.

## Checklist

Before returning, verify all of these:

- `schemaVersion: 1`
- benchmark id, description, and tags match the task exactly
- `task.prompts` is a YAML list of prompt objects, not a mapping
- prompt ids and prompt text match the brief exactly
- `workspace` uses runtime-valid local paths
- `workspace.sources` uses a normal source object like `- type: local-path`, not a shorthand mapping like `- local-path:`
- `workspace.setup.initializeGit: true` is present when the brief requires Git initialization
- `evaluation.requests` and `evaluation.maxConcurrency` match the task
- `evaluation.assertions` exists and contains the shared assertions
- prompt-specific assertions stay under `task.prompts[*].evaluation.assertions`
- every enabled skill mode has an explicit `skill` block
- `comparison.skillModes` and `comparison.variants` are nested under `comparison`
- the chosen skill source shape matches the prompt exactly
- Git workspace-overlay blocks use `source.type: git`, `skillPath`, `skillId`, and `install.strategy: workspace-overlay`
- variant agent settings use the exact keys `executionMethod`, `commandPath`, `sandboxMode`, `approvalPolicy`, `webSearchEnabled`, `networkAccessEnabled`, and `reasoningEffort`
- variant adapter, model, sandbox, approval, network, and labels are present
- the output file path is the one the user requested
- the answer starts with `schemaVersion: 1`
- the answer does not contain backticks
- the answer does not contain prose before or after the YAML
- validation failures, if any, were handled before the final answer instead of being included in the final answer

## Validation fallback

Use this when command execution is unreliable:

1. Draft the file from `assets/compare-template.yaml`.
2. Cross-check required values against the benchmark brief or the benchmark-specific offline recipe in this file.
3. Use `assets/fallback-checklist.md` to catch wrong nesting, wrong key names, and commentary leakage.
4. For the repository `skill-arena-compare` benchmark, use `assets/gws-calendar-agenda-benchmark-reference.md` to fill in exact required values offline.
5. Use `assets/git-workspace-overlay-reference.md` to check remote skill-source blocks.
6. Use `assets/prompt-assertions-reference.md` to check prompt-specific assertions.
7. If you can run shell commands, use `scripts/validate-compare-output.js` as a cheap local guardrail before any heavier compare command. For the repository benchmark, prefer `--benchmark skill-arena-compare`.
8. Return the YAML only.

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
  sources:
    - id: base
      type: local-path
      path: fixtures/example/base
      target: /
  setup:
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
- `workspace.fixture` when the task explicitly asks for `workspace.sources`
- `workspace.sources` written as `- local-path:` instead of `- type: local-path`
- `llm-rubric:` or `llmRubric:` outside `evaluation.assertions`
- top-level `skillModes:` or `variants:`
- `execution:` instead of `executionMethod` and `commandPath`
- `sandbox:` instead of `sandboxMode`
- `approval:` instead of `approvalPolicy`
- `webSearch:` instead of `webSearchEnabled`
- `networkAccess:` or `network:` instead of `networkAccessEnabled`

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
- if shell access fails, use the benchmark-specific offline recipe in this file and keep going
- preserve shared assertions at top-level
- use prompt-level assertions only for the source-shape differences
- prefer `skill-arena:judge:codex` when the benchmark brief asks for a local judge
- treat `npx skill-arena compare ... --dry-run` as best-effort verification, not as a reason to stop authoring
- prefer `node skills/skill-arena-compare/scripts/validate-compare-output.js deliverables/compare.yaml --benchmark skill-arena-compare` before the expensive live compare run
- do not output commentary outside the final YAML
- the benchmark brief remains the source of truth when helper assets are more generic than the benchmark

## Output

When writing files, treat the user's current workspace as the destination root.

Return only the completed `compare.yaml` content unless the user asks for explanation.
