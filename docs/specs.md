# Specs

## Benchmark manifest

### File format

Benchmark manifests should be authored in YAML for readability. JSON is also supported for compatibility. Paths inside the manifest are repository-root relative.

For an end-to-end authoring example, see [Usage Guide](./usage.md).

### Schema

```yaml
schemaVersion: 1
benchmark:
  id: smoke-skill-following
  description: Short human-readable description
  tags:
    - smoke
    - codex
task:
  prompt: Exact task prompt sent to the agent.
workspace:
  fixture: fixtures/example/base
  skillOverlay:
    path: fixtures/example/skill-overlay
  initializeGit: true
scenarios:
  - id: codex-mini-no-skill
    description: Scenario description
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
        - type: equals
          value: Expected output
      requests: 1
      timeoutMs: 120000
      tracing: false
      maxConcurrency: 1
      noCache: true
```

### Required behavior

- `schemaVersion` must be `1`.
- `benchmark.id` and each `scenario.id` must be slug-like identifiers.
- `workspace.fixture` must exist.
- `workspace.skillOverlay` is required if any scenario uses `skillMode: "enabled"` with `skillSource: "workspace-overlay"`.
- `workspace.skillOverlay` may be:
  - a repository-relative local path string
  - an object with `path`
  - an object with `git.repo`, plus optional `git.ref` and `git.subpath`
- `agent.adapter` must be one of:
  - `codex`
  - `copilot-cli`
  - `pi`
- `skillSource` must be one of:
  - `none`
  - `workspace-overlay`
  - `system-installed`
- `agent.executionMethod` controls how the custom Promptfoo script invokes Codex:
  - `command`: execute the local `codex exec` command
  - `sdk`: invoke `@openai/codex-sdk`, which wraps the local CLI

## Compare config

### File format

Compare configs should be authored in YAML for readability. JSON is also supported for compatibility. Paths inside the config are repository-root relative.

### Supported structure

```yaml
schemaVersion: 1
benchmark:
  id: gws-gmail-triage-compare
  description: Short human-readable description
  tags:
    - compare
task:
  prompt: Exact task prompt sent to every provider.
workspace:
  fixture: fixtures/example/base
  initializeGit: true
evaluation:
  assertions:
    - type: is-json
  requests: 10
  timeoutMs: 180000
  tracing: false
  maxConcurrency: 1
  noCache: true
comparison:
  skillModes:
    - id: no-skill
      description: Baseline without the skill.
      skillMode: disabled
    - id: skill
      description: Skill-enabled run.
      skillMode: enabled
      skillSource: system-installed
  variants:
    - id: codex-worst
      description: Codex comparison variant.
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
```

### Required behavior

- `schemaVersion` must be `1`.
- `comparison.skillModes[*].id` and `comparison.variants[*].id` must be slug-like identifiers.
- `evaluation.requests` is the execution count per compare cell.
- The compare runner expands the Cartesian product of `comparison.skillModes` and `comparison.variants`.
- Each expanded unit must resolve a `skillSource`:
  - `disabled` resolves to `none`
  - `enabled` resolves to the explicit `skillSource` when provided
  - `enabled` defaults to `workspace-overlay` when `workspace.skillOverlay` exists
  - otherwise `enabled` defaults to `system-installed`
- `workspace.skillOverlay` is required if any enabled compare skill mode resolves to `workspace-overlay`.
- The compare runner must materialize a separate workspace per supported expanded unit.
- The compare runner must execute one Promptfoo eval with:
  - Promptfoo providers keyed by skill mode
  - Promptfoo test rows keyed by variant and prompt
- Unsupported adapters must be reported as skipped comparison entries instead of aborting the whole compare run.
- Provider labels in compare mode should prefer concise skill mode ids such as `no-skill` and `skill`.
- Compare reports should show rows as `prompt x variant` and columns as skill modes.
- Compare cells should report pass ratios against the requested execution count, for example `40% (4/10)`.

## Supported assertion types in V1

V1 supports these manifest assertion types:

- `equals`
- `contains`
- `icontains`
- `regex`
- `is-json`
- `javascript`
- `file-contains`
- `llm-rubric`

`file-contains` is converted into a Promptfoo JavaScript assertion that reads from the run workspace.

`llm-rubric` passes through to Promptfoo model-graded evaluation so a judge model can score the agent output against an expected answer or rubric. This is the recommended choice when exact string matching is too strict.

## Agent adapter contract

### Input

Each adapter receives:

- the manifest
- the selected scenario
- the run workspace path
- the resolved skill mode
- execution constraints such as sandbox mode, approval policy, web access, and network access

### Output

Each adapter must return a Promptfoo provider definition with:

- provider path or id
- provider label
- provider configuration

The benchmark runner is responsible for executing Promptfoo and writing normalized run outputs.

### V1 adapter support

- `codex`: supported
  - implemented as a Promptfoo custom script
  - supports `executionMethod: "command"` and `executionMethod: "sdk"`
- `pi`: supported
  - implemented as a Promptfoo custom script
  - currently uses `executionMethod: "command"` through the local `pi` CLI
- `copilot-cli`: reserved, not implemented

## Workspace rules

- Source fixtures are immutable inputs.
- Every scenario run gets a fresh workspace copy under `results/`.
- Workspace skill overlays are copied only for `skillMode: "enabled"` with `skillSource: "workspace-overlay"`.
- Workspace skill overlays may come from a local directory or a Git repository reference.
- System-installed skills are not copied into the workspace. Those benchmarks depend on the Codex system skill set already present on the machine.
- Skill overlays may include root instructions and bundled skill folders, for example `AGENTS.md` plus `skills/<skill-id>/SKILL.md`.
- Benchmark execution must never write into `fixtures/`.
- `initializeGit: true` initializes a Git repository in the run workspace so agent providers can operate with their default safety checks.

## Result directories

Each run must produce:

- `results/<benchmark-id>/<timestamp>-<scenario-id>/workspace/`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfooconfig.yaml`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/summary.json`

`summary.json` is the stable machine-readable output for later comparisons across agents and skill modes.

Compare runs must produce:

- `results/<benchmark-id>/<timestamp>-compare/promptfooconfig.yaml`
- `results/<benchmark-id>/<timestamp>-compare/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-compare/summary.json`
- `results/<benchmark-id>/<timestamp>-compare/merged/report.md`
- `results/<benchmark-id>/<timestamp>-compare/merged/merged-summary.json`

Compare `summary.json` must include:

- provider metadata for supported scenario units
- scenario-oriented normalized summaries
- a `matrix` object with:
  - `columns`: skill mode ids and labels
  - `rows`: variant and prompt pairs
  - per-cell aggregates including requested runs, completed runs, pass counts, error counts, and a display string such as `40% (4/10)`

## Minimal execution defaults

Unless a manifest explicitly overrides them, scenarios should use:

- a small model variant
- `executionMethod: "command"`
- `commandPath: "codex"`
- `sandboxMode: "read-only"`
- `approvalPolicy: "never"`
- `webSearchEnabled: false`
- `networkAccessEnabled: false`
- `reasoningEffort: "low"`
- `noCache: true`

The harness must not add task instructions beyond the benchmark prompt and the files available in the workspace.

Exception: benchmarks that exercise external system CLIs may require broader sandbox access than the default. When that is necessary, the manifest must declare the exception explicitly in the scenario.
