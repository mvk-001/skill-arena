# Harbor Trace Distillation Contract

Read this reference before authoring or changing a run.

## Config

Paths resolve from the config directory. JSON is valid YAML.

~~~yaml
schemaVersion: 2
run:
  id: example-trace-distillation
  baselineSkill: ../../skills/example-skill
  outputDir: ../../.tmp/harbor-trace/example-run
harbor:
  rewardKey: reward
  passThreshold: 1
  requiredRewards:
    mechanical_qualification_gate: 1
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
development:
  candidateArtifacts:
    - jobs/development-candidate
  candidateJobConfigs: []
  minimumPassRate: 1
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

Config schema 1 remains accepted without behavioral changes, but it cannot
contain `development`; it is the legacy direct discovery-to-holdout workflow.
Config schema 2 requires at least one candidate-development artifact or
JobConfig and an explicit finite `minimumPassRate` in 0..1. An older runner
rejects schema 2 instead of silently ignoring the gate.

At the study level, discovery plus candidate development are the
optimizer-visible evolution dataset. The `holdout` block is the mandatory
independent validation dataset when it is the first unseen cohort; a study may
reserve a further holdout afterward. Declare and freeze both datasets before
evolution starts, while keeping validation paths and artifacts unopened until
the materialized candidate digest is fixed and the candidate-development gate
passes. Candidate development replays evolution cases, so it is not
independent validation.

The validation result is terminal for this run. It must not enter the trace
pool, proposal state, consolidation, or another candidate-development pass. A
new unbiased attempt requires a new study and fresh validation data.

`discovery.jobConfigs` and all later job-config lists are optional when their
phase has completed artifacts. In live mode the script validates each file
with Harbor `JobConfig`, assigns a fresh job name and jobs directory below the
run output, then executes it with `await Job.create(config)` and
`await job.run()`. Before any live execution it copies the source baseline to
`<output>/baseline/skills/<frontmatter-name>`. Candidate-development and
candidate-holdout configs use the generated
`<output>/candidate/skills/<frontmatter-name>` bundle. The same native JobConfig
may be listed for baseline discovery and candidate development; only the staged
target skill changes. Both physical basenames therefore equal the skill's
logical name. Keep secret values out of job YAML; list only required host
environment-variable names in `harbor.requiredEnv`.

`harbor.requiredRewards` is an optional mapping from verifier reward keys to
finite numeric minimums. These metrics are non-compensating qualification
gates: every imported trial preserves the observed value (or null when absent)
and records `missing` separately from `below-threshold`. A trial with an error
or any required-reward failure is unqualified. An empty mapping preserves the
single-reward workflow and requires no additional verifier metrics.
`harbor.passThreshold` and `holdout.minimumMeanGain` must also be finite, as
must every imported primary reward. NaN and infinity are rejected rather than
entering comparisons or JSON output.

Every skill bundle must be self-contained. A bundle root that is itself a
symbolic link, Windows junction, or other reparse point is rejected before its
resolved target is inspected; nested links are rejected too. Proposal targets
are resolved again against the staged candidate root before any write.

`--analyze-only` never executes job configs and never opens any
candidate-development or holdout path. It requires at least one existing
discovery artifact. It normalizes evidence and evaluates proposals already
present in `proposals.path`; it does not generate diagnoses or patch content.
An empty proposal set is a valid no-op. Do not infer a patch from reward or
error state alone when the bounded trajectory, output, log, and verifier
evidence does not establish a cause. `--dry-run` and `--doctor` do not create
the run output. Under schema 2, doctor validates only discovery and
candidate-development JobConfigs; holdout JobConfigs remain deferred until the
development gate passes.

## Native artifacts

An imported path may be a completed job directory or one completed trial
directory. Harbor 0.18.0 job output normally contains `config.json`,
`lock.json`, `result.json`, `job.log`, and immediate child trial directories.
A trial normally contains `config.json`, `lock.json`, `result.json`,
`trial.log`, `agent/`, `verifier/`, and optionally `steps/` for a multi-step
task. ATIF trajectories are normally `agent/trajectory.json` or
`steps/<step>/agent/trajectory.json`; their presence depends on the agent.

