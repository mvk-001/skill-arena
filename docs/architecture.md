# Architecture

Read this after [README.md](../README.md) and [Usage Guide](./usage.md). This page explains the runtime model and execution flow. Use [Specs](./specs.md) for field-level rules.

Skill Arena evaluates coding agents on repeatable repository tasks under constrained execution settings. It keeps benchmark authoring declarative and pushes agent-specific behavior into adapters.

## Core components

### Benchmark manifest

The benchmark manifest is the scenario-oriented authoring surface. It defines:

- benchmark identity and description
- the exact task prompt or prompt set
- the declarative workspace sources to materialize
- the optional declarative skill definition
- scenario variants for agent, model, and manifest skill state
- assertions, tracing, concurrency, and request-count settings

### Compare config

The compare config is the matrix-oriented authoring surface. It defines:

- benchmark identity and description
- the exact task prompt or prompt set
- the declarative workspace sources to materialize
- shared evaluation settings plus optional prompt-specific row assertions
- compare variants for adapter and model
- compare profiles such as `no-skill`, `skill-alternative-1`, `skill-alternative-2`, or other explicit capability bundles

The compare runner expands the matrix internally, materializes a separate workspace for each supported variant and profile, and then executes one Promptfoo eval with:

- Promptfoo providers mapped to profile columns
- Promptfoo test rows mapped to variant and prompt pairs

### Workspace sources

Workspace inputs are declared in YAML. Common sources include versioned fixtures in the repository, Git-backed external inputs, and small inline files. Source inputs must be safe to copy and must never be mutated during benchmark execution.

### Workspace materializer

Each scenario run creates a fresh run directory under `results/`. The materializer:

1. creates an empty run workspace
2. applies `workspace.sources` in declaration order
3. injects the skill only when the resolved skill install strategy is `workspace-overlay`
4. initializes a Git repository inside the workspace when requested

This preserves source inputs and gives each eval an isolated workspace.

Workspace-injected skills can contain any files needed by the benchmarked agent, including root-level instruction files such as `AGENTS.md` and bundled skill assets such as `skills/<skill-id>/SKILL.md`.

Compare profiles may also materialize non-skill capability bundles such as repository instructions, custom agents, and hooks when the selected adapter supports them. These capability bundles are applied after base workspace sanitization so the profile can intentionally reintroduce files such as `AGENTS.md` or `.github/agents/*`.

For explicit skill declarations, the preferred contract is to declare one benchmarked skill bundle through one of these source modes:

- a local path that points either to one skill directory or to a workspace-overlay bundle root
- inline files that create the entire bundle directly in YAML
- a Git repository plus an optional selected bundle root or selected skill subfolder

Some benchmarks use system-installed skills instead of workspace overlays. In those cases the harness does not inject skill files into the workspace; the benchmark relies on skills already installed in the local agent environment.

Legacy `workspace.fixture`, `workspace.skillOverlay`, and `skillSource` fields are still accepted in V1, but the runtime normalizes them into the declarative workspace and skill model before execution.

### Agent adapters

The adapter layer maps a manifest scenario into a Promptfoo provider definition. V1 implements:

- `codex`
- `copilot-cli`
- `pi`
- `opencode`
- `claude-code`

### Promptfoo config generator

The generator translates a manifest scenario or compare config into a Promptfoo configuration file. Promptfoo remains the evaluation runtime, but benchmark authors work against repository-native YAML instead of raw Promptfoo YAML.

For Codex, the generated provider is a file-based custom script. The script supports two execution methods:

- `command`: shell out to `codex exec`
- `sdk`: invoke `@openai/codex-sdk`, which still wraps the local Codex CLI

For `copilot-cli`, the generated provider is also a file-based custom script. V1 supports:

- `command`: shell out to the local `copilot` CLI

`copilot-cli` maps sandbox, network, web, and approval settings on a best-effort basis because the Copilot CLI does not expose the same execution controls as Codex.

