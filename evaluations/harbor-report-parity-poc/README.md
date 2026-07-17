# Harbor Report Parity POC

This proof of concept checks whether Harbor trial results can reproduce Skill
Arena's existing comparison artifacts without changing the public Skill Arena
CLI or runtime contracts.

## What It Proves

The normalizer reads two completed Harbor jobs, maps each trial to one
`prompt x agent/model x profile` cell, and reuses Skill Arena's existing matrix
and report functions. It writes:

```text
<output>/summary.json
<output>/merged/merged-summary.json
<output>/merged/report.md
```

The resulting Markdown has the same columns, rows, pass ratios, token
statistics, and latency statistics as a native Skill Arena compare report.

The normalizer also fails closed if the profile job configs differ beyond job
identity and skills, if the declared skill set is not present in every trial,
or if agent versions differ between profiles.

Baseline and skill are deliberately separate Harbor jobs. Harbor aggregates a
job by agent, model, and dataset; the aggregation key does not include the
skill list, so putting both profiles in one job would mix their statistics.

## Validate The Harbor Plans

Install Harbor into an isolated `uv` environment or use `uvx`. The pinned
version used for this POC is `0.18.0`.

```powershell
uvx --from harbor==0.18.0 harbor run `
  --config evaluations/harbor-report-parity-poc/jobs/no-skill.yaml `
  --print-config

uvx --from harbor==0.18.0 harbor run `
  --config evaluations/harbor-report-parity-poc/jobs/skill.yaml `
  --print-config
```

`--print-config` validates Harbor's Pydantic job model and prints the configured
attempts, agents, models, and skill paths. It does not verify local paths or
launch a sandbox.

## Generate The Deterministic POC Report

The checked-in config points to synthetic but Harbor-schema-aligned job
artifacts. This makes report compatibility testable without Docker or model
cost. The fixture includes Codex and Claude Code rows to prove multi-agent
report shaping; the live smoke config intentionally uses only Codex so it needs
one authenticated runtime.

```powershell
node skills/harbor-runner/scripts/normalize-harbor-jobs.js `
  evaluations/harbor-report-parity-poc/report-config.yaml `
  --output .tmp/harbor-report-parity-poc/normalized
```

The expected human-readable result is also checked in as
[`last_report.md`](./last_report.md).

## Run Live

The task contains a marker that exists only in the skill and hidden verifier.
The baseline should fail; the skill profile should pass. Docker is the default
Harbor environment. The live smoke config uses the current Codex subscription
model `openai/gpt-5.6-sol`.

From WSL, point Harbor at the current Windows Codex credential and run both
profiles from the repository root:

```bash
export CODEX_AUTH_JSON_PATH="$(wslpath "$(cmd.exe /c echo %USERPROFILE% 2>/dev/null | tr -d '\r')")/.codex/auth.json"
node skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/harbor-report-parity-poc/report-config-live.yaml \
  --doctor

node skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/harbor-report-parity-poc/report-config-live.yaml
```

The runner validates the Harbor configs and task schema, creates fresh job names,
executes both profiles, and normalizes their results. To normalize explicitly
selected completed jobs without another model run:

```powershell
node skills/harbor-runner/scripts/normalize-harbor-jobs.js `
  evaluations/harbor-report-parity-poc/report-config-live.yaml `
  --profile no-skill=.tmp/harbor-report-parity-poc/jobs/harbor-report-poc-no-skill `
  --profile skill=.tmp/harbor-report-parity-poc/jobs/harbor-report-poc-skill `
  --output .tmp/harbor-report-parity-poc/live-normalized
```

Profile override paths may be absolute or relative to the current working
directory. Paths stored in `report-config.yaml` are relative to this evaluation
folder.

## Live Evidence

The live run completed on 2026-07-13 with Harbor 0.18.0, Docker Engine 29.1.3,
Docker Compose 2.40.3, Codex 0.144.0, and `openai/gpt-5.6-sol`:

- no-skill: 0/2 passed, 0 execution exceptions;
- skill: 2/2 passed, 0 execution exceptions;
- the normalizer emitted the same Markdown matrix contract used by Skill Arena.

The generated evidence is checked in as
[`last_live_report.md`](./last_live_report.md). The full local Harbor job and
normalized JSON artifacts remain under `.tmp/harbor-report-parity-poc/`.

## Current Gaps

- Harbor runs the agent inside a Linux container or remote sandbox rather than
  invoking the host-installed Windows CLI.
- Harbor does not export Skill Arena's Markdown matrix by itself; the small
  normalizer remains necessary.
- Harbor has no native equivalent for Skill Arena's unsupported-capability
  cells or changed-code metric deltas.
- Final agent text is not a stable field in Harbor's `TrialResult`. The POC
  includes sample outputs only when an adapter records a known text field in
  `agent_result.metadata`.
