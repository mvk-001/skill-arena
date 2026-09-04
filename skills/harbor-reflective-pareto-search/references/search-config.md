# Harbor Reflective Pareto Search Config

Read this reference before authoring or changing a search run.

## Configuration

Paths resolve from the config directory. Candidate directories must be copied
skill bundles with the same frontmatter name as the baseline. That name must be
an exact portable basename: 1-64 lowercase letters, digits, or interior
hyphens, excluding Windows reserved device names. The runner never invents a
fallback name because doing so would change the skill identity Harbor installs.

~~~yaml
schemaVersion: 1

search:
  id: example-pareto-search
  baselineSkill: ../../skills/example-skill
  baselineCandidate: baseline
  outputDir: ../../.tmp/harbor-pareto/example
  generation: 0
  # Required after generation zero:
  # previousGenerationLog: ../../.tmp/harbor-pareto/example/development/generation-000/pareto-archive.json

harbor:
  developmentJob: jobs/development.yaml
  holdoutJob: jobs/holdout.yaml
  rewardKey: reward
  passThreshold: 1
  requiredRewards:
    mechanical_qualification_gate: 1
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

At the study level, `developmentJob` is the evolution dataset and `holdoutJob`
is the mandatory independent validation dataset for this bundle. Declare and
freeze both before generation zero, but do not resolve or inspect validation
artifacts during reflection. The selected archive member and skill digest must
be fixed before the holdout phase opens that dataset. A study may add a further
post-validation holdout outside this bundle.

The validation result is terminal for the current search: do not use it to
author another child, change the Pareto archive, or reselect a winner. Another
unbiased gate requires fresh validation in a new study.

For analysis of existing jobs, add jobDirectory to every development candidate.
For holdout analysis, add holdoutJobDirectory to the baseline and selected
candidate.

After development selection, add:

~~~yaml
search:
  selectedCandidate: recovery-specialist
  developmentArchive: ../../.tmp/harbor-pareto/example/development/generation-000/pareto-archive.json
~~~

Do not change `search.id`, `search.generation`, either Harbor job, the reward
and required-reward policy, promotion rules, baseline bundle, or selected
candidate bundle between development and holdout. `pareto-archive.json` stores
a canonical `developmentProfile` and its SHA-256 digest. Holdout recomputes the
profile from the current config and requires an exact match. It also requires
the selected candidate's current bundle digest to equal both its archive entry
and its development candidate result.
The declared development job signature must equal the signature observed in
every completed development job. A mismatched declaration remains useful as an
exploratory archive diagnostic, but cannot open holdout. `passThreshold`, every
required-reward threshold, `minimumMeanGain`, and every observed primary reward
must be finite.

Generation zero forbids `search.previousGenerationLog`. Every later generation
requires the immediately preceding archive from the same `search.id`. Its
generation seal and profile digest must be valid, its generation number must be
exactly one lower, and the current declared plus observed Harbor/promotion
profile must match exactly. Candidate parents may refer to current candidates
or members of that previous Pareto archive, and at least one parent must link
the generations.

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
overrides only job_name, jobs_dir, quiet, and each agent skills list. Before a
live run, it copies each candidate into an isolated
`candidate-staging/<candidate-id>/skills/<frontmatter.name>` directory and
passes that path to Harbor. It rejects unsafe names, pre-existing staging
destinations, copy drift, source mutation after staging, and lock digest drift.
The output records both source and evaluated paths plus their matching digest.
Every candidate therefore produces a normal Harbor job directory with
config.json, lock.json, result.json, and trial subdirectories.
Candidate bundles must be self-contained: symbolic links, junctions, and other
filesystem reparse points are rejected at the bundle root before resolution,
inside the bundle, before staging, and again after copying.

## Case vectors and Pareto selection

A case is identified by:

~~~text
task_checksum | agent_name | model
~~~

The score is the mean selected reward across declared attempts. Before Pareto
selection, every trial must be error-free and report every `requiredRewards`
key at or above its finite threshold. Unqualified candidates remain in
`candidateResults` for diagnosis but cannot enter the archive. Candidate A
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
Analyze-only compares the exact resolved skill source in `config.json` with the
declared candidate. A physical basename alias or a canonical-looking different
source may remain visible as `legacy-alias` or `source-mismatch`, but both are
explicitly exploratory and non-promotable. Promotion requires a present lock
whose logical name, digest, and resolved source all match the selected bundle.

## Native artifacts

The analyzer validates:

- job config.json through Harbor JobConfig
- optional lock.json through Harbor JobLock
- root result.json through Harbor JobResult
- every direct trial result.json through Harbor TrialResult
- the all-or-none set of direct trial lock.json files through Harbor TrialLock

A completed job must contain at least one trial. Each TrialResult configured
trial name and task identity, agent/model/skill, runtime settings, and observed
agent/model must bind to the root JobConfig and the corresponding JobLock
multiset. The lock/result trial counts and per-task/checksum/agent/model attempt
counts must exactly match root `n_attempts`.

