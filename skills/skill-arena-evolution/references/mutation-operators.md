# Mutation Operators

Choose operators that keep attribution clear and evaluation cheap.

## Good mutation targets

- Tighten or broaden trigger wording in `SKILL.md`.
  Example: change "Use this skill when the benchmark is stable" to "Use this skill only when the workspace, fixture, and scoring method have been validated and are frozen."
- Reorder workflow steps to reduce ambiguity.
  Example: move the benchmark freeze step before seed population when candidates assume the benchmark exists.
- Move bulky detail from `SKILL.md` into `references/*`.
  Example: extract a long inline code snippet into `references/parallelism-snippet.md` and link to it.
- Add deterministic helper scripts in `scripts/*`.
  Example: add a script that validates candidate directory structure before evaluation.
- Refine examples so the agent reaches the intended fast path sooner.
  Example: add a concrete `--skill` and `--out` invocation to the first workflow step.
- Narrow output contracts when the current skill is too open-ended.
  Example: require the final output to be a JSON object with `{ winner, score, reason }` instead of free-form prose.

## Good crossover patterns

- Keep the stronger `SKILL.md` from parent A and the stronger script set from parent B.
- Keep the stronger references from parent A and merge only one proven helper from parent B.
- Preserve the clearer interface metadata when parent changes diverge.

Crossover in `evolution-core.js` alternates file ownership by sorted index:
even-indexed files come from the left parent, odd-indexed from the right.
When a file exists in only one parent, that parent supplies it regardless of index.

## Avoid

- Mixing large unrelated rewrites into one child.
- Carrying forward failed ideas without a new hypothesis.
- Changing the benchmark while changing the skill.
- Editing files outside the skill bundle unless the benchmark explicitly requires it.
- Creating mutations without a written hypothesis: every child must have an explicit reason recorded in `candidate.json`.
