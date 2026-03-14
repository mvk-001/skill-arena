# Skill Arena

Skill Arena is a Promptfoo-driven benchmark harness for evaluating coding agents with and without skill overlays in isolated workspaces.

Codex scenarios run through a Promptfoo custom script that uses the local Codex system via `codex exec` or `@openai/codex-sdk`.

Benchmarks can target either workspace-injected skills or skills already installed in the local Codex system.

Start with these documents:

1. [Architecture](./docs/architecture.md)
2. [Specs](./docs/specs.md)
3. [Usage guide](./docs/usage.md)
4. [Testing](./docs/testing.md)
5. [Agent guidance](./AGENTS.md)

The repository has two authoring surfaces:

- `manifest.yaml` for scenario-oriented benchmark runs
- `compare.yaml` for one Promptfoo eval with skill-mode columns and variant/prompt rows

Promptfoo is the evaluation runtime behind both formats.
