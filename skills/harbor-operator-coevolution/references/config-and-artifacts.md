# Configuration And Harbor Artifacts

Use one YAML document per frozen generation. Relative paths resolve from the
generation file. Development entries are native Harbor jobs; the config never
contains candidate scores.

~~~yaml
schemaVersion: 1
evolution:
  id: example-operator-search
  generation: 0
  generationId: generation-001
  outputDir: runs/generation-001
  baselineCandidateId: baseline
  # previousGenerationLog: runs/generation-000/operator-coevolution-log.json

harbor:
  rewardKey: reward
  passThreshold: 1
  requiredRewards:
    mechanical_qualification_gate: 1
  requireNoErrors: true
  requiredEnv: [OPENAI_API_KEY]
  diagnosticChars: 3000
  # Disabled when omitted. This is a candidate-failure disposition, not retry.
  # candidateAttributableDiagnosticPolicy:
  #   contracts: [provider-context-limit.v1]

coevolution:
  candidateSurvivors: 2
  operatorSurvivors: 2
  nextOperatorCount: 6
  minimumOperatorTrials: 2
  allowCaseRegressionsForCredit: false
  complementaryRepair: false

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

For `--analyze-only`, replace each `jobConfig` used by the selected phase with
`jobDirectory`. A live run loads each selected native config with Harbor
`JobConfig`, resolves its local paths, and
copies the referenced source skill into a job-isolated
`.harbor-operator-candidate-staging/<job>/skills/<frontmatter.name>/` directory,
then executes the rewritten runtime config with `Job.create(...).run()`. It
refuses an existing job or staging destination and verifies that the staged
digest and logical name still match the source. The input JobConfig is not
rewritten on disk.

The default `--phase full` preserves the development-then-holdout workflow.
`--phase development` executes or analyzes only candidate development jobs and
produces a terminal receipt. `--phase development-chain` uses the same
holdout-free boundary but opts a normal, fully qualified and fully breedable
development generation into predecessor eligibility. In both development
phases, dry-run and doctor skip holdout JobConfig loading. The holdout mapping
remains a frozen required declaration, but its paths need not exist and are
never resolved, validated, loaded, or executed.

For `development-chain`, the runner projects that raw declaration into an
opaque schema-v2 commitment. It records the baseline candidate ID and
reference, an ID-free `candidateSlot` containing the declared `jobConfig` and
`jobDirectory` strings, and the normalized promotion policy. The raw
`holdout.candidate.candidateId` is intentionally excluded because a later
generation may produce a different winner. Relative paths are canonicalized
lexically against the generation config directory; absolute paths are
normalized lexically. This calculation does not resolve symlinks, test
existence, inspect directories, or read either target. The profile seals both
`holdoutDeclaration` and its
`holdoutDeclarationDigest`, so an absent target can be materialized later at
the exact declared location without exposing holdout during development.

Plain `development` seals the selected candidate ID and skill digest, records
an unopened holdout, `promotion: false`, and `chainEligible: false`.
`development-chain` requires a qualified selected candidate and enough
established, credit-eligible operators to produce the complete normal breeding
plan. It seals the selected development winner separately and does not require
the raw holdout candidate ID to predict that winner. On success, only the sealed
generation log and command result record `chainEligible: true`;
`holdout-promotion.json`
remains an explicitly unopened, non-promoting holdout artifact. An
all-unqualified, complementary-repair, identity-mismatched, or insufficient-
operator result cannot complete `development-chain`.

During an actual full execution or analysis, holdout paths also remain
unresolved until development has produced a qualified selected candidate and
confirmed that the raw `holdout.candidate.candidateId` matches it. The runner
then resolves the already frozen candidate-slot path and seals a
`holdoutReleaseBinding` containing the selected ID and skill digest, full
declaration and slot digests, and observed candidate holdout job/result/trial
identity. Consequently, an
all-unqualified complementary-repair run can safely return its diagnostic plan
even when the frozen holdout paths are absent or otherwise invalid. Explicit
full dry-run and doctor operations still preflight the full declared workflow.

A generation requires at least two candidates, at least two operators, and at
least one generated child. All candidate SKILL.md files must retain the
baseline frontmatter name. That name must be an exact portable basename: 1-64
lowercase letters, digits, or interior hyphens, and not a Windows reserved
device name. `operatorSurvivors` must be at least 2, and
`nextOperatorCount` must be at least `operatorSurvivors`. Analyze-only always
requires a completed `jobDirectory` for every development candidate; full mode
also requires both holdout sides, while both development modes read neither.

