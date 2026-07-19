---
name: skill-arena-operator-coevolution
description: Deprecated Skill Arena operator-coevolution workflow. Do not use for new skill evolution; use harbor-operator-coevolution with native Harbor jobs and evidence instead. Retain only for reproducing or migrating existing Skill Arena searches.
---

# Skill Arena Operator Coevolution

> [!CAUTION]
> Deprecated. Do not use or extend this skill for new work. Use
> `harbor-operator-coevolution`; retain this bundle only to reproduce or migrate
> existing Skill Arena searches.

Search two linked populations: skill candidates and mutation operators. Reward
an operator only when its children improve over their parents, then retain,
mutate, or cross over the strongest operator instructions for the next
generation.

Runtime: execute bundled ESM helpers with Node.js 24 or newer. In commands,
`<skill-root>` means this installed skill directory. The bundle runs without
any sibling skill installed.

This workflow adapts Promptbreeder's self-referential idea that mutation
prompts can evolve alongside task prompts. Skill Arena applies it to complete
skill bundles and records deterministic credit assignment. It does not
reproduce Promptbreeder's model stack, datasets, or empirical claims.

## Inputs

Collect:

- one frozen baseline skill and benchmark
- candidate results with parent fitness and operator ID
- the exact mutation instruction used for every child
- hard-gate outcomes, evaluation cost, and complexity delta
- a holdout set that operators never see

Do not use this strategy for a single edit. Use a fixed-operator population
loop when the operator library is still productive; operator coevolution pays
off only across repeated generations and does not require another bundle.

## Workflow

1. Freeze benchmark, fitness, hard gates, and holdout.
2. Seed a small, diverse operator population using
   [references/operator-genome-schema.md](references/operator-genome-schema.md).
3. Assign every candidate exactly one operator and record its parent fitness.
4. Evaluate every child on the same development benchmark. A failed hard gate
   receives fitness `0` before operator credit is computed.
5. Run `scripts/rank-coevolution.js`. Rank candidates by fitness and operators
   by mean parent-to-child improvement, success rate, best improvement, then
   deterministic ID.
6. Keep the top two candidates and top two operators by default. Do not infer
   operator quality from the absolute fitness of a strong parent.
7. Run `scripts/breed-operators.js` to retain the operator elites and create
   explicit mutation/crossover plans for the remaining operator slots.
8. Ask an editing agent to realize each operator plan as one concise mutation
   instruction. Keep operator edits separate from skill edits.
9. Generate the next skill candidates with the evolved operator set, evaluate,
   and repeat until improvement plateaus or operator rankings remain stable.
10. Choose the final skill by hard-gated development fitness, then improvement,
    lower complexity, lower evaluation cost, and candidate ID, in that order.
    Encode any required cross-case robustness in the frozen fitness before the
    run; do not invent a new post-hoc selector. Apply the unchanged holdout
    promotion gate. Operator fitness never bypasses skill validation.

Read [references/credit-and-selection-policy.md](references/credit-and-selection-policy.md)
before changing survivor counts or credit rules.

## Operating Rules

- Record the exact operator genome that produced every child.
- Attribute reward as `childFitness - parentFitness`; never use child fitness
  alone for operator ranking.
- Do not penalize a strong child because its parent fitness was low. Parent
  fitness exists to assign operator credit; final candidate ranking uses the
  child's absolute hard-gated development fitness.
- Give failed hard gates zero child fitness and negative improvement when the
  parent was valid.
- Require at least two trials before calling an operator established. Treat a
  one-trial leader as exploratory.
- Preserve operator elites unchanged and make child operator hypotheses
  legible.
- Reject operator text that leaks benchmark answers, holdout facts, or task
  instances into the skill.
- Keep one unchanged skill baseline and one unchanged operator baseline in the
  run record.

## Commands

```powershell
node <skill-root>/scripts/rank-coevolution.js `
  --input run/generation.json `
  --output run/ranking.json

node <skill-root>/scripts/breed-operators.js `
  --input run/generation.json `
  --ranking run/ranking.json `
  --output run/next-operators.json `
  --operator-count 6
```

## Final Output

Report the winning skill, surviving operators, per-operator trials and mean
improvement, discarded operators, total evaluations, holdout result, and why
coevolution stopped. Distinguish an exploratory operator from one supported by
repeated trials.
