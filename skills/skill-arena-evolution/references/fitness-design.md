# Fitness Design

Start with the narrowest fitness function that still reflects the user's goal.

## Preferred order

1. Use a user-provided rubric when available.
2. Add hard gates for tests, linters, schema checks, or required output format.
3. Infer a minimal rubric only when the user did not provide one.

## Normalization rules

- Prefer one numeric fitness value per candidate.
- Keep the score in the range `0..1` when practical.
- When using pass or success counts, normalize as `successes / total`.
- If a tool emits a raw `fitness` field, use it directly.
- If only prompt-level scores exist, average them.

## Resolution order

The code in `evolution-core.js resolveFitness()` checks these fields in order:

1. `result.fitness` (number)
2. `result.score` (number)
3. `result.summary.fitness` (number)
4. `result.summary.passRate` (number)
5. `result.summary.successRate` (number)
6. `result.stats.successes / (successes + failures)` (derived)
7. Average of `result.outputs[*].score` or `result.outputs[*].success` (derived)
8. Average of `result.results.results[*].score` or `.success` (Promptfoo shape)

If none of these resolve, the function throws with a diagnostic message.

## Hard gates

Hard gates are binary preconditions that must pass before rubric scoring matters.
Common examples:

- test suite must pass (`npm test` exits 0)
- linter must pass (`npm run lint` exits 0)
- schema validation must pass (`skill-arena val-conf` exits 0)
- required output file must exist (e.g., `deliverables/compare.yaml`)
- output file must parse without errors (valid YAML, valid JSON)

A candidate that fails a hard gate receives fitness `0` regardless of its rubric score.

## Recommended composition

- Use tests or hard validation as a gate first.
- Use rubric scoring for qualitative differences that tests cannot capture.
- Do not reward style churn unless it affects the benchmark target.
- Apply the simplicity criterion after fitness scoring: between two candidates
  with equal or near-equal fitness, prefer the one with fewer lines of change
  or simpler skill structure. Record this preference in the iteration summary.

## Failure cases

Pause the loop and tighten the setup when:

- repeated runs on the same candidate produce materially different scores
- the benchmark cannot distinguish weak from strong candidates
- external dependencies change between generations
- the fitness function rewards side effects that are invisible to the benchmark prompt
