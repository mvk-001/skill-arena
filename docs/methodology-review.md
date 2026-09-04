# Harbor methodology review

Date: 2026-09-04.

This review covers the twelve maintained bundles and their executable
contracts. It improves method selection and resolves continuation rules that
conflicted with the existing independent-validation decision. It does not
start an evolution study or claim a measured improvement in target-skill
performance.

## Choose the method from the evidence

| Responsibility | Owning skill | Decision to make before proceeding |
| --- | --- | --- |
| Dataset design | [Author evaluation datasets](../skills/harbor-author-evaluation-datasets/SKILL.md) | Choose independent semantic families, weighting, competency counterexamples, and verifier validity before increasing variant counts. |
| Study lifecycle | [Organize evaluations](../skills/harbor-organize-evaluations/SKILL.md) | Freeze the hypothesis, budget, stopping rule, selection rule, and independent acceptance rule; distinguish stage completion from acceptance. |
| Native comparison | [Run results](../skills/harbor-run-results/SKILL.md) | Establish completion and comparability before interpreting deltas; distinguish descriptive reporting from a promotion decision. |
| Selective recovery | [Resume external failures](../skills/harbor-resume-external-failures/SKILL.md) | Prove failure eligibility, lineage, and remediation readiness separately; stop at the first evaluable attempt. |
| Scalar search | [Population search](../skills/harbor-population-search/SKILL.md) | Use a scalar only when it meaningfully orders qualified candidates; retain hard gates and a fixed stopping rule. |
| Trace learning | [Trace distillation](../skills/harbor-trace-distillation/SKILL.md) | Separate symptom, causal hypothesis, counterevidence, and reusable patch; distinct task checksums are only a lower bound on independent support. |
| Complementary candidates | [Reflective Pareto search](../skills/harbor-reflective-pareto-search/SKILL.md) | Preserve conflicting case strengths, reevaluate merges, and predeclare how one finalist leaves the archive. |
| Mutation instruction learning | [Operator coevolution](../skills/harbor-operator-coevolution/SKILL.md) | Require distinct attributable child realizations and compare each with its own parent; use development-chain until one final gate. |
| Automatic text evolution | [Evolve skill](../skills/harbor-evolve-skill/SKILL.md) | Use GEPA for SKILL.md-only changes; keep every optimizer selection case in evolution and preserve independent validation. |
| Knowledge portfolio planning | [Maximize knowledge expertise](../skills/harbor-maximize-knowledge-expertise/SKILL.md) | Cover supported mechanisms with a small portfolio and preserve evidence fidelity; a bound classification is not a proven diagnosis. |
| Candidate materialization | [Realize skill candidate](../skills/harbor-realize-skill-candidate/SKILL.md) | Review one exact mutation and its preservation checks; local validation and sealing do not establish fitness. |
| Meta-policy replay | [MetaSkill evolution](../skills/harbor-metaskill-evolution/SKILL.md) | Verify observation identities, parity, and complete arms before interpreting productivity; report insufficient evidence without choosing a policy. |

## Executable corrections

The existing methodology made independent validation a one-way gate, but
population search allowed subsequent holdout attempts and new winners,
coevolution marked full runs as chainable, and Pareto allowed development
after a holdout output existed.

- Population search now checks the entire attempt history before any new
  input evaluation or writes. Executed, imported, or unfinished holdout
  attempts terminate continuation. Artifact-only staging can be completed
  using the same generation, candidate digests, job identities, and unchanged
  development evidence.
- Coevolution now emits terminal full-run and breeding receipts and rejects
  opened or unproven-unopened predecessors before new jobs or output creation,
  including dry-run and doctor. Historical full receipts are preserved but
  cannot authorize another generation.
- Pareto now rejects a search output with an attempted holdout and checks the
  standard output location of its immediate predecessor before continuing.
  A failed release is still a release attempt.
- Native reporting instructions now require zero built-in retries and route
  proven external failures to selective recovery. The research overview now
  describes GEPA selection on evolution, followed by independent validation.

The durable decision is recorded in the
[terminal-gates ADR](../.specs/adr/2026-09-04-terminal-independent-gates-and-method-selection.md).

## Sealed bundle compatibility

The complete current trees of `harbor-realize-skill-candidate` and
`harbor-metaskill-evolution` are bound by the preserved next-skill study,
including their SKILL.md files. This review leaves those two bundles byte-for-byte
unchanged. Their decision guidance is summarized in the table above; the ten
other maintained skills receive the applicable instruction improvements.
The historical verifier and its expected hashes remain unchanged.

## What remains a study responsibility

These continuity checks protect local output and declared predecessor history.
They cannot prove that a copied archive, a different output directory, or a
new dataset label has never been exposed. Use the organizer's release ledger
and independent access boundary; a new claim after exposure needs fresh
validation.

Digests establish byte identity, not semantic independence, trusted authorship,
causal explanation, statistical power, or meaningful outcome measurement.
Minimum task/child counts do not establish an effective independent sample
size. Report uncertainty only under an appropriate declared analysis supported
by the available observations; do not invent intervals from aggregate means.

Campaign-wide budgets and stopping rules for manual generation loops remain
protocol responsibilities where the owning CLI has no corresponding option.
For multi-generation population search, commit validation in the study before
generation zero, omit its holdout flag from intermediate invocations, and
supply it only for final selection. A supplied template automatically releases
the gate for a qualified, content-changing winner.
A failed gate cannot be repaired by relaxing thresholds after seeing results.
Recovery can complete only a frozen comparison under its original
first-evaluable policy; it cannot reopen candidate selection. The population
runner does not finalize that recovery by reentering its search command.

## Verification

The regression tests exercise accepted, rejected, unavailable, staged, and
failed-release paths using synthetic native Harbor artifacts. They check
continuation rejection, preserved evidence bytes, unchanged staged candidate
bindings, terminal full-run flags, and successful unopened development chains.
They do not execute paid model evaluations or establish an empirical ranking
among methods.

Run the repository checks and the affected runtime tests:

```sh
npm run docs:check
npm run skills:check
npm test
node --test test/harbor-population-search.test.js test/harbor-operator-coevolution.test.js test/harbor-reflective-pareto-search.test.js
```

Run each copied bundle's declared structural and command-line checks as well.
Sealed studies and the root package manifests retain their existing bytes.

[Back to documentation](README.md).
