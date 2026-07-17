# Native Harbor Artifact Contract

Use a completed Harbor job directory as the evidence boundary.

## Required job files

- config.json: validate as Harbor JobConfig. Candidate jobs may differ only in
  job identity, output directory, and agent skill paths.
- result.json: require finished_at, a positive n_total_trials, all trials
  completed, and zero running, pending, or cancelled trials.

If job-level lock.json exists, require a positive schema_version, a trials
array, and the same trial count as result.json. Each locked trial must contain
task and agent metadata.

## Trial directories

Each terminal trial directory must contain result.json. Read:

- id, trial_name, task_name, and task_checksum;
- config and agent_info, including agent/model identity;
- verifier_result.rewards[rewardKey];
- exception_info;
- agent_result token and cost fields;
- execution timestamps when present.

If a trial config.json or lock.json exists, parse it and require task plus agent
metadata. Treat exception_info as an execution error. When an errored trial has
no reward, record reward zero; a non-errored trial with no numeric selected
reward is invalid.

## Feedback discovery

Record paths rather than assuming adapter-specific content:

- agent/trajectory.json;
- every other file under agent/;
- every file under verifier/;
- artifacts/manifest.json;
- trial.log.

Verifier filenames differ between agents and tasks, so enumerate the directory
instead of hardcoding test-stdout.txt.

## Comparability

All population members are versions of one logical skill and must retain the
same SKILL.md frontmatter name. The baseline is the original skill version,
not a no-skill control. For offline analysis, the operator is responsible for
mapping each completed job to the exact candidate it evaluated. When lock
skill digests are absent, label the result exploratory and do not attribute a
performance difference to the supplied candidate directory.

Development candidates must have the same multiset of:

- task_name;
- task_checksum;
- agent name;
- model name;
- attempt count.

Holdout baseline and winner must match each other on the same signature. Their
task name/checksum pairs must be disjoint from every development trial.

## Fitness and promotion

Fitness is mean selected reward when every trial is error-free. Any execution
error sets candidate fitness to zero while preserving mean reward and pass rate
for diagnosis. Break fitness ties lexicographically by candidate id.

Holdout never affects development ranking. Promote only when both holdout jobs
are complete and error-free and winner mean reward minus baseline mean reward
meets the configured minimum gain.
