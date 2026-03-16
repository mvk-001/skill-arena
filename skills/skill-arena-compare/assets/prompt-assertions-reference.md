# Prompt-Level Assertions Reference

Use top-level `evaluation.assertions` for checks shared by every prompt.
Put only row-specific checks under `task.prompts[*].evaluation.assertions`.

## Short Rule

- Shared check for every row: top-level `evaluation.assertions`.
- Format check for one row only: that prompt's `evaluation.assertions`.
- Do not invent `shared:` under `evaluation`.
- Do not invent `text:` when the schema expects `prompt:`.

## Typical split

Shared:

```yaml
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: Score 1.0 only if the output satisfies the benchmark goal.
```

Prompt-specific:

```yaml
task:
  prompts:
    - id: today-json
      prompt: Return JSON only.
      evaluation:
        assertions:
          - type: is-json
    - id: week-markdown
      prompt: Return Markdown only.
      evaluation:
        assertions:
          - type: regex
            value: "(?m)^(#|[-*] )"
```

## Checks

- Keep prompt assertions nested under each prompt object in the YAML list.
- Keep the field name `prompt:`.
- Use supported V1 assertion types only.
- Prefer `regex` or `llm-rubric` for Markdown-shaped checks. Do not invent
  `type: is-markdown`.
- If the brief gives exactly two prompts, keep exactly two prompt objects and
  make each `id` appear once.
- When the answer must be raw YAML only, keep all commentary out of the final
  answer.

## gws-calendar-agenda benchmark pattern

```yaml
task:
  prompts:
    - id: today-json
      prompt: Return today's agenda across all calendars. Prefer the underlying gws calendar +agenda command in read-only mode. Return JSON only.
      evaluation:
        assertions:
          - type: is-json
    - id: week-markdown
      prompt: Return this week's agenda across all calendars. Prefer the underlying gws calendar +agenda command in read-only mode. Return Markdown only.
      evaluation:
        assertions:
          - type: regex
            value: "(?m)^(#|[-*] )"
```

## Reject These Mistakes

- `shared:` under `evaluation`
- `text:` instead of `prompt:`
- `type: is-json` inside `week-markdown`
- commentary before or after the YAML
