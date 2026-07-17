# Harbor Runner Skill

Date: 2026-07-13

## Goal

Turn the Harbor report-parity proof of concept into a reusable repository skill
that can create fair Harbor evaluations, execute fresh profile jobs repeatedly,
and emit the existing Skill Arena JSON and Markdown report artifacts.

## Scope

- Own the Harbor trial normalizer inside `skills/harbor-runner/`.
- Provide a fresh-run orchestrator with pinned Harbor versions and unique job
  names.
- Preserve separate skill and no-skill jobs and fail-closed fairness checks.
- Support normalization of already completed Harbor jobs without model calls.
- Document task, job, report-config, Docker, authentication, and output
  contracts through progressive disclosure.
- Validate deterministic fixtures and the execution lifecycle without spending
  model tokens in the automated test suite.

## Non-Goals

- Add Harbor to the public npm CLI in this change.
- Delete existing agent adapters before broader live benchmark parity exists.
- Hide Harbor execution exceptions or convert them into verifier failures.
- Store model credentials in repository files or generated run manifests.

## Acceptance Criteria

1. The skill passes the official skill validator and has matching UI metadata.
2. Dry runs validate all profile job configs without Docker or model calls.
3. Live runs use unique job names, preserve previous evidence, and stop on
   missing job artifacts.
4. Normalize-only runs reproduce the established matrix and report contract.
5. Tests cover planning, normalize-only execution, and a simulated fresh live
   lifecycle.
6. Repository tests, coverage, docs, and the required closeout hook pass.

## Evolution: Fail-Fast Operations

The live POC exposed four avoidable pre-agent failures: missing Docker Compose,
an invalid Harbor task name, stale subscription authentication, and an
unsupported model. The evolved runner adds a no-token `--doctor` mode that
validates Harbor job and task models, Docker Engine, Docker Compose, and the
credentials selected for configured agents. Live execution now runs the same
environment and credential checks before launching any profile job.

Codex subscription checks decode only the access-token expiry claim. Tokens,
refresh tokens, API keys, and auth file contents are never included in output
or run manifests.
