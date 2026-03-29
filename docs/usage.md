# Usage Guide

Read this after [README.md](../README.md). This page covers the common workflows around `evaluate` and `compare.yaml`. Use [Specs](./specs.md) for canonical fields, [Architecture](./architecture.md) for internals, and [Testing](./testing.md) for the validation loop.

## Fast Path

Start with the maintained example:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
pnpm exec skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Useful examples:

- [Maintained evaluation config](../benchmarks/skill-arena-compare/compare.yaml)
- [Smoke evaluation config](../benchmarks/smoke-skill-following/compare.yaml)
- [Copilot evaluation config](../benchmarks/copilot-cli-smoke-compare/compare.yaml)

Every command also accepts `--help`:

```bash
skill-arena evaluate --help
skill-arena gen-conf --help
skill-arena val-conf --help
```

## Common Workflows

### Validate a config

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

### Generate a starter config

`gen-conf` writes a commented `compare.yaml` starter with `TODO:` markers for fields you still need to customize:

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/skill-arena-compare/compare.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the answer covers the main architecture." \
  --requests 3 \
  --skill-type local-path
```

Useful `gen-conf` flags:

- `--prompt <text>`: repeat to create multiple `task.prompts` rows
- `--prompt-description <text>`: optional description for the next prompt
- `--evaluation-type <type>` and `--evaluation-value <value>`: repeat to prefill shared assertions
- `--skill-type <type>`: `git`, `local-path`, `system-installed`, or `inline-files`
- `--workspace-source-type <type>`: `local-path`, `git`, `inline-files`, or `empty`
- `--requests <n>` and `--max-concurrency <n>` / `--maxConcurrency <n>`: prefill evaluation settings
- `--adapter <id>` and `--model <id>`: prefill the first variant

### Override requests or concurrency for a local run

For exploratory runs, override `evaluation.requests` and `evaluation.maxConcurrency` directly from the command line:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 2 --max-concurrency 2
```

Example:

```bash
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 1 --maxConcurrency 2
```

Command reference:

- `--requests <n>`: override how many times each prompt is repeated for that run
- `--max-concurrency <n>`: override `evaluation.maxConcurrency` for that run
- `--maxConcurrency <n>`: alias accepted by the evaluator CLI
- `--reuse-unchanged-profiles`: in compare mode, reuse the latest matching profile outputs when the prompt, workspace inputs, agent config, and profile capabilities are unchanged

### Reuse unchanged compare profiles

