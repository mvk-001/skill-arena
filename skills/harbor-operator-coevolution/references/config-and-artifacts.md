# Configuration And Harbor Artifacts

Use one YAML document per frozen generation. Relative paths resolve from the
generation file. Development entries are native Harbor jobs; the config never
contains candidate scores.

~~~yaml
schemaVersion: 1
evolution:
  id: example-operator-search
  generationId: generation-001
  outputDir: runs/generation-001
  baselineCandidateId: baseline

harbor:
  rewardKey: reward
  passThreshold: 1
  requireNoErrors: true
  requiredEnv: [OPENAI_API_KEY]
  diagnosticChars: 3000

coevolution:
  candidateSurvivors: 2
  operatorSurvivors: 2
  nextOperatorCount: 6
  minimumOperatorTrials: 2

operators:
  - operatorId: tighten-contract
    instruction: Tighten observable output requirements without adding task facts.
    parentOperatorIds: []
    origin: seed
  - operatorId: simplify-flow
    instruction: Remove ambiguity and simplify the core workflow.
    parentOperatorIds: []
    origin: seed

candidates:
  - candidateId: baseline
    skill: skills/baseline
    jobConfig: jobs/baseline.yaml
  - candidateId: child-a
    skill: runs/candidates/child-a
    parentCandidateId: baseline
    operatorId: tighten-contract
    jobConfig: jobs/child-a.yaml

holdout:
  baseline:
    candidateId: baseline
    jobConfig: jobs/holdout-baseline.yaml
  candidate:
    candidateId: child-a
    jobConfig: jobs/holdout-child-a.yaml
  minimumMeanGain: 0
  allowTaskRegressions: false
  requireNoErrors: true
~~~

For `--analyze-only`, replace each `jobConfig` with `jobDirectory`. A live run
loads each native config with Harbor `JobConfig`, resolves its local paths, and
executes it with `Job.create(...).run()`. It refuses an existing job directory.

A generation requires at least two candidates, at least two operators, and at
least one generated child. All candidate SKILL.md files must retain the
baseline frontmatter name. `operatorSurvivors` must be at least 2, and
`nextOperatorCount` must be at least `operatorSurvivors`. Analyze-only requires
a completed `jobDirectory` for every development candidate and for both
holdout sides.

`--dry-run` validates the generation schema, every native JobConfig, candidate
paths and digests, and coevolution constraints; it does not establish that a
local dataset contains runnable tasks. `--doctor` additionally checks declared
credentials and Docker availability. Actual dataset/task resolution remains a
Harbor execution concern.

Every job must contain exactly one agent and one local skill, and each
candidate must have its own job. Root candidates omit both `parentCandidateId`
and `operatorId`; generated children provide both. The holdout candidate must
equal the top development candidate or analysis stops before promotion.

## Native artifact contract

The analyzer reads and validates:

~~~text
<job>/config.json
<job>/lock.json
<job>/result.json
<job>/<trial>/result.json
<job>/<trial>/agent/trajectory.json        # optional diagnostic evidence
<job>/<trial>/agent/*.txt                  # optional diagnostic evidence
<job>/<trial>/verifier/test-output.txt     # optional diagnostic evidence
<job>/<trial>/verifier/test-stdout.txt     # optional diagnostic evidence
<job>/<trial>/verifier/test-stderr.txt     # optional diagnostic evidence
~~~

Harbor's 0.18.0 Pydantic models validate config, lock, job, and trial objects.
The job must be finished with all planned trials present and settled. Every
non-exception trial must contain the selected numeric reward in `0..1`.

Candidate fitness is the mean of per-task mean rewards. When the no-error hard
gate fails, effective fitness is zero. Operator credit is the child's effective
fitness minus its parent's effective fitness. Candidate ranking uses effective
fitness first; operator ranking uses mean improvement, success rate, best
improvement, trial count, then operator id.

Job locks must match after removing only volatile creation time and candidate
skill provenance. The digest and source path must match the declared local
bundle exactly in the job config, trial result, trial-lock agent, and locked
skill entry. Harbor may serialize the locked name as either the bundle's
frontmatter `name` or that source path's basename; any other name is rejected.
Retry include/exclude exception filters are canonicalized as order-insensitive
sets; other arrays retain their order because it can be execution-significant.
`generation-evidence.json` preserves the logical frontmatter name as
`skillName` and reports Harbor's serialized `lockedSkillName` and the verified
`skillSource` separately.
Holdout locks are compared only with each other; holdout task names and
checksums must not overlap development.

The separate promotion gate compares the unchanged baseline and selected
candidate on holdout. It checks mean gain, task regressions, and candidate
errors. Changing holdout rewards can change promotion but cannot change any
development ranking or breeding artifact.
