# ADR: Candidate Development Gate for Harbor Trace Distillation

Date: 2026-07-19

## Status

Accepted

## Context

Harbor trace distillation originally represented baseline discovery followed
by a disjoint baseline/candidate holdout comparison. That is sufficient for a
small two-phase workflow, but not for studies that require the consolidated
child to be reevaluated across the complete development cohort before holdout.

The knowledge consultation study freezes 24 baseline discovery traces and 24
candidate-development attempts on those same cases. Its holdout and hard cases
must remain unopened until the candidate passes every development case. Mapping
the candidate reevaluation to the existing holdout block is invalid because the
runner correctly rejects discovery/holdout overlap by task name and checksum.

Adding an optional field to config schema 1 would also be unsafe. Older copies
of the atomic skill ignore unknown fields and could silently skip candidate
development while proceeding to holdout.

## Decision

- Keep config schema 1 supported as the legacy discovery-to-holdout contract.
  Reject a `development` block under schema 1.
- Add opt-in config schema 2. It requires candidate-development native Harbor
  artifacts or JobConfigs plus an explicit finite minimum pass rate in 0..1.
  Older runners reject schema 2 instead of bypassing its gate.
- Freeze and materialize the consolidated candidate before candidate
  development. Candidate JobConfigs replace only the declared baseline skill
  with that staged candidate.
- Require candidate development to match baseline discovery exactly as sorted
  multisets of task/checksum/agent/version/model cells, attempts, canonical
  TrialConfigs, configured artifact signatures, and TrialLocks. Discovery locks
  bind the baseline digest; candidate locks bind the frozen candidate digest.
  Weak fairness is forbidden.
- Require physically and evidentially separate candidate attempts despite that
  replay parity. Reject shared job directories/IDs, evidence IDs, trial
  UUIDs/names/URIs, result or lock paths, raw result artifacts, and
  label-independent attempt fingerprints. A copied or relabeled discovery job
  is not candidate-development evidence, including when the candidate digest
  equals the baseline digest.
- Fix Harbor built-in retries at zero for every schema-2 discovery,
  candidate-development, baseline-holdout, and candidate-holdout JobConfig.
  Imported evidence must be a whole job with a complete root retry lock,
  JobConfig/JobLock retry parity, zero reported retries, and matching
  retry-policy digest multisets across each comparison pair.
- Normalize candidate development without trajectories, agent logs, or verifier
  feedback. Keep it out of the trace pool and proposal state so it cannot become
  a second mutation opportunity within the same run.
- Pass development only when all candidate trials are evaluable, error-free,
  qualified on every required reward, canonically locked, and meet the declared
  primary-reward pass rate. Preserve non-evaluable outcomes as null rather than
  semantic zero.
- Write a separate `development-gate.json`. Do not load or execute any holdout
  artifact or JobConfig—including retry validation—unless that gate passes.
  Holdout must then be disjoint from both baseline discovery and candidate
  development.
- Keep output artifact schema 1 and record `configSchemaVersion: 2` in the v2
  plan and run. V1 run artifacts and behavior remain compatible.

## Consequences

- Trace distillation can account for baseline plus consolidated-child
  development budgets without mislabeling development evidence as holdout.
- The knowledge consultation study can enforce its existing 24 + 24 contract
  and minimum development pass rate before releasing its final cases.
- Schema 2 fails closed across skill versions; an outdated copied bundle cannot
  silently omit the new phase.
- Candidate-development failures remain useful metric receipts, but require a
  new run and new candidate digest for any repair. They never authorize an
  in-place post-validation mutation.
- Development replay cannot be satisfied by aliasing or cloning discovery
  evidence; the equal replay signatures describe evaluation parity, while a
  separate independence signature proves distinct attempts.
- Schema-2 promotion now has one retry contract across discovery, development,
  and holdout, without weakening the rule that holdout remains unopened until
  development passes.
- Existing schema 1 callers retain their prior direct holdout behavior. They
  must opt into schema 2 when a separate candidate-development gate is part of
  the governing protocol.