Harbor 0.18 computes the deprecated `TrialResult.task_checksum` with `dirhash`
and the durable `TrialLock.task.digest` with the Packager content-hash
algorithm. Their values are intentionally not transformed or compared as if
they used one algorithm. Result `task_id` must equal the configured TaskConfig
identity, including local path or package/Git identity and ref. That declaration
then binds by name, type, source, normalized path, Git URL, resolved Git commit,
and any digest-pinned package ref to its TrialLock. When direct trial locks
exist, every trial must have one and their exact multiset must equal the root
JobLock. An adjacent lock may bind a symbolic or omitted configured Git ref to
the lock's resolved 40- or 64-hex commit, or a mutable package ref to the lock's
durable package digest.

The compatibility path for older root-only jobs fails closed unless task
identity is durable from the declaration itself: a Git task must declare the
same resolved commit stored in the lock, and a package task must use a
digest-pinned ref equal to the lock digest. Local tasks remain eligible.
Root-only association matches task identity, agent, model, and the complete
comparable runtime identity. Canonical-identical locks may satisfy
repeated-attempt multiplicity, but multiple non-identical matches are ambiguous
and rejected.
This is a matching-environment limitation: Harbor 0.18's root `TaskLock` does
not retain the requested symbolic Git ref or mutable package ref, so adjacency
is the only native evidence that binds those declarations to their resolutions.
Canonical root-lock comparison keeps the resolved Git commits and Packager task
digests fixed across candidates, while TrialResult checksums continue to
identify case vectors and development/holdout overlap.

Feedback paths are discovered rather than assumed:

- agent/**/trajectory.json
- agent/**/*.txt
- verifier/** regular files

Missing trajectory or text output is allowed when a verifier result or
exception still supplies grounded evidence. A missing selected reward without
an exception is invalid. A missing required reward is preserved as null and
reported as a qualification failure, separately from a numeric zero.

`verifier/diagnostics.json` is optional. When present, the analyzer records
`status`, `failure_domain`, `terminal_outcome`, and `error_code`; absent fields
and absent diagnostics remain explicit null/unavailable values. The explicit
non-evaluable domains are `authentication`, `environment`, `evaluator`,
`infrastructure`, and `provider`. Normalized status, terminal-outcome, and
error-code equivalents are also recognized, including authentication and
credential failures, container or Docker failures, evaluator/verifier runtime
failures, and provider context, quota, and rate-limit failures. `infra` remains
a supported infrastructure alias.

An affected trial keeps numeric `reportedReward` and
`reportedRequiredRewards` for audit but sets semantic `reward` and
`requiredRewards` objectives to null. Any such trial makes its candidate
non-evaluable and unqualified, so it is excluded from the Pareto archive.
Candidate, case, and archive outputs report diagnostics availability, provider
failure, infrastructure failure, and evaluable-trial counts. Tasks without this
artifact retain their ordinary reward semantics and are not rejected.

## Independent validation / holdout gate

The presence of `holdout/` in the search output marks an attempted release,
including a failed or unfinished attempt. Development, repeated holdout,
dry-run, and doctor reject that output before jobs or report writes. A
successor also checks the output containing its previous archive when the
archive uses the standard `development/generation-NNN/pareto-archive.json`
layout. Inspect completed receipts directly rather than rerunning selection.
These filesystem checks are local continuity guards; copied archives and
unrelated output roots do not prove a fresh cohort. The organizer and private
study protocol remain authoritative for cross-directory release history.

The holdout phase requires a selected development archive member and rejects
any task name or checksum observed during development. Before executing or analyzing
holdout jobs, it binds the archive to the same Harbor strategy, search id,
generation, development and holdout job signatures, Harbor version, scoring
profile, promotion policy, baseline digest, and selected-candidate digest. An
archive from another search/profile or a bundle mutated after development is
rejected. It then compares baseline and candidate on the same native Harbor
holdout cases.
The archive seal covers full `candidateResults`, Pareto entries, profile digest,
prior-generation seal, and the development case names/checksums. Holdout
reconstructs those case identities from `candidateResults` rather than trusting
the summary fields. Declared holdout job-profile drift or observed
agent/version/model drift is a hard error, not a non-promotion result.

Promotion requires:

- overall mean gain at least minimumMeanGain
- no case regression unless allowCaseRegressions is true
- no candidate errors when requireNoErrors is true
- all required reward keys present for both jobs
- selected candidate qualified on every holdout trial
- both baseline and candidate holdout jobs evaluable, with no provider or
  infrastructure diagnostic failure
- canonical locked provenance for the selected development candidate and both
  holdout sides
- a declared development profile that matched the observed development jobs

If either holdout job is non-evaluable, promotion is blocked. Observed rewards
remain available under the diagnostic fields, while the affected semantic mean
and overall gain are null and the decision is `blocked-non-evaluable`.

The runner copies the selected bundle to holdout/candidate-skill but never
changes or installs the source skill. The copy is accepted only when its digest
still equals the development archive's selected `skillDigest`.
