# Decision Tree

Use the shortest path that fits the task.

## Generic compare task

1. Use `skill-arena gen-conf --output <path> --prompt <text>` when the CLI is
   available; repeat `--prompt` for multiple rows.
2. Otherwise start from `assets/compare-template.yaml` and replace its
   placeholders.
3. Validate with `skill-arena val-conf <path>`.

## Skill evaluation prompt design

Use this route when prompts are not supplied and the skill promise must define
the test surface.

1. Open `references/evaluation-design.md`.
2. Draft the smallest naturalistic task request for each case.
3. Add generalization and boundary cases across distinct task families.
4. Record cases in `prompt-coverage.json`.
5. Run `scripts/validate-evaluation-design.js` before compare validation.

## Final gate

- Keep the answer as raw YAML only
- No headings, bullets, fences, tests, or next steps
