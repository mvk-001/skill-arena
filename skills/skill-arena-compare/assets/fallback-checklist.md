# Offline Compare Authoring Checklist

Use this when shell access is blocked, flaky, or not worth trusting.

## Fixed fallback order

1. Start from one source only.
   - Repository `skill-arena-compare` benchmark:
     `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js`
   - Everything else:
     `assets/compare-template.yaml`
2. If shell execution is not available, copy `assets/gws-calendar-agenda-copy-card.yaml`.
3. Replace only the values the brief changes.
4. Check enabled skill shape and prompt assertions.
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
- Baseline profiles keep `capabilities: {}`.
- Capability profiles declare explicit entries under `comparison.profiles[*].capabilities`.
- Workspace overlays include `install.strategy: workspace-overlay`.
- Local paths are absolute or runtime-relative.
- The answer starts with `schemaVersion: 1`.
- The answer contains no backticks.

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

## Repository benchmark shortcut

For the repository `skill-arena-compare` benchmark:

1. Copy `assets/gws-calendar-agenda-copy-card.yaml`.
2. Or run `scripts/scaffold-skill-arena-compare-benchmark.js` to write `deliverables/compare.yaml`.
3. Check `assets/gws-calendar-agenda-benchmark-reference.md`.
4. Check `assets/git-workspace-overlay-reference.md`.
5. Check `assets/prompt-assertions-reference.md`.
6. Run `scripts/validate-compare-output.js <path> --benchmark skill-arena-compare`.
