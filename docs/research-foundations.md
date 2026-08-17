# Research Foundations

The Harbor evolution skills adapt published improvement mechanisms to complete
skill bundles and native Harbor evidence. The study organizer is a local
governance contract rather than an improvement mechanism. None of the bundles
claim to reproduce source papers' models, datasets, prompts, operators, or
reported results.

| Harbor skill | Contract or primary foundations | Local adaptation |
| --- | --- | --- |
| [`harbor-organize-evaluations`](../skills/harbor-organize-evaluations/SKILL.md) | Native Harbor artifact provenance and the split boundaries owned by the evaluation and evolution bundles | Freeze dataset and task digests, order skill-owned stages in a hash-chained ledger, release holdout only after a bound selection, and enforce a Git allowlist containing only source-path-free indexes and reviewed aggregate result tables. |
| [`harbor-population-search`](../skills/harbor-population-search/SKILL.md) | [EvoPrompt](https://arxiv.org/abs/2309.08532), [Promptbreeder](https://arxiv.org/abs/2309.16797), and [`autoresearch`](https://github.com/karpathy/autoresearch) | Freeze a baseline and objective, score real bundle candidates with native Harbor jobs, preserve the top two, and gate one winner on disjoint holdout tasks. |
| [`harbor-trace-distillation`](../skills/harbor-trace-distillation/SKILL.md) | [Trace2Skill](https://arxiv.org/abs/2603.25158) | Derive bounded trial-local lessons, require independent cross-trial and cross-task support, resolve conflicts, and consolidate evidence-cited patches. |
| [`harbor-reflective-pareto-search`](../skills/harbor-reflective-pareto-search/SKILL.md) | [GEPA](https://arxiv.org/abs/2507.19457), [NSGA-II](https://doi.org/10.1109/4235.996017), and [quality diversity](https://doi.org/10.3389/frobt.2016.00040) | Reflect on verified weak cases while retaining non-dominated bundle candidates with complementary case strengths. |
| [`harbor-operator-coevolution`](../skills/harbor-operator-coevolution/SKILL.md) | [Promptbreeder](https://arxiv.org/abs/2309.16797) | Attribute parent-to-child Harbor fitness changes to explicit mutation instructions, then breed only sufficiently established operators. |
| [`harbor-evolve-skill`](../skills/harbor-evolve-skill/SKILL.md) | [GEPA](https://arxiv.org/abs/2507.19457) and the [Harbor + GEPA cookbook](https://github.com/harbor-framework/harbor-cookbook/tree/main/harbor_cookbook/gepa) | Optimize complete `SKILL.md` text with Harbor reward and bounded trajectory feedback, select on validation, and reserve a third split for final promotion. |
| [`harbor-maximize-knowledge-expertise`](../skills/harbor-maximize-knowledge-expertise/SKILL.md) | Multi-objective quality-diversity practice and the repository's native Harbor evidence boundary | Bind a knowledge skill and sanitized development evidence, map fixed expertise failure modes to benchmark-agnostic mutation operators, preserve evidence fidelity and robustness, and delegate all realization, scoring, selection, and promotion to their owning Harbor skills. |
| [`harbor-realize-skill-candidate`](../skills/harbor-realize-skill-candidate/SKILL.md) | [Self-Improvements in Modern Agentic Systems](https://arxiv.org/abs/2607.13104v1), especially bounded scaffold self-reprogramming and layered gates | Materialize an agent-authored mutation in an isolated copy, verify exact parent and mutation provenance, validate the complete bundle, and seal it without evaluating, selecting, or installing it. |
| [`harbor-metaskill-evolution`](../skills/harbor-metaskill-evolution/SKILL.md) | [MetaSkill-Evolve](https://arxiv.org/abs/2607.05297v1) and the evaluation guidance in [Self-Improvements in Modern Agentic Systems](https://arxiv.org/abs/2607.13104v1) | Replay a branch DAG with five typed, branch-local policy roles; separate producing from inherited meta-state; admit only comparable development evidence through hard gates; and estimate policy productivity before identity-partitioned novelty-aware frontier decisions. |

## Shared boundaries

- Harbor tasks, locks, results, verifier diagnostics, errors, usage, timing, and
  trajectories are the scored evidence; no second evaluation schema is used.
- The study organizer indexes immutable artifact digests and stage state only.
  It does not parse, normalize, aggregate, rank, or promote Harbor outcomes.
- The MetaSkill ledger binds exact candidate identity, status, metric, numeric
  fields, and gates from SHA-bound public development-only Harbor-native source
  artifacts. This is content integrity, not proof of the producer's authority
  or the semantic absence of mislabeled holdout-derived data. It does not score
  raw trials or reinterpret their reward semantics.
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
- The MetaSkill paper does not publish its implementation, complete policy
  prompts, split seed, repeated-run variance, or cost ledger. The local bundle
  is a governed Harbor adaptation, not a reproduction, and its first release
  is deliberately analysis-only.
- The prior four-strategy study has one submitted child per strategy and cannot
  identify a slow-loop meta-policy effect. The
  [next-skill comparison](../evaluations/harbor-next-skill-comparison/README.md)
  reports such missing support as not identifiable instead of synthesizing a
  performance score.
- Every strategy keeps development selection separate from final holdout and
  preserves the unchanged baseline as the fallback.
