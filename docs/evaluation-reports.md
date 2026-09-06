# Evaluation reports and skill metrics

Reviewed inventory: 2026-09-06. This page indexes published repository evidence;
it does not inspect ignored jobs or imply that unlisted local runs never happened.
Scores describe the evaluated variant and study profile, not the current installed
skill. Source reports remain authoritative; historical evidence stays in place.

## Find a report

| Report | What it answers | Evidence status |
| --- | --- | --- |
| [Skill evolution comparison, 2026-07-16](../evaluations/harbor-evolution-comparison/results/20260716/report.md) | Scores for OpenAPI Integrator, Deepfake Detector, and Scene Script Planner under four evolution methods | Completed development and historical holdout; small descriptive sample |
| [Knowledge consult qualification pilot](../evaluations/knowledge-consult-evolution/results/q003-qualification-pilot.md) | Qualification, diagnostic utility, and usage for eight `consult-semantic-okf` variants | Exploratory discovery only; no qualified winner; no holdout |
| [Next-skill evidence comparison, 2026-07-20](../evaluations/harbor-next-skill-comparison/README.md) | Which workflow methods have observations versus only contracts | Evidence inventory; no new performance experiment |
| [Knowledge consult study](../evaluations/knowledge-consult-evolution/README.md) | Planned full evaluation and its frozen profile | Protocol; its planned budgets are not completed results |
| [Knowledge meta-evolution](../evaluations/knowledge-consult-evolution/meta-evolution/README.md) | Generation protocols and publication procedure | Workflow history; do not infer scores from candidate or protocol presence |

## Evaluated target skills

