# Error Patterns

Common failure scenarios when running Skill Arena evaluations.

## Invalid config

Symptoms:

- `val-conf` exits with a non-zero code
- Error message references schema violations, missing required fields, or unknown keys

Common causes:

- Missing `schemaVersion`, `benchmark.id`, or `task.prompts`
- Using legacy field names (`workspace.fixture` instead of `workspace.sources`)
- Malformed YAML (bad indentation, missing colons, tabs instead of spaces)
- Profile `capabilities.skills` using an extra `skill:` wrapper instead of `- source:` directly

Resolution: fix the config and rerun `val-conf` before attempting evaluation.

## Missing workspace inputs

Symptoms:

- Evaluation fails during workspace materialization
- Error message references a path that does not exist

Common causes:

- `workspace.sources[*].path` points to a directory that was not created or was moved
- Relative path resolved from an unexpected working directory
- Git-based source references a branch, tag, or subpath that does not exist

Resolution: verify all declared paths exist relative to the command working directory.

## Adapter or runtime failure

Symptoms:

- Evaluation starts but the agent provider exits with an error
- Timeout waiting for agent response
- Permission denied or command not found

Common causes:

- Agent CLI (`codex`, `copilot`, `opencode`, `pi`) not installed or not on `PATH`
- Agent not authenticated (missing API key or session)
- Sandbox mode incompatible with the workspace setup
- Timeout too short for the task complexity

Resolution: verify the agent CLI is available and authenticated. Check `comparison.variants[*].agent` settings.

## Assertion failure

Symptoms:

- Evaluation completes but `summary.json` shows failed assertions
- `merged/report.md` reports low pass rates for one or more profiles

Common causes:

- Agent produced output that does not match the rubric or expected format
- Rubric is too strict for the task difficulty
- Agent ran successfully but produced empty or partial output

Resolution: inspect the per-cell outputs in `promptfoo-results.json` to understand what the agent actually produced. Adjust the rubric or task prompt if the expectation was unreasonable.

## Partial execution

Symptoms:

- Some cells completed, others show errors or timeouts
- `summary.json` has a mix of passed and errored entries

Common causes:

- Rate limiting from the agent provider
- Concurrency too high for the local machine
- Intermittent network issues during evaluation

Resolution: lower `--max-concurrency`, increase timeout, or rerun with `--reuse-unchanged-profiles` to avoid re-executing successful cells.
