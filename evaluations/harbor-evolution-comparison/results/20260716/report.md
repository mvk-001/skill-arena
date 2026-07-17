# Harbor-Native Skill Evolution Comparison

Date: 2026-07-16
Study: `harbor-evolver-comparison-20260716`

## Outcome

Trace distillation and reflective Pareto search tied for the strongest selected
holdout result: `0.9390` mean reward across the three skills, `+0.0909` over
the shared baseline mean. Trace distillation had the strongest selected
development result (`0.9810`), while reflective Pareto reached the same
holdout result with a smaller average patch and lower attributed
selected-result usage. Population search and operator coevolution each
promoted one child but did not improve aggregate holdout reward.

This is a fit-to-evidence result, not a universal ranking. The strongest
practical conclusions are:

- Use trace distillation when multiple concrete success and failure traces can
  be consolidated into exact behavioral gates.
- Use reflective Pareto search when cases expose different failure dimensions
  and retaining complementary candidates is worth the archive overhead.
- Use scalar population search only with a real multi-candidate budget and a
  target whose mean reward is known to represent the important cases.
- Reserve operator coevolution for repeated generations with attributable
  operator lineage; a one-generation study measures a child, not the delayed
  benefit of evolved mutation operators.

No source skill was modified. All submitted bundles are isolated copies under
`.tmp/harbor-evolution-comparison/20260716/candidates/`.

## Aggregate Results

The baseline mean was `0.8143` in development and `0.8481` on holdout. The
selected development column uses the baseline whenever the submitted child
failed the frozen promotion rule. Holdout likewise reuses the shared baseline
job when development selected the baseline.

| Strategy | Raw child dev | Selected dev | Dev delta | Children promoted | Selected holdout | Holdout delta | Holdout I/T/R | Mean bundle delta | Child-dev cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Population search | 0.8543 | 0.8643 | +0.0500 | 1/3 | 0.8481 | +0.0000 | 0/3/0 | +1,125 B | $0.2365 |
| Trace distillation | **0.9737** | **0.9810** | **+0.1667** | 2/3 | **0.9390** | **+0.0909** | 1/2/0 | +2,021 B | $0.2670 |
| Reflective Pareto | 0.9234 | 0.9492 | +0.1348 | 2/3 | **0.9390** | **+0.0909** | 1/2/0 | +1,289 B | $0.2409 |
| Operator coevolution | 0.8942 | 0.9310 | +0.1167 | 1/3 | 0.8481 | +0.0000 | 0/3/0 | **+995 B** | $0.3171 |

`I/T/R` is the count of improved, tied, and regressed selected holdout results
relative to each subject's baseline. Child-development cost covers the same 12
Harbor trials for every strategy and excludes the shared baseline, holdout,
and candidate-authoring cost. It is descriptive rather than a stable property
of the strategy because agent trajectories are stochastic.

## Per-Skill Results

Development cells show `mean / worst-case` across four trials. Holdout cells
show `mean / worst-case` across two unseen trials. `Baseline reuse` means the
raw child was intentionally not exposed to holdout after it failed the
development promotion rule.

| Skill | Variant | Development | Decision | Holdout | Holdout delta |
| --- | --- | ---: | --- | ---: | ---: |
| OpenAPI Integrator | Baseline | 0.8500 / 0.4000 | Reference | 0.7273 / 0.4545 | -- |
| OpenAPI Integrator | Population | **1.0000 / 1.0000** | Child | 0.7273 / 0.4545 | +0.0000 |
| OpenAPI Integrator | Trace | **1.0000 / 1.0000** | Child | **1.0000 / 1.0000** | **+0.2727** |
| OpenAPI Integrator | Pareto | 0.9045 / 0.8000 | Child | **1.0000 / 1.0000** | **+0.2727** |
| OpenAPI Integrator | Operator | 0.7614 / 0.5000 | Baseline reuse | 0.7273 / 0.4545 | +0.0000 |
| Deepfake Detector | Baseline | 0.6500 / 0.3000 | Reference | **1.0000 / 1.0000** | -- |
| Deepfake Detector | Population | 0.6500 / 0.3000 | Baseline reuse | **1.0000 / 1.0000** | +0.0000 |
| Deepfake Detector | Trace | **1.0000 / 1.0000** | Child | **1.0000 / 1.0000** | +0.0000 |
| Deepfake Detector | Pareto | **1.0000 / 1.0000** | Child | **1.0000 / 1.0000** | +0.0000 |
| Deepfake Detector | Operator | **1.0000 / 1.0000** | Child | **1.0000 / 1.0000** | +0.0000 |
| Scene Script Planner | Baseline | **0.9430 / 0.9077** | Reference | 0.8171 / 0.8049 | -- |
| Scene Script Planner | Population | 0.9129 / 0.8615 | Baseline reuse | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Trace | 0.9212 / 0.8696 | Baseline reuse | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Pareto | 0.8656 / 0.8154 | Baseline reuse | 0.8171 / 0.8049 | +0.0000 |
| Scene Script Planner | Operator | 0.9212 / 0.8696 | Baseline reuse | 0.8171 / 0.8049 | +0.0000 |

