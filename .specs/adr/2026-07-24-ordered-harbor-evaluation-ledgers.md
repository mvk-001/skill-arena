# ADR: Ordered Harbor Evaluation Ledgers

Date: 2026-07-24

## Status

Accepted

## Context

The repository's nine Harbor bundles own native evaluation, external-failure
recovery, candidate realization, several development evolution mechanisms, and
MetaSkill replay. Versioned studies separately define their protocols, dataset
locks, stage order, evidence locations, and progress summaries.

No atomic bundle coordinates that lifecycle across studies. A user resuming a
multi-generation experiment must rediscover which splits are frozen, which
skill owns each stage, what evidence is complete or blocked, whether the
development selection was frozen before holdout, and where the current
comparison report lives.

Adding orchestration must not create a second Harbor job, result, reward,
normalization, ranking, or promotion layer. It must also keep raw native jobs
private, preserve append-only study evidence, and retain the development versus
holdout boundary.

## Decision

- Add `harbor-organize-evaluations` as the tenth atomic, independently
  copyable Harbor bundle.
- Use a Python 3.12 standard-library script to create one study-local contract:
  - immutable `study.json`
  - append-only, SHA-256-chained `ledger.jsonl`
  - one exclusive dataset lock per discovery, development, validation, or
    holdout source
  - replaceable derived `status.json` and `status.md` views
- Discover Harbor tasks through `task.toml` and bind dataset and task trees by
  canonical path, size, and content digests. Reject overlapping source trees,
  task identities, or task digests across splits.
- Stop dataset registration after any stage starts. Treat byte separation as a
  procedural integrity check, not proof of semantic independence.
- Append stages in execution order with dependencies on earlier stages and one
  explicit owning Harbor skill. Enforce owner/kind compatibility and legal
  planned, running, blocked, completed, or stopped transitions.
- Require digest-bound evidence before a stage can complete. Keep native jobs
  private and omit every evidence source path and holdout task name from
  derived status.
- Release holdout once, only after a completed development selection and exact
  selection artifact have already been recorded together. This proves event
  order and bytes, not that an external actor never inspected holdout.
- Rehash every dataset, task, selection, and evidence artifact during deep
  verification. Fail closed on missing sources, drift, orphan locks, malformed
  events, or a broken ledger chain; never repair or delete evidence
  automatically.
- Leave all reward parsing, failure classification, comparison, evolution,
  selection, and promotion decisions to the existing owning bundles. The
  organizer stores their artifact pointers and lifecycle state only.

## Consequences

- A long-running Harbor study has one progressive, auditable answer for what is
  planned, running, blocked, completed, ready, and next.
- Dataset versions and holdout release become reusable contracts instead of
  study-specific conventions.
- Existing studies and sealed locks remain unchanged. The organizer applies to
  new study directories or explicit append-only continuations.
- Derived status can be regenerated and shared without leaking machine-local
  evidence paths, but it is not a sanitized copy of the underlying evidence.
- Moving a study without its referenced datasets and evidence makes deep
  verification fail. Portable publication remains a separate, explicit
  workflow.
- The maintained surface expands from nine to ten atomic bundles and remains at
  three versioned studies.
