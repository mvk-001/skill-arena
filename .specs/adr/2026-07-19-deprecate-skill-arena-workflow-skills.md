# ADR: Deprecate Skill Arena Workflow Skills

Date: 2026-07-19

## Status

Accepted

## Context

Skill Arena and Harbor currently have parallel skill bundles for evaluation
reporting, population search, trace distillation, reflective Pareto search,
operator coevolution, and strategy orchestration. Maintaining both surfaces
duplicates execution, validation, ranking, reporting, and evolution logic.
Harbor-native jobs also preserve the task, environment, verifier, trial, and
candidate provenance needed by these workflows without translating evidence
through Skill Arena contracts.

## Decision

- Deprecate and freeze every repository-maintained `skill-arena-*` skill
  bundle. Retain the files only for legacy reproduction and migration.
- Deprecate `harbor-runner`, the repository-integrated bridge that converts
  Harbor evidence into Skill Arena reports.
- Use native Harbor `JobConfig` inputs and `harbor-run-results` for new
  evaluation and reporting workflows.
- Use only the Harbor-native evolution bundles for new population search,
  trace distillation, reflective Pareto search, operator coevolution, and
  integrated GEPA evolution.
- Do not add features to deprecated bundles. Permit only removal, migration
  aids, or critical security and compatibility fixes needed to read existing
  evidence.
- Keep the public Skill Arena CLI runtime supported. Removing or deprecating
  that runtime requires a separate decision.

This decision supersedes the maintained-skill recommendations in the
four-strategy Skill Arena ADRs and the continued `harbor-runner` maintenance
decision in the Harbor-native reporting ADR. Their historical algorithm and
evidence-boundary rationale remains valid.

## Consequences

- New skill workflow logic has one maintained implementation surface: Harbor.
- Legacy Skill Arena skill artifacts remain available for reproducibility but
  must not attract feature work.
- Documentation and skill metadata must route new work to Harbor-native
  replacements.
- Skill Arena runtime maintenance remains independent from the deprecated
  skill-bundle layer.
