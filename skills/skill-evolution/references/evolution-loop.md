# Evolution Loop

Use this loop when the target is another skill and the evaluation setup is stable.

## Generation policy

- Population size: `10`
- Survivors: `2`
- Children per generation: `8`
- Ranking order: highest fitness first, then lowest candidate id
- Reevaluation: required for every generation

## Survivor policy

- Keep the two best candidates only.
- Treat all other candidates as discarded, not dormant.
- If two candidates tie, prefer the lower candidate id to keep the run deterministic.

## Acceptance policy

- The incumbent winner remains the reference point.
- A new candidate is accepted only after it wins under the same evaluator.
- If the generation fails to beat the incumbent, keep the incumbent and record a failed generation.

## Practical rhythm

1. Seed the population.
2. Run the evaluator on all candidates.
3. Rank the results.
4. Keep the top two.
5. Generate eight children from those two.
6. Rerun the evaluator.
7. Accept only validated improvements.
