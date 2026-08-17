# ADR: Require Independent Validation Before Evolution Starts

Date: 2026-08-01

## Status

Accepted

## Context

An evolution strategy can appear to improve while learning the exact cases used
to propose, rank, merge, or select candidates. Calling an optimizer-visible
selection cohort `validation` does not test generalization: repeated candidate
decisions can overfit that cohort just as they can overfit training cases.

The repository already separates development from holdout in most evolution
bundles, but the shared organizer treated validation as optimizer-visible and
did not require it when an evolution stage began. The GEPA runner also passed
its configured validation split directly to GEPA for candidate selection. A
methodological warning alone would not prevent either execution path.

## Decision

- Define `development` as the organizer's optimizer-visible evolution dataset.
- Require every organizer-managed evolution to register a byte-disjoint
  `validation` dataset and plan a downstream validation stage before the
  evolution stage can transition to `running`.
- Embed the evolution/validation boundary in every evolution-stage ledger
  event so status and audit output carry the requirement with the task.
- Allow evolution stages to bind only development datasets. Validation stages
  bind only validation datasets and remain unavailable until release.
- Require the completed evolution stage to record the selected candidate file
  or bundle with evidence kind `candidate`. `release-validation` digest-binds
  that artifact before any validation stage or evidence can open.
- Make validation release one-way. No further evolution stage may start in the
  same study after validation is visible. Another unbiased claim requires a new
  study with fresh validation data.
- Treat holdout as an optional additional gate after validation. In an atomic
  evolver that names its only unseen cohort `holdout`, that cohort may fulfill
  the mandatory independent-validation role at the study level.
- Move `harbor-evolve-skill` to configuration schema 2. GEPA receives only the
  `evolution` dataset; the runner freezes one selected candidate, evaluates it
  against the unchanged baseline on `validation`, and opens holdout only after
  validation passes. Schema 1 is rejected because it made validation
  optimizer-visible.
- Keep validation results out of mutation, ranking, operator credit,
  reflection, consolidation, and reselection in every evolution bundle.

## Consequences

- Evolution cannot begin through the organizer with only a development cohort
  or with validation accidentally bound to the evolution stage.
- A study records the candidate digest before independent evidence exists, so
  validation measures one frozen decision instead of becoming another search
  loop.
- Failed validation remains useful evidence, but consuming it ends the current
  study's unbiased gate. Iteration requires explicitly replenishing validation
  in a new study.
- GEPA may still overfit its evolution cases internally; the independent gate
  now detects that failure without influencing the optimizer.
- Studies may retain an additional untouched holdout for higher-consequence
  promotion decisions.
- Existing sealed study evidence and locks remain unchanged. The organizer
  rule applies to new organizer-managed studies, and the GEPA schema change
  applies to new runs.
- The next-skill historical comparison keeps its frozen contract hashes and
  verifies evolved maintained-skill sources against the exact prior bytes in
  Git history; sealed results and non-skill historical evidence still require
  exact current-tree bytes.
