---
name: compare-config-author
description: Use this skill when you need to author or refine a Skill Arena compare.yaml file.
---

# Compare Config Author

Author a `compare.yaml` file for Skill Arena.

## Goal

Produce a concise compare config that gives:

- skill-mode columns such as `no-skill` and `skill`
- rows by prompt and agent/configuration
- explicit repeated executions through `evaluation.requests`
- labels that read well in Promptfoo and in `merged/report.md`

## Rules

1. Keep the task prompt exact and benchmark-specific.
2. Prefer `task.prompts` over a single `task.prompt` when the benchmark should compare multiple prompt variants.
3. Set `evaluation.requests` explicitly. Use `10` unless the benchmark has a reason to use a different count.
4. Prefer two skill modes by default:
   - `no-skill`
   - `skill`
5. Set `skillSource` explicitly when the benchmark depends on a system-installed skill.
6. Give every variant a stable slug id and a readable `output.labels.variantDisplayName`.
7. Keep assertions strict enough to measure the benchmark goal, but avoid unnecessary harness instructions in the prompt.
8. Reuse the template in `assets/compare-template.yaml` as the starting point.

## Output

Return only the completed `compare.yaml` content unless the user asks for explanation.
