# ADR: Verifiable Selective Resume for Harbor Evaluations

Date: 2026-07-18

## Status

Accepted

## Context

A Harbor evolution run can finish with only a subset of trials unavailable
because of provider, evaluator, environment, or infrastructure failures.
Restarting every candidate-task cell wastes model calls that already produced
valid evidence. Retrying all failures, however, gives semantic failures extra
attempts, enables best-of selection, and can bias strategy comparisons.

The four Harbor-native evolution bundles must remain independently copyable.
Selective continuation therefore needs its own Harbor-native evidence contract
rather than a shared Skill Arena runtime dependency.

## Decision

- Add the atomic `harbor-resume-external-failures` bundle. It consumes completed
  native Harbor jobs and emits fresh retry jobs only for independently
  attestable external failures.
- Require structured verifier-owned diagnostics or an exact allowlisted Harbor
  exception type or code. Missing reward alone and unstructured error text are
  insufficient evidence.
- Require completed source jobs by default. Permit an interrupted root only
  through an explicit, versioned, code-owned failure contract whose complete
  native lifecycle and artifact predicates pass. The initial contract,
  `harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1`, requires
  the exact one-trial cancelled root counters, null token/cost and execution
  fields, the Harbor SIGTERM stack during Pi setup, matching exception/log
  artifacts, and a failed-and-absent agent trajectory. `CancelledError` alone
  remains insufficient.
- Require a concrete transient rate-limit/HTTP-5xx/service-unavailable signal
  for provider retries; a generic provider label is insufficient. Only exact
  zero reward/gate placeholders may coexist with external evidence—any nonzero
  score is a conflict and fails closed.
- Apply an absolute non-retryable policy to semantic reward or gate failures,
  invalid answer/evidence contracts, context-window exhaustion, agent timeout,
  candidate token or tool-budget exhaustion, and ambiguous or conflicting
  classifications. A provider label does not override this denylist.
- Require a typed remediation attestation backed by a real evidence file and an
  exact SHA-256 digest, plus a successful preflight, before retrying
  authentication or environment failures. Seal only the type/path/digests and
  declaration; never copy evidence contents or secret values.
- Apply the same attestation and preflight requirement to the initial
  interrupted-root infrastructure contract, fix its external retry cap at one,
  and require explicit continuation intent. A domain adapter may keep a
  credential-derived content hash and file metadata inside the private
  evidence file, but sanitized publication exposes only evidence and
  attestation digests.
- Bind every retry to the original task name and checksum, task lock digest,
  agent/model/version/settings, environment signature, retry policy, and exact
  canonical skill name/source/digest. Missing or legacy provenance is
  diagnostic only and cannot be retried automatically.
- Create one new immutable Harbor job per eligible failed trial. Never resume,
  delete, or overwrite a native job directory. Preserve the source and retry
  artifacts and record their checksums in an append-only resume ledger.
- Serialize mutating runs with a sibling O_EXCL writer lock. Fail closed on a
  concurrent or stale lock. Persist a sealed, cap-consuming reservation before
  creating any attempt directory, staged skill, retry config, or Harbor job;
  an unresolved reservation blocks further calls.
- Merge by lineage: the first evaluable retry becomes the effective result.
  Never launch or import a later attempt, choose the highest reward, or otherwise
  cherry-pick after that point. An
  external failure that remains unavailable may continue only within the
  predeclared maximum external-attempt budget.
- When every original trial has an effective result, materialize a derived
  Harbor-compatible `effective-job` view. Copy successful original trials and
  the first evaluable retry for each unavailable trial, rebuild the root result
  aggregates, and seal every source and destination checksum in a resume
  manifest. Do not create a complete effective view while any trial remains
  unresolved. Existing evolvers may consume this view through their ordinary
  analyze-only job-directory input without depending on the resume bundle.
- Reject non-finite rewards, profile drift, task drift, skill drift, unsafe
  links, and any changed retry policy before model execution.
- Keep the resume bundle independent of Skill Arena modules and of all four
  evolution bundles. The dataset, task corpus, candidate skill, and prior
  Harbor jobs remain external inputs.

## Consequences

- Successful task cells are reused, reducing repeated model calls after a
  partial external outage.
- Semantic failures receive no additional attempts, so the resumed evidence is
  comparable with an uninterrupted run under the same frozen policy.
- Context-limit and agent-timeout cases require a candidate mutation or a new
  declared evaluation design; they cannot be disguised as transient retries.
- Legacy jobs without canonical skill provenance remain useful for diagnosis
  but cannot enter automatic resume or promotion paths.
- The resume ledger makes every eligibility decision, retry, and effective
  result independently auditable.
- The derived effective job is explicitly a lineage-preserving audit view, not
  a claim that Harbor executed all effective trials in one physical job.
- Complete effective jobs are built and verified in private sibling directories
  and become visible only through an atomic rename. Repeated analyze-only runs
  with no imports verify existing outputs and are byte-idempotent.
