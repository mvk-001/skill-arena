# Evolution Loop

Use this loop when the target is another skill and the evaluation setup is stable.

## Generation policy

- Population size: `10`
- Survivors: `2`
- Children per generation: `8`
- Ranking order: highest fitness first, then lowest candidate id
- Reevaluation: required for every generation
- Parallel execution: start from `Math.max(1, Math.floor(capacity * 0.6))` where `capacity` is `os.availableParallelism()` (or `os.cpus().length` on older runtimes). Lower when benchmarks are flaky, stateful, or rate-limit sensitive. Raise only after one stable run at the starting point.

## Survivor policy

- Keep the two best candidates only.
- Treat all other candidates as discarded, not dormant.
- If two candidates tie, prefer the lower candidate id (lexicographic comparison on the `candidate-##` format) to keep the run deterministic.

## Acceptance policy

- The incumbent winner remains the reference point.
- A new candidate is accepted only after it wins under the same evaluator.
- If the generation fails to beat the incumbent, keep the incumbent and record a failed generation.
- When a generation is recorded as failed, the iteration summary must still be written so the learning is visible in the log.

## Practical rhythm

1. Seed the population from the current best skill.
2. Run the evaluator on all candidates using the frozen benchmark.
3. Write per-candidate `result.json` into each candidate directory.
4. Run `scripts/rank-results.js` to rank and select survivors.
5. Keep the top two survivors.
6. Run `scripts/breed-generation.js` to create eight children.
7. Rerun the evaluator on the new generation.
8. Accept only validated improvements.
9. Run `scripts/write-generation-log.js` to record the generation outcome.
10. Report the iteration summary. Do not wait for permission to continue.
11. Loop back to step 6 unless a stop condition is met.

The loop is designed to be autonomous. Once started, it should run until
fitness plateaus or the user intervenes — the agent should not pause to ask
whether to continue. If all candidates regress, keep the incumbent, record
the failed generation, and breed a new set of children with different hypotheses.

## Simplicity criterion

Borrowed from autoresearch: all else being equal, simpler is better.

- A small fitness improvement that adds ugly complexity? Probably not worth it.
- A fitness-neutral change that removes code or simplifies the skill? Definitely keep.
- A fitness improvement from deleting content? Keep — that is a simplification win.

When evaluating whether to accept a candidate, weigh the complexity cost
against the improvement magnitude. Record the simplicity assessment in the
iteration summary alongside the fitness score.

## Crash handling

- If a candidate crashes during evaluation (missing output, runtime error,
  timeout), assign it fitness `0` and log the failure reason.
- If the crash looks trivially fixable (typo, missing file reference), fix it
  and re-evaluate once. Do not retry more than once.
- If the idea itself is broken, mark it as discarded with reason "crash" and
  move to the next candidate.
- Crashed candidates count as evaluated: they appear in the ranking with
  fitness `0` and never survive selection.

## Plateau detection

Stop evolving when:

- the best fitness has not improved for two consecutive generations
- the top two survivors are unchanged across generations
- the benchmark itself shows instability (repeated runs on the same candidate produce materially different scores)
