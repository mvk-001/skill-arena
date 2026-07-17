# Harbor Report Parity Proof Of Concept

Date: 2026-07-13

## Goal

Determine whether Harbor trial artifacts can reproduce Skill Arena's current
comparison matrix, normalized summary, merged summary, and Markdown report
without retaining Skill Arena's agent-provider implementations.

## Scope

- Run baseline and skill profiles as separate Harbor jobs.
- Read Harbor's job configuration and per-trial `result.json` artifacts.
- Fail closed when task checksums, variants, attempts, or cell counts differ.
- Normalize each Harbor trial into Skill Arena's existing attempt contract.
- Reuse the current matrix aggregation and report rendering modules unchanged.
- Validate the Harbor job configs without requiring a live model run.
- Exercise report generation with schema-aligned deterministic Harbor fixtures.

## Non-Goals

- Adding Harbor to the supported public CLI.
- Replacing Promptfoo or the existing adapters before live parity evidence exists.
- Claiming host-native and container-native agent execution are equivalent.
- Reproducing unsupported-capability cells or changed-code metrics in this POC.

## Acceptance Criteria

1. Harbor accepts both profile job configurations and resolves the expected
   agent, model, attempt count, concurrency, and skill source.
2. The fixture jobs validate against Harbor's current `JobResult` and
   `TrialResult` models.
3. The normalizer emits `summary.json`, `merged/merged-summary.json`, and
   `merged/report.md` using the existing Skill Arena report code.
4. Matrix cells preserve requested/completed/pass/fail/error counts, population
   token and latency averages and standard deviations, and sample outputs when
   Harbor metadata exposes them.
5. Tests prove that incomplete jobs and unfair task-checksum changes are
   rejected.
6. Repository documentation, tests, coverage, and closeout checks pass.

## Environment Resolution

Docker Engine 29.1.3 and Docker Compose 2.40.3 were installed in the existing
WSL2 Ubuntu distribution. Live Harbor 0.18.0 trials completed with Codex 0.144.0
and `openai/gpt-5.6-sol`: the no-skill profile passed 0/2 attempts and the skill
profile passed 2/2 attempts, both with zero execution exceptions. The resulting
Harbor artifacts were normalized into the existing Skill Arena Markdown and
JSON report contracts.