Generated children attributed to one operator must have distinct bundle
digests. Two child IDs that point to byte-identical skill bundles under the
same operator are rejected as pseudoreplication before any Harbor job runs.
`coevolution.complementaryRepair` is a Boolean and defaults to false.

`--dry-run` validates the generation schema, each native JobConfig used by the
selected phase, candidate paths and digests, and coevolution constraints; it
does not establish that a local dataset contains runnable tasks. `--doctor`
additionally checks declared credentials and Docker availability. Actual
dataset/task resolution remains a Harbor execution concern.

All source and staged candidate bundles must be self-contained. Symbolic links,
Windows junctions, and other filesystem reparse points are rejected before any
copy or execution. Primary rewards, `harbor.passThreshold`, required-reward
thresholds, and `holdout.minimumMeanGain` must be finite.

For every generation after zero, set `evolution.previousGenerationLog` to the
immediately preceding `operator-coevolution-log.json`; generation zero forbids
the field. The runner validates the schema, source, `evolutionId`, consecutive
generation number, distinct `generationId`, generation seal, and profile
digest. Current operator IDs, origins, and `parentOperatorIds` must realize the
prior sealed breeding plan exactly. The operator `instruction` must also equal
the prior plan text exactly. Each normal plan entry carries an
`instructionContract` with mode `exact-text-v1` and a digest of that text;
mutation-plan and crossover-plan instructions are concrete contracts, not
free-form realization prompts.

A historical full log without phase or chain fields retains its compatibility
path only when it also has the historical profile shape without an opaque
holdout-declaration commitment. The historical seal remains verifiable, but a
log that predates `developmentEvidenceIdentity` cannot seed a new generation
because fresh generated-child evidence cannot be proven. Every newly emitted
full log records
`phase: full`, `requestedPhase: full`, `diagnosticOnly: false`,
`chainEligible: true`, `holdoutOpened: true`, and its Boolean promotion result.
A phased development log is accepted only when it was produced by the
explicit `development-chain` mode and its seal binds `chainEligible: true`, a
qualified selected candidate, false diagnostic/promotion state, and an unopened
holdout projection. Plain development, complementary repair, and report-only
logs remain rejected as predecessors.

Every explicit predecessor seal also binds
`holdoutUsedForDevelopmentSelection: false`. The selected development identity
must equal the first qualified candidate survivor and its ranking digest. The
breeding plan must be normal, non-diagnostic, chain-eligible, contain unique
operator IDs, report an `operatorCount` equal to its operator-list length, and
seal the exact-text instruction contract for every entry.

Every newly emitted generation log also contains
`developmentEvidenceIdentity` and `developmentEvidenceIdentityDigest`. The
identity projection covers every development candidate and binds its
attribution, skill digest, resolved job directory, root JobResult UUID/path/
digest, config digest, lock digest, and the UUID/path/digest and task identity
of every TrialResult. The projection is part of `generationSeal`.

For a successor, every candidate with `operatorId` must use fresh evidence that
is disjoint from all predecessor evidence by job directory, job UUID, root
result path/digest, trial UUID, and trial result path/digest. A new directory
containing copied result files therefore fails even though its path changed.
An unattributed row may reuse evidence only when its candidate ID, skill digest,
and complete freshness-identity set are unchanged and the predecessor row was
either an unattributed root reference or exactly `selectedDevelopment`. A
second-place or lower ranked survivor does not receive this exception. Partial
reuse, such as a new job path combined with old trial UUIDs, is rejected. This
narrow rule supports the study's baseline/reference and selected-winner
reevaluations without permitting a current operator to claim prior attempts. A
fully disjoint, genuinely fresh reevaluation remains valid.

Before a successor full run resolves either holdout reference, it validates the
previous log, breeding lineage, and the Harbor, scoring, evaluation, promotion,
observed-profile, development-lock projection, exact operator instructions,
and cross-generation job/trial freshness. A full predecessor must
still match the final full profile exactly after holdout is loaded. A
`development-chain` predecessor has no observed holdout lock, so the successor
first requires an exact match to the sealed opaque holdout declaration and its
digest, then compares the development projection and seals its newly observed
holdout lock in the full-generation log. Changing the baseline ID/reference,
candidate-slot reference, or any promotion-policy field is rejected before the
new target can be resolved. Changing the eventual candidate ID is permitted
between development generations; final full development binds it before opening
the slot. The original paths may be populated after the development generation;
substituting different paths is drift. Candidate-bound schema-v1 declarations
cannot migrate into this deferred-release contract and fail closed. This
supports a chain such as generation zero `development-chain` followed by
generation one `full`: both generations run development, a new generation-one
candidate may win, and only the second generation opens holdout.

