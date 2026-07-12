# ADR: Documentation Information Architecture

Date: 2026-07-12

## Status

Accepted

## Context

Repository documentation had several competing entry points. The root README,
usage guide, and command reference repeated the same workflow; the command
reference had drifted from `--help`; and an old benchmark YAML snapshot lived
under `docs/` even though maintained executable examples belong under
`evaluations/`.

This made it difficult to tell which document was canonical and allowed local
links and command examples to become stale.

## Decision

Skill Arena documentation will use these boundaries:

- `README.md` is the concise project entry point and quick start.
- `docs/README.md` is the documentation index and ownership map.
- `docs/usage.md` owns the end-to-end benchmark-authoring workflow.
- `docs/cli-reference.md` summarizes the installed CLI, while command-specific
  `--help` remains the authoritative option list for a version.
- `docs/specs.md` owns configuration and output contracts.
- `docs/architecture.md` owns runtime design and source-module boundaries.
- `docs/testing.md` owns validation workflows.
- `docs/research-foundations.md` owns research provenance and adaptation
  boundaries for skill-improvement workflows.
- maintained executable YAML examples live under `evaluations/`, not `docs/`.

The repository will run `npm run docs:check` to validate local links and heading
fragments in the root README and `docs/` tree.

## Consequences

- Readers have one documented route for each kind of question.
- Command documentation is shorter and less likely to drift from the CLI.
- Maintained examples stay executable and are not copied into prose folders.
- File moves and heading changes can be checked locally before review.
- Documentation changes that alter these ownership boundaries should update
  this ADR or supersede it with a new decision record.
