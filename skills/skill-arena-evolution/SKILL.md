---
name: skill-arena-evolution
description: Evolve an existing skill against a fixed workspace and repeatable evaluation target. Use when Codex needs to iteratively improve another skill by scoring alternatives, keeping the top two, generating mutated or crossover children, reevaluating, and discarding regressions.
---

# Skill Arena Evolution

Improve a skill through a repeatable evolutionary loop instead of one-shot edits.
Use this skill only when the workspace, benchmark fixture, and scoring method are stable enough to compare generations fairly.

## Inputs

Collect these inputs before changing the target skill:

- path to the skill being evolved
- fixed workspace, fixture, or benchmark config
- reproducible evaluation command or scoring method
- optional rubric or explicit fitness definition

If the evaluation target is unstable, warn immediately and tighten the benchmark before evolving anything.

## Defaults

Use these defaults unless the user gives a stronger constraint:

- population size: `10`
- survivors per generation: `2`
- offspring per generation: `8`
- survivor policy: keep the two highest-fitness candidates
- reevaluation: score every candidate every generation
- acceptance rule: promote only candidates that improve or preserve the validated best score
- baseline: preserve one stable control copy of the incoming skill and never overwrite it silently

Prefer a user-defined rubric as the fitness function.
If the user does not provide one, derive the minimal rubric from the task, fixture, and evaluation command, then write that rubric down before generating variants.

## Workflow

### 1. Freeze the benchmark

- Confirm the workspace and target files are static.
- Confirm the evaluation command is reproducible.
- Define the fitness rule in one place.
- Identify any hard gates such as tests, linters, schema validation, or required output shape.

Read [references/fitness-design.md](references/fitness-design.md) when the scoring rule is vague or mixes tests with rubric scoring.

### 2. Seed the first population

- Start from the current best-known skill as the control genome.
- Create `10` candidate folders for generation `0`.
- Keep candidate `00` as the untouched baseline.
- Give each other candidate an explicit hypothesis about what to improve.
- Restrict changes to the skill bundle:
  - `SKILL.md`
  - `references/*`
  - `scripts/*`
  - `agents/openai.yaml` only when the interface contract must change

Use `scripts/create-population.js` to materialize the first generation and write candidate manifests.

### 3. Evaluate every candidate

- Run the same evaluation method for every candidate.
- Record raw outputs and the normalized fitness value for each one.
- Reject candidates that break required gates even if they look promising qualitatively.
- Keep scoring artifacts outside the skill files when possible so the skill content stays reviewable.

Use `scripts/rank-results.js` after writing per-candidate result files.

### 4. Select survivors

- Rank all candidates by normalized fitness.
- Break ties deterministically.
- Keep only the top `2`.
- Write down why those two survived.
- Mark the remaining `8` as discarded for this generation.

Read [references/evolution-loop.md](references/evolution-loop.md) for the exact selection policy.

### 5. Breed the next generation

- Create `8` new children from the two survivors.
- Use mutation when a single parent should be pushed further.
- Use crossover when the two survivors improved different parts of the skill.
- Keep the operators explicit so each child has a traceable hypothesis.
- Do not promote a child just because it is novel.

Use `scripts/breed-generation.js` to create the next generation folders and deterministic mutation or crossover plans.
Read [references/mutation-operators.md](references/mutation-operators.md) when you need concrete mutation ideas.

### 6. Reevaluate and accept only wins

- Score the new generation with the same evaluator.
- Compare the best child against the validated incumbent.
- Keep what improved.
- Discard what regressed.
- If nothing improved, keep the incumbent and log that the generation failed.

Use `scripts/write-generation-log.js` to append a generation summary with scores, survivors, parents, mutations, and accepted winner.

### 7. Stop cleanly

Stop when one of these is true:

- the best score has plateaued for the allowed number of generations
- the skill meets the success criteria
- further mutations are producing instability instead of gains
- the benchmark itself is no longer trustworthy

The final output should identify:

- the accepted winning variant
- the final score
- the rejected alternatives and why they were discarded
- the files that changed in the winning skill

## Operating Rules

- Keep the benchmark fixed while the skill evolves.
- Make one candidate hypothesis legible enough that another agent could understand it from the manifest alone.
- Preserve deterministic ordering for ranking and survivor selection.
- Prefer small, attributable mutations over sweeping rewrites.
- Use crossover only when the parent strengths are complementary and observable.
- Do not merge speculative changes into the winner without reevaluation.
- Do not let hidden context or external knowledge drift into the benchmark loop.

## References And Helpers

- `references/evolution-loop.md`: selection policy and generation rhythm
- `references/fitness-design.md`: how to define and normalize fitness
- `references/mutation-operators.md`: practical mutation and crossover operators
- `scripts/create-population.js`: create a generation skeleton and candidate manifests
- `scripts/rank-results.js`: normalize scores and rank candidates
- `scripts/breed-generation.js`: keep top two and generate the next eight candidates
- `scripts/write-generation-log.js`: record winner selection and discarded variants