### OpenAPI Integrator

Trace and Pareto produced the only holdout improvements. Both added explicit
conformance work around operation coverage, referenced parameters and request
bodies, effective per-operation security, and local transport verification.
Their two holdout attempts passed all 11 checks. Population also saturated the
two development tasks, but one holdout trajectory generated incompatible
operation identifiers and failed six transport checks; its holdout therefore
matched the baseline. The baseline's failing attempt lost source-reference
fidelity instead, so equal scalar reward concealed a different failure vector.
This is the clearest development-to-holdout generalization gap in the study and
is consistent with overfitting, although two attempts cannot establish it.

Pareto raised development worst-case reward from `0.4` to `0.8`, but it reduced
the count of exact `1.0` development trials from three to one. The mean-first
selector therefore preferred several near-passes over a sharper pass/fail
profile; its perfect holdout is promising but does not erase that trade-off.

The operator child regressed in development even though its round-trip gate
looked plausible in prose. The fixed selector correctly retained the baseline.
For this skill, trace is the quality-first choice and Pareto is the more compact
alternative; this sample cannot distinguish their holdout quality.

### Deepfake Detector

The baseline and population child repeatedly mishandled the development case
with a nonzero detector exit and mixed success/error records, scoring `0.3` on
both attempts. Trace, Pareto, and operator candidates all added an exact
partial-result reporting protocol and reached `1.0` on all four development
trials. All three also preserved `1.0` on holdout.

The holdout baseline itself scored `1.0`, so holdout is a preservation check,
not a discriminator for this subject. The operator patch is smallest, trace is
the most explicit, and Pareto sits between them; choosing among the three needs
additional non-ceiling cases.

### Scene Script Planner

Every submitted child regressed in development, so every strategy safely kept
the baseline. Candidate instructions improved constraint-ledger and coverage
language, but generated plans still missed concrete story order, research
schema, component-candidate, visual-specificity, or implementation-note checks.
Pareto had the largest raw regression (`-0.0774` mean reward).

This subject demonstrates the value of the promotion gate and also the limit of
instruction-only mutation for a high-baseline, generative writing task. Since
no child was promoted, raw child holdout behavior is unknown by design and must
not be inferred from the reused `0.8171` baseline result.

## Strategy Critique

### Population Search

Strengths:

- The scalar selection rule is transparent, cheap to inspect, and correctly
  rejected a tie and a regression.
- Its OpenAPI child improved development mean and worst-case reward to `1.0`.
- The candidate patches stayed relatively compact.

Weaknesses:

- The promoted OpenAPI child did not improve holdout, revealing sensitivity to
  the two visible tasks.
- A single mean hides which cases or behaviors improved, tied, or regressed.
- The fairness budget allowed only one submitted child, so this exercised the
  selection mechanism but not the breadth normally expected from a population.

### Trace Distillation

Strengths:

- It produced the highest raw and selected development means and tied for best
  holdout.
- Consolidating repeated failures into transferable gates fixed both OpenAPI
  transport conformance and Deepfake partial-batch reporting.
- The baseline fallback prevented its Scene regression from reaching holdout.

Weaknesses:

- It created the largest patches (`+2,021` bytes on average) and used more
  evaluation tokens than Population or Pareto.
- It depends on diverse, correctly labeled traces; correlated failures can
  become overconfident instructions.
- Its Scene coverage gate did not reliably alter the agent's final artifact,
  showing that prevalence-based prose is not sufficient for every task shape.

### Reflective Pareto Search

Strengths:

- It tied for best holdout while using smaller patches and lower attributed
  selected-result usage than trace distillation; shared baseline reuse means
  this is not an independent end-to-end cost estimate.
- Per-case feedback preserved information that a scalar mean discards; the
  OpenAPI child generalized despite a lower development mean than Population.
- The archive and baseline fallback make complementary trade-offs explicit.

Weaknesses:

- Its raw Scene candidate had the worst regression of the study.
- Two development cases and one submitted child provide a very thin Pareto
  frontier; much of the archive machinery is overhead under this budget.
- Reflection is only as reliable as the verifier diagnosis, and every archive
  member must be reevaluated on the fixed case set.

### Operator Coevolution

Strengths:

- It produced the smallest average patch and a perfect Deepfake child.
- Explicit parent/operator lineage can turn repeated fitness deltas into useful
  future mutation policy when many generations are available.
- The fixed gate rejected its two regressing children.

Weaknesses:

