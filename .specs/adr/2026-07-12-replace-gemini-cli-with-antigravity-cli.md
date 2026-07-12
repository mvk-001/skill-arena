# ADR: Replace Gemini CLI with Antigravity CLI

Date: 2026-07-12

## Status

Accepted

## Context

Google is moving its terminal agent workflow from Gemini CLI to Antigravity
CLI. Skill Arena needs its supported runtime set to reflect the current local
CLI surface rather than retain an adapter for the superseded executable.

The current Antigravity documentation defines:

- `agy` as the launcher and `agy --print <prompt>` as the non-interactive mode
- `--model`, `--sandbox`, `--dangerously-skip-permissions`, and repeatable
  `--add-dir` launch controls
- user settings at `~/.gemini/antigravity-cli/settings.json`
- workspace skills under `.agents/skills/`
- workspace context through `AGENTS.md`, `GEMINI.md`, and `.agents/rules/`

The relevant product contracts are documented in Google's
[CLI reference](https://antigravity.google/docs/cli-reference),
[Gemini CLI migration guide](https://antigravity.google/docs/gcli-migration),
[skills guide](https://antigravity.google/docs/skills), and
[rules guide](https://antigravity.google/docs/rules-workflows).

## Decision

Skill Arena will remove the `gemini-cli` adapter and local judge identifiers
and replace them with `antigravity-cli`.

The Antigravity provider will:

- execute `agy --print` through the existing local-command provider boundary
- pass model, sandbox, auto-approval, print-timeout, project, and additional
  workspace controls through documented launch flags
- mirror declared generic workspace skills from `skills/*` into
  `.agents/skills/*`
- preserve project instruction discovery through `AGENTS.md`, `GEMINI.md`, or
  explicitly materialized `.agents/rules/*`
- use an isolated home and generate
  `~/.gemini/antigravity-cli/settings.json` without copying host settings
- rely on Antigravity's operating-system secure-keyring authentication instead
  of copying credential files
- capture plain print output and command metadata in execution-event artifacts

V1 compare capability support remains intentionally limited to `instructions`
and `skills`. Antigravity hooks, MCP servers, plugins, custom agents, and
subagents are native product features, but Skill Arena will not claim support
until each surface has deterministic materialization, isolation, and tests.

The adapter replacement is intentionally breaking: V1 configs that name
`gemini-cli` or `skill-arena:judge:gemini-cli` must migrate to
`antigravity-cli` or `skill-arena:judge:antigravity-cli`.

## Consequences

- The supported adapter count remains six while the Google runtime tracks the
  current `agy` product.
- Antigravity comparisons use native project skill discovery and headless print
  mode.
- Sandbox, network, web, and approval semantics remain best-effort because the
  common Skill Arena policy fields are more granular than Antigravity's launch
  flags.
- Print mode does not currently expose a structured tool-event stream, so
  execution-event artifacts contain command metadata and plain output only.
- Live Antigravity validation requires an installed and authenticated `agy`
  executable; unit tests use an injected process boundary and do not require
  credentials.
