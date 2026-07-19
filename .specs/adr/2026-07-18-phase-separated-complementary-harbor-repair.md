# ADR: Phase-Separated Complementary Harbor Repair

Date: 2026-07-18

## Status

Accepted

## Context

Harbor operator coevolution previously required at least one fully qualified
development candidate and then immediately opened the declared holdout. This
is correct for promotion, but it discards useful non-compensating evidence when
separately evaluated children pass complementary required-reward gates while no
single child passes all gates. It also prevents a caller from freezing a
development winner before authorizing holdout execution.

Partial gate coverage must not become scalar fitness, operator credit, survival,
or promotion. External failures, missing rewards, repeated identical child
bundles, and unrelated parent evaluations cannot support a causal repair
hypothesis.

## Decision

- Keep the full development-then-holdout workflow and its fail-closed behavior
  as the default.
- Add `--phase development`. It executes or analyzes only development jobs,
  seals the selected candidate ID and bundle digest, and records promotion and
  chain eligibility as false. Holdout declarations remain frozen but their job
  paths are not resolved, loaded, validated, or executed.
- Defer holdout path resolution and artifact validation in an actual full run
  until after qualified development selection. Full dry-run and doctor may
  still preflight the explicitly requested full workflow.
- Add the opt-in Boolean `coevolution.complementaryRepair`. It applies only when
  no development candidate passes every qualification gate.
- Preserve the complete required-reward vector for each candidate and trial.
  Complementary coverage is a conjunction over trials, never an average.
- Permit a diagnostic repair pair only when both children and their common
  evaluated parent are evaluable, each child preserves the parent's passing
  gates and adds at least one, the operators differ, and each child contributes
  an exclusive gate.
- Apply `minimumOperatorTrials` to repair evidence without granting normal
  operator credit or survivor status.
- Permit development-only output to seal a qualified candidate when fewer than
  `operatorSurvivors` operators are established. Preserve the operator ranking
  and credit evidence, but emit an empty diagnostic breeding plan with reason
  `insufficient-established-operators`. Full mode remains fail-closed.
- Reject duplicate child bundle digests attributed to one operator as
  pseudoreplication.
- Emit a sealed, diagnostic-only `repair-plan.json` and development log with
  empty survivors, closed holdout, false promotion, and false chain eligibility.
  The generic repair instruction must be realized and freshly evaluated before
  entering normal selection.

## Consequences

- A caller can stop after development, review the sealed winner or repair
  hypothesis, and avoid premature holdout execution.
- Complementary failures can guide a generic crossover/mutation without being
  mislabeled as demonstrated skill improvement.
- Repair output may retain raw and hard-gated fitness values for diagnosis, but
  it never awards, selects, credits, or breeds from those values.
- Missing, malformed, errored, externally failed, under-sampled, differently
  parented, or pseudoreplicated evidence cannot enter a repair pair.
- Development-only and repair logs are receipts, not valid predecessor logs for
  another coevolution generation. A later release phase must bind to their
  selected candidate and seal before opening holdout.
