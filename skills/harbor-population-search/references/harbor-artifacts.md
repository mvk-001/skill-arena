# Native Harbor Artifact Contract

Use a completed Harbor job directory as the evidence boundary.

At the study level, development jobs are the optimizer-visible evolution
dataset and the configured holdout job is the mandatory independent validation
dataset when it is the first unseen cohort. Declare and freeze both before the
first generation, but do not execute or inspect validation artifacts until one
development winner and its bundle digest are fixed. A study may reserve a
further holdout after that gate. Validation is one-way: its result cannot feed
another generation, ranking, repair-parent choice, or candidate mutation in the
same study. A later unbiased gate requires fresh validation.

## Required job files

- config.json: validate as Harbor JobConfig. Candidate jobs may differ only in
  job identity, output directory, and agent skill paths.
- result.json: require finished_at, a positive n_total_trials, all trials
  completed, and zero running, pending, or cancelled trials.

If job-level lock.json exists, require a positive schema_version, a trials
array, and the same trial count as result.json. Each locked trial must contain
task and agent metadata. When skill records are present, require exactly one
skill with a lowercase SHA-256 digest, source, and installed name.

## Trial directories

Each terminal trial directory must contain result.json. Read:

- id, trial_name, task_name, and task_checksum;
- config and agent_info, including agent/model identity;
- verifier_result.rewards[rewardKey];
- every verifier_result.rewards key named by a required-reward threshold;
- exception_info;
- agent_result token and cost fields;
- execution timestamps when present.

If a trial config.json or lock.json exists, parse it and require task plus agent
metadata. Treat exception_info as an execution error. When an errored trial has
no reward, record reward zero; a non-errored trial with no numeric selected
reward is invalid.

Every root and trial JobConfig must install one identical local skill source.
Every available job/trial lock source must match that configured source, and
all lock name/digest records must agree. The locked digest must equal the
supplied candidate bundle digest. NaN and infinity are invalid primary or
required rewards.

## Feedback discovery

Record paths rather than assuming adapter-specific content:

- agent/trajectory.json;
- every other file under agent/;
- every file under verifier/;
- artifacts/manifest.json;
- trial.log.

Verifier filenames differ between agents and tasks, so enumerate the directory
instead of hardcoding test-stdout.txt.

If a verifier provides `diagnostics.json`, read the optional `status`,
`failure_domain`, `terminal_outcome`, and `error_code` fields. Normalize case
and punctuation and classify all four signals. Provider, authentication,
environment, evaluator, and general infrastructure aliases are not evaluated
semantic zeros. This includes verifier/evaluation errors, invalid or missing
credentials, container/Docker failures, platform failures, quotas, rate
limits, unavailable models/services, and context limits. Preserve the observed
reward for diagnosis, count the trial as non-evaluable, and leave candidate
fitness null.

External classification has precedence. If a provider failure has no reward,
retain the provider domain and do not also classify it as a missing-primary
evaluator failure. Mark `missingPrimaryReward` only when a non-errored trial
has neither an external diagnostic nor a finite primary reward.

## Comparability

All population members are versions of one logical skill and must retain the
same SKILL.md frontmatter name. The baseline is the original skill version,
not a no-skill control. For offline analysis, the operator is responsible for
mapping each completed job to the exact candidate it evaluated. The analyzer
verifies that mapping by digest. A digest-matching legacy installed alias or
incomplete legacy lock is labeled exploratory and is never promotion evidence;
a digest mismatch fails closed.

The shared frontmatter name must be a portable basename containing 1-64
lowercase letters, digits, or interior hyphens and must not be a reserved device
name. Do not slug, truncate, or replace it: failing closed preserves logical
identity. Development candidates are copied to isolated
`candidates/<id>/skills/<name>/` directories, and holdout roles to
`holdout/<role>/skills/<name>/`. Native JobConfigs must install those exact
paths so Harbor observes the logical name as the source basename while each
candidate remains isolated. Reject broken, escaping, and directory symlinks,
including Windows junction/reparse directories.
Dereference a safe in-bundle file symlink into a regular staged file so the
frozen candidate has no runtime dependency on its source bundle.

Development candidates must have the same multiset of:

- task_name;
- task_checksum;
- agent name;
- model name;
- attempt count.

Holdout baseline and winner must match each other on the same signature. Their
task name/checksum pairs must be disjoint from every development trial.

## Fitness and promotion

