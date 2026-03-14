# Skill Arena

Skill Arena is a Promptfoo-driven benchmark harness for evaluating coding agents with and without skill overlays in isolated workspaces.

Codex scenarios run through a Promptfoo custom script that uses the local Codex system via `codex exec` or `@openai/codex-sdk`.

Start with these documents:

1. [Architecture](./docs/architecture.md)
2. [Specs](./docs/specs.md)
3. [Usage guide](./docs/usage.md)
4. [Testing](./docs/testing.md)
5. [Agent guidance](./AGENTS.md)

The repository authoring surface is the benchmark manifest, typically authored in YAML. Promptfoo is the evaluation runtime behind that manifest.
