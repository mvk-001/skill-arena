# Specs

Read this after [README.md](../README.md). Use [Usage Guide](./usage.md) for examples, [Architecture](./architecture.md) for flow, and [Testing](./testing.md) for the recommended validation sequence.

## Goals

The benchmark configuration must be declarative and skill-agnostic. A manifest or compare config should describe enough information for the harness to:

- materialize a fresh workspace for each run
- resolve the `skill` and `no-skill` environments without hidden repository coupling
- execute multiple prompts across multiple agent configurations
- compare outputs under consistent, reproducible conditions

The repository may contain example fixtures, overlays, and benchmark definitions, but the execution model must not depend on benchmarks being pre-registered in this repository.

Quick links:

- [Benchmark manifest](#benchmark-manifest)
- [Compare config](#compare-config)
- [Supported assertion types in V1](#supported-assertion-types-in-v1)
- [Agent adapter contract](#agent-adapter-contract)
- [Workspace rules](#workspace-rules)
- [Result directories](#result-directories)
- [Minimal execution defaults](#minimal-execution-defaults)

## Benchmark manifest

### File format

Benchmark manifests should be authored in YAML for readability. JSON is also supported for compatibility.

Paths inside the manifest may be:

- repository-root relative
- absolute local paths
- Git-based external references where allowed by the field schema

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
  prompts:
    - id: direct
      prompt: Exact task prompt sent to the agent.
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/example/base
      target: /
  setup:
    initializeGit: true
scenarios:
  - id: codex-mini-no-skill
    description: Scenario description
    skillMode: disabled
    skill:
      source:
        type: none
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
      maxConcurrency: 4
      noCache: true
```

### Required behavior

- `schemaVersion` must be `1`.
- `benchmark.id` and each `scenario.id` must be slug-like identifiers.
- `task` must define either:
  - `prompt` as a single exact prompt string, or
  - `prompts` as a non-empty list of prompt objects
- `task.prompt` is shorthand for a single-entry `task.prompts` list.
- `task.prompts[*].id` should be slug-like when present.
- `workspace` must fully describe how to materialize the run workspace.
- `workspace.sources` is the preferred representation and must be applied in declaration order.
- Each `workspace.sources[*]` entry must declare a `type` and a `target`.
- `workspace.setup` defines post-materialization setup such as Git initialization.
- `agent.adapter` must be one of:
  - `codex`
  - `copilot-cli`
  - `pi`
- For `codex`, `agent.executionMethod` controls how the custom Promptfoo script invokes the local runtime:
  - `command`: execute the local `codex exec` command
  - `sdk`: invoke `@openai/codex-sdk`, which wraps the local CLI
- `copilot-cli` supports only `executionMethod: "command"` in V1.
- `skillMode` must be one of:
  - `disabled`
  - `enabled`
- Each scenario must resolve a skill source explicitly or by normalization rules.
- The harness must be able to build the scenario workspace and skill state from the manifest alone, plus any external references declared in the manifest.

### Workspace model

`workspace` describes how a run workspace is materialized. The harness must create a fresh workspace per scenario run under `results/`.

Preferred structure:

```yaml
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/example/base
      target: /
    - id: helper-files
      type: git
      repo: https://github.com/example/benchmark-assets.git
      ref: main
      subpath: repo-summary/base
      target: /
  setup:
    initializeGit: true
    env:
      EXAMPLE_FLAG: "1"
```

Supported source types in V1:

- `local-path`
  - copy files from a local directory into the materialized workspace
- `git`
  - fetch files from a Git repository, optionally pinned with `ref` and narrowed with `subpath`
- `inline-files`
  - write one or more small files declared directly in the YAML
- `empty`
  - contribute no files and act as an explicit empty source

Common source fields:

- `id`: optional stable identifier
- `type`: required source type
- `target`: required destination path inside the run workspace

Type-specific fields:

- `local-path`
  - `path`
- `git`
  - `repo`
  - optional `ref`
  - optional `subpath`
- `inline-files`
  - `files`
    - each file entry must include `path`
    - file content may be provided as `content`

Required workspace behavior:

- Source inputs are immutable.
- The harness must never mutate local source directories, fetched Git sources, or inline source definitions.
- Sources are applied in order, so later sources may intentionally add or override files written by earlier sources.
- `target` is resolved relative to the materialized workspace root.
- `workspace.setup.initializeGit: true` initializes a Git repository in the run workspace so agent providers can operate with their default safety checks.
- `workspace.setup.env` defines environment variables for provider execution in that run workspace.
- Environment variable values in `workspace.setup.env` and `scenario.agent.cliEnv` support the `$WORKSPACE` placeholder. At runtime, every occurrence of `$WORKSPACE` or `${WORKSPACE}` in a value string is replaced with the absolute path of the materialized execution workspace. This lets benchmark authors declare paths relative to the workspace without knowing the actual runtime directory:

```yaml
workspace:
  setup:
    env:
      MY_CONFIG: "$WORKSPACE/config/settings.json"
      DATA_DIR: "${WORKSPACE}/data"
```

### Skill model

`skillMode` controls whether a skill is available to the agent for a scenario. The skill itself should be described declaratively instead of being inferred from repository structure.

Preferred structure:

```yaml
skillMode: enabled
skill:
  source:
    type: local-path
    path: fixtures/example/skills/repo-summary
  install:
    strategy: workspace-overlay
```

Supported skill source types in V1:

- `none`
- `system-installed`
- `local-path`
  - points to one local skill folder that contains `SKILL.md`
  - optional `skillId` overrides the installed folder name; otherwise the basename of `path` is used
- `inline`
  - defines one skill directly in YAML
  - requires `skillId`
  - writes `SKILL.md` from `content`
  - optional `files` add extra files under that skill folder
- `git`
  - clones a Git repository and selects one skill folder from it
  - `subpath` may narrow the checkout root before selection
  - optional `skillPath` selects the skill folder relative to the cloned root or selected `subpath`
  - optional `skillId` overrides the installed folder name
- `inline-files`
  - legacy compatibility form for full workspace overlays

Supported install strategies in V1:

- `none`
- `workspace-overlay`
- `system-installed`

Required skill behavior:

- `skillMode: disabled` must resolve to an effective skill source of `none`.
- `skillMode: enabled` must resolve to a concrete skill source and install strategy.
- For `workspace-overlay`, the harness copies or writes skill files into the materialized workspace.
- For `system-installed`, the harness does not inject skill files into the workspace and relies on the local agent runtime environment.
- Skill materialization for `enabled` runs must not leak into `disabled` runs.
- Skill definitions may include root instructions and bundled skill folders, for example `AGENTS.md` plus `skills/<skill-id>/SKILL.md`.
- Preferred explicit skill definitions should use exactly one of these three source modes:
  - `local-path`
  - `inline`
  - `git`

Normalization rules for backward-compatible manifests:

- If `skillMode: disabled`, the effective skill config is:

```yaml
skill:
  source:
    type: none
  install:
    strategy: none
```

- If `skillMode: enabled` and `skill` is omitted:
  - use `workspace.skillOverlay` when present and normalize it to:

```yaml
skill:
  source:
    type: local-path
    path: <workspace.skillOverlay path>
  install:
    strategy: workspace-overlay
```

  - otherwise use:

```yaml
skill:
  source:
    type: system-installed
  install:
    strategy: system-installed
```

Legacy compatibility fields still supported in V1:

- `workspace.fixture`
- `workspace.skillOverlay`
- `skillSource`

When present, the harness must normalize these fields into the declarative `workspace.sources` and `skill` forms before execution.

## Compare config

### File format

Compare configs should be authored in YAML for readability. JSON is also supported for compatibility.

Paths inside the config may be absolute local paths, runtime-working-directory-relative local paths, or external Git references according to the field schema.

### Supported structure

```yaml
schemaVersion: 1
benchmark:
  id: gws-gmail-triage-compare
  description: Short human-readable description
  tags:
    - compare
task:
  prompts:
    - id: primary
      prompt: Exact task prompt sent to every provider.
      evaluation:
        assertions:
          - type: contains
            value: Prompt-specific expectation.
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
    - type: is-json
  requests: 10
  timeoutMs: 180000
  tracing: false
  maxConcurrency: 4
  noCache: true
comparison:
  profiles:
    - id: baseline
      description: Fully isolated control.
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill
      description: Skill-enabled run.
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
              type: local-path
              path: fixtures/example/skills/repo-summary
            install:
              strategy: workspace-overlay
  variants:
    - id: codex-worst
      description: Codex comparison variant.
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
```

### Required behavior

- `schemaVersion` must be `1`.
- `comparison.profiles[*].id` and `comparison.variants[*].id` must be slug-like identifiers.
- `evaluation.requests` is the execution count per compare cell.
- When `evaluation.requests` is omitted in a compare config, it defaults to `10`.
- `evaluation.maxConcurrency` is optional. When omitted, the harness uses the local machine parallelism.
- `task.prompts[*].evaluation.assertions` is optional and appends prompt-specific assertions for that row.
- The compare runner expands the Cartesian product of `comparison.profiles` and `comparison.variants`.
- `comparison.profiles[*].isolation.inheritSystem` must resolve to `false` in V1.
- Each expanded unit must resolve:
  - one materialized workspace
  - one explicit capability profile
  - one agent configuration
- The compare runner must materialize a separate workspace per supported expanded unit.
- The compare runner must execute one Promptfoo eval with:
  - Promptfoo providers keyed by profile
  - Promptfoo test rows keyed by variant and prompt
- Unsupported adapters must be reported as skipped comparison entries instead of aborting the whole compare run.
- Unsupported capability bundles must be reported as per-cell `unsupported` entries instead of aborting the whole compare run.
- Provider labels in compare mode should prefer concise profile ids such as `baseline` or `skill`.
- Compare reports should show rows as `prompt x variant` and columns as profiles.
- Compare cells should report pass ratios against the requested execution count, for example `40% (4/10)`.
- When token usage is available, compare cells must also report total-token aggregates for the observed runs, including average and standard deviation.
- When `rust-code-analysis` is available, compare cells may also report per-metric deltas between original and proposed code for modified original files only, including cell-level average and standard deviation for each changed metric.
- Shared compare execution settings such as `requests`, `timeoutMs`, `tracing`, `maxConcurrency`, and `noCache` still come from top-level `evaluation`.

### Compare normalization rules

For each `comparison.profiles[*]` entry:

- The effective runtime starts from deny-all isolation.
- `capabilities.skills` may declare zero, one, or many skills.
- When `capabilities.skills` is empty, the effective legacy skill state resolves to:

```yaml
skill:
  source:
    type: none
  install:
    strategy: none
```

- When `capabilities.skills` contains one skill, the effective legacy skill state resolves to that skill for adapter compatibility.
- Legacy `comparison.skillModes` is still accepted and normalizes into `comparison.profiles`.

### Compare capability families

V1 compare profiles accept these capability families:

- `instructions`
- `skills`
- `agents`
- `hooks`
- `mcp`
- `extensions`
- `plugins`

These capability families are compare-facing abstractions. Adapters may translate them natively or mark them unsupported per cell.

Current compare support in V1:

- `codex`
  - supported: `instructions`, `skills`
  - unsupported: `agents`, `hooks`, `mcp`, `extensions`, `plugins`
- `copilot-cli`
  - supported: `instructions`, `skills`, `agents`, `hooks`
  - unsupported: `mcp`, `extensions`, `plugins`
- `pi`
  - supported: `skills`
  - unsupported: `instructions`, `agents`, `hooks`, `mcp`, `extensions`, `plugins`

Materialized capability rules in V1:

- `instructions`, `agents`, and `hooks` must declare a materializable `source`.
- Capability `source` entries use the same source shapes as workspace materialization:
  - `local-path`
  - `git`
  - `inline-files`
  - `empty`
- For materialized capability sources, `source.target` is required unless `source.type` is `empty`.
- Compare-mode strict isolation does not support system-installed capability bundles.

Adapter-specific V1 rules:

- `copilot-cli` custom agents require exactly one `capabilities.agents[*]` entry per profile.
- `copilot-cli` custom agents require `agentId`.
- Repository-level `copilot-cli` agents should usually materialize files under `.github/agents/`.
- Repository-level `copilot-cli` hooks should usually materialize files under `.github/hooks/`.
- `instructions` for `codex` or `copilot-cli` should usually materialize `AGENTS.md` at the workspace root when you want project instructions in that profile.

Preferred explicit compare skill definitions use the same three source modes:

- `local-path`
- `inline`
- `git`

### Compare local path resolution

For compare configs, local filesystem paths are resolved using this contract:

- absolute local paths are used as-is
- relative local paths are resolved from the current runtime working directory where compare-mode execution runs
- relative local paths are not resolved against the installed package location
- when a relative local path is missing in compare mode, the runner may bootstrap that relative directory from a unique packaged fixture match before workspace materialization

This applies to legacy fields such as `workspace.fixture` and `workspace.skillOverlay` and to declarative `local-path` entries such as `workspace.sources[*].path` and `comparison.profiles[*].capabilities.skills[*].source.path`.

Bootstrap behavior in compare mode:

- bootstrap only applies to relative local paths
- bootstrap copies fixture content into the runtime-relative destination path
- bootstrap prepares only the sources needed by the specific scenario unit
- bootstrap excludes `AGENTS.md` so compare evaluation measures the agent configuration plus prompt rather than injected root instructions

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

Local judge shorthand is also supported in V1 through packaged Promptfoo custom providers:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

These judge providers are separate from the benchmarked agent adapters. They let Promptfoo run `llm-rubric` grading through the local CLI instead of a hosted API provider.

## Agent adapter contract

### Input

Each adapter receives:

- the manifest or compare-derived scenario unit
- the selected scenario or comparison variant
- the run workspace path
- the resolved profile id
- the normalized capability profile
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
- `copilot-cli`: supported
  - implemented as a Promptfoo custom script
  - supports `executionMethod: "command"` through the local `copilot` CLI
  - maps sandbox, network, web, and approval settings on a best-effort basis
- `pi`: supported
  - implemented as a Promptfoo custom script
  - currently uses `executionMethod: "command"` through the local `pi` CLI

## Workspace rules

- Source workspaces, fixtures, overlays, and skill assets are immutable inputs.
- Every scenario run gets a fresh workspace copy under `results/`.
- Benchmark execution must never write into declared local source paths or repository fixture inputs.
- The workspace and skill environment for a run must be derivable from the benchmark YAML plus any external references declared in it.
- System-installed skills are not copied into the workspace.
- Workspace-injected skills are copied or written only for `skillMode: "enabled"` runs that resolve to `workspace-overlay`.
- Compare profiles must default to deny-all isolation and expose only explicitly declared capabilities.
- The harness must not require a benchmark to live under `benchmarks/` in order to run it.

## Result directories

Each run must produce:

- `results/<benchmark-id>/<timestamp>-<scenario-id>/workspace/`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfooconfig.yaml`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/promptfoo-results.json`
- `results/<benchmark-id>/<timestamp>-<scenario-id>/summary.json`

`summary.json` is the stable machine-readable output for later comparisons across agents and profiles.

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
  - `columns`: profile ids and labels
  - `rows`: variant and prompt pairs
  - per-cell aggregates including requested runs, completed runs, pass counts, error counts, token usage aggregates, optional code-metric delta aggregates, and a display string such as `40% (4/10)<br>tokens avg 120, sd 15.5` or `unsupported`

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
- local machine parallelism for `evaluation.maxConcurrency`
- `noCache: true`

The harness must not add task instructions beyond the benchmark prompt and the files available in the workspace.

Exception: benchmarks that exercise external system CLIs may require broader sandbox access than the default. When that is necessary, the manifest must declare the exception explicitly in the scenario.
