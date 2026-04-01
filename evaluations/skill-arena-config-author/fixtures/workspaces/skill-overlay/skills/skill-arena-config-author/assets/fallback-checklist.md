# Offline Compare Authoring Checklist

Use this checklist when shell validation is unavailable or unreliable.

## Output contract

- Final answer is raw YAML only.
- No prose before the YAML.
- No prose after the YAML.
- No Markdown fences.
- If the task says to write a file first, the YAML answer still needs to match
  the file content exactly.

## Top-level shape

- `schemaVersion`
- `benchmark`
- `task`
- `workspace`
- `evaluation`
- `comparison`
- Keep that exact order when the benchmark requires exact top-level keys.

## Common mistakes to reject

- Top-level `skillModes`
- Top-level `variants`
- `task.prompts` written as a mapping instead of a list
- `execution` instead of `executionMethod`
- `sandbox` instead of `sandboxMode`
- `webSearch` instead of `webSearchEnabled`
- `networkAccess` or `network` instead of `networkAccessEnabled`
- `type: is-markdown`

## Skill-mode checks

- Disabled mode uses `skillMode: disabled`.
- Enabled mode uses `skillMode: enabled`.
- Enabled mode has an explicit `skill` block.
- Workspace overlays include `install.strategy: workspace-overlay`.

## Prompt-row checks

- Shared assertions stay under top-level `evaluation.assertions`.
- Prompt-specific assertions stay under `task.prompts[*].evaluation.assertions`.
- Multiple prompts remain in one `task.prompts` list.
- If the brief gives exact prompt ids, verify each required id appears once.
- If one row is JSON-only and another is Markdown-only, do not copy `type:
  is-json` into the Markdown row.

## Runtime-path checks

- Local paths are absolute or runtime-relative.
- Do not rely on package-relative path resolution.

## Benchmark-target shortcut

- For the repository `skill-arena-compare` benchmark, read
  `gws-calendar-agenda-benchmark-reference.md` before drafting from memory.
