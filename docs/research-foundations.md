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

## Choosing A Workflow

Use population search when you have a repeatable scalar or ordered fitness
signal and can afford to evaluate multiple candidates. Use trace distillation
when you already have diverse labeled trajectories and need to consolidate
recurring lessons. They can be composed: distill a strong evidence-grounded
baseline first, then search a population of measured refinements.

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
