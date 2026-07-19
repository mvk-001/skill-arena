# Skill Evolution Strategy Evaluation

> [!CAUTION]
> This Skill Arena strategy workflow is deprecated and retained only for
> historical reproduction. Use `harbor-evolve-skill` or the appropriate
> Harbor-native population, trace, Pareto, or operator workflow for new work.

This evaluation compares four improvement workflows and leaves the full inputs,
scripts, replay results, and live compare config under
[`evaluations/skill-evolution-strategies/`](../evaluations/skill-evolution-strategies/).
It is designed to answer “which method fits my evidence?” rather than declare
one universal optimizer.

## Strategies

| Strategy | Evidence required | Mechanism | Main risk |
| --- | --- | --- | --- |
| Population search | Stable scalar fitness for every candidate | Broad mutation/crossover and top-two selection | Mean-score overfitting and evaluation cost |
| Trace distillation | Diverse labeled success and failure traces | Prevalence-based, conflict-filtered patch consolidation | Weak or correlated trace evidence |
| Reflective Pareto search | Per-case scores and verified diagnoses | Feedback-guided edits plus non-dominated archive | Archive growth and expensive full-case reevaluation |
| Operator coevolution | Repeated generations with parent/operator lineage | Parent-to-child credit and operator evolution | Noisy credit and premature operator conclusions |

## Corpus

The catalog was generated from `$HOME/dev/skills/.agents/skills` and contains
21 valid skill bundles. Four subjects were selected to cover different shapes:

- `animated-svg-to-gif`: compact deterministic converter
- `d3-composition-evaluator`: small evidence-led evaluator
- `compose-synchronized-svg`: large multi-case orchestrator
- `html-d3-anime-video-workflow`: script-heavy production workflow

The committed fixture snapshots only each subject's `SKILL.md`; it does not copy
the external repository's large assets. The snapshot manifest records exact
source paths, SHA-256 hashes, and line counts. Refresh it with:

```powershell
node evaluations/skill-evolution-strategies/scripts/prepare-corpus-snapshot.js `
  --source-root $HOME/dev/skills/.agents/skills
```

Generate the complete catalog with:

```powershell
node skills/skill-arena-strategy-evaluator/scripts/catalog-skills.js `
  --root $HOME/dev/skills/.agents/skills `
  --output evaluations/skill-evolution-strategies/corpus-catalog.json
```

## Evidence Layers

### Deterministic mechanism replay

Replay fixtures contain candidate development scores, case scores, trace tags,
operator lineage, complexity, evaluation cost, and hidden holdout scores. Each
strategy selects without seeing holdout; holdout is revealed only after the
selection. This verifies selection behavior and failure modes, not agent
quality.

Current replay results:

| Strategy | Mean holdout | Mean gain | Regression-free | Mean complexity delta |
| --- | ---: | ---: | ---: | ---: |
| Population search | 74.3% | +7.7 points | 75% | +11.25 |
| Trace distillation | 85.0% | +18.5 points | 100% | +3.25 |
| Reflective Pareto search | 88.5% | +22.0 points | 100% | +4.25 |
| Operator coevolution | 74.3% | +7.7 points | 75% | +11.25 |

Interpretation: reflective Pareto search has the best aggregate result in this
controlled replay, population search wins the stable scalar converter case,
and trace distillation wins the recurring-findings case. In one generation,
operator coevolution selects the same final skill as scalar population search;
its distinct output is the `evolved` operator elite for the next generation.
The fixture does not model the quality of future children, so it cannot measure
that delayed benefit. These outcomes expose mechanism fit; they are not
historical measurements from the source skill repository.

Reproduce them with:

```powershell
node skills/skill-arena-strategy-evaluator/scripts/evaluate-strategies.js `
  --input evaluations/skill-evolution-strategies/replay-scenarios.json `
  --output evaluations/skill-evolution-strategies/replay-results.json `
  --markdown evaluations/skill-evolution-strategies/replay-report.md
```