- One generation cannot establish operator credit or demonstrate coevolution;
  only one applied operator per subject received attributable evidence.
- It improved only one of three development subjects and produced no aggregate
  holdout gain in this ceiling-limited sample.
- Its candidate jobs had the highest observed development cost despite the
  smallest patches, illustrating that patch size does not predict trajectory
  cost.

## Reproducibility and Evidence

The study used Harbor 0.18.0, Docker, Codex `openai/gpt-5.4-mini`, low
reasoning, disabled web search, two attempts per task, deterministic local
verifiers, and zero retries. The eligible evidence contains:

- 15 development jobs, 60 trials;
- 9 holdout jobs, 18 trials;
- 24 jobs and 78 trials total;
- zero agent, environment, or verifier errors;
- 6,899,339 input tokens, 151,397 output tokens, and $1.7165 recorded cost.

The physical holdout jobs are fewer than the analytical comparison cells
because a shared baseline result is reused. The recorded candidate-generation
and selection inputs contain no holdout paths. The corpus lock, candidate lock,
and release lock bind the inputs, submitted bundles, native development jobs,
selection decisions, and released holdout datasets.

The machine's WSL kernel could not start Harbor's nftables egress sidecar, so
every scored cell used the same public network mode with Codex web search
explicitly disabled and all benchmark inputs local. Pre-agent environment
calibrations and three pre-audit Deepfake jobs are declared exclusions in the
protocol and do not enter any metric.

## Native Evolver Closeout

Each strategy's own Harbor-native analyzer was rerun against the final jobs.
Population closed all three development selections and the promoted OpenAPI
holdout. Trace closed all three development analyses plus promoted OpenAPI and
Deepfake holdout gates. Pareto produced child-plus-baseline archives and
promoted OpenAPI and Deepfake while retaining the Scene baseline.

Operator correctly refused to claim coevolution under the one-child fairness
budget: after validating identity, digest, source, locks, and job comparability,
it stopped with `Need 2 evaluated operators, found 1.` Fabricating a second
operator observation would have made the comparison look complete while
violating the experimental budget. This is recorded as an applicability limit,
not an execution failure.

The live closeout exposed and fixed two analyzer integration defects without
changing any scored candidate or Harbor job:

- Trace and Operator now accept Harbor's source-directory basename as the
  locked name only when source and digest exactly match the logically named
  skill bundle.
- Pareto and Operator canonicalize the order-insensitive
  `retry.exclude_exceptions` set while retaining order sensitivity for arrays
  whose ordering can change execution.

The durable analyzer decision index is
[`evolver-finalization.md`](evolver-finalization.md). It records the local
native analyzer paths without making the versioned report depend on `.tmp/`.

## Validation

- All 9 canonical task solutions received reward `1.0`.
- Corpus, candidate, and release locks revalidated after holdout execution.
- The result summarizer revalidated frozen corpus and job digests, selection
  decisions, model and reasoning kwargs, environment/network cell, per-task
  checksums and repetitions, job and trial locks, skill source/name/digest,
  terminal rewards, usage totals, and the released holdout config and dataset.
- The four evolver test files passed 23/23 tests; the result-summary tamper
  suite passed 6/6 synthetic cases, and the combined focal wrapper passed
  24/24 Node tests.
- The full repository test suite passed 436/436 tests.
- Python compilation, Ruff, and all 14 independent skill-bundle checks passed.
- Documentation links and the required Rust code analysis closeout hook
  passed.

Machine-readable metrics are in [`summary.json`](summary.json). The frozen
protocol and declared exclusions are in [`../../protocol.yaml`](../../protocol.yaml),
and the immutable candidate decisions are in
[`../../locks/candidate-lock.json`](../../locks/candidate-lock.json).

## Limits

- Three skills, two development tasks, one holdout task, and two attempts per
  task do not support statistical significance or a universal ranking.
- Only one child per strategy and subject was allowed. This makes comparison
  cost fair but underexercises population breadth, Pareto diversity, and
  multi-generation operator learning.
- Holdout isolation is procedural because its versioned source remains in the
  repository; it is not a cryptographic secrecy boundary.
- Deepfake holdout saturated at the baseline, and Scene candidate holdout was
  intentionally not run after development rejection.
- Harbor costs cover agent execution only. Candidate-authoring effort and
  human review cost were not measured.
- All 12 patches were additive, so mechanism is partly confounded with added
  instruction length and specificity. Seven frozen candidates also contain
  mixed line endings; normalizing them after evaluation would invalidate their
  locked digests.
- The shared OpenAPI support bundle contains a nested example `SKILL.md`
  without frontmatter, which emitted the same non-fatal load warning in every
  OpenAPI arm.
- The shared Deepfake support bundle contains the literal partial-error text
  expected by one verifier. This is equal exposure across strategies, but it
  makes that task easier to satisfy without independently deriving the error.
