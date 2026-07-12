# Documentation

This directory contains the user and contributor documentation for Skill Arena.
Start with the guide that matches the work you are doing.

## For benchmark authors

1. [Usage guide](./usage.md) — author, validate, dry-run, execute, and inspect a
   compare evaluation.
2. [CLI reference](./cli-reference.md) — commands, options, environment
   variables, and exit behavior.
3. [Configuration specs](./specs.md) — canonical schema, normalization rules,
   adapter contract, and output requirements.
4. [Research foundations](./research-foundations.md) — provenance and adaptation
   boundaries for the skill-improvement workflows.

The maintained examples under [`evaluations/`](../evaluations/) are executable
references. Use
[`evaluations/skill-arena-config-author/evaluation.yaml`](../evaluations/skill-arena-config-author/evaluation.yaml)
as the primary compare example.

## For contributors

1. [Architecture](./architecture.md) — runtime boundaries, execution flow, and
   source-module responsibilities.
2. [Testing](./testing.md) — validation sequences for documentation, runtime,
   configs, and live evaluations.
3. [Decision records](../.specs/adr/) — durable technical and workflow
   decisions.

Read [`AGENTS.md`](../AGENTS.md) before changing the repository.

## Sources of truth

| Concern | Canonical source |
| --- | --- |
| Runtime design and execution flow | [Architecture](./architecture.md) |
| Config fields and required behavior | [Configuration specs](./specs.md) |
| CLI behavior | `skill-arena <command> --help`, then [CLI reference](./cli-reference.md) |
| Maintained benchmark scenarios | [`evaluations/`](../evaluations/) |
| Validation workflow | [Testing](./testing.md) |
| Improvement-workflow research provenance | [Research foundations](./research-foundations.md) |
| Historical decisions | [ADRs](../.specs/adr/) |

When prose and executable behavior disagree, treat the implementation and its
tests as evidence of current behavior, then update the relevant canonical
document in the same change.

## Documentation conventions

- Repository artifacts are written in English.
- Use lower-case, kebab-case names for new files in `docs/`.
- Prefer one maintained example over copied YAML snapshots in this directory.
- Link to executable examples under `evaluations/` instead of duplicating them.
- Keep reproducible README diagram sources, static verification renders, and
  animated renders together under [`docs/assets/`](./assets/).
- Keep workflow guidance in `usage.md`, field-level requirements in `specs.md`,
  and implementation details in `architecture.md`.
- Run `npm run docs:check` after changing Markdown links or moving files.