Every job must contain exactly one agent and one local skill, and each
candidate must have its own job. Root candidates omit both `parentCandidateId`
and `operatorId`; generated children provide both. The holdout candidate must
equal the top development candidate or analysis stops before promotion.

`harbor.requiredRewards` is an optional mapping from a non-empty verifier
reward key without whitespace to a finite numeric threshold. Every trial must
report every configured key at or above its threshold. The default empty
mapping retains the existing reward-only behavior. The legacy
`harbor.requireNoErrors` key remains accepted for configuration compatibility,
but trial errors are always non-compensating qualification failures.

`harbor.candidateAttributableDiagnosticPolicy` is optional and defaults to a
disabled `{contracts: []}` policy. Its `contracts` list accepts only versioned,
code-owned IDs and rejects duplicates, unknown IDs, and unknown policy keys.
The only current contract is `provider-context-limit.v1`. Enabling it changes
and seals both the Harbor scoring policy and the exact code-owned contract
definition digest in the evolution profile; omitting it keeps the historical
profile shape and classification behavior.

## Development-only and complementary repair artifacts

Both development modes write the normal development evidence, candidate and
operator rankings, a breeding plan when normal survivors exist, an explicitly
unopened `holdout-promotion.json`, a sealed `operator-coevolution-log.json`, and
`report.md`. Both logs record `phase: development`, the selected candidate ID
and skill digest, `promotion: false`, and `holdoutOpened: false`.

Plain `development` records `requestedPhase: development` and
`chainEligible: false`; it is a phase receipt, not a completed predecessor.
Successful `development-chain` records
`requestedPhase: development-chain` and `chainEligible: true`. Its generation
log may be the immediate predecessor of another `development-chain` or `full`
generation. Its evolution profile also records the opaque
`holdoutDeclaration` and `holdoutDeclarationDigest`. The separate unopened
holdout artifact remains non-chainable because it contains no release evidence;
predecessor validation consumes the sealed generation log.

A qualified development winner does not require a complete operator survivor
population merely to be sealed by plain `development`. When fewer than
`operatorSurvivors` operators are established and credit-eligible, that mode
preserves their complete ranking and credit fields but writes an empty
diagnostic breeding plan with `reason: insufficient-established-operators` and
`chainEligible: false`. The same evidence in `development-chain` or full mode
aborts before any holdout path is resolved.

When every candidate is unqualified, the default remains fail-closed. Setting
`coevolution.complementaryRepair: true` changes only that terminal branch. It
emits `repair-plan.json` and returns before resolving holdout. The repair plan
is marked `diagnosticOnly: true`, `chainEligible: false`,
`fitnessAwarded: false`, `operatorCreditAwarded: false`,
`holdoutOpened: false`, and `promotion: false`. Candidate/operator survivors
and the ordinary breeding plan remain empty; the repair instruction must be
realized as a fresh child and re-evaluated before it can receive normal credit.
Raw and hard-gated fitness fields remain in candidate ranking for diagnosis,
but the repair branch does not award, select, credit, or breed from them.

For a terminal evidence report instead of repair, run
`scripts/harbor_operator_report_only.py` against the unchanged configuration.
It requires existing development `jobDirectory` values and never executes a
Harbor job. It uses the canonical diagnostic classifier and deterministic
ranking, sets candidate survivors and operator survivors to empty, records
`fitnessAwarded: false` and `creditAwarded: false`, emits an empty breeding
plan with reason `diagnostic-report-only`, and leaves holdout unopened. A
qualified row remains visible in ranking so an external frozen gate can derive
an `advance` result, but report-only itself never selects or promotes it.

Repair eligibility is deliberately narrower than ordinary diagnostics:

- The generated child and its declared parent must both have complete,
  evaluable Harbor results with no exception, classified external failure,
  candidate-attributable diagnostic failure, or missing required-reward value.
- Gate coverage is computed from the complete per-trial vector. A candidate
  passes a gate only when every trial reports a finite value meeting that
  gate's frozen threshold. Values are never averaged across gates or trials.
- A child must preserve every gate passed by its evaluated parent and add at
  least one. Two repair parents must share the same evaluated parent, originate
  from distinct operators, and each contribute a gate the other does not.
- Each participating operator must have at least
  `coevolution.minimumOperatorTrials` eligible child comparisons. This is a
  diagnostic establishment check, not operator credit or survival.
