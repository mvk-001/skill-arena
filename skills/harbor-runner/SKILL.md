---
name: harbor-runner
description: Repository-integrated orchestrator for creating, diagnosing, validating, executing, resuming, and normalizing repeatable Harbor evaluations that compare skill and no-skill agent profiles and emit Skill Arena summary.json, merged-summary.json, report.md, and run manifests. Use when Codex needs to scaffold Harbor tasks and job configs, preflight Docker, Compose, task schemas, and agent credentials without model calls, run Harbor trials through Docker or a remote sandbox, normalize existing Harbor job artifacts, enforce fair profile comparisons, or reproduce benchmark reports from Harbor.
---

# Harbor Runner

Create fair Harbor profile jobs and turn their trial artifacts into the existing
Skill Arena report contract.

This skill is intentionally a repository-integrated orchestrator rather than an
atomic bundle. `skill-dependencies.json` declares the Skill Arena runtime
modules and `zod` package used by its normalization layer. Run it from a Skill
Arena source checkout with Node.js 24 or newer; `<repository-root>` below means
that checkout root.

## Workflow

1. Read the repository `AGENTS.md`, accepted ADRs, and current architecture
   before changing an established evaluation direction.
2. When creating or changing an evaluation, read
   `references/harbor-evaluation-contract.md` completely.
3. Create one Harbor job config per report profile. Keep the dataset, task,
   agents, models, attempts, environment, retry policy, and timeouts identical;
   vary only job identity and declared skills.
4. Put evaluator-only knowledge in `tests/` or verifier code. Keep it out of
   `instruction.md`, agent-visible files, and naturalistic prompts.
5. Diagnose the complete local execution path without launching an agent:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml \
  --doctor
```

The doctor validates job configs, local task schemas, Docker Engine, Docker
Compose, and selected agent credentials. It rejects expired Codex access tokens
before concurrent containers can race on a stale refresh token.

6. When Docker or credentials are intentionally unavailable, validate only the
   declarative execution plan:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml \
  --dry-run
```

7. Run from Linux or WSL when Docker is there. Export credentials in the
   process environment; never copy credentials into the evaluation or skill:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml
```

The runner validates every Harbor job config, checks Docker, gives each profile
a fresh shared run suffix, executes profiles sequentially, verifies result
artifacts, normalizes trials, and writes a run manifest.

## Existing Results

Normalize completed Harbor jobs without launching agents:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml \
  --skip-run \
  --profile-result no-skill=/path/to/no-skill-job \
  --profile-result skill=/path/to/skill-job \
  --output .tmp/harbor-normalized
```

Use `scripts/normalize-harbor-jobs.js` directly only when a caller needs the
lower-level conversion API or the legacy CLI shape.

## Required Invariants

- Use separate Harbor jobs for profiles whose skill lists differ.
- Require the same task checksum, attempt count, agent/model set, agent version,
  and non-skill job configuration across profiles.
- Declare `expectedSkills` for every report profile. Use `[]` for no-skill.
- Treat Harbor execution exceptions as errors, not ordinary verifier failures.
- Count input tokens as Harbor reports them; cached input is a subset and must
  not be added to the total again.
- Emit a token total only when both input and output counts are present.
- Measure agent execution time only. For multi-step tasks, sum complete step
  agent timings; do not substitute whole-trial wall time.
- Reject incomplete jobs, missing rewards, unknown agents/models, duplicate
  cells, task drift, skill drift, and agent-version drift.
- Never delete an existing Harbor job automatically. Use a new run id, or pass
  `--resume` only when intentional.
- Run `--doctor` after changing Docker, Compose, Harbor, task schemas, agent
  selection, models, concurrency, or credentials.

## Output Contract

For a live or normalize-only run, preserve:

```text
<output>/run.json
<output>/summary.json
<output>/merged/merged-summary.json
<output>/merged/report.md
```

Return the report path and the profile pass/error counts. Report infrastructure,
authentication, model-compatibility, and agent exceptions explicitly; do not
present synthetic fixtures as live evidence.

## Validation

After editing this skill or its scripts, run:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" <repository-root>/skills/harbor-runner
node --test test/harbor-runner.test.js test/harbor-report-parity-poc.test.js
node <repository-root>/scripts/run-rust-analyzer-hook.js
```

Use the project-wide tests, coverage, and documentation checks before declaring
a repository change complete.
