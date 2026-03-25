I need 6 agents to search for the best strategies to improve this skill: `skills/skill-arena-compare`.

Each agent should:
1. Run its version of the configuration file with `node ./src/cli/run-compare.js ./benchmarks/skill-arena-compare/compare.yaml`.
2. Review failing results. If a failure is a false negative, improve `compare.yaml` so correct behavior is validated correctly. If it is a false positive, improve `compare.yaml` so incorrect behavior is no longer accepted. Use true negatives to learn and propose improvements to the skill.
3. When proposing an idea that may improve the skill-enabled version, keep it within one of these areas: improve the skill document by simplifying it, making it more descriptive, adding references that help explain the intended outcome, creating scripts under `scripts` that automate repeated tasks and documenting how the agent should use them, or adding assets the agent can use as references.
4. Evaluate again by running the script.
5. Before closing the iteration, run `node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js`.
6. Keep the change if results improve; revert it if results get worse.
7. Record both failed and successful attempts in `learning.log` so future runs avoid repeating them. Never overwrite other progress; always append.
8. Return to step 2.

Allowed changes:
- Create scripts under `scripts`
- Create references under `references`
- Create templates and skeletons under `assets`
- Modify `SKILL.md`
- Modify evaluations only when fixing confirmed false positives or false negatives

Not allowed:
- Modify anything outside evaluation logic when changing evaluation
- Add files outside the skill folder: `skills/skill-arena-compare`

Hints:
- A simpler `SKILL.md` is easier to follow.
- A well-designed script is more reliable because it always performs the expected steps.
- Script output can return contextual next steps based on the current situation.

Assume the executor has attention constraints and struggles to retain long instructions.

Afterward, take the agents that achieved something useful and merge their winning ideas into a single solution.