A verifier may optionally write `verifier/diagnostics.json` at trial or step
scope. The normalizer extracts only bounded `status`, `failure_domain`,
`terminal_outcome`, and `error_code` signals. The file is not required. A
provider or infrastructure classification makes the trial non-evaluable even
when Harbor completed it with reward zero or emitted no primary reward:
`reportedReward` preserves a raw numeric value when present, while semantic
`reward` is null and `evaluationFailure` records the classification. Diagnostic
classification runs first, so an absent reward does not overwrite a provider
or infrastructure cause. Other reward-zero trials remain ordinary verifier
failures. A completed, non-error trial with neither an external diagnostic nor
a finite configured primary reward becomes a non-evaluable
`missing-primary-reward` evaluator failure; it is never converted to zero.
All classified trial- and step-scoped diagnostics are aggregated. Context
budget actionability is conservative: it is granted only when every classified
diagnostic for the trial is a provider context-limit signal. A simultaneous
authentication, environment, evaluator, infrastructure, quota, or other
external failure makes the evidence non-actionable.

Every normalized trial exposes `evidenceClass`, `actionability`, and
`evidenceEligible`. `provider-context-limit` and
`context_length_exceeded` classify as actionable
`operational-context-budget` evidence for the exact proposal domain
`execution-efficiency/context-budget`. Quota, rate-limit, authentication,
environment, and unclassified provider/infrastructure failures remain external,
non-actionable, and ineligible. Actionability changes patch eligibility only;
it never restores a semantic reward or makes holdout scoring evaluable.

The normalizer validates Harbor JSON with `JobConfig`, `JobLock`, `JobResult`,
`TrialConfig`, `TrialLock`, `TrialResult`, and `Trajectory`. It emits bounded
messages and tool names, the last agent message, bounded agent logs, and
verifier stdout/stderr. It never emits exception tracebacks, raw configs,
environment values, or ATIF reasoning content.

A locked target is selected by the exact digest of the declared local bundle.
Its lock source must occur exactly once in both `TrialConfig.agent.skills` and
`TrialLock.agent.skills`. In live discovery and all holdouts, both the locked
name and exact source basename must equal the bundle's portable frontmatter
`name`; a matching digest cannot excuse a physical alias. Analyze-only accepts
the former basename-alias shape solely to inspect legacy discovery evidence and
sets `skillIdentity.legacyAliasAccepted: true` and
`promotionEligible: false` in the trace pool and consolidation. That
compatibility path cannot reach promotion. When the source directory is locally
accessible, the normalizer also rechecks its frontmatter name and content
digest.
Unlocked discovery artifacts remain available for analyze-only diagnosis when
`requireDiscoveryLocks` is false, but `unverifiedLockTrials` makes the complete
development pool non-promotable. Holdout weak-fairness opt-in does not override
this discovery provenance gate.

## Proposal schema

