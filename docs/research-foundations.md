# Research Foundations

The Harbor skills adapt published improvement mechanisms to complete skill
bundles and native Harbor evidence. They do not claim to reproduce the source
papers' models, datasets, prompts, operators, or reported results.

| Harbor skill | Primary foundations | Local adaptation |
| --- | --- | --- |
| [`harbor-population-search`](../skills/harbor-population-search/SKILL.md) | [EvoPrompt](https://arxiv.org/abs/2309.08532), [Promptbreeder](https://arxiv.org/abs/2309.16797), and [`autoresearch`](https://github.com/karpathy/autoresearch) | Freeze a baseline and objective, score real bundle candidates with native Harbor jobs, preserve the top two, and gate one winner on disjoint holdout tasks. |
| [`harbor-trace-distillation`](../skills/harbor-trace-distillation/SKILL.md) | [Trace2Skill](https://arxiv.org/abs/2603.25158) | Derive bounded trial-local lessons, require independent cross-trial and cross-task support, resolve conflicts, and consolidate evidence-cited patches. |
| [`harbor-reflective-pareto-search`](../skills/harbor-reflective-pareto-search/SKILL.md) | [GEPA](https://arxiv.org/abs/2507.19457), [NSGA-II](https://doi.org/10.1109/4235.996017), and [quality diversity](https://doi.org/10.3389/frobt.2016.00040) | Reflect on verified weak cases while retaining non-dominated bundle candidates with complementary case strengths. |
| [`harbor-operator-coevolution`](../skills/harbor-operator-coevolution/SKILL.md) | [Promptbreeder](https://arxiv.org/abs/2309.16797) | Attribute parent-to-child Harbor fitness changes to explicit mutation instructions, then breed only sufficiently established operators. |
| [`harbor-evolve-skill`](../skills/harbor-evolve-skill/SKILL.md) | [GEPA](https://arxiv.org/abs/2507.19457) and the [Harbor + GEPA cookbook](https://github.com/harbor-framework/harbor-cookbook/tree/main/harbor_cookbook/gepa) | Optimize complete `SKILL.md` text with Harbor reward and bounded trajectory feedback, select on validation, and reserve a third split for final promotion. |

## Shared boundaries

- Harbor tasks, locks, results, verifier diagnostics, errors, usage, timing, and
  trajectories are the scored evidence; no second evaluation schema is used.
- Policies such as survivor count, support thresholds, operator establishment,
  deterministic tie-breaking, and promotion gates are repository contracts,
  not claims copied from a paper.
- The four-strategy live study is small and operational, not statistical proof
  of a universal ranking. Read its
  [protocol](../evaluations/harbor-evolution-comparison/protocol.yaml) and
  [report](../evaluations/harbor-evolution-comparison/results/20260716/report.md).
- The knowledge-consult history contains exploratory, sealed, unevaluated, and
  prospective stages. Its [study README](../evaluations/knowledge-consult-evolution/README.md)
  defines the status of each artifact.
- Every strategy keeps development selection separate from final holdout and
  preserves the unchanged baseline as the fallback.