Fitness is mean selected reward when every trial is error-free and satisfies
every configured required-reward threshold. Any execution error, missing
required reward, or below-threshold required reward makes the candidate
unqualified and sets fitness to zero while preserving mean reward and pass rate
for diagnosis. Missing required rewards remain null and are counted separately
from numeric zeros. Infrastructure failures instead make fitness and evaluable
mean unavailable. Sort unavailable candidates below numeric fitness, then break
ties lexicographically by candidate id.

The primary reward may also be absent. Preserve that absence as
`reportedReward: null`, count it under `missingPrimaryRewards`, and make the
candidate or holdout comparison non-evaluable. Do not substitute zero merely
to keep arithmetic running; parse diagnostics before reward normalization so
provider, authentication, or environment failures remain explicit.

Winner eligibility is stricter than survivor eligibility. After fitness
ranking, a candidate may become the selected winner only when it is evaluable,
passes every qualification gate, and its primary selected-reward pass rate is
at least `minimumDevelopmentPassRate`. The threshold is in 0..1 and defaults to
zero for compatibility. A below-threshold candidate remains available as an
evaluable survivor or repair parent, but it cannot enter holdout. When no row is
eligible, preserve `winnerIneligibilityReasons` per candidate and mark holdout
`not-eligible` rather than assigning a zero-reward winner.

The selected winner must also remain in the survivor/parent set. If a
zero-fitness deterministic tie placed two unqualified candidates before the
only qualified winner, replace the lower survivor with that winner before
writing the next-generation parent list.

When repair is required, choose up to two parents by greedy coverage of
`passedRequiredRewards`: prefer a candidate that adds a gate it met on every
development trial, then total gates met, pass rate, observed mean reward, and
candidate id. A partially qualified repair parent remains barred from holdout
and promotion.

Holdout never affects development ranking. Promote only when both holdout jobs
are complete and error-free, provenance is verified, all required reward keys
are present, the winner qualifies on development and holdout, winner mean
reward minus baseline mean reward meets the configured minimum gain, and no
matched task signature regresses. Compare the mean over attempts for each
task-name/checksum/agent/model signature. Record all comparisons and blockers.
Task regressions are forbidden by default and require an explicit opt-in to
tolerate.

Content equality is a separate non-compensating promotion gate. If the selected
candidate's canonical bundle digest equals the preserved baseline digest,
record status `baseline-retained` and blocker `no-skill-change`; do not open
holdout and never call the no-op bundle promoted, even when minimum gain is
zero or the candidate id differs from the baseline id.

## Cross-generation contract

For multiple development generations, freeze the independent validation
commitment in the study protocol before generation zero and omit the holdout
template flag during intermediate invocations. Supply it for the final
selection only: a supplied template releases holdout automatically for a
qualified, content-changing winner. The CLI's holdout contract starts when the
template is first supplied, so it does not replace the organizer's earlier
dataset lock or protocol commitment.

`search-contract.json` freezes the logical name, baseline content digest,
normalized development JobConfig fingerprint, reward key, pass threshold,
required rewards, minimum development pass rate, minimum holdout gain, and
task-regression policy. Reject any later generation in the same output tree
that changes one of those fields. `development-signatures.json` freezes the
observed task-name/checksum/agent/model/attempt multiset. `holdout-contract.json`
binds the first provided holdout JobConfig fingerprint, and
`holdout-signatures.json` freezes the first completed release signature; reject
later development or release drift even when a local config path stayed the
same.

Materialize each holdout invocation under
`holdout/generation-NNN/attempt-NNN/`. Create `attempt.json` exactly once before
execution and seal the generation, baseline digest, winner id/digest, config
fingerprints, reward thresholds, and promotion policy. Create `result.json`
exactly once after staging or analysis. Never reuse role paths across attempts:
this preserves failed evidence. An executed, imported, or unfinished attempt
terminates further search invocations in that output tree. Only an artifact-only
staged attempt can be completed, using analyze-only with the same generation,
baseline, full candidate digest/job mapping, and unchanged development results.
All attempts are checked for consumption before staged-completion checks.

This runner does not authorize retries. Proven external recovery belongs to
the selective recovery workflow, with the frozen candidate, immutable cap, and
first-evaluable semantics; do not rerun this search to select again or finalize
such recovery. Native reporting can inspect the resulting evidence. Creating
a new directory does not establish fresh independent validation.
