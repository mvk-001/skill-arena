# ADR: Explicit Skill Activation Preambles

Date: 2026-04-14

## Status

Accepted

## Context

Skill Arena originally relied on each adapter's native skill discovery and workspace layout alone. That left two gaps:

- Some CLIs expose a documented explicit skill invocation path, and benchmarks should use it when a profile intentionally enables a skill.
- Copilot CLI does not consume the same `skills/` workspace layout as Codex, PI, OpenCode, or Claude Code, so a plain workspace overlay was weaker than the other adapters.

## Decision

When a scenario enables declared skills, Skill Arena will add a small adapter-specific prompt preamble that only forces explicit skill activation and then preserves the original benchmark task verbatim under a `Task:` header.

Skill Arena will also mirror declared workspace skills into adapter-native runtime locations when required. For Copilot CLI, workspace skills are mirrored into `.github/skills/` inside the isolated workspace before execution.

## Consequences

- Skill-enabled profiles exercise a more explicit and comparable activation path across adapters.
- The benchmark prompt still remains the source of task instructions; the added preamble is limited to selecting declared skills.
- Copilot CLI skill profiles are less likely to miss repository-local skills because of layout differences.
