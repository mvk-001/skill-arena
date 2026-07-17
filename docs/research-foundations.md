# Research Foundations

This document records the provenance of Skill Arena's skill-improvement
workflows. It distinguishes direct inspiration from related published work and
states where the repository deliberately implements a narrower or different
method. These links point to primary sources.

## Provenance At A Glance

| Workflow | Source | Relationship to Skill Arena |
| --- | --- | --- |
| Population search | [EvoPrompt: *Connecting Large Language Models with Evolutionary Algorithms Yields Powerful Prompt Optimizers*](https://arxiv.org/abs/2309.08532) | Closest published precedent for generating a prompt population, evaluating it on a fixed development set, applying LLM-driven evolutionary operators, and selecting the next population. Added as research context during the naming review; it was not cited in the original skill. |
| Population search | [Promptbreeder: *Self-Referential Self-Improvement Via Prompt Evolution*](https://arxiv.org/abs/2309.16797) | Closest published precedent for populations and diverse linguistic mutation operators. Added as research context during the naming review; Skill Arena does not implement self-referential mutation-prompt evolution. |
| Population search | [Karpathy's `autoresearch`](https://github.com/karpathy/autoresearch) | Directly recorded operational inspiration for a fixed experiment target, one measurable result, and an explicit keep-or-discard loop. This is a software repository, not a paper. |
| Trace distillation | [Trace2Skill: *Distill Trajectory-Local Lessons into Transferable Agent Skills*](https://arxiv.org/abs/2603.25158) | Directly recorded paper inspiration for independent trajectory-local analysis followed by conflict-aware consolidation into one transferable skill. |
| Reflective Pareto search | [GEPA: *Reflective Prompt Evolution Can Outperform Reinforcement Learning*](https://arxiv.org/abs/2507.19457) | Direct inspiration for natural-language reflection over execution feedback and retaining complementary candidates through Pareto selection. |
| Harbor-guided skill evolution | [Harbor + GEPA cookbook](https://github.com/harbor-framework/harbor-cookbook/tree/main/harbor_cookbook/gepa) and [GEPA](https://arxiv.org/abs/2507.19457) | Direct implementation precedent for using Harbor trials, rewards, verifier output, and agent trajectories as GEPA evaluation feedback. The repository adapts the prompt-template example to evolve SKILL.md and adds an untouched holdout gate. |
| Operator coevolution | [Promptbreeder: *Self-Referential Self-Improvement Via Prompt Evolution*](https://arxiv.org/abs/2309.16797) | Direct inspiration for evolving mutation instructions as well as the artifacts those instructions modify. |
| Pareto and diversity context | [NSGA-II](https://doi.org/10.1109/4235.996017) and [Quality Diversity: A New Frontier for Evolutionary Computation](https://doi.org/10.3389/frobt.2016.00040) | Related foundations for non-dominated selection and preserving diverse high-quality stepping stones; Skill Arena implements narrower deterministic policies. |

Repository history is part of the provenance check: Trace2Skill and
`autoresearch` were explicit citations before this review; EvoPrompt and
Promptbreeder are documented as related research that more precisely names the
population workflow's mechanics.

## Population Search

The `skill-arena-population-search` workflow freezes a benchmark, seeds ten
candidate skill bundles, evaluates every candidate, keeps the top two, and
creates eight mutation or crossover children. It promotes a candidate only
after reevaluation against the same acceptance rule.

### Mechanisms adopted or aligned

- Maintain a population of candidate instructions rather than trusting one
  rewrite.
- Use language-model-driven variation to produce new candidates.
- Evaluate candidates against a fixed target and use measured fitness for
  selection.
- Preserve the incumbent when a new generation does not improve the validated
  result.
- Keep each experiment attributable and prefer simpler changes when fitness is
  otherwise equal.

### Adaptation boundaries

- Skill Arena searches complete skill bundles, not only task prompts.
- The population size, top-two survivor policy, and eight-child generation are
  repository defaults rather than claims copied from either paper.
- It does not evolve mutation prompts or implement Promptbreeder's
  self-referential loop.
- It does not claim to reproduce EvoPrompt's operators, datasets, models, or
  reported results.
- Hard gates, normalized Skill Arena results, cache discipline, and
  machine-aware concurrency are repository-specific additions.

The descriptive name **population search** was chosen because it captures the
implemented mechanism without implying an exact reproduction of EvoPrompt,
Promptbreeder, a generic genetic algorithm, or `autoresearch`.

## Trace Distillation

The `skill-arena-trace-distillation` workflow imports labeled success and
failure traces, proposes independent trace-local patches against a frozen
baseline, consolidates recurring proposals, filters conflicts and out-of-scope
changes, and validates the consolidated update on a holdout slice when one is
available.

### Mechanisms adapted from Trace2Skill

- Analyze a broad trace pool independently instead of updating the skill after
  each trajectory.
- Keep success and failure evidence explicit and use deeper root-cause analysis
  for failures.
- Derive narrow trajectory-local lessons before cross-trace consolidation.
- Consolidate recurrent evidence into one coherent skill rather than an
  episodic memory bank.
- Use hierarchical merging when the proposal pool is large.
- Support both skill deepening and skill creation from a minimal baseline.

### Adaptation boundaries

- The local scripts provide deterministic file orchestration and validation;
  they do not reproduce the paper authors' analyst prompts or model stack.
- Prevalence thresholds, lexicographic tie-breaking, allowed path prefixes, and
  conflict groups are Skill Arena contracts.
- Holdout promotion uses the evaluator and fitness rules declared by the local
  benchmark, not the paper's experimental suite.
- The repository makes no claim that its simplified implementation reproduces
  the paper's reported performance.

The descriptive name **trace distillation** reflects the evidence transformation
performed by the workflow and its relationship to Trace2Skill without using the
paper title as a product name.

## Reflective Pareto Search

The `skill-arena-reflective-pareto-search` workflow keeps case scores separate,
reflects on verified per-case feedback, preserves candidates that are
non-dominated across the frozen case set, and plans attributable merges between
archive members with complementary case ownership.

### Mechanisms adapted from GEPA

- Use execution feedback and natural-language diagnoses instead of relying only
  on a sparse scalar reward.
- Preserve complementary candidates on a Pareto archive.
- Select the weakest covered case for the next reflection step.
- Merge at most two complementary candidates and reevaluate the result.

### Adaptation boundaries

- The local scripts rank declared scores and produce reflection or merge plans;
  they do not invoke GEPA's proposer, evaluator, or model stack.
- Skill Arena evolves complete skill bundles rather than one prompt string.
- Identical score vectors use complexity, evaluation cost, and candidate ID as
  deterministic tie-breakers.
- The repository's replay fixtures are mechanism tests, not reproductions of
  GEPA's experiments or performance claims.

## Harbor-Guided Skill Evolution

The harbor-evolve-skill workflow invokes GEPA's optimizer over real Harbor
trials. Each textual candidate replaces SKILL.md inside a copied skill bundle;
Harbor supplies isolated execution, scalar reward, verifier diagnostics,
exceptions, and bounded trajectory evidence for reflection.

### Mechanisms adopted

- Use Harbor tasks as reproducible containerized evaluation cases.
- Give GEPA scalar rewards plus textual execution feedback.
- Use optimizer-visible training and validation splits for reflective,
  Pareto-aware candidate search.
- Evaluate the unchanged baseline and selected candidate on a third holdout
  split before promotion.
- Preserve all trial artifacts and exact Harbor, GEPA, skill, and task
  provenance.

### Adaptation boundaries

- The official cookbook evolves a prompt template for MedAgentBench; this
  workflow evolves the complete SKILL.md text for an arbitrary frozen Harbor
  task corpus.
- Scripts, references, and assets remain unchanged during one run.
- Validation participates in candidate selection and is not described as
  holdout evidence.
- The runner never installs the candidate or overwrites the source skill.
- Local reports demonstrate only the declared tasks, agent, model, attempts,
  versions, and budget; they do not inherit GEPA paper or cookbook performance
  claims.

### Four native-artifact strategy variants

The Harbor-native strategy family applies the same four evidence regimes to
standard Harbor job output rather than declared Skill Arena scores:

- harbor-population-search ranks complete skill candidates by Harbor reward and
  error evidence before mutation and crossover.
- harbor-trace-distillation normalizes native trial results, trajectories, and
  verifier files before support- and conflict-aware consolidation.
- harbor-reflective-pareto-search builds per-case score vectors from Harbor
  tasks, agents, and models, then preserves non-dominated candidates and emits
  bounded reflection evidence.
- harbor-operator-coevolution credits mutation instructions from measured
  parent-to-child Harbor fitness changes.

All four use one candidate skill per Harbor job, preserve native job and trial
artifacts, and reveal disjoint holdout results only after selection. The
strategy logic is an adaptation of the corresponding research mechanism; it is
not a reproduction of any paper's optimizer or empirical result.

## Operator Coevolution

The `skill-arena-operator-coevolution` workflow treats mutation instructions as
an explicit second population. It credits an operator from the improvement of
its children over their parents, preserves operator elites, and emits
attributable mutation or crossover plans for the next generation.

### Mechanisms adapted from Promptbreeder

- Improve mutation instructions as well as the artifacts they mutate.
- Keep operator lineage explicit across generations.
- Use measured downstream candidate outcomes to select operator genomes.

### Adaptation boundaries

- The implementation does not autonomously call an LLM to rewrite operators;
  it emits deterministic plans for an editing agent to realize and validate.
- Operator credit is mean parent-to-child fitness delta with hard-gate failures
  forced to zero child fitness.
- Operator ranking chooses future exploration; it never promotes a skill
  without development and holdout evaluation.

## Choosing A Workflow

Use population search when you have a repeatable scalar or ordered fitness
signal and can afford to evaluate multiple candidates. Use trace distillation
when you already have diverse labeled trajectories and need to consolidate
recurring lessons. Use reflective Pareto search when task families trade off
and case-local diagnoses are available. Use operator coevolution only after
multiple generations make parent-to-child operator credit meaningful. They can
be composed with explicit phase boundaries: distill a baseline, search measured
refinements, then use reflective Pareto selection without changing the
benchmark or exposing holdout evidence.

Use the matching harbor-* strategy when a native Harbor task corpus already
exists and its artifacts should drive the same evidence regime. Use
harbor-evolve-skill when the desired loop is specifically an integrated
Harbor+GEPA optimizer over SKILL.md. Keep the final holdout separate even when
an earlier Skill Arena strategy replay helped choose the method.

## Name Migration

The 2026-07-12 naming review replaced ambiguous skill identifiers:

| Previous identifier | Current identifier |
| --- | --- |
| `skill-arena-evolution` | `skill-arena-population-search` |
| `skill-arena-traced-evolution` | `skill-arena-trace-distillation` |
| `evolution-log.json` | `population-search-log.json` |

Update explicit `$skill-name` invocations, local paths, and consumers of the
population-search log. The repository does not retain duplicate compatibility
skills because duplicate discovery entries would make benchmark capability
selection ambiguous.
