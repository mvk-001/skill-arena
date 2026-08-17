# ADR: Git-Safe Harbor Study Publication

Date: 2026-07-24

## Status

Accepted

## Context

Ordered Harbor studies contain task datasets, locks, append-only ledgers,
native jobs, trials, trajectories, candidate bundles, verifier diagnostics,
answers, and machine-local evidence paths. Even when those artifacts are
ignored by convention, a broad or forced Git add can publish private
evaluation material. Marking evidence `public` is also insufficient because it
classifies index metadata; it does not sanitize the underlying file.

The repository needs a deterministic publication boundary that preserves local
verification while allowing progress and aggregate comparisons to be shared.
It must not create another Harbor result or scoring model.

## Decision

- Initialize every new `harbor-organize-evaluations` study with a study-local,
  deny-by-default `.gitignore`.
- Allow Git to see only the `.gitignore` control, generated
  `publication/index.json`, generated `publication/index.md`, and flat,
  explicitly reviewed aggregate tables named `*.table.csv`, `*.table.tsv`, or
  `*.table.md` under `publication/tables/`.
- Keep study identity, ledgers, dataset locks, internal status, raw reports,
  jobs, trials, trajectories, candidates, diagnostics, answers, reasoning, and
  credentials local and ignored.
- Interpret evidence visibility `public` only as permission to include
  source-path-free digest metadata in the generated publication index. Never
  copy its source artifact into the publication tree.
- Exclude dataset inventories, task names, source paths, and private evidence
  from publication indexes.
- Hash and index reviewed result tables without parsing, aggregating, ranking,
  or otherwise reinterpreting their values.
- Make deep verification fail on allowlist drift, unexpected publication
  files, stale indexes, reparse points, or any disallowed study artifact
  already present in the Git index, including force-added files. Also reject a
  tracked publication index or table whose staged bytes differ from the
  verified worktree projection.
- Require human review of aggregate result tables because structural and Git
  checks cannot prove semantic redaction.

## Consequences

- A normal `git add .` cannot stage evaluation data from a compliant study.
- Forced or previously tracked raw artifacts are detected before publication.
- GitHub receives compact indexes and comparison tables, not the evaluation
  corpus or execution evidence.
- Internal status remains richer than the public projection and is not
  versioned.
- Existing studies and sealed evidence are not rewritten automatically. Apply
  this contract through a new study directory or an explicit append-only
  continuation.