### Live agent comparison

[`evaluation.yaml`](../evaluations/skill-evolution-strategies/evaluation.yaml)
uses four identical prompts across four isolated strategy-skill profiles. The
prompts cover scalar selection, heterogeneous cases, recurring trace evidence,
and an operator plateau. Each cell must create a structured decision artifact;
deterministic JavaScript assertions check JSON structure and the profile's
declared selection mechanism. Holdout scores are absent from the live workspace.

Run the live layer in order:

```powershell
npx . val-conf evaluations/skill-evolution-strategies/evaluation.yaml
node skills/skill-arena-config-author/scripts/validate-evaluation-design.js `
  evaluations/skill-evolution-strategies/evaluation.yaml `
  --coverage evaluations/skill-evolution-strategies/prompt-coverage.json
npx . evaluate evaluations/skill-evolution-strategies/evaluation.yaml --dry-run
npx . evaluate evaluations/skill-evolution-strategies/evaluation.yaml `
  --markdown-output evaluations/skill-evolution-strategies/last_report.md
```

One request per cell is a live smoke, not reliability evidence. Raise requests
to at least three before using pass-rate differences for promotion decisions.

The maintained GPT-5.4 smoke completed 16/16 cells with zero runtime errors and
10/16 strict method-fidelity passes:

| Profile | Method fidelity | Post-selection holdout | Holdout gain | Tokens avg | Latency avg |
| --- | ---: | ---: | ---: | ---: | ---: |
| Population search | 25% | 92.8% | +26.2 points | 32,492 | 41.3 s |
| Trace distillation | 50% | 88.5% | +22.0 points | 46,073 | 50.4 s |
| Reflective Pareto search | 100% | 88.5% | +22.0 points | 37,756 | 50.6 s |
| Operator coevolution | 75% | 80.3% | +13.7 points | 23,575 | 37.0 s |

The two metrics answer different questions. Reflective Pareto is the most
faithful and predictable. Population search achieved the highest revealed
holdout by departing from scalar selection in three cases and adapting to the
evidence regime; that is good decision quality but low algorithm fidelity.
Operator coevolution was cheapest and fastest, but its absolute-fitness final
candidate overfit two heterogeneous fixtures. Trace distillation behaved as
expected on recurrent traces and the scalar case, then chose robust alternatives
outside its native regime.

Rebuild the joined analysis after a live run:

```powershell
node skills/skill-arena-strategy-evaluator/scripts/analyze-live-results.js `
  --results results/skill-evolution-strategies/<run>-compare/promptfoo-results.json `
  --replay evaluations/skill-evolution-strategies/replay-scenarios.json `
  --output evaluations/skill-evolution-strategies/live-analysis.json `
  --markdown evaluations/skill-evolution-strategies/live-analysis.md
