---
name: skill-arena-config-author
description: Generate, repair, and validate Skill Arena compare.yaml files. Use when Codex needs to author benchmark configs with correct task prompts, evaluation rules, variants, explicit no-skill versus one-or-many skill alternatives, and workspace-overlay skill bundles sourced from local-path, git, inline, or inline-files.
---

# Skill Arena Config Author

Generate and validate `compare.yaml` files for Skill Arena.

## Output Contract

For compare-authoring tasks, the final answer is usually the file content only.

- Start with `schemaVersion: 1`.
- Return raw YAML only.
- No headings, bullets, status notes, test notes, next steps, or file notes.
- No prose before the YAML.
- No prose after the YAML.
- No Markdown fences.
- If the draft starts with commentary instead of `schemaVersion: 1`, delete the
  commentary and keep only the YAML body.
- If you wrote `deliverables/compare.yaml`, answer with that file's contents
  only.

## Preferred Evaluation Layout

When the user does not provide a different destination, prefer this repository
layout:

```text
evaluations/<skill-name>/evaluation.yaml
evaluations/<skill-name>/fixtures/workspaces/...
evaluations/<skill-name>/last_report.md
```

Use it like this:

- write the main compare config to `evaluations/<skill-name>/evaluation.yaml`
- put benchmark-specific workspace fixtures under
  `evaluations/<skill-name>/fixtures/workspaces/<workspace-name>/`
- reserve `evaluations/<skill-name>/last_report.md` for the latest human
  execution summary after running the evaluation

This is the preferred convention, not a hard requirement. If the user asks for
another path, follow the user path exactly.

## Fast Path

When the task is straightforward or the agent is struggling with long
instructions:

1. Open `assets/fast-path.md`.
2. For the repository benchmark, run
   `node skills/skill-arena-config-author/scripts/scaffold-skill-arena-compare-benchmark.js --validate`.
   It writes `deliverables/compare.yaml` by default.
3. For generic compare tasks, prefer
   `node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js`.
   - See full usage and examples in
     `assets/scaffold-compare-from-prompts.md`.
4. Otherwise start from `assets/compare-template.yaml`.
5. Validate with `scripts/validate-compare-output.js` when shell commands work.
6. Final answer rule: return raw YAML only. Do not add headings, bullets,
   fences, status notes, test notes, or file notes before or after the YAML.

## Goal

Produce a concise compare config that gives:

- profile columns such as `no-skill`, `skill`, `skill-alternative-1`, or other explicit alternatives
- rows by prompt and agent/configuration
- explicit repeated executions through `evaluation.requests`
- labels that read well in Promptfoo and in `merged/report.md`

## Supported Surface Checklist

Before drafting, map the request against the full V1 compare surface this skill
is supposed to cover.

Workspace source types:

- `local-path`
- `git`
- `inline-files`
- `empty`

Skill source types:

- `local-path`
- `git`
- `inline`
- `inline-files`
- `system-installed`
- disabled baseline normalized to `none`

Assertion types:

- `equals`
- `contains`
- `icontains`
- `regex`
- `is-json`
- `javascript`
- `file-contains`
- `llm-rubric`

Capability families:

- `instructions`
- `skills`
- `agents`
- `hooks`
- `mcp`
- `extensions`
- `plugins`

Adapter support:

- `codex`: `instructions`, `skills`
- `copilot-cli`: `instructions`, `skills`, `agents`, `hooks`
- `pi`: `skills`
- `opencode`: `instructions`, `skills`, `agents`

If the user asks for a capability family that a chosen adapter does not
support, still model it explicitly. The compare run should surface that cell as
`unsupported` instead of hiding the requested setup.

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
- Prefer two profiles by default: one isolated `no-skill` profile and one explicit skill profile.
- When the user wants to compare multiple alternatives at once, add as many explicit profiles as needed, for example `skill-alternative-1`, `skill-alternative-2`, and `skill-alternative-3`.
- For every capability profile, define the capability under
  `comparison.profiles[*].capabilities` explicitly.
- Inside `capabilities.skills`, each entry must use the exact shape
  `- source: ...` plus `install: ...`. Do not wrap it inside an extra
  `skill:` object.
- Use `inline-files` when the skill is really a bundle, not just a bare `SKILL.md`.
- Use `inline` only when one small skill can be expressed directly; otherwise
  use `inline-files`.
