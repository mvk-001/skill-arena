# ADR: Bound Candidate Realization and MetaSkill Replay

Date: 2026-07-20

## Status

Accepted

## Context

The maintained Harbor evolvers validate and rank native job evidence, but the
agent-authored step between a mutation plan and a complete candidate bundle was
not one reusable contract. Versioned studies consequently implemented their
own candidate manifests, operator-realization receipts, locks, and validation
checks. This made source immutability and exact mutation attribution harder to
apply consistently across evolution methods.

MetaSkill-Evolve proposes a distinct two-timescale mechanism: each branch owns
a task skill plus five typed improvement policies, and branch selection uses
task utility, recent policy productivity, and novelty. Existing operator
coevolution instead credits exact mutation instructions across explicit
generations. The mechanisms overlap, but neither subsumes the other.

The paper does not release executable code, complete policy prompts, split
seeds, repeated-run uncertainty, or a cost ledger. The prior local
four-strategy study also contains only one submitted child per strategy, so it
cannot identify the causal effect of a slow meta-policy update.

## Decision

- Add `harbor-realize-skill-candidate` as an atomic, evaluator-independent
  materialization boundary. It copies a frozen parent into isolated staging,
  binds an exact mutation contract and allowed path scope, runs declared
  validation, and seals a complete candidate plus provenance receipts.
- Keep the realization core separate from native Harbor execution, fitness,
  development selection, holdout, promotion, and installation. Treat declared
  validation as trusted unsandboxed code and never infer its external effects
  from the realizer's zero core-call count.
- Add `harbor-metaskill-evolution` as an atomic analysis-first adaptation with
  five internal policy roles: analyzer, retriever, allocator, proposer, and
  evolver. Do not publish those roles as five separately invocable skills.
- Require append-only task/meta lineage, separate producing and inherited meta
  digests, development-only evidence, digest-bound evidence references, minimum
  productivity support, hard gates before frontier scoring, and a frozen total
  budget.
- Resolve exact source-artifact selectors for evaluated skill identity, status,
  comparison identities, utility, and gates. A projection and receipt agreeing
  with each other is not sufficient unless the selected source fields agree.
- Bind every frozen/adaptive child to one unique generation slot and SHA-bound
  receipt covering seeds, ordered retrieval, prompts, profiles, parent state,
  producing meta-policy, and realized child digest. Exclude unchanged skills and
  structural branch-seed edges from productivity.
- Partition frontier rankings by comparison profile, task set, and utility
  metric. Never order values from incomparable cohorts or reward scales.
- Treat external or otherwise non-evaluable outcomes as unavailable, never as
  zero and never as evidence that advances the slow-loop horizon.
- Keep native Harbor artifacts and the owning Harbor-native analyzer as the
  evaluation surface. MetaSkill replay may consume digest-bound numeric fields
  from their sanitized projections, but it may not reinterpret trajectories or
  define another reward normalization.
- Treat development labels and holdout filtering as configured boundaries, not
  semantic proof. The replay reports that producer authority and semantic
  holdout absence remain unverified.
- Keep the first MetaSkill implementation analysis-only. Live mutation,
  retrieval, model calls, and Harbor execution require a later versioned study
  with an equal-budget frozen-meta control before they can enter this contract.
- Add an append-only comparison study. Report compatibility and evidence
  sufficiency separately; use `not-identifiable` when historical evidence does
  not support a causal or performance comparison.

This expands the maintained surface from seven to nine atomic bundles and from
two to three versioned studies. It narrows, but does not rewrite, the historical
Harbor-only repository decision.

## Consequences

- Population, trace, Pareto, operator, and future policy evolvers can share one
  candidate realization boundary without importing each other's code.
- Candidate authorship becomes inspectable without granting the materializer
  authority to select or promote its own output.
- Branch-local meta-policy hypotheses can be replayed before any model spend,
  while unsupported productivity estimates fail closed.
- A fair prospective MetaSkill claim still needs repeated comparable
  parent-child development evidence, fixed budgets and retrieval, a
  frozen-meta control, independent final evaluation, and unopened holdout.
- Historical studies and their locks remain byte-for-byte unchanged; new
  comparison evidence lives in its own append-only directory.
