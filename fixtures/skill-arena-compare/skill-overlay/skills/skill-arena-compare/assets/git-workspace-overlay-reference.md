# Git Workspace-Overlay Reference

Use this pattern when the benchmark asks for a remote skill that must be
materialized into the compare workspace.

## Minimal shape

```yaml
comparison:
  skillModes:
    - id: no-skill
      description: Baseline without the skill.
      skillMode: disabled
    - id: skill
      description: Skill-enabled run.
      skillMode: enabled
      skill:
        source:
          type: git
          repo: https://github.com/example/repo.git
          ref: main
          subpath: .
          skillPath: skills/example-skill
          skillId: example-skill
        install:
          strategy: workspace-overlay
```

## Checks

- Keep the keys under `comparison.skillModes[*].skill`.
- Use `skillMode: enabled`, not `enabled: true`.
- Keep `type: git` under `source`.
- `skillPath` points to the skill folder that contains `SKILL.md`.
- Prefer runtime-relative local workspace sources such as `fixtures/...` when the
  compare file must run from another working directory.
- Do not switch to `system-installed` unless the benchmark brief explicitly asks
  for it.

## Target benchmark reminder

For the repository benchmark `benchmarks/skill-arena-compare/compare.yaml`, the
expected remote skill source is:

```yaml
skill:
  source:
    type: git
    repo: https://github.com/googleworkspace/cli.git
    ref: main
    subpath: .
    skillPath: skills/gws-calendar-agenda
    skillId: gws-calendar-agenda
  install:
    strategy: workspace-overlay
```
