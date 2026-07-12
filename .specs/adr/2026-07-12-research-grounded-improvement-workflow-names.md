# ADR: Research-Grounded Improvement Workflow Names

Date: 2026-07-12

## Status

Accepted

## Context

The repository exposed two skills named `skill-arena-evolution` and
`skill-arena-traced-evolution`. The names overlapped, did not clearly identify
the evidence each workflow consumes, and could be read as claims that both
implemented the same evolutionary method.

The population workflow historically cited Karpathy's `autoresearch` software
loop but no academic paper. Its implemented population, mutation, evaluation,
and selection mechanics align with EvoPrompt and Promptbreeder, while differing
from both because it searches complete skill bundles. The trace workflow
directly cited Trace2Skill and implements a narrower deterministic local
orchestration of trajectory-local patch consolidation.

## Decision

- Rename `skill-arena-evolution` to `skill-arena-population-search`.
- Rename `skill-arena-traced-evolution` to
  `skill-arena-trace-distillation`.
- Rename the population workflow's `evolution-log.json` artifact to
  `population-search-log.json`.
- Use mechanism-descriptive names instead of paper or project names.
- Record direct inspiration, related research, and non-reproduced mechanisms
  separately in `docs/research-foundations.md`.
- Do not retain duplicate compatibility skill directories. Users must update
  explicit invocations and local paths to the new identifiers.
- Keep algorithm-specific vocabulary such as generation, mutation, crossover,
  and fitness where it accurately describes the implementation.

## Consequences

- Discovery and invocation names communicate the required input: repeatable
  scores or labeled traces.
- Documentation can acknowledge research lineage without implying faithful
  reproduction or inherited empirical guarantees.
- Existing explicit skill invocations and paths require a one-time migration.
- Tests, helper commands, metadata, and documentation assets use the same names
  as the skill directories.