- In skill bundles, include every required support file explicitly, for example `AGENTS.md`, `skills/<skill-id>/SKILL.md`, `skills/<skill-id>/references/*`, and `skills/<skill-id>/scripts/*`.
- Always include at least one explicit `workspace.sources` entry when the task
  provides a base fixture or workspace path. Do not replace it with
  `sources: []` when the prompt gives a concrete fixture.
- Support the full declared V1 source surface when the task asks for it:
  workspace `local-path`, `git`, `inline-files`, `empty`; skill `local-path`,
  `git`, `inline`, `inline-files`, `system-installed`.
- Support capability families beyond `skills` when the prompt asks for them,
  especially `instructions`, `agents`, and `hooks`.
- Keep shared checks in top-level `evaluation.assertions`.
- Keep row-specific checks under `task.prompts[*].evaluation.assertions`.
- Keep shared assertions schema-level and row-agnostic. Do not make top-level
  checks depend on one prompt's required workspace source type, profile set, or
  capability family when other prompt rows intentionally exercise different
  shapes.
- Make output format requirements explicit in the prompt and enforce them with
  prompt-level assertions when different rows expect different formats.
- When a prompt names a specific remote skill or bundle, assert the exact
  identifying fields that make it that artifact, such as `repo`, `ref`,
  `skillPath`, `skillId`, and install strategy, instead of checking only a
  generic source type.
- When a prompt asks for an explicit control profile or a fixed set of profiles,
  assert that those profile ids are present and the count matches the request.
- When a prompt asks for a specific variant or a fixed set of variants, assert
  the expected variant ids are present and the count matches the request.
- Prefer assertions that reject partial compare configs. If the prompt asks for
  two profiles, one variant, or one workspace base source, do not accept an
  output that only includes a subset and happens to satisfy a few field checks.
- When a prompt specifies an exact set of workspace sources, assert the source
  types and count that were requested instead of only checking that one desired
  source appears somewhere.
- When a prompt specifies shared assertions explicitly, assert that the required
  assertion types are present in the shared `evaluation.assertions` block and,
  when the set is closed in the prompt, that no required item is missing.
- When the benchmark asks for file output, prefer file-aware assertions such as
  `file-contains`, `javascript`, or `llm-rubric` over checking only the final
  chat response.
- When the user does not specify an output path, prefer
  `evaluations/<skill-name>/evaluation.yaml` over ad hoc names such as
  `deliverables/compare.yaml`.
- When proposing local fixtures, prefer
  `evaluations/<skill-name>/fixtures/workspaces/<workspace-name>/`.
- Write the file to the user-requested path before returning YAML when the task
  asks for file output.
- Use runtime-relative or absolute local paths. Do not rely on package-relative
  paths.
- Return raw YAML only unless the user explicitly asks for commentary.
- Before sending the final answer, delete any summary, validation note,
  command-log note, or next-step note and leave only the YAML body.
- If you ran validation or wrote files successfully, do not mention that in the
  final answer unless the user explicitly asked for commentary.
- When working in an autonomous loop for this repository, run
  `node skills/skill-arena-config-author/scripts/run-rust-analyzer-hook.js` before
  declaring the iteration complete.

## Do Not Do This

- Do not invent aliases such as top-level `skillModes`, top-level `variants`,
  `execution`, `sandbox`, `approval`, `webSearch`, or `network`.
- Do not rename the isolated baseline profile to `baseline` when the task asks
  for `no-skill`.
- Do not rename the enabled profile to a custom skill-specific id when the task
  asks for `skill`.
- Do not collapse multiple requested alternatives back into only `no-skill` plus one `skill` profile.
- Do not silently drop requested capability families because some adapters may
  report them as unsupported.
- Do not rewrite `task.prompts` into a mapping.
- Do not move `task`, `workspace`, `evaluation`, or `comparison` under
  `benchmark`.
- Do not use alias keys inside assertions such as `pattern:` or `rubric:`. In
  V1 assertions, keep the payload under `value:`.
- Do not write outputs into the skill directory unless the user explicitly asks.
- Do not replace the YAML with shell-error prose when the brief and assets are
  enough to finish offline.

## Workflow

1. Read the benchmark brief or user requirements first.
2. If the task matches the repository benchmark, prefer
   `node skills/skill-arena-config-author/scripts/scaffold-skill-arena-compare-benchmark.js --validate`
   immediately. It writes `deliverables/compare.yaml` by default.
3. Otherwise open `assets/fast-path.md`.
5. For faster authoring, you can use the prompt-based scaffold:
   `node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js`.
6. Choose the starting asset:
   - generic task: `assets/compare-template.yaml`
   - repository benchmark: the scaffold script