- Malformed diagnostics abort analysis. Unavailable/external evidence and
  `null` gate values are excluded. The generated instruction is fixed,
  benchmark-agnostic text; verifier output, trajectories, and agent text are
  never interpolated into it.

The selected repair combination records both candidate/operator IDs, their
skill digests, identity modes, the shared evaluated parent and digest, complete
trial vectors, passed and failed gates, exclusive contributions, the union of
passed gates, and remaining gaps. A run with no valid complementary pair still
writes the diagnostic artifact with `planned: false`; it does not silently
promote a single partial candidate.

## Native artifact contract

The analyzer reads and validates:

~~~text
<job>/config.json
<job>/lock.json
<job>/result.json
<job>/<trial>/result.json
<job>/<trial>/agent/trajectory.json        # optional diagnostic evidence
<job>/<trial>/agent/*.txt                  # optional diagnostic evidence
<job>/<trial>/verifier/**/diagnostics.json # optional structured failure evidence
<job>/<trial>/verifier/test-output.txt     # optional diagnostic evidence
<job>/<trial>/verifier/test-stdout.txt     # optional diagnostic evidence
<job>/<trial>/verifier/test-stderr.txt     # optional diagnostic evidence
~~~

Harbor's 0.18.0 Pydantic models validate config, lock, job, and trial objects.
The job must be finished with at least one trial and all planned trials present
and settled. Every
non-exception trial must contain the selected numeric reward in `0..1`.
Every `TrialResult.config` must bind exactly to its trial name and task identity,
the one declared root agent/model/skill, its observed agent/model metadata, and
the matching JobLock runtime multiset. Per-task/checksum/agent/model counts must
equal root `n_attempts`, and lock/result trial counts must be identical. Harbor's
`TrialResult.task_checksum` is the legacy directory checksum while
`JobLock.task.digest` is the Packager content digest; the analyzer preserves
and compares both hash families but never requires those two different
algorithms to equal one another. Result and lock rows are instead bound by exact
local task name/path plus agent/model identity.
Each configured required reward is preserved in trial evidence as its finite
numeric value or `null` when absent. `qualificationFailures` records a
structured `missing` or `below-threshold` reason with the key, threshold, and
actual value. An exception also makes that trial unqualified.
`candidate-ranking.json` repeats this evidence as `requiredRewardVector`, keyed
by trial/task/checksum with exact values and Boolean gate results, plus a
candidate-level `requiredRewardGates` conjunction. This representation is
non-compensating: no reward mean can hide one failing or missing trial value.

`verifier/**/diagnostics.json` is optional because ordinary Harbor tasks need not
publish it. When present, the analyzer extracts `status`, `failure_domain`,
`terminal_outcome`, and `error_code` without replacing the existing Harbor
exception field. A `failure_domain` of `authentication`, `environment`,
`evaluator`, `infrastructure`, or `provider` classifies the trial as
non-evaluable. Matching failure/error status, terminal-outcome, and error-code
forms (for example provider context limits, authentication errors, verifier
failures, or container failures) receive the same classification. The observed
verifier reward remains in evidence, but `score` becomes `null`; this keeps a
provider- or infrastructure-emitted reward of zero distinct from an evaluated
semantic zero. The specific normalized domain remains visible on every trial
and in aggregate domain counts.

The optional `provider-context-limit.v1` candidate-attributable contract is a
narrow exception to evaluability, not to retry safety. It matches only when:

- the structured diagnostic domain set is exactly `provider` and is not
  conflicting;
- every discovered `diagnostics.json` observation supplies all four exact raw
  values: `status: provider-failure`, `failure_domain: provider`,
  `terminal_outcome: provider-context-limit`, and
  `error_code: context_length_exceeded`; case, punctuation, and surrounding
  whitespace variants do not match;
- the Harbor trial has no exception; and
- the configured primary reward and every configured required reward that is
  present are finite numeric zero. Unconfigured auxiliary/audit metrics may be
  nonzero because they do not participate in scoring or qualification.

