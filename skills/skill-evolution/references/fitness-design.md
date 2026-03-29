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

## Recommended composition

- Use tests or hard validation as a gate first.
- Use rubric scoring for qualitative differences that tests cannot capture.
- Do not reward style churn unless it affects the benchmark target.

## Failure cases

Pause the loop and tighten the setup when:

- repeated runs on the same candidate produce materially different scores
- the benchmark cannot distinguish weak from strong candidates
- external dependencies change between generations
