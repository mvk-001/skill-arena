# Architecture

## Purpose

Skill Arena evaluates coding agents on repeatable repository tasks under constrained execution settings. The main comparisons are:

- skill-enabled vs. skill-disabled runs
- the same task across different agents
- smaller and cheaper models under the same benchmark conditions

The harness keeps execution context small, but it does not remove hidden provider runtime behavior.

## Core components

### Benchmark manifest

The benchmark manifest is the main authoring surface. It defines:

- benchmark identity and description
- the exact task prompt or prompt set
- the fixture workspace to copy
- the optional skill overlay
- scenario variants for agent, model, and skill mode
- assertions, tracing, concurrency, and request-count settings

### Compare config

The compare config is the second authoring surface. It defines:

- benchmark identity and description
- the exact task prompt or prompt set
- the fixture workspace to copy
- shared evaluation settings
- compare variants for adapter and model
- compare skill modes such as `no-skill` and `skill`

The compare runner expands the matrix internally, materializes a separate workspace for each supported variant and skill mode, and then executes one Promptfoo eval with:

- Promptfoo providers mapped to skill-mode columns
- Promptfoo test rows mapped to variant and prompt pairs

### Fixture workspaces

Fixtures are versioned directories stored in the repository. They represent the source state for a benchmark task. Fixtures must be safe to copy and must never be mutated during benchmark execution.

### Workspace materializer

Each scenario run creates a fresh run directory under `results/`. The materializer:

1. copies the fixture tree into a new workspace
2. applies the skill overlay only when the scenario enables skill mode
3. initializes a Git repository inside the workspace when requested

This preserves source fixtures and gives each eval an isolated workspace.

Workspace skill overlays can contain any files needed by the benchmarked agent, including root-level instruction files such as `AGENTS.md` and bundled skill assets such as `skills/<skill-id>/SKILL.md`.

Some benchmarks use system-installed skills instead of workspace overlays. In those cases the harness does not inject skill files into the workspace; the benchmark relies on skills already installed in the Codex system environment.

### Agent adapters

The adapter layer maps a manifest scenario into a Promptfoo provider definition. V1 implements:

- `codex`
- `pi`

The following adapter id is reserved but not implemented in V1:

- `copilot-cli`

### Promptfoo config generator

The generator translates a manifest scenario or compare config into a Promptfoo configuration file. Promptfoo remains the evaluation runtime, but benchmark authors work against repository-native YAML instead of raw Promptfoo YAML.

For Codex, the generated provider is a file-based custom script. The script supports two execution methods:

- `command`: shell out to `codex exec`
- `sdk`: invoke `@openai/codex-sdk`, which still wraps the local Codex CLI

### Result outputs

Each run writes a predictable directory under `results/<benchmark-id>/<timestamp>-<scenario-id>/`:

- `workspace/`
- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json`

Compare runs write under `results/<benchmark-id>/<timestamp>-compare/` and include:

- `promptfooconfig.yaml`
- `promptfoo-results.json`
- `summary.json` with provider metadata, scenario summaries, and a compare matrix
- `merged/report.md`
- `merged/merged-summary.json`

## Execution flow

### Scenario flow

1. Load and validate a benchmark manifest.
2. Select one or more scenarios from the manifest.
3. Materialize a fresh workspace for each scenario.
4. Build the Promptfoo provider config through the adapter registry.
5. Generate a Promptfoo config file for the scenario.
6. Run `promptfoo eval` with the generated config.
7. Export Promptfoo results as JSON.
8. Normalize the results into a stable summary payload.

### Compare flow

1. Load and validate a compare config.
2. Expand compare variants and skill modes into internal scenario-like units.
3. Materialize a fresh workspace for each supported unit.
4. Build one Promptfoo config with skill-mode providers and variant/prompt test rows.
5. Run one `promptfoo eval` so Promptfoo shows skill modes side by side for each row.
6. Record unsupported adapters as skipped comparison entries.
7. Export Promptfoo results as JSON.
8. Normalize the results into a stable comparison matrix plus a merged report.

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
