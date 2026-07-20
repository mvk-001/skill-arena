# ADR: Harbor 0.18 Task Lock Identity Binding

Date: 2026-07-19

## Status

Accepted

## Context

The reflective Pareto analyzer formerly attempted to compare
`TrialResult.task_checksum` with `TrialLock.task.digest` by adding a prefix or
hashing the result value. That worked for synthetic fixtures whose locks were
built from the result checksum, but it rejects native Harbor 0.18 jobs.

Harbor 0.18 marks `Task.checksum` as deprecated and computes it with `dirhash`.
The job and trial locks use `Packager.compute_content_hash()` instead. Both are
SHA-256-shaped values over task content, but they are different algorithms and
there is no valid conversion between them.

Harbor also resolves Git branches, tags, and omitted refs to a commit before it
writes `TaskLock.git_commit_id`. A root `TaskLock` records the resolution but
not the requested symbolic Git ref. Package locks similarly retain the resolved
content digest but not the configured mutable package ref. A root-only lock can
therefore contain several plausible resolutions for the same declared task and
runtime cell.

## Decision

- Never transform or equate `TrialResult.task_checksum` and
  `TrialLock.task.digest`.
- Require each result `task_id` to equal the identity reconstructed from its
  configured TaskConfig, including local path or package/Git name and ref.
- Bind the configured task to its TrialLock by declared name, task type,
  source, normalized path, Git URL, resolved Git commit when the declaration is
  already a 40- or 64-hex object ID, and any digest-pinned package ref, plus
  agent/model, comparable runtime identity, and attempt multiplicity.
- When native per-trial locks exist, require an all-or-none set, bind each
  result to its adjacent lock, and require their exact multiset to equal the
  root JobLock. Adjacency may bind a symbolic or omitted configured Git ref to
  a resolved lock commit, or a mutable package ref to its durable lock digest.
- For a root-only legacy job, require a resolved Git commit or digest-pinned
  package ref in the configured task. Match the full comparable runtime
  identity in addition to task, agent, and model. Permit repeated matches only
  when the remaining locks are canonical-identical; reject multiple
  non-identical matches instead of choosing greedily.
- Keep the Packager task digests in the canonical root-lock signature. Candidate
  jobs still fail closed when any durable task digest or other evaluation input
  drifts after removing only candidate skill provenance.
- Continue to use `TrialResult.task_checksum` for case vectors, attempt counts,
  and development/holdout overlap because those comparisons stay within the
  TrialResult checksum domain.

## Consequences

- Native Harbor 0.18 jobs can be analyzed without a false task-drift error.
- Result task identity, direct trial locks, root locks, agents, models, runtime
  settings, and multiplicity remain mutually bound.
- Symbolic Git and mutable package declarations remain analyzable with native
  adjacent locks. Root-only evidence for those declarations is rejected as a
  matching-environment limitation because it cannot prove the resolution.
- Task-name, source, path, Git identity, package-ref, partial-lock, root/trial
  lock, and cross-candidate digest tampering fail closed.
- Synthetic tests must model the distinct Harbor checksum algorithms instead
  of manufacturing a TrialLock digest from `TrialResult.task_checksum`.
