# ADR: Use Group-Aware Splits and Seeded Response-Surface Variation for Dataset Authoring

Date: 2026-09-02

## Status

Accepted

## Context

The evaluation organizer proves byte-level separation between registered Harbor
task roots, but different bytes can still encode the same underlying problem.
Variants derived from one source, template, fixture, oracle, repository, or
solution pattern can leak across development and a sealed cohort while retaining
different task IDs and hashes.

Dataset adapters can also teach a skill accidental conventions. If every task
uses the same working directory, input layout, output path, serialization, or
`answer.txt` filename, an optimizer can improve on that surface without learning
the intended competency. Conversely, random expectations chosen during scoring
make trials noisy and can give baseline and candidate different conditions.

The 2026-08-30 *Modern Skill Evaluation and Evolution* report establishes the
larger experimental boundary: disjoint discovery, development, validation, and
holdout cohorts; frozen task worlds; layered verification; paired comparisons;
and independent promotion. It does not define an operational authoring contract
for seeded interface variation or semantic-family separation.

## Decision

- Add the atomic `harbor-author-evaluation-datasets` bundle before the existing
  organizer in the workflow. It owns dataset design, deterministic authoring
  plans, response-profile variation, and adapter/verifier preflight.
- Partition semantic families, not materialized task rows. Every derivative of
  one source or generator lineage remains in one split. Exact and approximate
  duplicate checks supplement, but do not replace, independent semantic review.
- Require `development` and sealed `validation` for evolution-oriented plans.
  Keep `discovery` optional and optimizer-visible and `holdout` optional and
  sealed. If validation feedback changes a candidate, the study ends and a new
  study requires fresh validation.
- Select nuisance variants deterministically at authoring time from private,
  split-specific seeds. Use task-keyed rendezvous hashing so input enumeration
  and unrelated task additions do not change an existing selection while its
  split, ID, option set, and seed remain fixed. Audit the realized distribution
  instead of claiming exact balance. The resulting task bytes are frozen, and
  baseline and candidate receive the same materialized variant.
- Require explicit family-level capability, domain, difficulty, and resource
  class values plus task-level response modes. Predeclare per-split minimum
  coverage and fail plan creation when the realized group-aware allocation does
  not satisfy it.
- Vary agent-facing response surfaces only when instructions, fixtures, oracle,
  and verifier remain aligned. Keep Harbor's internal task and reward protocol
  stable. `answer.txt` is an optional task convention, not a Harbor requirement.
- Verify semantic equivalence classes instead of exact bytes when formatting is
  incidental. Exercise every verifier with reference solutions, independent
  valid alternatives, invalid semantic mutants, and shortcut implementations.
- Keep detailed validation and holdout plans, seeds, prompts, solutions,
  verifiers, and diagnostics outside Git and the evolution context. Seeds aid
  reproducibility but do not provide confidentiality.
- Distinguish self-consistency verification from reproduction against the
  original blueprint and seed material. Neither digest mode authenticates
  authorship; higher-risk studies need separately controlled provenance.
- Preserve `harbor-organize-evaluations` as the sole owner of authoritative
  dataset locks, lifecycle stages, release events, and publication indexes. The
  authoring bundle does not define another `JobConfig`, result, reward, ledger,
  lock, optimizer, or promotion format.
- Allow the bundle to consolidate finalized schema-version-1 reports from
  `harbor-run-results` into aggregate-only Markdown and self-contained SVGs.
  The view must expose correctness, errors, tokens, cached-input coverage,
  reported cost, agent time, wall time, throughput, and baseline deltas while
  retaining source hashes and native fairness warnings. It must neither reparse
  raw jobs nor infer comparability across different task locks, execution
  profiles, or hardware.

## Consequences

- A new dataset can measure robustness to declared response contracts without
  rewarding one fixed filename or directory layout.
- Reproduction remains possible because randomness is materialized and recorded
  before execution rather than sampled inside the verifier.
- The effective unit of independence becomes the semantic family. Task counts
  containing many sibling variants must not be treated as equally many
  independent observations.
- A new seed from the same generator supports an in-family generalization claim,
  not an unseen-family claim. Public-source pretraining contamination, semantic
  near-duplicates, verifier bugs, and infrastructure drift still require
  separate controls.
- Correcting a sealed task or verifier requires an append-only dataset version;
  prior evidence is retained and marked with explicit provenance rather than
  rewritten.
- Aggregate visualization happens only after the owning cohort's release
  boundary and cannot feed validation or holdout evidence back into the same
  study's evolution loop.
