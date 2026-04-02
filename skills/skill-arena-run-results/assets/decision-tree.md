# Decision Tree

Use the shortest path that fits the execution task.

## Just validate, do not run

1. Read the config to confirm benchmark id, profiles, and variants.
2. Run validation.
3. Report whether the config is valid and surface any schema errors.

## Dry run to check generated artifacts

1. Validate the config first.
2. Run dry evaluation.
3. Inspect the generated `promptfooconfig.yaml` and materialized workspace.
4. Report what would be executed without running any agents.

## Full live evaluation

1. Validate the config.
2. Run live evaluation (optionally with `--markdown-output`).
3. Read `merged/report.md` for the human-readable comparison.
4. Summarize: which profile won, by how much, and which cells failed.

## Iterating on one profile

1. Use `--reuse-unchanged-profiles` to skip re-running the stable profile.
2. Only the changed profile re-executes.
3. Confirm reuse conditions are met (same prompt, workspace, and agent config hash).

## Execution failed

1. Classify the error using `references/error-patterns.md`.
2. Report which stage succeeded before the failure.
3. Suggest the minimal fix (config change, missing CLI, path correction).