The following values are transcribed at the precision of the published
[per-skill result table](../evaluations/harbor-evolution-comparison/results/20260716/report.md#per-skill-results).
Each development cell is **mean / worst reward over four trials**; each holdout
cell is **mean / worst reward over two trials**. Two attempts per task are not
four or two independent task families. The profile used Harbor 0.18.0, Codex
`openai/gpt-5.4-mini`, low reasoning, and zero retries. These historical splits
must not be relabeled as compliance with the newer independent-validation contract.

| Target skill | Evaluated variant | Development reward | Selected artifact | Holdout reward | Holdout delta vs baseline |
| --- | --- | ---: | --- | ---: | ---: |
| OpenAPI Integrator | Baseline | 0.8500 / 0.4000 | Baseline | 0.7273 / 0.4545 | — |
| OpenAPI Integrator | Population | 1.0000 / 1.0000 | Child | 0.7273 / 0.4545 | +0.0000 |
| OpenAPI Integrator | Trace | 1.0000 / 1.0000 | Child | 1.0000 / 1.0000 | +0.2727 |
| OpenAPI Integrator | Pareto | 0.9045 / 0.8000 | Child | 1.0000 / 1.0000 | +0.2727 |
| OpenAPI Integrator | Operator | 0.7614 / 0.5000 | Baseline reused | 0.7273 / 0.4545 | +0.0000 |
| Deepfake Detector | Baseline | 0.6500 / 0.3000 | Baseline | 1.0000 / 1.0000 | — |
| Deepfake Detector | Population | 0.6500 / 0.3000 | Baseline reused | 1.0000 / 1.0000 | +0.0000 |
| Deepfake Detector | Trace | 1.0000 / 1.0000 | Child | 1.0000 / 1.0000 | +0.0000 |
| Deepfake Detector | Pareto | 1.0000 / 1.0000 | Child | 1.0000 / 1.0000 | +0.0000 |
| Deepfake Detector | Operator | 1.0000 / 1.0000 | Child | 1.0000 / 1.0000 | +0.0000 |
| Scene Script Planner | Baseline | 0.9430 / 0.9077 | Baseline | 0.8171 / 0.8049 | — |
| Scene Script Planner | Population | 0.9129 / 0.8615 | Baseline reused | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Trace | 0.9212 / 0.8696 | Baseline reused | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Pareto | 0.8656 / 0.8154 | Baseline reused | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Operator | 0.9212 / 0.8696 | Baseline reused | 0.8171 / 0.8049 | +0.0000 |

Baseline reuse is a measured baseline result, **not a measurement of the rejected
child on holdout**. No confidence interval or statistical significance is reported.
Exact machine-readable results are in the [published summary](../evaluations/harbor-evolution-comparison/results/20260716/summary.json).

### Knowledge consult

`consult-semantic-okf` has a published eight-variant, single-task discovery pilot:
**four evaluable trials, no qualified winner, holdout not opened**. Mixed installed
identities make every row diagnostic and non-promotable. The complete
[pilot table](../evaluations/knowledge-consult-evolution/results/q003-qualification-pilot.md)
provides each candidate's evidence-contract, minimum-document, and mechanical
gates; diagnostic utility; covered/cited-document counts; and input/output tokens.
Its reported utility values for evaluable variants are 0.376, 0.656, 0.657, and
0.782. These are **not qualified rewards or evidence of semantic correctness**.
Unavailable outcomes stay unavailable, never zero.

The pilot reports 13,211,233 input tokens, 12,449,920 cached tokens, and 372,559
output tokens across eight trials; provider cost is unavailable. The
[machine-readable pilot](../evaluations/knowledge-consult-evolution/results/q003-qualification-pilot.json)
preserves the detailed projection. Later candidate/protocol artifacts alone do
not establish another published performance result; the
[dated evidence inventory](../evaluations/harbor-next-skill-comparison/README.md#what-the-tracked-evidence-says)
documents those limits.

## Coverage of the twelve maintained Harbor skills

Target quality and evolution-method performance answer different questions.
The four numeric method rows below reproduce **selected development means across
three subjects**, with baseline fallback, from the
[2026-07-20 evidence inventory](../evaluations/harbor-next-skill-comparison/README.md#what-the-tracked-evidence-says).
They describe historical workflows, not a benchmark of today's bundle versions.
There is no cross-study leaderboard.

| Maintained skill | Published performance evidence in this inventory | Metric / limitation |
| --- | --- | --- |
| `harbor-population-search` | Descriptive method observation | Selected development mean 0.8643255; delta +0.0500000 |
| `harbor-trace-distillation` | Descriptive method observation | Selected development mean 0.9809922; delta +0.1666667 |
| `harbor-reflective-pareto-search` | Descriptive method observation | Selected development mean 0.9491740; delta +0.1348485 |
| `harbor-operator-coevolution` | One-generation child observation | Selected development mean 0.9309922; delta +0.1166667; coevolution benefit not identifiable |
| `harbor-evolve-skill` | No comparable published performance result located | No measured quality gain to report |
| `harbor-realize-skill-candidate` | Sealed contract comparison | Realization reliability and causal gain not measured in that snapshot |
| `harbor-metaskill-evolution` | Sealed contract comparison | Meta-productivity not identifiable in that snapshot |
| `harbor-author-evaluation-datasets` | No published performance result located | No measured dataset-quality gain to report |
| `harbor-organize-evaluations` | No published performance result located | Structural tests are not a skill-quality score |
| `harbor-run-results` | Runner/reporting contract and historical usage | Usage is not an independent quality evaluation of the runner |
| `harbor-resume-external-failures` | Recovery contract | No comparable published recovery-effectiveness metric located |
| `harbor-maximize-knowledge-expertise` | No published performance result located | No measured expertise gain to report |

## Reading and maintaining this inventory

Reward is the study's verifier-defined score, not a universal accuracy percentage.
Compare only matched dataset versions, profiles, budgets, and metric definitions.
Do not combine development, independent validation, and holdout into one score.
Cost covers only the components identified by its source; missing cost, sample
size, uncertainty, or outcome must be shown as unavailable.

This is a human-maintained navigation view of already published summaries, not a
second evaluator. Refresh it when a reviewed report is published, preserving its
date, exact variant identity, provenance, and limitations. Follow the organizer's
[report catalog procedure](../skills/harbor-organize-evaluations/references/report-catalog.md)
for new reports and projects. Private pending results do not enter this catalog.

[Back to documentation](README.md).
