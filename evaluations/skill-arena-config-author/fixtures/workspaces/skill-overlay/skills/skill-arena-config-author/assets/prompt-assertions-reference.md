# Prompt-Level Assertions Reference

Use top-level `evaluation.assertions` for checks shared by every prompt. Put only
row-specific checks under `task.prompts[*].evaluation.assertions`.

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
- Use supported V1 assertion types only.
- Prefer `regex` or `llm-rubric` for Markdown-shaped checks. Do not invent
  `type: is-markdown`.
- If the user asks for exactly two prompts, verify there are exactly two prompt
  objects and that each `id` appears once.
- When the answer must be raw YAML only, do not add commentary before or after
  the config.

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
