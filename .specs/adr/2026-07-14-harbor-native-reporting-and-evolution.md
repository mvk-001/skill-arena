# ADR: Harbor-Native Reporting and Skill Evolution

Date: 2026-07-14

## Status

Accepted

## Context

The repository already contains a Harbor report-parity proof and a
repository-integrated harbor-runner. That orchestrator intentionally converts
Harbor trials into Skill Arena's normalized summary and Markdown contracts.
Two workflows need a different boundary:

- obtain and compare final Harbor results without requiring Skill Arena
  configuration, CLI commands, or runtime modules
- use Harbor trials as the real evaluation surface that guides repeated skill
  evolution rather than only replaying declared scores

Harbor 0.18.0 records requested config, resolved locks, job results, per-trial
results, rewards, usage, timing, exceptions, and skill digests. The official
Harbor cookbook also demonstrates GEPA optimize_anything with Harbor rewards,
verifier output, and agent trajectory side information.

## Decision

- Add harbor-run-results as an atomic Harbor-native reporting skill.
  - Validate native artifacts through Harbor's own 0.18.0 models.
  - Emit final-report.json and final-report.md without importing Skill Arena.
  - Reject incomplete jobs and unfair comparisons by default.
  - Prefer resolved lock equality with only skill provenance removed; fall back
    to observed task, agent, model, version, and attempt parity for legacy jobs.
- Add harbor-evolve-skill as an atomic Harbor+GEPA evolution skill.
  - Evolve the complete SKILL.md text while copying all other bundle resources
    unchanged.
  - Use disjoint training, optimizer-visible validation, and final holdout
    Harbor task sets.
  - Feed only development reward, bounded verifier diagnostics, agent output,
    errors, and trajectories into GEPA reflection.
  - Compare the selected candidate with the unchanged baseline on holdout and
    never install or overwrite the source skill automatically.
- Pin Harbor 0.18.0 and GEPA 0.1.2 in each executable script's inline
  dependency metadata. A version upgrade requires fixture validation against
  the new result and optimizer contracts.
- Keep harbor-runner for Skill Arena report parity. The new skills do not add
  Harbor to the public Skill Arena CLI and do not change npm runtime contracts.

## Consequences

- Users can obtain native Harbor final reports even when Skill Arena is absent.
- Harbor lock provenance provides a stronger fairness check than trial fields
  alone, while legacy evidence remains usable with an explicit limitation.
- Skill evolution can use real containerized execution feedback and
  Pareto-aware textual mutation while preserving an untouched promotion gate.
- The evolution workflow intentionally changes only SKILL.md; failures in
  scripts, references, or assets require a separately reviewed baseline repair.
- Live evolution consumes model and sandbox resources, so dry-run, doctor,
  explicit budgets, preserved evidence, and no-secret configuration are
  required guardrails.