7. If shell access works, inspect the requested workspace files immediately.
6. If shell access is blocked or flaky, switch to offline authoring immediately.
7. If the benchmark uses a Git workspace-overlay skill source, copy the block
   shape from `assets/git-workspace-overlay-reference.md`.
8. Expand the request against the supported-surface checklist in this file:
   - workspace source types
   - skill source types
   - assertion types
   - capability families
   - adapter compatibility
9. If the task needs multiple skill alternatives, add one profile per alternative instead of trying to encode alternatives inside one profile.
10. If the task needs multiple prompt rows, vary only the prompt text and nested
   prompt assertions. Use `assets/prompt-assertions-reference.md`.
11. Replace placeholders with benchmark-specific metadata, prompts, workspace,
   evaluation, profiles, and variants.
12. Design the evaluation inputs before finalizing YAML:
   - write prompts that request one concrete observable outcome
   - choose or propose fixtures that expose only the files needed for that task
   - when the user did not pick a layout, place those fixtures under
     `evaluations/<skill-name>/fixtures/workspaces/`
   - use layered `workspace.sources` intentionally when a shared base fixture
     needs a tiny benchmark-specific override
   - use `inline-files` to create synthetic fixtures when a small purpose-built
     benchmark is clearer than reusing a large repository tree
   - make sure the baseline fixture remains meaningful without the skill
13. If the task asks for an output path such as `deliverables/compare.yaml`,
   write the file there before the final answer.
14. Run the smallest useful validation:
   - repository benchmark:
     `node skills/skill-arena-config-author/scripts/validate-compare-output.js <path> --benchmark skill-arena-compare`
   - generic task:
     `node skills/skill-arena-config-author/scripts/validate-compare-output.js <path>`
15. Before returning, compare the draft against the checklist in this file and
    `assets/fallback-checklist.md`.
16. When the user asked for file contents only, return raw YAML only even if a
    live compare run could not complete.
17. If the task asks for a file and final YAML, the final answer must be only
    the file contents. Do not append validator results, dry-run status, or
    next steps after the YAML.
18. Final answer checkpoint:
    - starts with `schemaVersion: 1`
    - contains no backticks
    - contains no prose before or after the YAML
19. Before the final answer, remove any headings, bullets, status summaries,
    shell failure notes, and code fences so the reply starts with
    `schemaVersion: 1`.

## Evaluation Design Guidance

When the user wants help evaluating something well, do not stop at wiring
profiles and variants. Propose prompts and fixtures that make the evaluation
discriminative.

Prompt design:

- Prefer prompts with one observable deliverable.
- State the required output format directly in the prompt.
- Name the target file path when the task writes artifacts.
- Split materially different tasks into separate `task.prompts` rows.
- Keep the prompt identical across profiles so the compare remains fair.

Fixture design:

- Prefer a small benchmark-specific fixture over a large noisy repository.
- Include only the files the agent should rely on.
- When the user does not provide another convention, place those fixtures under
  `evaluations/<skill-name>/fixtures/workspaces/`.
- Use `local-path` when the fixture already exists locally.
- Use `git` when inputs must be pinned to a repo/ref.
- Use `inline-files` when a tiny synthetic fixture is clearer inside the YAML.
- Use `empty` only when the benchmark intentionally starts blank.

Assertion design:

- Use `is-json` only when the prompt truly requires JSON.
- Use `regex` or `contains` for stable format cues, not broad semantic grading.
- Use `file-contains` when the task writes files into the workspace.
- Use `javascript` when assertions must inspect multiple fields or files.
- Use `llm-rubric` when exact matching would be brittle.
- Mix shared and prompt-level assertions deliberately instead of duplicating
  the same checks everywhere.
- Shared assertions should protect invariant schema structure only.
- Prompt-level assertions should carry the prompt-specific source shapes,
  profile ids, adapters, and capability-family expectations.
- Prompt-level assertions should also carry exact profile-count and variant-count
  expectations whenever the prompt names a closed set.
- Prompt-level assertions should carry exact workspace-source-count expectations
  whenever the prompt names a closed set of sources.
