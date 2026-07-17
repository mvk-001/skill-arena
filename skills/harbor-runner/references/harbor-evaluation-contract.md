# Harbor Evaluation Contract

Read this reference when creating or changing Harbor evaluations for Skill
Arena reports.

## Required Layout

```text
evaluations/<evaluation>/
├── report-config-live.yaml
├── jobs/
│   ├── no-skill.yaml
│   └── skill.yaml
├── dataset/
│   └── <task>/
│       ├── instruction.md
│       ├── task.toml
│       ├── environment/Dockerfile
│       ├── tests/test.sh
│       └── solution/solve.sh
└── skills/
    └── <skill>/SKILL.md
```

Use `evaluations/harbor-report-parity-poc/` as the executable reference. Keep
evaluation-specific files with the evaluation; keep reusable execution and
normalization logic in `<repository-root>/skills/harbor-runner/scripts/`.

## Harbor Task

Harbor 0.18.0 task names require `org/name` form:

```toml
schema_version = "1.3"

[task]
name = "example-org/example-task"
description = "Observable task description."
authors = [{ name = "Skill Arena" }]
keywords = ["skills", "evaluation"]

[agent]
timeout_sec = 180.0
user = "agent"

[verifier]
timeout_sec = 30.0

[environment]
network_mode = "public"
```

The image must create the configured agent user and make the task workspace
writable. The verifier must always write a numeric reward to
`/logs/verifier/reward.txt`. Put canonical answers and hidden markers only in
the verifier or solution, never in the instruction.

## Harbor Jobs

Create one job per profile. Resolve relative paths from the repository root.
The runner appends a unique run id through Harbor's `--job-name` override.

Baseline:

```yaml
job_name: example-no-skill
jobs_dir: .tmp/harbor-jobs
n_attempts: 2
n_concurrent_trials: 2
retry:
  max_retries: 0
environment:
  type: docker
  force_build: true
  delete: true
agents:
  - name: codex
    model_name: openai/<supported-model>
datasets:
  - path: evaluations/<evaluation>/dataset
```

Skill profile:

```yaml
job_name: example-skill
jobs_dir: .tmp/harbor-jobs
n_attempts: 2
n_concurrent_trials: 2
retry:
  max_retries: 0
environment:
  type: docker
  force_build: true
  delete: true
agents:
  - name: codex
    model_name: openai/<supported-model>
    skills:
      - evaluations/<evaluation>/skills/<skill>
datasets:
  - path: evaluations/<evaluation>/dataset
```

Use a model currently supported by the selected agent authentication mode.
Match `model_name` exactly in the report config. Pin an agent version when the
Harbor adapter supports it; the normalizer still rejects version drift found in
trial results.

## Report Config

The report config maps Harbor task, agent/model, and profile identities onto
Skill Arena rows and columns:

```yaml
schemaVersion: 1
benchmark:
  id: example-harbor-evaluation
  description: Compare one skill profile against its baseline.
evaluation:
  requests: 2
  rewardKey: reward
  passThreshold: 1
task:
  prompts:
    - id: example-task
      harborTaskName: example-org/example-task
      description: User-facing report row description.
      prompt: The exact agent-visible task prompt.
comparison:
  variants:
    - id: codex-current
      displayName: Codex / Current model
      agent: codex
      model: openai/<supported-model>
  profiles:
    - id: no-skill
      displayName: no-skill
      description: Harbor job without skills.
      skillMode: disabled
      skillSource: none
      expectedSkills: []
      jobDirectory: /path/to/completed/no-skill-job
    - id: skill
      displayName: skill
      description: Harbor job with only the evaluated skill.
      skillMode: enabled
      skillSource: workspace-overlay
      expectedSkills:
        - <skill>
      jobDirectory: /path/to/completed/skill-job
```

`evaluation.requests` must equal Harbor `n_attempts`. `harborTaskName` must
equal `TrialResult.task_name`, including the organization prefix. Agent names
and models must match Harbor's serialized trial config.

## Authentication And Runtime

- Prefer Docker on Linux or WSL2 when the host agent normally runs on Windows.
- Verify `docker info` and `docker compose version` before live work.
- Use `uvx --from harbor==<pinned-version>` to isolate Harbor.
- For Codex subscription authentication, set `CODEX_AUTH_JSON_PATH` to the
  current host `auth.json`. Do not check it in, print it, or place it in a task.
- Refresh host authentication before concurrent trials if the access token is
  stale. Isolated containers cannot safely share a one-use stale refresh token.
- A Harbor command may exit zero even when trials contain agent exceptions.
  Judge completion from trial artifacts and the normalized error counts.

Run the doctor before every new environment or credential context:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml \
  --doctor
```

The doctor performs no model calls. It validates Harbor job models, Harbor task
models, Docker Engine, Docker Compose, and selected credentials. For Codex
subscription auth it decodes only the JWT expiry claim and never prints or
stores the token. Refresh host Codex authentication when the doctor reports an
expired or near-expiry access token.

## Repeated Runs

Let the runner generate a new timestamp run id, or supply a stable unique id:

```bash
node <repository-root>/skills/harbor-runner/scripts/run-harbor-evaluation.js \
  evaluations/<evaluation>/report-config-live.yaml \
  --run-id experiment-20260713-01 \
  --output .tmp/harbor-runs/experiment-20260713-01
```

Do not delete old jobs to obtain a fresh run. Keep them as evidence and use a
new run id. Use `--resume` only for an intentionally interrupted job whose
saved config matches the current plan.
