# ADR: Minimal Runtime Auth Seeding

Date: 2026-04-12

## Status

Accepted

## Context

Skill Arena runs local CLIs such as Codex, PI, and OpenCode inside isolated execution homes. The earlier isolation flow copied not only authentication files but also parts of the user's local runtime configuration such as:

- Codex `config.toml`, `version.json`, `.codex-global-state.json`, `rules/`, and `vendor_imports/`
- PI `settings.json` and `bin/`
- OpenCode `opencode.json`, `opencode.jsonc`, and `tui.json`

That behavior did not directly mix outputs between compare profiles, but it weakened benchmark methodology because the effective baseline could inherit user-specific defaults and personalization from the host machine.

## Decision

Skill Arena runtime isolation will seed only the minimum host state required for authenticated CLI execution:

- Codex: `auth.json` plus built-in `.system` skills
- PI: `auth.json` only
- OpenCode: data `auth.json` only

Host personalization and default-behavior config files must not be copied into the isolated runtime home.

## Consequences

- Compare runs remain authenticated and executable on the local machine.
- Baselines and skill-enabled runs are less sensitive to user-specific runtime defaults.
- Reproducibility improves across operators and machines.
- If a local CLI later proves to require another file for basic authenticated execution, add it deliberately with an explicit rationale instead of copying whole config trees.
