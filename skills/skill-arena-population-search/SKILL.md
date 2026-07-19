---
name: skill-arena-population-search
description: Deprecated Skill Arena population-search workflow. Do not use for new skill evolution; use harbor-population-search with native Harbor jobs and evidence instead. Retain only for reproducing or migrating existing Skill Arena searches.
---

# Skill Arena Population Search

> [!CAUTION]
> Deprecated. Do not use or extend this skill for new work. Use
> `harbor-population-search`; retain this bundle only to reproduce or migrate
> existing Skill Arena searches.

Improve a skill through repeatable population search instead of one-shot edits.
Use this skill only when the workspace, benchmark fixture, and scoring method are stable enough to compare generations fairly.

Runtime: execute bundled ESM helpers with Node.js 24 or newer. In commands,
`<skill-root>` means this installed skill directory. The bundle runs without
any sibling skill installed.

The workflow's population, mutation, evaluation, and selection mechanics align
with published prompt-optimization precedents
[EvoPrompt](https://arxiv.org/abs/2309.08532) and
[Promptbreeder](https://arxiv.org/abs/2309.16797). Its directly recorded
operational inspiration is the fixed-metric, keep-or-discard experiment loop in
[autoresearch](https://github.com/karpathy/autoresearch), which is a software
project rather than a paper. This implementation searches complete skill
bundles, uses a fixed top-two survivor policy, and does not reproduce
Promptbreeder's self-referential mutation-prompt evolution; those explicit
differences define the local adaptation boundary.

## Inputs

Collect these inputs before changing the target skill:

- path to the skill being evolved
- fixed workspace, fixture, or benchmark config
- reproducible evaluation command or scoring method
- optional rubric or explicit fitness definition

If the evaluation target is unstable, warn immediately and tighten the benchmark before searching anything.

## Defaults

Use these defaults unless the user gives a stronger constraint:

- population size: `10`
- survivors per generation: `2`
- offspring per generation: `8`
- survivor policy: keep the two highest-fitness candidates
- reevaluation: score every candidate every generation
- acceptance rule: promote only candidates that improve or preserve the validated best score
- baseline: preserve one stable control copy of the incoming skill and never overwrite it silently
- evaluation requests: prefer a minimum of `3` so the results have at least a
  small distribution instead of a single-run anecdote
- parallel requests:
  - choose a level that keeps the machine responsive and avoids turning rate limits or local contention into benchmark noise
  - for local machine-aware runs, start from `60%` of the capacity reported by Node.js (`os.availableParallelism()` when available, otherwise `os.cpus().length`)
  - lower that starting point when the benchmark is expensive, flaky, stateful, or prone to local contention
  - increase parallelism only after one stable run at the chosen starting point
- cache policy:
  - disable cache while validating whether a new mutation actually changed behavior
  - enable reuse or cache only for unchanged profiles or unchanged candidates when the benchmark and inputs are identical
  - do not compare a cached incumbent against a freshly executed challenger without stating that asymmetry
- simplicity criterion:
  - all else being equal, simpler is better
  - a small fitness improvement that adds significant complexity to the skill is not worth keeping
  - a fitness-neutral change that removes complexity or improves clarity is worth keeping
  - weigh the complexity cost against the improvement magnitude before accepting any candidate
- crash and failure handling:
  - if a candidate crashes during evaluation (missing output, runtime error, timeout), try to diagnose the cause
  - if the crash is a trivial fix (typo, missing import, path error), fix it and re-evaluate once
  - if the idea itself is fundamentally broken, mark it as crashed with fitness `0`, log the failure reason, and move on
  - do not spend more than one retry on a crashing candidate
- autonomous loop discipline:
  - once the population-search loop has begun, do not pause to ask the user if you should continue
  - the loop runs until fitness plateaus, success criteria are met, or the user intervenes
  - if you run out of mutation ideas, re-read the current skill and references for new angles, try combining near-misses from previous generations, or try more radical structural changes
  - report each iteration summary before proceeding to the next generation

Prefer a user-defined rubric as the fitness function.
If the user does not provide one, derive the minimal rubric from the task, fixture, and evaluation command, then write that rubric down before generating variants.

## Workflow

### 1. Freeze the benchmark

- Confirm the workspace and target files are static.
- Confirm the evaluation command is reproducible.
- Define the fitness rule in one place.
- Identify any hard gates such as tests, linters, schema validation, or required output shape.
- Estimate an appropriate parallel request count before the loop starts:
  - `1` when the benchmark is flaky, stateful, or likely to hit shared-resource conflicts
  - otherwise compute `Math.max(1, Math.floor(capacity * 0.6))` from Node.js capacity and use that as the default first trial
  - lower the computed value when the benchmark is mostly CLI startup, heavy filesystem work, or remote-rate-limit sensitive
  - raise it only after confirming the benchmark remains stable and machine capacity is not the bottleneck
- Prefer lowering parallelism before lowering requests when results look noisy.

Use this Node.js snippet when you need the concrete value:

```js
import os from "node:os";

const capacity = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : os.cpus().length;

const maxConcurrency = Math.max(1, Math.floor(capacity * 0.6));
console.log(maxConcurrency);
```

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

Use `scripts/create-population.js` to materialize the first generation and write candidate manifests.

### 3. Evaluate every candidate

- Run the same evaluation method for every candidate.
- For Skill Arena evaluations, run `skill-arena val-conf <evaluation.yaml>`,
  `skill-arena evaluate <evaluation.yaml> --dry-run`, and then
  `skill-arena evaluate <evaluation.yaml>` directly. Inspect
  `merged/report.md` first and use `summary.json` for structured details. A
  result-reporting skill may automate these same steps when available, but is
  not required. Live execution can take several minutes.
- Use cache deliberately:
  - prefer fresh execution for newly mutated candidates
  - use `--reuse-unchanged-profiles` or equivalent reuse only when you have
    verified that the candidate, prompt set, and benchmark inputs are unchanged
  - if cache or reuse is enabled, say which options were reused and which were
    freshly executed
- Use parallelism deliberately:
  - if latency is dominated by local CPU, filesystem, or CLI startup, keep concurrency modest
  - if the benchmark is mostly independent remote calls and remains stable, moderate parallelism is usually acceptable
  - if error rates increase with concurrency, treat that as benchmark noise and step back down
- Record raw outputs and the normalized fitness value for each one.
- Reject candidates that break required gates even if they look promising qualitatively.
- Keep scoring artifacts outside the skill files when possible so the skill content stays reviewable.
- At the end of each iteration, produce a short findings summary that captures:
  - the strongest positive signal
  - the main regression or weakness
  - what stayed inconclusive
  - the next mutation hypothesis

Use `scripts/rank-results.js` after writing per-candidate result files.

### 4. Select survivors

- Rank all candidates by normalized fitness.
- Break ties deterministically.
- Keep only the top `2`.
- Write down why those two survived.
- Mark the remaining `8` as discarded for this generation.

Read [references/population-search-loop.md](references/population-search-loop.md) for the exact selection policy.

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
- Before starting another generation or stopping, report the iteration summary
  so the user can see what the loop learned from that round.
- Include the key evaluation run facts in that summary:
  - requests per cell or total requests actually executed
  - max concurrency or effective parallelism used
  - success ratio for each option that was compared
  - which option was selected as best
  - why it won, including the deciding signals and any hard gates

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
- the important execution facts for the winning evaluation, including request
  count, concurrency, and per-option success ratios

## Operating Rules

- Keep the benchmark fixed while the skill evolves.
- Make one candidate hypothesis legible enough that another agent could understand it from the manifest alone.
- Preserve deterministic ordering for ranking and survivor selection.
- Prefer small, attributable mutations over sweeping rewrites.
- Use crossover only when the parent strengths are complementary and observable.
- Do not merge speculative changes into the winner without reevaluation.
- Do not let hidden context or external knowledge drift into the benchmark loop.
- Every iteration must include a concise summary of findings before the next
  mutation or final closeout.
- The final closeout must report the winning option and the reason it beat the
  alternatives, not just that it was accepted.
- Every candidate must have a binary outcome: keep or discard. There is no
  "maybe" or "revisit later" status. Either it beats the incumbent and gets
  promoted, or it is discarded and its hypothesis is recorded for learning.
- Treat the skill bundle as the only file you modify. The benchmark config,
  workspace fixtures, and evaluation harness are read-only during the loop.
  If the benchmark needs to change, stop the loop, fix the benchmark, and
  restart from a fresh generation.

## References And Helpers

- `references/population-search-loop.md`: selection policy, generation rhythm, and plateau detection
- `references/fitness-design.md`: how to define, normalize, and compose fitness
- `references/mutation-operators.md`: practical mutation and crossover operators with examples
- `assets/decision-tree.md`: choose the shortest path for the current population-search task
- `assets/fast-path.md`: step-by-step quick start for a single population-search loop
- `scripts/create-population.js`: create a generation skeleton and candidate manifests
- `scripts/rank-results.js`: normalize scores and rank candidates
- `scripts/breed-generation.js`: keep top two and generate the next eight candidates
- `scripts/write-generation-log.js`: record winner selection and discarded variants
