# Decision Tree

Use the shortest path that fits the traced-evolution task.

## Skill deepening (existing human-written skill)

Use this route when you have a validated skill and want to improve it from traces.

1. Initialize the run with the current human-written skill as baseline.
2. Import the trace pool, splitting off a holdout slice (20%+) if the pool is large enough.
3. Propose trajectory-local patches using asymmetric analysis:
   - failure traces → agentic multi-turn root-cause analysis
   - success traces → single-pass pattern extraction
4. Consolidate by prevalence (default `minSupport: 2`).
5. Route high-prevalence rules to `SKILL.md`, niche heuristics to `references/*`.
6. Validate the consolidated set for scope and conflicts.
7. Evaluate the consolidated skill on holdout traces.
8. Promote only if holdout result improves or preserves the baseline.

## Skill creation from scratch

Use this route when no useful skill exists yet and you want to build one from traces.

1. Start with a minimal parametric-knowledge-only draft as `S0`.
2. Generate traces by running the agent with `S0` on the task set.
3. Follow the same pipeline as skill deepening (steps 2-8 above).
4. The resulting skill is driven entirely by trajectory evidence, not parametric guesses.

## Small trace pool (under 5 traces)

1. Lower `minSupport` to `1` only if the task explicitly allows speculative consolidation.
2. Skip holdout validation (not enough data to split).
3. Record that the promotion is discovery-only and recommend re-evaluation on future traces.

## Large trace pool (50+ traces)

1. Raise `minSupport` to 3 or higher for higher-confidence patches.
2. Use hierarchical merging: group patches into batches, consolidate each batch, then consolidate batch results.
3. Split at least 20% as holdout before analysis.

## Traces lack clear labels

1. Do not consolidate yet.
2. Label each trace as success or failure based on the benchmark evaluator output.
3. If the benchmark cannot distinguish outcomes clearly, fix the evaluation setup first.

## Consolidation has too many conflicts

1. Review the conflict groups in `consolidated/consolidated-patches.json`.
2. If many patches share the same conflict group, the trace pool may reflect contradictory lessons.
3. Tighten the trace labeling criteria or split into separate task-specific pools.

## Choosing between evolution and traced-evolution

- Use `$skill-arena-evolution` when you want to generate new skill candidates through genetic-algorithm-style mutation and crossover.
- Use `$skill-arena-traced-evolution` when you already have execution traces and want to distill recurring lessons into one consolidated update.
- The two approaches can be combined: use traced-evolution to produce a strong initial skill from existing traces, then use evolution to push it further through iterative generation.
