# ADR: Explicit Environment Variable Passthrough

Date: 2026-07-12

## Status

Accepted

## Context

Some benchmarks exercise tools that require credentials such as API keys or
access tokens. Storing those values in `workspace.setup.env` or `agent.cliEnv`
would serialize secrets into the benchmark YAML and generated Promptfoo
artifacts. Inheriting the complete host environment would avoid that
serialization but would violate compare isolation and make runs difficult to
reproduce.

The runtime had a narrow value-string convention for resolving same-name host
variables. That convention was not a clear configuration contract, was not
available through `gen-conf`, and mixed secret references with ordinary static
environment values.

## Decision

Skill Arena will expose explicit, name-only environment allowlists:

- `workspace.setup.envPassthrough` applies to every scenario or compare cell.
- `agent.envPassthrough` adds variables required by one scenario or variant.

Allowlisted names must use portable environment-variable syntax. Every listed
variable is required; evaluation preparation fails with the missing names when
the host process does not define them.

The generated provider configuration stores only the allowlisted names. Values
are resolved from the provider process environment immediately before spawning
the agent CLI. Static environment mappings and the harness isolation environment
continue to override passthrough values, preserving deterministic settings and
isolated homes.

The existing same-name `$HOST_ENV:<NAME>` convention remains accepted for
backward compatibility, but new configs should use `envPassthrough`.

## Consequences

- Benchmarks can use credential-dependent tools without committing secrets.
- Generated Promptfoo configs and result metadata contain variable names, not
  their values.
- Host environment inheritance remains deny-by-default.
- Missing credentials fail before a live agent run starts.
- Benchmark authors must declare credential names as part of the reproducible
  runtime contract.
