# Mutation Operators

Choose operators that keep attribution clear and evaluation cheap.

## Good mutation targets

- tighten or broaden trigger wording in `SKILL.md`
- reorder workflow steps to reduce ambiguity
- move bulky detail from `SKILL.md` into `references/*`
- add deterministic helper scripts in `scripts/*`
- refine examples so the agent reaches the intended fast path sooner
- narrow output contracts when the current skill is too open-ended

## Good crossover patterns

- keep the stronger `SKILL.md` from parent A and the stronger script set from parent B
- keep the stronger references from parent A and merge only one proven helper from parent B
- preserve the clearer interface metadata when parent changes diverge

## Avoid

- mixing large unrelated rewrites into one child
- carrying forward failed ideas without a new hypothesis
- changing the benchmark while changing the skill
- editing files outside the skill bundle unless the benchmark explicitly requires it
