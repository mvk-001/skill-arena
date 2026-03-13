# Architecture

## Purpose

Skill Arena evaluates how well coding agents perform on repeatable repository tasks under constrained execution settings. The system is designed to compare:

- skill-enabled vs. skill-disabled runs
- the same task across different agents
- smaller and cheaper models under the same benchmark conditions

The project minimizes harness-added context, but it does not claim to remove hidden provider-level system behavior. Agent runtimes may still inject their own instructions or tool policies.

## Core components

### Benchmark manifest

The benchmark manifest is the project authoring surface. It defines:

- benchmark identity and description
- the exact task prompt
- the fixture workspace to copy
- the optional skill overlay
- scenario variants for agent, model, and skill mode
- assertions, tracing, concurrency, and repeat settings

### Fixture workspaces

Fixtures are versioned directories stored in the repository. They represent the source state for a benchmark task. A fixture must be safe to copy and must never be mutated during benchmark execution.

### Workspace materializer

Each scenario run creates a fresh run directory under `results/`. The materializer:

1. copies the fixture tree into a new workspace
2. applies the skill overlay only when the scenario enables skill mode
3. initializes a Git repository inside the workspace when requested

This preserves source fixtures and gives each eval an isolated workspace.

Skill overlays can contain any files needed by the benchmarked agent, including root-level instruction files such as `AGENTS.md` and bundled skill assets such as `skills/<skill-id>/SKILL.md`.

### Agent adapters

The adapter layer maps a manifest scenario into a Promptfoo provider definition. V1 implements:

- `codex`: fully supported through a Promptfoo custom script provider that runs the local Codex system

The following adapter ids are reserved but not implemented in V1:

- `copilot-cli`
- `pi`

This keeps the benchmark format stable while future integrations are added.

### Promptfoo config generator

The generator translates a manifest scenario and its run workspace into a Promptfoo configuration file. Promptfoo remains the evaluation runtime, but benchmark authors work against the project manifest instead of raw Promptfoo YAML.

For Codex, the generated provider is a file-based custom script. The script supports two execution methods:

- `command`: shell out to `codex exec`
- `sdk`: invoke `@openai/codex-sdk`, which still wraps the local Codex CLI

### Result outputs

Each run writes a predictable directory under `results/<benchmark-id>/<timestamp>-<scenario-id>/`:

- `workspace/` contains the isolated run workspace
- `promptfooconfig.yaml` contains the generated Promptfoo config
- `promptfoo-results.json` contains the raw Promptfoo export
- `summary.json` contains a normalized run summary for downstream analysis

## Execution flow

1. Load and validate a benchmark manifest.
2. Select one or more scenarios from the manifest.
3. Materialize a fresh workspace for each scenario.
4. Build the Promptfoo provider config through the adapter registry.
5. Generate a Promptfoo config file for the scenario.
6. Run `promptfoo eval` with the generated config.
7. Export Promptfoo results as JSON.
8. Normalize the results into a stable summary payload.

## Design constraints

### Minimal execution context

The harness defaults to:

- small coding models where configured
- `read-only` or tightly scoped sandbox settings
- `approval_policy: never`
- `web_search_enabled: false`
- `network_access_enabled: false`
- no extra system prompt content added by the harness
- execution through the local system Codex runtime instead of a direct hosted Promptfoo provider shortcut

### Known limitation

Agent providers may still add hidden system instructions, internal orchestration, or tool wrappers. Skill Arena measures the effective agent system, not an impossible "pure model with zero runtime behavior" abstraction.
