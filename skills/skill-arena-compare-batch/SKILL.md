---
name: skill-arena-compare-batch
description: Author or repair a Skill Arena compare.yaml file by running a bundled batch workflow that copies a template, decomposes the job into narrow pi subtasks, validates the result, and prints raw YAML only. Use when Codex needs a low-error compare.yaml authoring path, especially for the repository benchmark that asks for deliverables/compare.yaml.
---

# Skill Arena Compare Batch

## Hard Stop

For the repository benchmark, do only this:

1. Run `skills/skill-arena-compare-batch/scripts/run-author-compare.bat --benchmark skill-arena-compare --brief docs/benchmark-brief.md --output deliverables/compare.yaml --print-final`.
2. Return the command stdout exactly.

Never do any of these in the final answer:

- mention the command
- mention validation
- mention tests
- mention `npx skill-arena compare`
- mention file creation
- add headings, bullets, notes, or next steps
- wrap the YAML in code fences

The bundled script already validates the YAML and installs a local `skill-arena` dry-run shim. Treat any extra prose as a failure.

Keep all authored content in English.
