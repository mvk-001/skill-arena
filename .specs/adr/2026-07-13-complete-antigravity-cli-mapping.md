# ADR: Complete Antigravity CLI option and capability mapping

Date: 2026-07-13

## Status

Accepted

## Context

The first `antigravity-cli` adapter release proved authenticated print mode and
workspace skills, but exposed only part of the `agy` 1.1.1 contract. In
particular, omitting a false sandbox flag allowed an isolated settings overlay
to be contradicted by persistent defaults, common approval policies were
reported as unsupported despite native equivalents, and custom agents, hooks,
MCP servers, and plugins were blocked even though Antigravity provides stable
workspace layouts for them.

The current product contracts are documented in Google's
[CLI reference](https://antigravity.google/docs/cli-reference),
[permissions guide](https://antigravity.google/docs/cli-permissions),
[sandbox guide](https://antigravity.google/docs/cli-sandbox),
[agents command](https://antigravity.google/docs/cli/commands/agents),
[hooks guide](https://antigravity.google/docs/hooks),
[MCP guide](https://antigravity.google/docs/mcp), and
[plugins guide](https://antigravity.google/docs/plugins).

## Decision

The provider will always emit `--sandbox=true` or `--sandbox=false`, and will
generate isolated settings that override host policy with:

- `toolPermission` mapped from every common approval policy
- `artifactReviewPolicy` aligned with autonomous versus review-required runs
- `enableTerminalSandbox` and `sandboxAllowNetwork`
- fine-grained `read_url` and `execute_url` rules
- `allowNonWorkspaceAccess: false`

Typed `agent.config` fields will cover `agent`, `mode`, `logFile`,
`printTimeout`, `project`, `newProject`, `settings`, and `extraArgs`. Log paths
must remain inside the run workspace. Managed flags and conversation-state
options cannot be smuggled through `extraArgs`.

Compare profiles may declare one custom agent and may materialize hooks, MCP
configuration, and plugins using Antigravity's native `.agents/*` paths. The
profile agent ID is selected with `--agent`. Extensions remain unsupported
because Antigravity's replacement abstraction is plugins.

## Consequences

- Approval, sandbox, network, and web policy are deterministic for combinations
  representable by Antigravity settings and permissions.
- `read-only` remains best-effort because terminal commands inside the native
  sandbox may still write within the workspace.
- Enabling web reads while disabling all terminal network access cannot be
  perfectly separated because `read_url` grants also feed sandbox domain
  allowlists; the provider reports that combination as unsupported metadata.
- `reasoningEffort` remains unsupported; users select Antigravity reasoning
  variants through the model name.
- Fresh-session isolation takes precedence over exposing `--continue`,
  `--conversation`, or interactive prompt modes.
