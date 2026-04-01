# Git Workspace-Overlay Reference

Use this pattern when the benchmark asks for a remote skill that must be
materialized into the compare workspace.

## Minimal shape

```yaml
comparison:
  profiles:
    - id: baseline
      description: Fully isolated control.
      isolation:
        inheritSystem: false
      capabilities: {}
    - id: skill
      description: Skill-enabled profile.
      isolation:
        inheritSystem: false
      capabilities:
        skills:
          - source:
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

- Keep the keys under `comparison.profiles[*].capabilities.skills[*]`.
- Keep `isolation.inheritSystem: false` and declare capabilities explicitly.
- Keep `type: git` under `source`.
- `skillPath` points to the skill folder that contains `SKILL.md`.
- Prefer runtime-relative local workspace sources such as `fixtures/...` when the
  compare file must run from another working directory.
- Do not switch to `system-installed` unless the benchmark brief explicitly asks
  for it.

## Target benchmark reminder

For the repository benchmark `evaluations/skill-arena-config-author/evaluation.yaml`, the
expected remote skill source is:

```yaml
capabilities:
  skills:
    - source:
        type: git
        repo: https://github.com/googleworkspace/cli.git
        ref: main
        subpath: .
        skillPath: skills/gws-calendar-agenda
        skillId: gws-calendar-agenda
      install:
        strategy: workspace-overlay
```