An exact match sets `candidateAttributableFailure: true`, preserves the
structured observation and its provider-domain counts, makes the evaluation
available with score `0`, keeps qualification false, and records a
`candidateAttributableDiagnostic` disposition with
`retryAuthorized: false`. Candidate and diagnostic summaries count the match,
and the active policy (including its contract-definition digest) is present in
the root generation evidence and sealed in `evolutionProfile.harborPolicy` even
when no trial matches. Reports surface candidate-attributable counts separately
from unavailable infrastructure counts.
Transient provider signals, partial tuples, nonzero configured scoring rewards,
mixed domains, authentication, environment, evaluator, and infrastructure
failures retain the ordinary unavailable/null classification. The operator
analyzer has no retry execution path, and this disposition must never be
consumed as retry authorization by another tool.
Diagnostics may be nested anywhere below the trial's `verifier/` directory;
the short `infra` and `auth` domains normalize to `infrastructure` and
`authentication`.
Every nested file contributes to domain, terminal-outcome, and error-code
aggregates. A trial may record multiple external domains and is flagged when
they conflict. Malformed JSON or a diagnostics root that is not an object
aborts analysis because its failure cause cannot be classified safely.

Diagnostics are parsed before the selected primary reward is required. A trial
classified non-evaluable may omit that reward entirely: both `reward` and
`reportedReward` remain `null`, `missingPrimaryReward` is true, and its score,
task mean, and fitness remain unavailable. This is not an evaluated semantic
zero and does not abort analysis. A rewardless trial without a Harbor exception
or classified non-evaluable diagnostic is malformed and still aborts analysis.

Candidate raw and effective fitness are `null` when any task score is unavailable
because of a classified non-evaluable diagnostic failure. The evidence includes
diagnostic, domain, provider-failure, terminal-outcome, and error-code counts.
Ordinary Harbor exceptions and required-reward gate failures retain the
non-compensating zero effective fitness behavior. Candidate ranking places
qualified candidates first and selects survivors only from that qualified
subset.

Operator credit is the child's effective fitness minus its parent's effective
fitness only when both values are available. An unavailable pair produces
`improvement: null`, is excluded from improvement aggregates, increments the
operator's unavailable-credit count, and cannot establish or reward the
operator. `coevolution.minimumOperatorTrials` is the minimum number of those
creditable comparisons required for `established: true`. An operator below the
threshold retains its instruction, parent lineage, child IDs, raw improvement
statistics, and unavailable-credit diagnostics, but its credited mean is
`null`, it cannot be an operator survivor, and it cannot appear as a mutation
or crossover parent in `breeding-plan.json`. An established operator must also
have at least one qualified child to be credit-eligible for survival. If fewer
than `operatorSurvivors` operators satisfy both gates, analysis stops instead
of breeding from under-sampled evidence.
Credit is case-non-compensating by default. If a child regresses on any
development task relative to its evaluated parent, its raw `improvement`
remains visible but `creditedImprovement` is null and the operator receives no
credit for that child. `coevolution.allowCaseRegressionsForCredit: true`
explicitly relaxes this rule.

Job locks must match after removing only volatile creation time and candidate
skill provenance. The digest and source path must match the declared local
bundle exactly in the job config, trial result, trial-lock agent, and locked
skill entry. Canonical evidence requires the evaluated source basename and
locked name to equal `frontmatter.name` exactly. Analyze-only retains a narrow
compatibility path for old artifacts whose evaluated source is the declared
candidate directory but has another basename; it marks those records
`identityMode: legacy-alias`, `exploratory: true`, and
`promotionEligibleIdentity: false`. A canonical-looking but different resolved
source with the same digest is reported as `identityMode: source-mismatch` and
is likewise exploratory/non-promotable in analyze-only. Other arbitrary source
aliases are rejected.
Retry include/exclude exception filters are canonicalized as order-insensitive
sets; other arrays retain their order because it can be execution-significant.
`generation-evidence.json` preserves the logical frontmatter name as
`skillName` and reports Harbor's serialized `lockedSkillName` and the verified
`skillSource` separately.
Holdout locks are compared only with each other; holdout task names and
checksums must not overlap development.
The Harbor version and agent/model/attempt/retry/environment/timeout profile
must match across development and holdout. The same policy and comparable locks
are sealed into the generation log for validation by the next generation.

The separate promotion gate compares the unchanged baseline and selected
candidate on holdout. It checks mean gain, task regressions, qualification,
configured-reward completeness, canonical skill identity, and candidate
errors. A candidate with any
errored, missing, or below-threshold holdout trial cannot be promoted; a
missing configured reward or classified non-evaluable diagnostic result on
either side also closes the gate. Changing
holdout rewards can change promotion but cannot change any development ranking
or breeding artifact. Legacy analyze-only evidence may still support
exploratory ranking, diagnosis, credit, and breeding, but the holdout artifact
always reports `identityPromotionEligible: false` and keeps the baseline.
That combined identity gate includes the selected development record; canonical
holdout artifacts cannot rehabilitate a development `legacy-alias` or
`source-mismatch` record.
