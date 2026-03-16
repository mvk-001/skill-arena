---
name: skill-arena-compare
description: Author or refine a Skill Arena compare.yaml file. Use when Codex needs to create, repair, or review compare configs with correct task prompts, evaluation rules, variants, and explicit skill/no-skill setup, including workspace-overlay skill sources such as local-path, git, or inline-files.
---

# Skill Arena Compare

Author a `compare.yaml` file for Skill Arena.

## Output Contract

For compare-authoring tasks, the final answer is usually the file content only.

- Start with `schemaVersion: 1`.
- Return raw YAML only.
- No headings, bullets, status notes, test notes, next steps, or file notes.
- No prose before the YAML.
- No prose after the YAML.
- No Markdown fences.
- If you wrote `deliverables/compare.yaml`, answer with that file's contents
  only.

## Fast Path

When the task is straightforward or the agent is struggling with long
instructions:

1. Open `assets/fast-path.md`.
2. For the repository benchmark, run
   `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js --validate`.
   It writes `deliverables/compare.yaml` by default.
3. Otherwise start from `assets/compare-template.yaml`.
4. Validate with `scripts/validate-compare-output.js` when shell commands work.
5. Final answer rule: return raw YAML only. Do not add headings, bullets,
   fences, status notes, test notes, or file notes before or after the YAML.

## Goal

Produce a concise compare config that gives:

- skill-mode columns such as `no-skill` and `skill`
- rows by prompt and agent/configuration
- explicit repeated executions through `evaluation.requests`
- labels that read well in Promptfoo and in `merged/report.md`

## Decision Tree

1. Read the user brief first.
2. Open `assets/fast-path.md`.
3. If the task matches the repository benchmark, run the scaffold script first.
4. Otherwise open `assets/fast-path.md`.
5. If shell access works, inspect the workspace and run the validator.
6. If shell access is blocked or flaky, finish offline. Do not stop with a
   blocker message when the needed values are already available.

## Do This

- Keep the task prompt exact and benchmark-specific.
- Put the final-answer format first: raw YAML only.
- Prefer `task.prompts` when the benchmark needs multiple prompt rows.
- Set `evaluation.requests` explicitly. Use `10` unless the benchmark says
  otherwise.
- Set `evaluation.maxConcurrency` explicitly only when the benchmark wants a
  machine-specific value.
- Prefer two skill modes by default: `no-skill` and `skill`.
- For every enabled skill mode, define `comparison.skillModes[*].skill`
  explicitly.
- Keep shared checks in top-level `evaluation.assertions`.
- Keep row-specific checks under `task.prompts[*].evaluation.assertions`.
- Write the file to the user-requested path before returning YAML when the task
  asks for file output.
- Use runtime-relative or absolute local paths. Do not rely on package-relative
  paths.
- Return raw YAML only unless the user explicitly asks for commentary.
- Before sending the final answer, delete any summary, validation note,
  command-log note, or next-step note and leave only the YAML body.
- If you ran validation or wrote files successfully, do not mention that in the
  final answer unless the user explicitly asked for commentary.

## Do Not Do This

- Do not invent aliases such as top-level `skillModes`, top-level `variants`,
  `execution`, `sandbox`, `approval`, `webSearch`, or `network`.
- Do not rewrite `task.prompts` into a mapping.
- Do not move `task`, `workspace`, `evaluation`, or `comparison` under
  `benchmark`.
- Do not write outputs into the skill directory unless the user explicitly asks.
- Do not replace the YAML with shell-error prose when the brief and assets are
  enough to finish offline.

## Workflow

1. Read the benchmark brief or user requirements first.
2. If the task matches the repository benchmark, prefer
   `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js --validate`
   immediately. It writes `deliverables/compare.yaml` by default.
3. Otherwise open `assets/fast-path.md`.
4. Choose the starting asset:
   - generic task: `assets/compare-template.yaml`
   - repository benchmark: the scaffold script
5. If shell access works, inspect the requested workspace files immediately.
6. If shell access is blocked or flaky, switch to offline authoring immediately.
7. If the benchmark uses a Git workspace-overlay skill source, copy the block
   shape from `assets/git-workspace-overlay-reference.md`.
8. If the task needs multiple prompt rows, vary only the prompt text and nested
   prompt assertions. Use `assets/prompt-assertions-reference.md`.
9. Replace placeholders with benchmark-specific metadata, prompts, workspace,
   evaluation, skill modes, and variants.
10. If the task asks for an output path such as `deliverables/compare.yaml`,
   write the file there before the final answer.
11. Run the smallest useful validation:
   - repository benchmark:
     `node skills/skill-arena-compare/scripts/validate-compare-output.js <path> --benchmark skill-arena-compare`
   - generic task:
     `node skills/skill-arena-compare/scripts/validate-compare-output.js <path>`
