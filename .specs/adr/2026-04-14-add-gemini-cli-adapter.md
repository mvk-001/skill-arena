# ADR: Add Gemini CLI Adapter

Date: 2026-04-14

## Status

Accepted

## Context

Skill Arena already benchmarks several local code assistants, but Gemini CLI was missing from the supported adapter set. The repository needs a first-class Gemini integration that preserves compare isolation, supports explicit instruction and skill materialization, and keeps provider behavior inside the adapter layer.

Official Gemini CLI documentation describes:

- project instructions through `GEMINI.md`
- workspace skills under `.gemini/skills/` or `.agents/skills/`
- headless execution through `-p` plus `--output-format json` or `stream-json`
- approval-mode and sandbox controls that are coarser than Codex-style execution settings

## Decision

Skill Arena will add a `gemini-cli` adapter implemented as a local command provider around the `gemini` CLI.

The provider will:

- execute Gemini in headless mode with `-p` and `--output-format stream-json`
- mirror workspace instructions and skills into Gemini-native project layout (`GEMINI.md`, `.gemini/skills/*`)
- prepend the existing explicit skill activation preamble for skill-enabled runs
- enforce best-effort isolation through an isolated home, generated `.gemini/settings.json`, and generated system-settings override paths

V1 support is intentionally limited to `instructions` and `skills`. Hooks, extensions, and other Gemini-native surfaces remain out of scope until they are materialized, mapped, and tested as stable benchmark capabilities.

## Consequences

- Skill Arena can benchmark Gemini CLI alongside the existing local adapters.
- Gemini compare runs use native project discovery paths instead of relying on generic workspace files alone.
- Sandbox, network, and approval semantics remain best-effort because Gemini CLI does not expose the same exact control surface as Codex.
