# Compare Schema Reference

## Required V1 Shape

Use this nesting:

```yaml
schemaVersion: 1
benchmark:
  id: example-compare
  description: Short human-readable description.
  tags:
    - compare
task:
  prompts:
    - id: natural-summary
      description: Naturalistic repository-summary case.
      prompt: Summarize this repository in output/summary.md.
      evaluation:
        assertions:
          - type: file-contains
            path: output/summary.md
            value: Overview
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/workspaces/summary
      target: /
  setup:
    initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: Score 1.0 only when the requested artifact satisfies the task.
  requests: 10
  timeoutMs: 180000
  tracing: false
  noCache: true
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
              path: skills/example-skill
              skillId: example-skill
            install:
              strategy: workspace-overlay
  variants:
    - id: codex-mini
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

## Source Selection

Workspace source types:

- `local-path`
- `git`
- `inline-files`
- `empty`
- no sources for a source-free evaluation

Skill source types:

- `local-path`
- `git`
- `inline`
- `inline-files`
- `system-installed`
- `none` for the normalized disabled baseline

Use `inline` for one small standalone skill. Use `inline-files` when the bundle
needs `SKILL.md`, references, scripts, root instructions, or other files. Use
runtime-relative or absolute local paths; do not depend on package-relative
resolution.

When a concrete workspace source is provided, preserve it. Do not replace a
real source with `sources: []`. For genuinely source-free tasks, omit
`workspace.sources` or use an empty list rather than inventing a no-op source.

## Profiles and Capabilities

Prefer one isolated `no-skill` control and one explicit `skill` profile by
default. Add one profile for every requested alternative. Never collapse
multiple alternatives into one profile.

Declare capability families explicitly under each profile:

- `instructions`
- `skills`
- `agents`
- `hooks`
- `mcp`
- `extensions`
- `plugins`

Model requested unsupported combinations instead of dropping them. The runner
must expose those cells as `unsupported`.

Current V1 support:

- `codex`: `instructions`, `skills`
- `copilot-cli`: `instructions`, `skills`, `agents`, `hooks`
- `pi`: `skills`
- `opencode`: `instructions`, `skills`, `agents`
- `claude-code`: `instructions`, `skills`, `agents`, `hooks`
- `antigravity-cli`: `instructions`, `skills`

Inside `capabilities.skills`, place `source` and `install` directly under each
list item. Do not add an extra `skill:` wrapper.

## Assertions

Supported V1 assertion types:

- `equals`
- `contains`
- `icontains`
- `regex`
- `is-json`
- `javascript`
- `file-contains`
- `llm-rubric`

Keep invariant checks under top-level `evaluation.assertions`. Put
prompt-specific checks under `task.prompts[*].evaluation.assertions`. Do not
make a shared assertion depend on one row's source shape, format, profile set,
or capability family.

Prefer observable checks:

- `file-contains` for written artifacts
- `javascript` for structured multi-field checks
- `is-json`, `regex`, or exact containment for stable syntax
- `llm-rubric` for semantic quality that exact matching cannot capture

Keep assertion payloads under `value:`. Use local judge ids such as
`skill-arena:judge:codex` unless the user asks for a hosted judge.