~~~json
{
  "proposals": [
    {
      "id": "bound-context-budget",
      "diagnosis": "Two independent Harbor tasks exhausted the provider context budget.",
      "domain": "execution-efficiency/context-budget",
      "evidenceIds": ["job-a:<trial-uuid>", "job-b:<trial-uuid>"],
      "conflictGroup": "context-budget",
      "target": "SKILL.md",
      "operation": "append",
      "content": "\n## Context budget\n\nBound retrieval and intermediate output.\n"
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

`domain` remains optional for ordinary evaluable discovery evidence. It is
mandatory and must equal `execution-efficiency/context-budget` when any cited
trial is actionable context-budget evidence. The usual minimum unique-trial and
unique-task thresholds still apply. Such evidence supports only operational
changes that reduce context use; it cannot substantiate semantic-quality claims.
Any cited non-actionable external evidence rejects the proposal.

## Candidate development gate

Schema 2 freezes the materialized candidate digest before importing or
executing candidate development. Candidate development must contain the same
sorted multiset of task-name/checksum/agent/version/model cells, attempts,
canonical TrialConfigs, configured artifact signatures, and TrialLocks as
baseline discovery. The target skill is removed from TrialConfig and TrialLock
signatures for this comparison, but each discovery trial must lock the exact
baseline digest and each candidate trial must lock the exact frozen candidate
digest. Missing locks, physical skill aliases, weak fairness, or any replay
drift are contract errors.

Matching replay inputs does not permit reusing replay outputs. Candidate
development must use a different whole job and genuinely new attempts. Job
directories and result IDs, evidence IDs, trial UUIDs/names/URIs, artifact and
result/lock paths, and raw result digests must be disjoint from discovery. A
label-independent attempt fingerprint removes mutable job/trial labels and
target-skill provenance while retaining timestamps, outcomes, usage, and agent
evidence; any overlap rejects copied artifacts even when directories, UUIDs,
and labels were changed. This independence check runs before holdout is opened.

Schema 2 fixes Harbor built-in retries at zero for every discovery,
candidate-development, baseline-holdout, and candidate-holdout JobConfig.
Imported inputs must be whole job artifacts: the root JobLock must explicitly
record all six retry fields, its canonical retry policy must equal the root
JobConfig policy, `JobResult.stats.n_retries` must be zero, and retry-policy
digest multisets must match within both development and holdout pairs. Missing
retry fields, a lone trial artifact, or any policy/count drift fails closed.
Holdout JobConfigs and artifacts remain deferred—including retry validation—
until candidate development passes.

Candidate-development normalization sets `include_feedback: false` and never
adds its records to `trace-pool.json` or `proposal-state.json`. It therefore
validates the already-materialized child without becoming a second mutation
opportunity. `development-gate.json` reports only bounded metrics, diagnostics,
usage, paths to native artifacts, and canonical skill identity.

The gate passes only when every candidate trial is evaluable and qualified,
there are no errors, every required reward is present and meets its threshold,
and the primary-reward pass rate meets `development.minimumPassRate`. If any
trial has a provider/infrastructure diagnostic or a missing primary reward, the
aggregate candidate pass rate is null and the decision is `not-evaluable`.
Required-gate failures always produce decision `fail`. An ordinary primary
reward below the pass threshold reduces the aggregate pass rate and produces
`fail` only when that rate falls below `development.minimumPassRate`.
Neither outcome opens holdout.

~~~json
{
  "schemaVersion": 1,
  "source": "harbor",
  "phase": "development",
  "status": "complete",
  "decision": "pass",
  "passed": true,
  "evaluable": true,
  "fairnessBasis": "trial-lock-and-result",
  "attemptIndependenceVerified": true,
  "attemptIndependenceSignature": "sha256:...",
  "discoveryReplaySignature": "sha256:...",
  "candidateReplaySignature": "sha256:...",
  "candidateDigest": "sha256:...",
  "uniqueTrials": 24,
  "uniqueTasks": 24,
  "passedTrials": 24,
  "candidatePassRate": 1.0,
  "minimumPassRate": 1.0,
  "passRateEligible": true,
  "candidateErrors": 0,
  "candidateQualified": true,
  "requiredRewardsComplete": true,
  "provenanceVerified": true,
  "qualification": {},
  "blockers": [],
  "candidateEvidence": []
}
~~~

The schema-2 live command receipt exposes the frozen candidate digest,
development decision and gate path, and both replay signatures so an
orchestrator can bind subsequent stages without reparsing the full run.

## Outputs and holdout

~~~text
<output>/
├── baseline/
│   └── skills/
│       └── <frontmatter-name>/
├── candidate/
│   └── skills/
│       └── <frontmatter-name>/
├── harbor-jobs/
├── trace-pool.json
├── proposal-state.json
├── consolidation.json
├── development-gate.json       # schema 2 only
├── holdout-gate.json
├── run.json
└── report.md
~~~

The discovery pool contains normalized feedback. Candidate-development and
holdout normalization are metric-only and are written separately after
candidate materialization. A fair holdout requires identical
task-checksum/agent/version/model attempt cells and matching trial locks after
removing only the target skill's provenance. Harbor 0.18.0 trial locks do not
cover trial-level `artifacts`, so those configured artifact lists are compared
separately. Without locks, live holdout promotion is rejected unless
`allowWeakFairness` is explicit; candidate development never permits that
opt-in.
Lock, TrialConfig, and artifact signatures are compared as sorted multisets.
Duplicate attempts therefore remain observable: distributions such as
`A,A,B` and `A,B,B` are different even though their distinct members match.

After candidate development passes, the runner opens holdout and rejects any
holdout overlap with either baseline discovery or candidate development by task
name or task checksum. It requires the same set of agent, agent-version, and
model identities across all phases. These checks prevent a changed benchmark
or execution profile from being mistaken for skill improvement.

For schema 2, holdout then applies the same whole-job retry contract used by
development. Both sides must have complete root retry locks, JobConfig/JobLock
parity, zero `JobResult.stats.n_retries`, and equal retry-policy digest
multisets. `allowWeakFairness` cannot bypass this schema-2 retry requirement.

Holdout promotion additionally requires every candidate trial to qualify and
every required reward key to be present on both baseline and candidate trials.
The gate reports aggregate missing, below-threshold, and errored trial counts,
and includes per-trial required values and failure reasons without converting a
missing metric to zero.

Any missing configured primary reward or provider-/infrastructure-classified
diagnostic makes the complete holdout comparison `not-evaluable` and prevents
promotion. The affected side's mean reward and the aggregate gain are null; an
unaffected side may retain its numeric mean. The gate reports
`primaryRewardMissing` per trial and aggregate `missingPrimaryRewardTrials`.
External diagnostic classification is separate from Harbor `exception_info`,
which remains an execution error under the ordinary error policy.
