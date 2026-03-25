Work in an autonomous loop to improve `skills/skill-arena-compare`.

Rules:
- Run the baseline first:
  `npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 10 --maxConcurrency 10`
- Test only one hypothesis per iteration.
- Never mix evaluation changes and skill changes in the same iteration.
- If you change evaluation, modify only `benchmarks/skill-arena-compare/compare.yaml`, and only to fix false failures or false passes caused by incorrect evaluation logic.
- If you change the skill, you may modify only:
  - `skills/skill-arena-compare/SKILL.md` # Default loaded skill file
  - `src` # Do not generate scripts, extended references, or templates; improve the CLI, the generated template, the generated TODOs, and any options needed to make them more trustworthy
- Re-run the benchmark after every change.
- Before closing the iteration, run `node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js`.
- Keep a change only if it improves results or fixes a real false positive or false negative.
- Revert any change that makes results worse, ambiguous, or noisier.
- Record every attempt in `skills/skill-arena-compare/learning.log` using append-only writes.
- Avoid repeating hypotheses already recorded there.
- Prefer simple, short, robust instructions. Assume the executor is easily distracted.
- Do not overfit the skill to a specific case. The goal is a skill that can generate any configuration file with any supported option set.

Loop:
1. Run the benchmark.
2. Inspect failures.
3. Classify each one as a false negative, false positive, or true negative.
4. Choose one hypothesis.
5. Apply one change.
6. Re-run the benchmark.
7. Run `node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js`.
8. Keep or revert.
9. Append the result to `learning.log`.
10. Repeat.

Iterate as much as possible, or until the skill-enabled version performs perfectly.

Hints:
- Allow the workflow to generate a configuration from the options already known, then iterate through the remaining TODOs.
- Run and improve `val-conf` so it clearly warns when TODOs or undefined fields remain; the agent should be able to trust it before running the evaluation.
