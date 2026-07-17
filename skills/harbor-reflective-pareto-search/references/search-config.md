# Harbor Reflective Pareto Search Config

Read this reference before authoring or changing a search run.

## Configuration

Paths resolve from the config directory. Candidate directories must be copied
skill bundles with the same frontmatter name as the baseline.

~~~yaml
schemaVersion: 1

search:
  id: example-pareto-search
  baselineSkill: ../../skills/example-skill
  baselineCandidate: baseline
  outputDir: ../../.tmp/harbor-pareto/example
  generation: 0

harbor:
  developmentJob: jobs/development.yaml
  holdoutJob: jobs/holdout.yaml
  rewardKey: reward
  passThreshold: 1
  requiredEnv:
    - OPENAI_API_KEY

candidates:
  - id: baseline
    skill: ../../skills/example-skill
    parents: []
    rationale: Frozen source baseline.
  - id: recovery-specialist
    skill: candidates/recovery-specialist
    parents:
      - baseline
    rationale: Repair repeated recovery failures found in Harbor verifier output.

promotion:
  minimumMeanGain: 0
  allowCaseRegressions: false
  requireNoErrors: true
~~~

For analysis of existing jobs, add jobDirectory to every development candidate.
For holdout analysis, add holdoutJobDirectory to the baseline and selected
candidate.

After development selection, add:

~~~yaml
search:
  selectedCandidate: recovery-specialist
  developmentArchive: ../../.tmp/harbor-pareto/example/development/generation-000/pareto-archive.json
~~~

## Harbor job requirements

The development and holdout YAML files are ordinary Harbor 0.18.0 JobConfig
documents. Each must:

- declare at least one agent
- declare local or registered tasks or datasets
- use a positive n_attempts value
- set retry.max_retries to 0
- keep agent, model, task, attempt, verifier, environment, and timeout settings
  fixed across candidates

Lock comparison treats `retry.exclude_exceptions` as an order-insensitive set,
matching Harbor's unique exception-filter semantics. Other arrays remain
order-sensitive because instruction, skill, or compose-file order can affect
execution.

The runner resolves local dataset and task paths relative to the job YAML. It
overrides only job_name, jobs_dir, quiet, and each agent skills list. Every
candidate therefore produces a normal Harbor job directory with config.json,
lock.json, result.json, and trial subdirectories.

## Case vectors and Pareto selection

A case is identified by:

~~~text
task_checksum | agent_name | model
~~~

The score is the mean selected reward across declared attempts. Candidate A
dominates candidate B only when A is no worse on every case and strictly better
on at least one. Exact vector ties prefer fewer execution errors, then fewer
SKILL.md lines, then lexical candidate id.

The archive includes the non-dominated representatives. Reflection targets the
weakest cases of each archive member and exposes only bounded development
evidence. Merge plans are emitted only when two archive members have distinct
case strengths.

For offline analysis, candidate-to-job mappings are factual assertions by the
operator. A job without lock skill digests can describe observed performance,
but cannot establish that the mapped local bundle caused it. Label such an
archive exploratory, do not promote from it, and prefer jobs executed by this
script. Empty bounded feedback is a valid reason to make no mutation even when
a case score is weak.

## Native artifacts

The analyzer validates:

- job config.json through Harbor JobConfig
- optional lock.json through Harbor JobLock
- root result.json through Harbor JobResult
- every direct trial result.json through Harbor TrialResult

Feedback paths are discovered rather than assumed:

- agent/**/trajectory.json
- agent/**/*.txt
- verifier/** regular files

Missing trajectory or text output is allowed when a verifier result or
exception still supplies grounded evidence. A missing configured reward without
an exception is invalid.

## Holdout gate

The holdout phase requires a selected development archive member and rejects
any task checksum observed during development. It compares baseline and
candidate on the same native Harbor holdout cases.

Promotion requires:

- overall mean gain at least minimumMeanGain
- no case regression unless allowCaseRegressions is true
- no candidate errors when requireNoErrors is true

The runner copies the selected bundle to holdout/candidate-skill but never
changes or installs the source skill.
