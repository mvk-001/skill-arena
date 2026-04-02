---
name: skill-arena-run-results
description: Execute Skill Arena compares and report the outcome clearly to the user. Use when Codex needs to validate a compare config, run a dry-run or live evaluation, inspect merged outputs, and summarize the result without dumping raw harness noise.
---

# Skill Arena Run Results

Execute a Skill Arena compare and present the outcome clearly.

## Goal

Turn a `compare.yaml` into an actionable result:

- validate the config before heavier execution when possible
- prefer a dry run first when the config or workspace may still be wrong
- run the requested evaluation command
- inspect generated result artifacts such as `merged/report.md` and profile outputs
- summarize what passed, what failed, and what the user should look at next

## Preferred Evaluation Layout

When the evaluation belongs to one skill and the user did not request another
layout, prefer:

```text
evaluations/<skill-name>/evaluation.yaml
evaluations/<skill-name>/fixtures/workspaces/...
evaluations/<skill-name>/last_report.md
```

Interpretation:

- execute `evaluations/<skill-name>/evaluation.yaml`
- treat `evaluations/<skill-name>/fixtures/workspaces/` as the default local
  fixture area for that evaluation
- if the workflow wants a persisted human summary, write or refresh
  `evaluations/<skill-name>/last_report.md`

## Result Artifact Structure

Compare runs write artifacts under:

```text
results/<benchmark-id>/<timestamp>-compare/
```

Key files:

- `promptfooconfig.yaml`: the generated Promptfoo config used for this run
- `promptfoo-results.json`: raw Promptfoo output with per-cell evaluation details
- `summary.json`: normalized Skill Arena summary with provider metadata, scenario summaries, and a compare matrix
- `merged/report.md`: human-readable side-by-side compare report (primary inspection target)
- `merged/merged-summary.json`: merged machine-readable summary payload

When inspecting results, read `merged/report.md` first. Fall back to `summary.json`
for structured data when the report does not contain the needed detail.

## Workflow

1. Read the requested `compare.yaml` and confirm which benchmark, profiles, and variants are involved.
2. Start with the lightest useful validation:
   - config check: `skill-arena val-conf <evaluation.yaml>`
   - planning only: `skill-arena evaluate <evaluation.yaml> --dry-run`
   - live execution: `skill-arena evaluate <evaluation.yaml>`
   - persisted report: `skill-arena evaluate <evaluation.yaml> --markdown-output evaluations/<skill-name>/last_report.md`
3. If the user asked for results and no mode was specified, prefer `--dry-run` first unless the task clearly expects a live run.
4. When a command fails, classify the failure (see `references/error-patterns.md`):
   - invalid config: schema violations, missing required fields
   - missing workspace inputs: paths that do not exist or cannot be resolved
   - adapter or runtime failure: agent CLI not found, timeout, permission error
   - assertion failure: benchmark ran but assertions did not pass
5. If execution succeeds, inspect the generated report and summarize the important deltas between profiles and variants.
6. If the workflow wants a persisted summary and the user did not request a
   different location, refresh `evaluations/<skill-name>/last_report.md`.
7. Keep the final user-facing response concise: execution status, key findings, and the most relevant artifact paths.

## Reading The Compare Report

When inspecting `merged/report.md`:

- Look for the profile comparison table showing pass rates per profile and variant.
- Identify which profile won (higher pass rate) and by how much.
- Note any cells marked as `unsupported` or `skipped` (adapter does not support that capability).
- Surface the prompt-level breakdown when the user needs per-task detail.

When inspecting `summary.json`:

- `summary.comparison.matrix` contains the structured pass/fail data per cell.
- `summary.providers` maps provider ids to their profile and variant metadata.
- `summary.scenarios` lists per-prompt results with assertion outcomes.

## Do This

- Prefer exact commands over vague instructions.
- Quote benchmark ids, profile ids, prompt ids, and variant ids exactly as they appear.
- Distinguish dry-run success from live-evaluation success.
- Surface the concrete artifact paths that matter, especially `merged/report.md`.
- When the repository uses the recommended layout, prefer
  `--markdown-output evaluations/<skill-name>/last_report.md`.
- When the evaluation follows the recommended layout, also surface
  `evaluations/<skill-name>/last_report.md` if it was updated.
- When results are incomplete, say which stage failed and what completed successfully before it.

## Do Not Do This

- Do not rewrite the user's config when the task is only to execute it.
- Do not paste long raw logs into the final answer.
- Do not claim a benchmark passed when only validation or dry-run passed.
- Do not omit failed assertions if the harness produced them.
- Do not guess at result values; read them from the actual artifact files.

## Output

Default to a short execution summary in prose. Include command intent, outcome, and relevant artifact paths. Use bullets only when multiple findings or failures need to be separated.

## References

- `references/error-patterns.md`: common failure scenarios and how to classify them
- `references/artifact-structure.md`: detailed layout of result directories and file purposes
