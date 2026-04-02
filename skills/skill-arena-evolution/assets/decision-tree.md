# Decision Tree

Use the shortest path that fits the evolution task.

## Known benchmark with stable workspace

Use this route when the evaluation config, workspace, and scoring are already validated.

1. Freeze the benchmark: confirm evaluation config passes `skill-arena val-conf`.
2. Seed the population: `node scripts/create-population.js --skill <path> --out <dir>`.
3. Evaluate all candidates with the frozen benchmark.
4. Rank candidates: `node scripts/rank-results.js --generation-dir <dir>`.
5. Breed next generation: `node scripts/breed-generation.js --out <dir> --previous-generation-dir <dir> --next-generation 1`.
6. Log results: `node scripts/write-generation-log.js --root <dir> --generation-dir <dir>`.

## New benchmark or unstable setup

1. Author or validate the compare config first using `$skill-arena-config-author`.
2. Run the benchmark once to confirm it produces meaningful fitness variance.
3. If the fitness range is too narrow (all candidates score similarly), tighten the rubric.
4. Once stable, follow the known benchmark path above.

## Fitness resolution is failing

1. Check the candidate's `result.json` for expected fields (see `references/fitness-design.md`).
2. Common causes: evaluation did not produce `result.json`, or the result uses an unsupported field layout.
3. Align the evaluator output with one of the recognized shapes: `fitness`, `score`, `summary.passRate`, `stats.successes/failures`, or `outputs[*].score`.

## Choosing between mutation and crossover

- Use mutation when one parent is clearly stronger and needs a focused push.
- Use crossover when two survivors improved different aspects (e.g., one has better scripts, the other has better SKILL.md).
- See `references/mutation-operators.md` for concrete operator examples.
