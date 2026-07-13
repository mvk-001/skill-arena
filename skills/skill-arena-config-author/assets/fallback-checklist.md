# Offline Compare Authoring Checklist

Use this when shell access is blocked, flaky, or not worth trusting.

## Fixed fallback order

1. Start from `assets/compare-template.yaml`.
2. Replace only values supported by the request and declared inputs.
3. Check enabled skill shape and prompt assertions.
4. If prompts were authored, check them against
   `references/evaluation-design.md` and their coverage JSON.
5. Delete any commentary around the YAML.
6. Return the YAML.

## Output-only rules

- Final answer is raw YAML only.
- No prose before the YAML.
- No prose after the YAML.
- No Markdown fences.
- No headings such as `Status`, `Summary`, `Testing`, `Changes`, or `Next Steps`.
- No bullets that describe what you did.
- No validation notes in the final answer.
- If the task says to write a file first, the final YAML answer still needs to
  match that file.
- If validation is flaky, fix the draft and still return YAML when the required
  values are already available locally.
- Final self-check:
  - first visible characters are `schemaVersion: 1`
  - last visible characters are the end of the YAML file

## Exact top-level shape

- `schemaVersion`
- `benchmark`
- `task`
- `workspace`
- `evaluation`
- `comparison`

Keep that exact order when the benchmark expects exact top-level keys.

## Required checks before return

- `task.prompts` is a list, not a mapping.
- Shared assertions stay under top-level `evaluation.assertions`.
- Prompt-specific assertions stay under `task.prompts[*].evaluation.assertions`.
- `no-skill` profiles keep `capabilities: {}` unless the task explicitly asks for a different baseline id.
- Capability profiles declare explicit entries under `comparison.profiles[*].capabilities`.
- Workspace overlays include `install.strategy: workspace-overlay`.
- Local paths are absolute or runtime-relative.
- The answer starts with `schemaVersion: 1`.
- The answer contains no backticks.
- `workspace.setup.env` values using `$WORKSPACE` or `${WORKSPACE}` reference the
  materialized workspace directory at runtime.
- `agent.cliEnv` values using `$WORKSPACE` or `${WORKSPACE}` also resolve at runtime.

## Reject these mistakes

- Top-level `profiles`
- Top-level `variants`
- `task`, `workspace`, or `evaluation` nested under `benchmark`
- `execution` instead of `executionMethod`
- `sandbox` instead of `sandboxMode`
- `webSearch` instead of `webSearchEnabled`
- `networkAccess` or `network` instead of `networkAccessEnabled`
- `type: is-markdown`
- Commentary before the YAML
- Shell-blocker prose instead of a best-effort compare config
