# ADR: Seal Dataset Portfolios and Leakage Reviews in the Organizer

Date: 2026-09-04

## Status

Accepted

## Context

The organizer already supports multiple dataset IDs per stage and an independent
validation boundary. Its documented workflow nevertheless emphasizes one cohort
per split, and byte-disjoint task roots do not detect renamed or paraphrased
members of the same semantic family. Repeated filenames, prompt patterns, and
other incidental cues can also become optimization shortcuts. With multiple
private datasets, selectively opening or reporting only favorable cohorts would
undermine independent verification.

## Decision

- Limit this change to `harbor-organize-evaluations`, its tests, and supporting
  documentation. Do not modify dataset-authoring or evolution skill contracts.
- Treat public/private as optimizer access derived from split. Preserve separate
  dataset identities and allow multiple datasets in every role. Publication
  permissions remain a distinct boundary.
- Initialize study schema 2 with a mandatory `seal-design` event before execution.
  Keep existing schema 1 studies auditable under their legacy contract without
  rewriting historical evidence. Ledger envelopes and dataset locks retain their
  own schema 1.
- Bind the complete dataset portfolio, baseline, protocol, private curator review,
  and planned private evaluation/comparison stages. Require exact dataset/task
  review coverage and reject shared declared independence groups across datasets.
- Require supporting evidence for six curator checks covering provenance and
  contamination, grouping, surface cues, verifiers, coverage and power, and access
  isolation. The organizer validates receipts and bytes; the curator evaluates
  semantic quality and the native evaluator interprets performance.
- Plan all private gates before sealing. All validation gates must descend from
  a common evolution selection, and all holdout gates from a common pre-holdout
  selection. Validation releases one candidate for the complete portfolio; all
  planned validation gates must complete before holdout release. Owners apply
  the frozen joint acceptance rule before that release.
- Block further optimizer-visible execution and realization after private gate
  disclosure, including ordinary studies that use only a holdout gate and
  attempts to relabel work as ordinary evaluation. An
  independently proven external-failure recovery remains with its existing
  owner and must bind the original split. No best-of recovery is introduced.
- Document task-family grouping, nuisance-surface audits, counterfactual checks,
  predeclared method comparisons, uncertainty, and cross-study dataset retirement
  inside the independently copyable organizer bundle.

## Consequences and Limits

Preparation errors now stop execution before a costly evolution run. Receipts,
protocols, baselines, and private gate plans are immutable evidence. Native Harbor
jobs and owning skills remain responsible for scoring and actual input identity;
this change introduces no second result format or optimizer.

Opaque group labels and passing receipts do not prove semantic independence,
reviewer authority, or adequate statistical power. Operating-system access
controls and a curator's cross-study exposure inventory remain necessary.
The organizer does not implement reusable-holdout guarantees or automatically
discover semantic contamination. Even a binary progress signal consumes an
independent gate when it influences another candidate decision.

Existing sealed studies, root package hashes, and all other skill bundles remain
unchanged. The executable contract and source rationale are maintained in the
[organizer skill](../../skills/harbor-organize-evaluations/SKILL.md) and its
[design reference](../../skills/harbor-organize-evaluations/references/study-design-and-leakage.md).
