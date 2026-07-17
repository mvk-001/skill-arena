# Harbor Trace Distillation Contract

Read this reference before authoring or changing a run.

## Config

Paths resolve from the config directory. JSON is valid YAML.

~~~yaml
schemaVersion: 1
run:
  id: example-trace-distillation
  baselineSkill: ../../skills/example-skill
  outputDir: ../../.tmp/harbor-trace/example-run
harbor:
  rewardKey: reward
  passThreshold: 1
  requiredEnv: []
  requireDiscoveryLocks: false
discovery:
  artifacts:
    - jobs/discovery-one
  jobConfigs: []
proposals:
  path: proposals.json
  minimumUniqueTrials: 2
  minimumUniqueTasks: 2
holdout:
  baselineArtifacts:
    - jobs/holdout-baseline
  candidateArtifacts:
    - jobs/holdout-candidate
  baselineJobConfigs: []
  candidateJobConfigs: []
  allowWeakFairness: false
  minimumMeanGain: 0
  allowTaskRegressions: false
  requireNoErrors: true
~~~

`discovery.jobConfigs` and the holdout job-config lists are optional. In live
mode the script validates each file with Harbor `JobConfig`, assigns a fresh
job name and jobs directory below the run output, then executes it with
`await Job.create(config)` and `await job.run()`. Candidate holdout configs
replace the baseline skill path in each agent's skill list with the generated
candidate bundle. Keep secret values out of job YAML; list only required host
environment-variable names in `harbor.requiredEnv`.

`--analyze-only` never executes job configs and never opens any holdout path.
It requires at least one existing discovery artifact. It normalizes evidence
and evaluates proposals already present in `proposals.path`; it does not
generate diagnoses or patch content. An empty proposal set is a valid no-op.
Do not infer a patch from reward or error state alone when the bounded
trajectory, output, log, and verifier evidence does not establish a cause.
`--dry-run` and `--doctor` do not create the run output.

## Native artifacts

An imported path may be a completed job directory or one completed trial
directory. Harbor 0.18.0 job output normally contains `config.json`,
`lock.json`, `result.json`, `job.log`, and immediate child trial directories.
A trial normally contains `config.json`, `lock.json`, `result.json`,
`trial.log`, `agent/`, `verifier/`, and optionally `steps/` for a multi-step
task. ATIF trajectories are normally `agent/trajectory.json` or
`steps/<step>/agent/trajectory.json`; their presence depends on the agent.

The normalizer validates Harbor JSON with `JobConfig`, `JobLock`, `JobResult`,
`TrialConfig`, `TrialLock`, `TrialResult`, and `Trajectory`. It emits bounded
messages and tool names, the last agent message, bounded agent logs, and
verifier stdout/stderr. It never emits exception tracebacks, raw configs,
environment values, or ATIF reasoning content.

A locked target is selected by the exact digest of the declared local bundle.
Its lock source must occur exactly once in both `TrialConfig.agent.skills` and
`TrialLock.agent.skills`. Harbor may serialize the lock name as either the
bundle's frontmatter `name` or the basename of that exact source path. Any
other name is rejected. When the source directory is locally accessible, the
normalizer also rechecks its frontmatter name and content digest.

## Proposal schema

~~~json
{
  "proposals": [
    {
      "id": "require-output-verification",
      "diagnosis": "Two independent Harbor tasks passed only after output checks.",
      "evidenceIds": ["job-a:<trial-uuid>", "job-b:<trial-uuid>"],
      "conflictGroup": "finish-check",
      "target": "SKILL.md",
      "operation": "append",
      "content": "\n## Completion check\n\nVerify the requested artifact before finishing.\n"
    }
  ]
}
~~~

Supported operations are `append`, exact single `replace` using `old` and
`content`, and `create` for a new file. Allowed targets are `SKILL.md`,
`references/**`, `scripts/**`, and `agents/openai.yaml`. A proposal is accepted
only when all evidence IDs exist in discovery and its unique-trial and
unique-task-checksum support meet both configured thresholds. Both thresholds
must be at least 2; this prevents repeated attempts on one task from being
presented as transferable evidence. At most one proposal survives each
conflict group; ties resolve by proposal ID.

## Outputs and holdout

~~~text
<output>/
├── candidate-skill/
├── harbor-jobs/
├── trace-pool.json
├── proposal-state.json
├── consolidation.json
├── holdout-gate.json
├── run.json
└── report.md
~~~

The discovery pool contains normalized feedback. Holdout normalization is
metric-only and is written separately after candidate materialization. A fair
holdout requires identical task-checksum/agent/version/model attempt cells and
matching trial locks after removing only the target skill's provenance. Harbor
0.18.0 trial locks do not cover trial-level `artifacts`, so those configured
artifact lists are compared separately. Without locks, live promotion is
rejected unless `allowWeakFairness` is explicit; the gate then states that it
used observed trial fields and config parity only.
