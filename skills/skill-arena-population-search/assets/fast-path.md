# Fast Path

Use this when the task is to run one population-search loop and the benchmark is already stable.

## 1. Freeze and validate

```bash
skill-arena val-conf <evaluation.yaml>
skill-arena evaluate <evaluation.yaml> --dry-run
```

Confirm the dry run produces a valid `promptfooconfig.yaml` and workspace.

## 2. Seed the first generation

```bash
node <skill-root>/scripts/create-population.js \
  --skill <path-to-skill> \
  --out <population-search-run-dir>
```

Output: `generation-000/` with 10 candidate folders, each containing a copy of the skill and a `candidate.json` manifest.

## 3. Evaluate all candidates

For each candidate, run the benchmark against `candidate-##/skill/` and write the result to `candidate-##/result.json`.

Run the frozen Skill Arena evaluation directly for every candidate. Read the
generated `merged/report.md` first and use `summary.json` when structured data
is needed. A reporting skill may automate this optional step, but the loop does
not depend on one.

## 4. Rank and select survivors

```bash
node <skill-root>/scripts/rank-results.js \
  --generation-dir <population-search-run-dir>/generation-000
```

Output: `ranking.json` with sorted candidates and top-2 survivors.

## 5. Breed the next generation

```bash
node <skill-root>/scripts/breed-generation.js \
  --out <population-search-run-dir> \
  --previous-generation-dir <population-search-run-dir>/generation-000 \
  --next-generation 1
```

Output: `generation-001/` with 2 survivor carry-overs and 8 new children.

## 6. Repeat evaluate → rank → breed

Continue until fitness plateaus or the success criteria are met.

## 7. Record the final winner

```bash
node <skill-root>/scripts/write-generation-log.js \
  --root <population-search-run-dir> \
  --generation-dir <population-search-run-dir>/generation-NNN \
  --accepted-winner candidate-XX
```

Output: `population-search-log.json` at the run root.

## Common mistakes

- Forgetting to write `result.json` before ranking (ranking will fail with a clear error).
- Using cached evaluation results for mutated candidates (always re-evaluate mutations fresh).
- Changing the benchmark mid-loop (invalidates all prior fitness comparisons).
- Starting with parallelism too high (begin at 60% capacity, lower if noisy).