For `claude-code`, the generated provider is also a file-based custom script. V1 supports:

- `command`: shell out to the local `claude` CLI with `-p`

`claude-code` materializes generic benchmark instruction and skill bundles into Claude Code's project-native discovery layout (`CLAUDE.md` and `.claude/skills/*`) inside the isolated execution workspace. Sandbox, network, web, and approval settings are mapped on a best-effort basis through generated Claude settings plus CLI flags.

For `pi`, the generated provider runs with strict skill isolation by default:

- `--no-skills` disables implicit skill discovery
- when a test enables a workspace-overlay skill, it passes explicit `--skill` paths for those declared skill IDs

For `codex`, skill scope defaults are applied through generated `skills.config` values unless the scenario uses `system-installed` skills.

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

Provider executions may also write hook artifacts under the materialized workspace at `.skill-arena/hooks/execution-events/`. These JSON files capture the observable command invocation plus any parsed event or tool-call stream emitted by `codex`, `copilot-cli`, `pi`, `opencode`, or `claude-code`.

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
2. Expand compare variants and profiles into internal scenario-like units.
3. Materialize a fresh workspace for each supported unit.
4. Build one Promptfoo config with profile providers and variant/prompt test rows.
5. Run one `promptfoo eval` so Promptfoo shows profiles side by side for each row.
6. Record unsupported adapters as skipped comparison entries and unsupported capability bundles as per-cell unsupported entries.
7. Export Promptfoo results as JSON.
8. Normalize the results into a stable comparison matrix plus a merged report.

For concrete config examples, see [Usage Guide](./usage.md) and the maintained [compare benchmark](../evaluations/skill-arena-config-author/evaluation.yaml).

## Cross-tool capability mapping

Compare profiles are capability-oriented on purpose. Similar names across tools do not imply identical runtime semantics.

- `Native`: first-class documented runtime support
- `Analogous`: similar outcome through a different mechanism
- `IDE-only`: available in an IDE context, not as a comparable runtime primitive
- `No`: not documented as a supported capability
- `Planned`: relevant for future adapter support in Skill Arena

| Capability | Codex | Copilot CLI | OpenCode | Pi | Claude Code |
| --- | --- | --- | --- | --- | --- |
| Project instruction file | Native (`AGENTS.md`) | Native | Native (`AGENTS.md`) | Native (`AGENTS.md`) | Native (`CLAUDE.md`) |
| Skills | Native | Native | Native | Native | Native (`.claude/skills`) |
| Skill groups / multiple skills | Native | Native | Native | Native | Native |
| Hooks / event hooks | No | Native | Analogous via plugins | Analogous via extensions | Native |
| Custom agents | Native | Native | Native | No | Native |
| Subagents / delegation | Native | Native | Native | Analogous via extensions/packages | Native |
| MCP servers | Native | Native | Native | Analogous via extensions | Native |
| Runtime plugin / extension API | No | No | Native plugins | Native extensions/packages | Native plugins |
| IDE plugin / IDE extension | No | No | IDE-only | No | Native IDE integration |

Notes:

- OpenCode runtime plugins are not the same thing as Claude Code IDE plugins.
- Pi extensions and packages are closer to runtime extensibility than to a benchmark-stable plugin marketplace.
- Copilot CLI hooks are native. OpenCode plugin hooks and Pi extension handlers are analogous, not equivalent.
- Codex should remain `No` for hooks unless OpenAI documents a stable runtime hook surface suitable for deterministic benchmarking.

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

Benchmark integrity depends on strict context boundaries. The runtime should expose only:

- the exact benchmark prompt
- the files materialized into folders explicitly shared with the agent

It should not append hidden harness instructions or rely on knowledge sources outside those declared run inputs.

### Known limitation

Agent providers may still add hidden system instructions, internal orchestration, or tool wrappers. Skill Arena measures the effective agent system, not an impossible "pure model with zero runtime behavior" abstraction.
