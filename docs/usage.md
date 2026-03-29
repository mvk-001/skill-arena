# Usage Guide

Read this after [README.md](../README.md). This guide explains the normal `skill-arena` workflow from authoring a config to inspecting the final compare report. Use [Specs](./specs.md) for field-level rules, [Architecture](./architecture.md) for internals, and [Testing](./testing.md) for the validation loop.

## The Normal Workflow

Most users should think in terms of one `compare.yaml` file and one repeated loop:

1. Author or update the benchmark config.
2. Validate it with `skill-arena val-conf`.
3. Materialize and inspect the generated Promptfoo config with `skill-arena evaluate --dry-run`.
4. Run the live compare with `skill-arena evaluate`.
5. Inspect the normalized artifacts under `results/`.

Start with the maintained example:

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Equivalent invocation forms also work:

```bash
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
pnpm exec skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Every command accepts `--help`:

```bash
skill-arena evaluate --help
skill-arena gen-conf --help
skill-arena val-conf --help
```

## Understand The Config Shape

Skill Arena is compare-first. The most important authoring file is `compare.yaml`.

That file answers five questions:

1. What prompt or prompts should every run execute?
2. What files should exist in the isolated workspace?
3. How should success be graded?
4. Which profiles should be compared, for example `no-skill` vs `skill-alternative-1`?
5. Which agent variants should execute those profiles?

The runtime then expands the matrix as:

- rows: `prompt x variant`
- columns: profiles
- cells: repeated runs controlled by `evaluation.requests`

### Minimal mental model

- `workspace`: the files copied into the run workspace
- `profile`: the capability bundle under comparison
- `variant`: the agent adapter plus model and runtime settings
- `requests`: how many times each cell is repeated

## Fast Start With The Maintained Config

Useful repository examples:

- [Maintained compare config](../benchmarks/skill-arena-compare/compare.yaml)
- [Smoke compare config](../benchmarks/smoke-skill-following/compare.yaml)
- [Copilot compare config](../benchmarks/copilot-cli-smoke-compare/compare.yaml)

Validate the config:

```bash
skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml
```

Generate the Promptfoo config and workspaces without live evaluation:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run
```

Run the full compare:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

## Author A New Compare Config

Use `gen-conf` when you want a commented starter file with `TODO:` markers:

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/my-benchmark/compare.yaml \
  --prompt "Read the repository and summarize the architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the answer covers the main architecture." \
  --requests 3 \
  --skill-type local-path
```

Useful `gen-conf` flags:

- `--prompt <text>`: repeat to create multiple prompt rows
- `--prompt-description <text>`: optional description for the next prompt
- `--evaluation-type <type>` and `--evaluation-value <value>`: repeat to prefill assertions
- `--skill-type <type>`: `git`, `local-path`, `system-installed`, or `inline-files`
- `--workspace-source-type <type>`: `local-path`, `git`, `inline-files`, or `empty`
- `--requests <n>`: prefill `evaluation.requests`
- `--max-concurrency <n>` or `--maxConcurrency <n>`: prefill `evaluation.maxConcurrency`
- `--adapter <id>` and `--model <id>`: prefill the first variant

### Minimal example

```yaml
schemaVersion: 1
benchmark:
  id: repo-summary-compare
  description: Compare a control profile against one skill-enabled profile.
task:
  prompts:
    - id: architecture
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
  requests: 3
comparison:
  profiles:
    - id: no-skill
      description: Fully isolated control
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill
      description: One explicit workspace-overlay skill bundle
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
              type: local-path
              path: fixtures/repo-summary/skill-bundle
            install:
              strategy: workspace-overlay
  variants:
    - id: codex-mini
      description: Codex mini baseline
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
```

Use [Specs](./specs.md) for the full schema and normalization rules.

## Common Local Iteration Commands

Override repeat count or concurrency for a one-off local run:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 2 --max-concurrency 2
```

Both flag spellings are accepted:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 1 --maxConcurrency 2
```

If you need a machine-wide cap without editing YAML, set `SKILL_ARENA_MAX_PARALLELISM` before running the command.

## Reuse Unchanged Compare Profiles

When you are iterating on only one profile, use:

```bash
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --reuse-unchanged-profiles
```

This tells the evaluator to reuse the latest matching outputs for unchanged profiles instead of rerunning every column.

Reuse applies only when:

- the previous run recorded a reuse fingerprint
- the current prompt, workspace inputs, agent config, and profile capabilities still hash to the same value
- the previous run completed the expected number of prompt/request outputs

This is exact for local-path and inline content. It is best-effort for mutable Git sources.

## Assertions And Judges

Use shared assertions in top-level `evaluation.assertions`.

When one prompt row needs extra checks, append them under `task.prompts[*].evaluation.assertions`.

`llm-rubric` is the usual choice when exact string equality is too strict. It can use either a native Promptfoo provider such as `openai:gpt-5-mini` or a local Skill Arena judge provider:

- `skill-arena:judge:codex`
- `skill-arena:judge:copilot-cli`
- `skill-arena:judge:pi`

Object form is also supported when you need judge-specific overrides:

```yaml
provider:
  id: skill-arena:judge:copilot-cli
  config:
    model: gpt-5.4-mini
    commandPath: copilot
```

## Local Path Rules

For compare configs:

- absolute paths are always valid
- relative paths are resolved from the current command working directory
- relative paths are not resolved from the installed package location
- when a relative local path is missing, the evaluator may bootstrap it from a unique packaged fixture match
- compare-mode bootstrap excludes `AGENTS.md`

These rules apply to `workspace.sources[*].path` and compare capability sources such as skill bundles.

## Capability Profiles Beyond Skills

Profiles can compare more than just skills. V1 support is intentionally narrow:

- `codex`: `instructions`, `skills`
- `copilot-cli`: `instructions`, `skills`, `agents`, `hooks`
- `pi`: `skills`

Minimal `copilot-cli` example:

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

## Inspect The Results

Compare runs write artifacts under:

```text
results/<benchmark-id>/<timestamp>-compare/
```

The most useful outputs are:

- `promptfooconfig.yaml`: the generated Promptfoo config
- `promptfoo-results.json`: raw Promptfoo result payload
- `summary.json`: normalized Skill Arena summary
- `merged/report.md`: human-readable side-by-side compare report
- `merged/merged-summary.json`: merged machine-readable summary

After at least one run, you can open the Promptfoo viewer:

```bash
npx promptfoo@latest view
```

## Legacy Compatibility

New authoring should use the compare-first declarative shape, but V1 still normalizes some older fields:

- `workspace.fixture`
- `workspace.skillOverlay`
- `task.prompt`
- `comparison.skillModes`

Those fields still parse, but new configs should prefer `workspace.sources`, `task.prompts`, and `comparison.profiles`.