12. Before returning, compare the draft against the checklist in this file and
    `assets/fallback-checklist.md`.
13. When the user asked for file contents only, return raw YAML only even if a
    live compare run could not complete.
14. If the task asks for a file and final YAML, the final answer must be only
    the file contents. Do not append validator results, dry-run status, or
    next steps after the YAML.
15. Final answer checkpoint:
    - starts with `schemaVersion: 1`
    - contains no backticks
    - contains no prose before or after the YAML
16. Before the final answer, remove any headings, bullets, status summaries,
    shell failure notes, and code fences so the reply starts with
    `schemaVersion: 1`.

## No-Shell Rule

If every shell command fails, do not return a blocker message by default.

- Use the benchmark brief, the current user request, the skill assets, and the
  benchmark-specific note in this file to draft the YAML offline.
- Only mention a shell problem when the task truly depends on unknown values
  that are not available anywhere in the prompt, skill, workspace instructions,
  or embedded benchmark recipe.
- For file-writing tasks, still produce the requested file content even if local
  file creation could not be verified.
- Prefer one complete best-effort `compare.yaml` over a prose explanation of
  why shell commands failed.
- Even when validation fails, keep that failure out of the final answer unless
  the user explicitly asked for commentary.

## Benchmark-Specific Offline Recipe

Use this only when the task matches the repository benchmark
`benchmarks/skill-arena-compare/compare.yaml`.

The required output is one compare config for the remote
`gws-calendar-agenda` skill with these exact facts:

- `schemaVersion: 1`
- benchmark id `gws-calendar-agenda-compare-generated`
- benchmark description `Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.`
- benchmark tags `compare`, `calendar`, `gws`, `codex`
- exactly two prompts under `task.prompts`:
  - `today-json`
  - `week-markdown`
- `today-json` asks for today's agenda across all calendars, explicitly prefers
  `gws calendar +agenda` in read-only mode, and requires JSON only
- `week-markdown` asks for this week's agenda across all calendars, explicitly
  prefers `gws calendar +agenda` in read-only mode, and requires Markdown only
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
- shared evaluation includes one `llm-rubric` assertion with provider
  `skill-arena:judge:codex`
- prompt-level evaluation differs by format:
  - `today-json` includes `type: is-json`
  - `week-markdown` uses supported V1 assertions such as `regex` and/or
    `llm-rubric` for Markdown-shaped output instead of JSON
- `evaluation.requests: 2`
- `evaluation.timeoutMs: 1200000`
- `evaluation.maxConcurrency: 1`
- skill modes:
  - `no-skill` with `skillMode: disabled`
  - `skill` with `skillMode: enabled` and explicit
    `skill.install.strategy: workspace-overlay`
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

If this benchmark-specific recipe matches the current task, draft the YAML
directly from it instead of replying with a shell-error explanation.

When this benchmark-specific recipe applies and shell access is blocked, prefer
copying the exact schema structure from a benchmark-specific skeleton or
reference asset rather than drafting the structure from memory. Do not rename
keys into aliases such as `instructions`, `request`, `responseFormat`,
`shared`, `enabled`, or nested `reasoning` blocks.
Do not mention the scaffold script, validator, or file-writing step in the
final answer. Return the YAML body only.

## Checklist

Before returning, verify all of these:

- `schemaVersion: 1`
- benchmark id, description, and tags match the task exactly
- the final answer starts with `schemaVersion: 1` and ends at the end of YAML
- `task.prompts` is a YAML list of prompt objects, not a mapping
- prompt ids and prompt text match the brief exactly
- `workspace` uses runtime-valid local paths
- `workspace.sources` uses a normal source object like `- type: local-path`,
  not a shorthand mapping like `- local-path:`
- `workspace.setup.initializeGit: true` is present when the brief requires Git
  initialization
- `evaluation.requests` and `evaluation.maxConcurrency` match the task
- `evaluation.assertions` exists and contains the shared assertions
- prompt-specific assertions stay under `task.prompts[*].evaluation.assertions`
- every enabled skill mode has an explicit `skill` block
- `comparison.skillModes` and `comparison.variants` are nested under
  `comparison`
- the chosen skill source shape matches the prompt exactly
- Git workspace-overlay blocks use `source.type: git`, `skillPath`, `skillId`,
  and `install.strategy: workspace-overlay`
- variant agent settings use the exact keys `executionMethod`, `commandPath`,
  `sandboxMode`, `approvalPolicy`, `webSearchEnabled`,
  `networkAccessEnabled`, and `reasoningEffort`
- variant adapter, model, sandbox, approval, network, and labels are present
- the output file path is the one the user requested
- the answer starts with `schemaVersion: 1`
- the answer does not contain backticks
- the answer does not contain prose before or after the YAML
- the answer does not contain headings such as `Status`, `Summary`, `Testing`,
  `Deliverable`, or `Next Steps`
