# ADR: Terminal independent gates and evidence-led method selection

Date: 2026-09-04.

## Status

Accepted.

## Context

The [independent-validation decision](2026-08-01-independent-validation-before-evolution.md)
requires one frozen selection followed by an optimizer-invisible acceptance
gate. Some maintained continuation paths contradicted that contract:
population search allowed a new winner after prior holdout attempts,
coevolution emitted chain-eligible full logs, and Pareto could continue
development after opening its holdout output.

Append-only records prevent overwriting history but cannot prevent a later
candidate from responding to an earlier independent result. Guidance also
needed to distinguish method-specific decision evidence from structural
checks and descriptive scores.

## Decision

1. Treat every executed or imported population holdout attempt as terminal for
   the local search. Unfinished attempts fail closed. Check consumption across
   the whole history before considering staged completion.
2. Permit completion of an artifact-only population staging receipt only for
   the same generation, baseline, candidate digests, development jobs, and
   unchanged development evidence. Do not authorize retries or reselection.
3. Mark new full coevolution logs and their breeding plans non-chainable.
   Reject full or unproven-unopened predecessors before creating output,
   loading new jobs, or invoking Harbor. Keep qualified, unopened
   development-chain predecessors available under their existing profile,
   seal, exact-instruction, and fresh-evidence checks.
4. Treat creation of a Pareto holdout output as an attempted release. Reject
   subsequent development or holdout in that output and continuation from a
   standard-layout predecessor whose output has attempted release.
5. Keep dataset freshness, semantic family independence, protocol budgets,
   stopping rules, and causal or statistical claims distinct from executable
   byte/provenance checks. Put method-specific decisions in the owning skill;
   keep repository documentation a navigation and rationale layer.
6. Keep Harbor's built-in retries at zero. Use selective recovery only under
   its existing independently proven external-failure contract, without
   reopening candidate selection.

## Consequences and compatibility

The next-skill snapshot also binds the complete current trees of the candidate
realizer and MetaSkill replay bundles. Keep both byte-for-byte unchanged in
this review; summarize their methodology in the review guide without changing
their sealed entrypoints or weakening the historical verification tests.

- This enforces the existing scientific boundary rather than redefining the
  outcome metric, optimizer, native job schema, or result schema.
- Historical study bytes, locks, receipts, and package manifests remain
  unchanged. An old receipt can still be inspected; its prior chainable flag
  does not authorize a new evolution after validation exposure.
- A failed or interrupted independent gate preserves its evidence and the
  baseline. A new output path alone does not establish an unbiased new study.
- Population search does not finalize post-release recovery by rerunning
  selection. Report recovered native evidence through the appropriate
  evaluator while preserving the original frozen decision and recovery
  lineage.
- Local guards are not a global access-control or dataset-freshness service.
  The organizer and independent validation authority retain those duties.
- Deterministic regression tests cover the terminal boundary, staged
  completion, failed attempts, unchanged evidence, and still-unopened
  development chains. They do not establish a live performance improvement.
