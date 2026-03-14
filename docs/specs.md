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
      repeat: 1
      timeoutMs: 120000
      tracing: false
      maxConcurrency: 1
      noCache: true
    output:
      tags:
        - codex
        - baseline
      labels:
        skill: off
```

### Required behavior

- `schemaVersion` must be `1`.
- `benchmark.id` and each `scenario.id` must be slug-like identifiers.
- `workspace.fixture` must exist.
- `workspace.skillOverlay` is required if any scenario uses `skillMode: "enabled"`.
- `workspace.skillOverlay` may be:
  - a repository-relative local path string
  - an object with `path`
  - an object with `git.repo`, plus optional `git.ref` and `git.subpath`
- `agent.adapter` must be one of:
  - `codex`
  - `copilot-cli`
  - `pi`
- `agent.executionMethod` controls how the custom Promptfoo script invokes Codex:
  - `command`: execute the local `codex exec` command
  - `sdk`: invoke `@openai/codex-sdk`, which wraps the local CLI

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
- `copilot-cli`: reserved, not implemented
- `pi`: reserved, not implemented

## Workspace rules

- Source fixtures are immutable inputs.
- Every scenario run gets a fresh workspace copy under `results/`.
- Skill overlays are copied only for `skillMode: "enabled"`.
- A skill overlay may come from a local directory or a Git repository reference.
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