- If one row asks for `workspace.sources` with `git` or `empty`, do not keep a
  shared assertion that forces every row to use `local-path`.

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
`evaluations/skill-arena-config-author/evaluation.yaml`.

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
  - `path: evaluations/gws-calendar-agenda-compare/fixtures/workspaces/base`
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
- profiles:
  - `no-skill` with `isolation.inheritSystem: false` and `capabilities: {}`
  - `skill` with `isolation.inheritSystem: false` and explicit
    `capabilities.skills[*].install.strategy: workspace-overlay`
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
- every enabled capability profile has an explicit capability block
- `comparison.profiles` and `comparison.variants` are nested under
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
  profiles:
    - id: no-skill
      description: ...
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill-alternative-1
      description: ...
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
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
- top-level `profiles:` or `variants:`
- top-level `modes:`
- `workspace.fixture` when the task explicitly asks for `workspace.sources`
- `workspace.sources` written as `- local-path:` instead of
  `- type: local-path`
- `execution:` instead of `executionMethod` and `commandPath`
- `sandbox:` instead of `sandboxMode`
- `approval:` instead of `approvalPolicy`
- `webSearch:` instead of `webSearchEnabled`
- `networkAccess:` or `network:` instead of `networkAccessEnabled`

## Environment Variable Support

`workspace.setup.env` and `agent.cliEnv` support arbitrary key-value pairs passed
to the provider at runtime. Values may contain the `$WORKSPACE` or
`${WORKSPACE}` placeholder, which is replaced with the absolute path of the
materialized execution workspace.

### workspace.setup.env

Use `workspace.setup.env` for environment variables shared by every scenario or
compare cell. Example:

```yaml
workspace:
  setup:
    initializeGit: true
    env:
      MY_CONFIG: "$WORKSPACE/config/settings.json"
      DATA_DIR: "${WORKSPACE}/data"
      STATIC_FLAG: "1"
```

### agent.cliEnv (variant-level)

Use `agent.cliEnv` inside a variant or scenario for per-agent environment
overrides. Example:

```yaml
variants:
  - id: codex-mini
    agent:
      adapter: codex
      model: gpt-5.1-codex-mini
      cliEnv:
        TOOL_PATH: "$WORKSPACE/bin/tool"
        DEBUG: "true"
```

### Precedence

Environment variables are merged in this order (later wins):

1. `workspace.setup.env`
2. `agent.cliEnv`
3. Isolation environment (internal, set by the harness)

`$WORKSPACE` interpolation applies after the merge, so it works in values from
any of these sources.

## Common Failure Patterns

- Returning commentary such as `Used the skill...` before the YAML.
- Returning headings such as `Status`, `Testing`, `Changes`, or `Deliverable`
  before the YAML.
- Moving `task`, `workspace`, or `evaluation` under `benchmark`.
- Emitting top-level `variants`, `profiles`, or `modes` instead of nesting
  them under `comparison`.
- Rewriting `task.prompts` as a mapping keyed by prompt id instead of a YAML
  list of prompt objects.
- Using `shared:` under `evaluation` instead of top-level
  `evaluation.assertions`.
- Using `pattern:` or `rubric:` under assertions instead of `value:`.
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

Compare profile form:

```yaml
comparison:
  profiles:
    - id: no-skill
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
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
      - path: AGENTS.md
        content: |
          # Example bundle instructions
      - path: skills/my-skill/SKILL.md
        content: |
          ---
          name: my-skill
          description: Example skill.
          ---
      - path: skills/my-skill/references/checklist.md
        content: |
          Use this checklist before answering.
      - path: skills/my-skill/scripts/helper.sh
        content: |
          echo helper
  install:
    strategy: workspace-overlay
```

Prefer `inline-files` over `inline` when the benchmark explicitly asks for a
workspace-overlay file set or when the skill depends on support files beyond
`SKILL.md`.

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

For the repository benchmark `evaluations/skill-arena-config-author/evaluation.yaml`,
optimize for exact compare authoring:

- keep the generated file focused on compare configuration, not unrelated
  repository tasks
- if shell access fails, use the benchmark-specific offline recipe in this file
  and keep going
- preserve shared assertions at top-level
- use prompt-level assertions only for the source-shape differences
- prefer `skill-arena:judge:codex` when the benchmark brief asks for a local
  judge
- treat `npx skill-arena evaluate ... --dry-run` as best-effort verification,
  not as a reason to stop authoring
- prefer
  `node skills/skill-arena-config-author/scripts/validate-compare-output.js deliverables/compare.yaml --benchmark skill-arena-compare`
  before the expensive live compare run
- do not output commentary outside the final YAML
- the benchmark brief remains the source of truth when helper assets are more
  generic than the benchmark

## Output

When writing files, treat the user's current workspace as the destination root.

Return only the completed `compare.yaml` content unless the user asks for
explanation.