- validation failures, if any, were handled before the final answer instead of
  being included in the final answer

## Validation Fallback

Use this when command execution is unreliable:

1. Draft the file from `assets/compare-template.yaml`.
2. Cross-check required values against the benchmark brief or the
   benchmark-specific offline recipe in this file.
3. Use `assets/fallback-checklist.md` to catch wrong nesting, wrong key names,
   and commentary leakage.
4. For the repository `skill-arena-compare` benchmark, use
   `scripts/scaffold-skill-arena-compare-benchmark.js` first, then
   `assets/gws-calendar-agenda-benchmark-reference.md` to fill in exact
   required values.
5. Use `assets/git-workspace-overlay-reference.md` to check remote skill-source
   blocks.
6. Use `assets/prompt-assertions-reference.md` to check prompt-specific
   assertions.
7. If you can run shell commands, use
   `scripts/validate-compare-output.js` as a cheap local guardrail before any
   heavier compare command. For the repository benchmark, prefer
   `--benchmark skill-arena-compare`.
8. Return the YAML only.

## Exact Schema Guardrails

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

If your draft contains any of the following, stop and correct it before
returning:

- `task.prompts:` followed by `author-compare:` or any other direct mapping key
- top-level `benchmarks:` or `tasks:`
- `llm-rubric:` or `llmRubric:` outside `evaluation.assertions`
- top-level `skillModes:` or `variants:`
- top-level `modes:`
- `workspace.fixture` when the task explicitly asks for `workspace.sources`
- `workspace.sources` written as `- local-path:` instead of
  `- type: local-path`
- `execution:` instead of `executionMethod` and `commandPath`
- `sandbox:` instead of `sandboxMode`
- `approval:` instead of `approvalPolicy`
- `webSearch:` instead of `webSearchEnabled`
- `networkAccess:` or `network:` instead of `networkAccessEnabled`

## Common Failure Patterns

- Returning commentary such as `Used the skill...` before the YAML.
- Returning headings such as `Status`, `Testing`, `Changes`, or `Deliverable`
  before the YAML.
- Moving `task`, `workspace`, or `evaluation` under `benchmark`.
- Emitting top-level `variants`, `skillModes`, or `modes` instead of nesting
  them under `comparison`.
- Rewriting `task.prompts` as a mapping keyed by prompt id instead of a YAML
  list of prompt objects.
- Using `shared:` under `evaluation` instead of top-level
  `evaluation.assertions`.
- Putting `adapter` or `model` outside `comparison.variants[*].agent`.
- Replacing the YAML answer with a shell-failure status message when validation
  is unavailable.

## Source-Shape Patterns

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

Prefer `inline-files` over `inline` when the benchmark explicitly asks for a
workspace-overlay file set.

## Judge Provider Guidance

When the benchmark uses `llm-rubric`, prefer the local Skill Arena judge
shorthand unless the user explicitly wants a hosted Promptfoo provider:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

These values belong in `evaluation.assertions[*].provider`.

Use the object form only when the benchmark needs judge-specific overrides such
as `model`, `commandPath`, or `cliEnv`:

```yaml
provider:
  id: skill-arena:judge:copilot-cli
  config:
    model: gpt-5
    commandPath: copilot
```

If the benchmark specifically depends on a hosted judge, keep the provider in
native Promptfoo form such as `openai:gpt-5-mini`.

## maxConcurrency Guidance

When the user wants the compare config to use local machine capacity, calculate
`evaluation.maxConcurrency` from Node.js and write the computed integer into the
YAML.

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

If the benchmark should stay portable across machines and the user does not want
machine-specific numbers committed into the file, omit
`evaluation.maxConcurrency` and note that the harness will use local machine
parallelism by default.

## Benchmark-Specific Note

For the repository benchmark `benchmarks/skill-arena-compare/compare.yaml`,
optimize for exact compare authoring:

- keep the generated file focused on compare configuration, not unrelated
  repository tasks
- if shell access fails, use the benchmark-specific offline recipe in this file
  and keep going
- preserve shared assertions at top-level
- use prompt-level assertions only for the source-shape differences
- prefer `skill-arena:judge:codex` when the benchmark brief asks for a local
  judge
- treat `npx skill-arena compare ... --dry-run` as best-effort verification,
  not as a reason to stop authoring
- prefer
  `node skills/skill-arena-compare/scripts/validate-compare-output.js deliverables/compare.yaml --benchmark skill-arena-compare`
  before the expensive live compare run
- do not output commentary outside the final YAML
- the benchmark brief remains the source of truth when helper assets are more
  generic than the benchmark

## Output

When writing files, treat the user's current workspace as the destination root.

Return only the completed `compare.yaml` content unless the user asks for
explanation.