```

See [`last_report.md`](../evaluations/skill-evolution-strategies/last_report.md)
for the matrix and [`live-analysis.md`](../evaluations/skill-evolution-strategies/live-analysis.md)
for post-selection holdout, token, and latency joins.

## Decision Guide

Use the evidence already available, not the replay winner alone, to choose a
workflow:

| If this is true | Choose | Do not choose it when |
| --- | --- | --- |
| Every candidate has one trusted scalar fitness and broad evaluation is affordable | Population search | Important cases conflict or the mean hides regressions |
| A diverse pool of labeled success and failure traces already contains recurring lessons | Trace distillation | Evidence is sparse, correlated, or dominated by one anomalous trace |
| Cases conflict and each failure has case-local evidence plus a verified diagnosis | Reflective Pareto search | Only one reliable aggregate score exists or full per-case reevaluation is unaffordable |
| Fixed mutation operators have plateaued over repeated generations and every child has unambiguous parent/operator lineage | Operator coevolution | This is a one-shot edit, there is no plateau, or operator credit is too noisy |

In short: start with trace distillation when reusable historical evidence
already exists; otherwise use reflective Pareto for heterogeneous diagnosed
cases or population search for one scalar objective. Escalate to operator
coevolution only after ordinary operators stop improving across generations.
For historical reproduction only, `skill-arena-strategy-evaluator` can replay
the committed Skill Arena study; it is deprecated and must not be used or
extended for new strategy work.

For high-stakes promotion, use a staged composition: distill recurrent lessons,
freeze the resulting baseline, search candidates, retain complementary Pareto
members, and expose holdout only at the final gate. Do not optimize benchmark
and skill in the same run.

### Harbor-native execution path

When Harbor tasks are the evaluation surface, use the corresponding
harbor-population-search, harbor-trace-distillation,
harbor-reflective-pareto-search, or harbor-operator-coevolution bundle. Each
executes or inspects native Harbor jobs and derives its strategy evidence
directly from job locks, trial rewards, errors, trajectories, and verifier
output without passing through Skill Arena.

Use [harbor-evolve-skill](../skills/harbor-evolve-skill/SKILL.md) when the
objective is specifically integrated GEPA reflection over SKILL.md. These
Harbor workflows are operational paths, not additional rows in the controlled
four-strategy replay above, and every one retains a separate
baseline-versus-candidate holdout gate.

### Harbor live comparison conclusions

A separate Harbor-native study applied all four strategies to three real skill
bundles: `openapi-integrator`, `deepfake-detector`, and
`scene-script-planner`. It executed 24 eligible Harbor jobs and 78 trials with
zero execution errors or retries. The sample is intentionally small, so use
these results as operational guidance rather than statistical proof.

| Strategy | Selected development mean | Selected holdout mean | Holdout gain vs. baseline | Practical conclusion |
| --- | ---: | ---: | ---: | --- |
| Trace distillation | 0.9810 | 0.9390 | +0.0909 | Best default when diverse Harbor traces and verifier diagnostics exist; strongest development result, but largest patches and highest attributed usage |
| Reflective Pareto search | 0.9492 | 0.9390 | +0.0909 | Best robustness companion; tied the best holdout with smaller patches and lower attributed usage while preserving complementary candidates |
| Population search | 0.8643 | 0.8481 | +0.0000 | Simple and parallelizable, but a one-child budget underuses population breadth and produced no aggregate holdout gain |
| Operator coevolution | 0.9310 | 0.8481 | +0.0000 | Useful only with repeated generations and at least two evaluated operators; its guardrail correctly refused to claim coevolution from one operator |

Use trace distillation as the default generator of evidence-backed updates,
then use reflective Pareto selection to protect complementary case strengths
and decide which candidate reaches the untouched Harbor holdout. Add population
search when the budget supports several children per generation. Add operator
coevolution only after ordinary mutation operators plateau and the experiment
can attribute multiple children to multiple operators.

See the [Harbor evolution playbook](./harbor-evolution-playbook.md) for the
minimum-call operating sequence, selection quadrant, and per-strategy Ishikawa
and test-state diagrams.

The reproducible protocol, frozen locks, detailed critique, and machine-readable
summary are in
[`evaluations/harbor-evolution-comparison/`](../evaluations/harbor-evolution-comparison/),
with the primary report at
[`results/20260716/report.md`](../evaluations/harbor-evolution-comparison/results/20260716/report.md).

## Limitations

- The committed replay landscapes are controlled fixtures.
- The corpus snapshot covers four of 21 skills and only their `SKILL.md` files.
- One live request per cell cannot estimate variance.
- The live smoke measures selection and method fidelity, not the quality of a
  fully materialized skill edit.
- Operator coevolution needs multiple generations to measure whether its
  selected operator creates better future children; this one-generation replay
  only measures current candidate and operator selection.
- Local CLI versions, model availability, and judge behavior can change; every
  live report must record its exact runtime metadata.
