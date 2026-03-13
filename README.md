# Skill Arena

Skill Arena is a Promptfoo-driven benchmark harness for evaluating coding agents with and without skill overlays in isolated workspaces.

Codex scenarios run through a Promptfoo custom script that uses the local Codex system via `codex exec` or `@openai/codex-sdk`.

Benchmarks can target either workspace-injected skills or skills already installed in the local Codex system.

Start with these documents:

1. [Architecture](./docs/architecture.md)
2. [Specs](./docs/specs.md)
3. [Agent guidance](./AGENTS.md)

The repository authoring surface is the benchmark manifest. Promptfoo is the evaluation runtime behind that manifest.
