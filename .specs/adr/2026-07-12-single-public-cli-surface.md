# ADR: Single Public CLI Surface

Date: 2026-07-12

## Status

Accepted

## Context

Skill Arena documents three commands: `evaluate`, `gen-conf`, and `val-conf`.
The repository also exposed npm aliases and standalone source entrypoints for
manifest-only generation, direct runners, and dry-run wrappers. Those paths
duplicated public command behavior, used older manifest-oriented names, and
created additional interfaces that documentation and tests had to keep aligned.

The config-author skill also maintained a separate generator and regex-based
validator despite the public CLI already providing schema-backed generation and
validation.

## Decision

- The supported user-facing command surface is `skill-arena evaluate`,
  `skill-arena gen-conf`, and `skill-arena val-conf`.
- Files under `src/cli/` are internal implementations and may be composed by
  the public wrapper; they are not independent public interfaces.
- Dry-run behavior is an `evaluate --dry-run` option, not a separate entrypoint.
- Skills should reuse the public CLI for config generation and schema
  validation instead of shipping parallel implementations.
- Shared config parsing and Promptfoo process execution belong in reusable
  runtime modules outside `src/cli/`.

## Consequences

- Help, documentation, skills, and package scripts have one command vocabulary.
- Removing undocumented aliases may affect callers that invoked repository
  internals directly; they must migrate to the corresponding public command.
- Manifest and compare remain supported authoring formats behind `evaluate` and
  `val-conf`; this decision does not remove either contract.
- New public commands require explicit documentation, tests, and an update or
  superseding ADR rather than an incidental npm alias.