When you are iterating on only one compare profile, for example editing `skill-alternative-2` while leaving `no-skill` and `skill-alternative-1` untouched, you can ask the evaluator to reuse the latest unchanged profile outputs instead of rerunning them:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --reuse-unchanged-profiles
```

This compares the current scenario inputs against the latest `results/<benchmark-id>/*-compare/summary.json` fingerprints and only reuses a profile when:

- the previous run recorded a reuse fingerprint for that scenario
- the current prompt, workspace inputs, agent config, and profile capabilities still hash to the same value
- the previous run completed the same number of prompt/request outputs expected by the current config

This applies to both local-path and inline skill definitions. Changing the inline `content` or inline extra files invalidates reuse for that profile.

This is best-effort for mutable Git sources. Reuse decisions are exact for local-path and inline content, and declaration-based for Git sources.

## Compare Config

Use [Specs](./specs.md) for the canonical schema. The example below is intentionally minimal and focuses on the supported `compare.yaml` authoring shape.

Create `benchmarks/<eval-id>/compare.yaml` when you want one Promptfoo eval with multiple isolated profile columns.

Minimal shape:

```yaml
schemaVersion: 1
benchmark:
  id: repo-summary-compare
  description: Compare one control profile against two skill alternatives.
  tags:
    - compare
task:
  prompts:
    - id: architecture
      description: Architecture summary
      prompt: Read the repository and summarize the architecture.
workspace:
  sources:
    - id: base
      type: local-path
      path: fixtures/repo-summary/base
      target: /
  setup:
    initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: Score 1.0 only if the answer covers the main architecture.
  requests: 10
  timeoutMs: 180000
  tracing: false
  noCache: true
comparison:
  profiles:
    - id: no-skill
      description: Fully isolated control
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill-alternative-1
      description: Inline bundle with the repo-summary skill
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
              type: inline-files
              files:
                - path: AGENTS.md
                  content: |
                    # Repo Summary Bundle
                    Use only the materialized workspace.
                - path: skills/repo-summary/SKILL.md
                  content: |
                    ---
                    name: repo-summary
                    ---
                    Summarize the repository using the provided workspace files only.
                - path: skills/repo-summary/references/checklist.md
                  content: |
                    Cover architecture, major directories, and execution flow.
            install:
              strategy: workspace-overlay
    - id: skill-alternative-2
      description: Local bundle from disk
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
              type: local-path
              path: fixtures/repo-summary/skill-bundle
              skillId: repo-summary
            install:
              strategy: workspace-overlay
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
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Use `--dry-run` to generate the Promptfoo config without live evaluation:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

If you want to force one machine-wide cap without editing YAML, set `SKILL_ARENA_MAX_PARALLELISM` before running the command.

`llm-rubric` can use either a native Promptfoo provider such as `openai:gpt-5-mini` or a local Skill Arena judge provider:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

You can also use the object form when you need overrides such as `model` or `commandPath`:

```yaml
provider:
  id: skill-arena:judge:copilot-cli
  config:
    model: gpt-5.4-mini
    commandPath: copilot
```

For matrix evaluation configs, local paths follow a runtime contract:

- absolute paths are valid
- relative paths are resolved from the current command working directory
- package-relative fallback is not supported
- if a relative local path is missing, the evaluator can bootstrap the runtime-relative directory from a unique packaged fixture match
- bootstrap excludes `AGENTS.md`

When an evaluation needs different checks per prompt row, keep shared assertions at top-level `evaluation.assertions` and add prompt-specific assertions under `task.prompts[*].evaluation.assertions`.

Legacy compatibility:

- `workspace.fixture` normalizes to the first `workspace.sources` entry
- `workspace.skillOverlay` can still supply the default enabled skill
- `task.prompt` still works and normalizes to a single prompt entry
- Legacy `comparison.skillModes` still parses, but new authoring should use `comparison.profiles`

Preferred explicit skill source options:

- `local-path`: point to one local skill directory or a workspace-overlay bundle root on disk
- `inline`: define one `SKILL.md` directly in YAML when the bundle is still centered on one skill folder
- `inline-files`: define a whole bundle inline, including `AGENTS.md`, `skills/<skill-id>/SKILL.md`, references, and scripts
- `git`: clone a repo and select one bundle root or skill directory with optional `skillPath`

## Additional Capability Profiles

Beyond `skills`, compare profiles can declare additional capability families. Current V1 support is intentionally narrow:

- `codex`: `instructions`, `skills`
- `copilot-cli`: `instructions`, `skills`, `agents`, `hooks`
- `pi`: `skills`

Minimal `copilot-cli` example with repository instructions, one custom agent, and one hook:

```yaml
comparison:
  profiles:
    - id: baseline
      description: Fully isolated control
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: reviewer-agent
      description: Copilot profile with explicit instructions, agent, and hook
      isolation:
        inheritSystem: false
      capabilities:
        instructions:
          - source:
              type: inline-files
              target: /
              files:
                - path: AGENTS.md
                  content: |
                    # Project instructions
                    Keep the answer short and repository-grounded.
        agents:
          - agentId: reviewer-agent
            source:
              type: inline-files
              target: /
              files:
                - path: .github/agents/reviewer-agent.agent.md
                  content: |
                    ---
                    description: Focus on risk and regressions.
                    ---

                    # Reviewer agent
                    Focus on risk and regressions.
        hooks:
          - source:
              type: inline-files
              target: /
              files:
                - path: .github/hooks/pre-command.json
                  content: |
                    {
                      "hooks": []
                    }
```

For a repository example, see [copilot capability compare config](../benchmarks/copilot-cli-capabilities-compare/compare.yaml).

## Artifacts

Evaluation runs write to:

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
