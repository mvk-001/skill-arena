# Harbor-Native Skills Plan

Date: 2026-07-14

## Goal

Create two independently copyable skills: one that publishes final evaluation
reports directly from Harbor artifacts and one that evolves SKILL.md through
Harbor-backed GEPA evaluation with a separate holdout gate.

## Scope

- Add harbor-run-results with a pinned native artifact reporter.
- Add harbor-evolve-skill with config validation, dry-run, doctor, bounded
  GEPA optimization, preserved Harbor trials, and holdout promotion logic.
- Keep both bundles independent of Skill Arena runtime modules.
- Document the new workflow boundary and research provenance.
- Add deterministic tests that do not launch live agents.

## Acceptance Criteria

1. Both bundles pass the official skill validator and repository independence
   gate.
2. The native reporter reproduces expected pass, error, token, latency, and
   comparison deltas from Harbor fixtures.
3. The reporter rejects incomplete jobs and task drift, and validates a real
   lock-backed comparison.
4. Evolution dry-run validates real Harbor task directories and rejects split
   leakage without Docker or model calls.
5. The source skill is never written by the evolution runner, credential
   values never enter TrialConfig, and holdout is evaluated only after GEPA
   selection.
6. Focused tests, full tests, coverage, documentation checks, diff checks, and
   the required closeout hook pass.

## Non-Goals

- Add Harbor commands to the public Skill Arena CLI.
- Replace harbor-runner or the existing Promptfoo adapter runtime.
- Run a paid live GEPA optimization in the automated suite.
- Mutate skill scripts, references, or assets inside the GEPA loop.

## Execution Result

Status: completed.

- Added the atomic `harbor-run-results` bundle with a Harbor 0.18.0 artifact
  parser, completion checks, lock-backed fairness checks, and JSON/Markdown
  final reports.
- Added the atomic `harbor-evolve-skill` bundle with Harbor 0.18.0 + GEPA
  0.1.2, isolated train/validation/holdout splits, bounded optimization,
  preserved trial evidence, and a non-mutating promotion gate.
- Validated both bundles with the skill validator, repository bundle checker,
  Ruff, and ty.
- Passed focused native tests, independent forward dry-runs, and the full
  repository suite: 412 tests with 95.61% statements/lines, 85.82% branches,
  and 97.23% functions.
- Reproduced a lock-backed native Harbor comparison from live job artifacts:
  no-skill 0/2 versus skill 2/2. The automated fixture forward test reproduced
  1/4 versus 4/4 and explicitly labeled the fixture limitation.
- Did not run a paid live GEPA optimization; the deterministic full-lifecycle
  simulation covers candidate selection, resource preservation, fresh holdout
  queues, baseline immutability, and promotion gating.
