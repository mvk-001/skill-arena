---
name: harbor-operator-coevolution
description: Coevolve skill candidates and the mutation instructions that produce them from native Harbor jobs. Use when repeated skill-improvement generations need parent-to-child operator credit derived from Harbor rewards, errors, verifier diagnostics, trajectories, and locked skill digests, with an untouched Harbor holdout promotion gate and no Skill Arena runtime.
---

# Harbor Operator Coevolution

Use one native Harbor job per skill candidate. Rank skill candidates by absolute
development fitness, credit mutation operators by improvement over each
candidate's evaluated parent, breed the next operator population, and apply a
separate holdout gate only after development selection.

Runtime: use `uv` and Python 3.12 or newer. The bundled executable pins Harbor
0.18.0. In commands, `<skill-root>` means this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Evolution/validation boundary

Before generation zero, freeze a development dataset for candidate ranking and
operator credit plus a disjoint, optimizer-invisible validation dataset. Plan
the validation stage before evolution starts. This bundle's deferred `holdout`
declaration normally supplies that independent validation dataset; a study may
reserve an additional holdout afterward. Its lexical commitment may be created
up front, but neither the coevolution analyzer nor candidate author may resolve
or inspect the referenced validation inputs before the selected development
candidate and digest are frozen.

Validation is a one-way gate. Never use its rewards, task identities,
diagnostics, or trajectories for operator credit, breeding, repair, candidate
ranking, or reselection in the same study. If it fails, preserve the result and
start a new study with fresh validation for another unbiased claim.

## Workflow

1. Read [references/config-and-artifacts.md](references/config-and-artifacts.md)
   completely before authoring a generation.
2. Freeze the Harbor tasks, agent, model, attempts, reward rule, non-compensating
   `harbor.requiredRewards`, operators, and holdout before creating children.
   Give every child exactly one operator and one evaluated parent.
   Use at least two candidates and two operators. Every candidate is a version
   of the baseline skill and must preserve its SKILL.md frontmatter `name`;
   include at least one generated child.
   Leave `coevolution.complementaryRepair` false for the normal fail-closed
   workflow. Enable it only when an all-unqualified generation should produce
   a diagnostic crossover hypothesis from complementary required-reward gates.
   Leave `harbor.candidateAttributableDiagnosticPolicy` omitted unless the
   frozen benchmark explicitly treats one of the code-owned, non-retryable
   absolute-deny contracts as a candidate failure. The only current contract is
   `provider-context-limit.v1`.
3. Create one native Harbor job config per development candidate and one per
   side of the final holdout comparison. Each job must install exactly one
   local candidate skill. The config references the source bundle; live mode
   copies it into an isolated path whose basename is exactly the portable
   SKILL.md `frontmatter.name` before Harbor sees it.
4. Validate the coevolution structure, native JobConfig schemas, paths, skill
   digests, and breeding constraints without running agents:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --dry-run
~~~

   Dry-run does not prove that a dataset contains runnable Harbor tasks.
5. Check declared credentials and Docker when applicable:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --doctor
~~~

6. Run the generation through Harbor's `Job` and `JobConfig` APIs:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml
~~~

   To execute or analyze development as a terminal receipt without resolving,
   validating, loading, or running either holdout job, use the explicitly
   separated phase:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --phase development
~~~

   To keep holdout equally closed while making a normal, fully qualified and
   fully breedable development generation eligible to seed the next generation,
   use the separate opt-in phase:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --phase development-chain
~~~

   To analyze already completed native jobs without launching agents, provide
   `jobDirectory` for every entry used by the selected phase, then add
   `--analyze-only`. Plain `development` seals the selected candidate ID and
   digest, marks promotion false and `chainEligible: false`, and does not open
   the frozen holdout declarations. `development-chain` performs the same
   holdout-free analysis but requires a qualified winner and enough established,
   credit-eligible operators for a normal breeding plan; only then does its
   sealed generation log record `chainEligible: true`. It seals the winner
   separately from an opaque schema-v2 holdout declaration. That declaration
   freezes the baseline ID/reference, an ID-free candidate-slot reference, and
   the promotion policy; it does not predict the eventual release candidate.
   The paths may be absent, and this step neither resolves nor reads their
   targets. Legacy artifacts whose
   source basename differs from `frontmatter.name` remain analyzable, but are explicitly
   exploratory and can never pass promotion. A canonical-looking path that is
   not the exact declared candidate source is likewise `source-mismatch`
   exploratory evidence.
   Plain `development` can still seal a qualified winner when fewer than
   `operatorSurvivors` operators are established. It preserves operator ranking
   and credit diagnostics but emits an empty, non-chainable breeding plan with
   reason `insufficient-established-operators`. Full mode remains fail-closed.
   When a downstream evidence publisher must report a completed development
   stage regardless of qualification, use the separate report-only executable:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_report_only.py generation.yaml `
  --output-dir run/report-only
~~~

   It accepts immutable `jobDirectory` inputs only, reuses this skill's exact
   classifier and ranking implementation, suppresses diagnostic/model-text
   excerpts, and emits no survivor, operator credit, breeding, holdout,
   promotion, or chain decision. The normal coevolution command remains
   fail-closed when no candidate qualifies.
7. Inspect optional verifier diagnostic classifications, per-trial required
   reward values, and qualification failures in `generation-evidence.json`,
   then inspect `candidate-ranking.json`,
   `operator-ranking.json`, `breeding-plan.json`, `holdout-promotion.json`, and
   `operator-coevolution-log.json`. Treat every breeding-plan `instruction` as
   the exact next-generation operator text bound by its
   `instructionContract`; mutation and crossover plan text is not a placeholder
   that may be rewritten while retaining the same operator ID.
   After a completed full run or successful `development-chain` run, point the
   next config's `evolution.previousGenerationLog` at that log so the sealed
   Harbor, scoring, evaluation, and promotion profile cannot drift. Run fresh
   Harbor jobs for every newly attributed child; copying or relabeling a prior
   generated-child job is not a new realization. Plain
   `development` and repair logs are receipts with `chainEligible: false`, not
   predecessor logs. A final `full` generation may follow a
   `development-chain` predecessor: it validates the prior development profile
   and breeding lineage before resolving holdout, then runs its own development
   selection before opening holdout once.
   When complementary repair activates, inspect `repair-plan.json` instead.
   It is a diagnostic-only same-parent crossover/mutation proposal, not a
   breeding, fitness, credit, survival, promotion, or holdout decision.
8. Promote only when `holdout-promotion.json` says `promote`. The script never
   installs a candidate or replaces the source skill.

## Rules

- Derive fitness, hard-gate failures, and operator credit from Harbor artifacts;
  never copy declared scores into the generation config.
- Require complete jobs, matching resolved locks except for skill provenance,
  identical task checksums, attempts, agent versions, and models.
- Reject a completed artifact with zero trials. Bind every trial's configured
  name, task, agent, model, skill, runtime settings, and attempt count to the
  root JobConfig, JobLock multiset, and observed agent metadata.
- Verify every local candidate bundle against Harbor's locked skill digest.
- Reject symbolic links, junctions, and other filesystem reparse points in any
  source or staged candidate bundle.
- Require one exact portable `frontmatter.name`: 1-64 lowercase letters,
  digits, or interior hyphens, excluding Windows reserved basenames. In live
  mode, never give Harbor a candidate path with a different basename.
- Declare `harbor.requiredRewards` as a mapping from verifier reward key to a
  finite minimum when any mechanical or semantic metric is a hard gate. An
  empty mapping preserves the reward-only workflow.
- Require finite primary rewards, `harbor.passThreshold`, and holdout
  `minimumMeanGain`; NaN and infinity never enter ranking or output JSON.
- Preserve every configured reward value per trial, including `null` when it
  is missing, and record `missing` or `below-threshold` qualification failures.
- Preserve the complete non-compensating required-reward vector for every
  candidate and trial in ranking evidence. Never replace it with a mean or a
  count when deriving complementary gate coverage.
- Give any candidate with an errored or unqualified trial zero effective
  fitness. Keep raw fitness, verifier values, and agent diagnostics visible.
- When a verifier supplies `verifier/**/diagnostics.json`, extract `status`,
  `failure_domain`, `terminal_outcome`, and `error_code`. Authentication,
  environment, evaluator, infrastructure, and provider failures (including
  equivalent terminal outcomes and error codes) make evaluation fitness
  unavailable (`null`) rather than a semantic zero by default. Do not require
  this optional file from generic tasks.
- `harbor.candidateAttributableDiagnosticPolicy.contracts` is an explicit,
  profile-sealed opt-in to code-owned exact contracts; it is not a configurable
  signal allowlist. `provider-context-limit.v1` requires every diagnostics
  observation to contain the exact raw tuple `provider-failure`, `provider`,
  `provider-context-limit`, and `context_length_exceeded`, with one unambiguous
  domain, no Harbor exception, and no nonzero configured primary or required
  reward. Unconfigured audit metrics do not participate in this conflict gate. It
  records an unqualified, evaluation-available candidate failure with score
  zero and `retryAuthorized: false`. Partial matches, conflicts, transient
  provider failures, and authentication/environment/evaluator/infrastructure
  failures remain unavailable. This analyzer never authorizes a retry.
- Read every nested diagnostics file, retain all classified domains and
  terminal/error signals, and surface conflicting-domain counts. Invalid JSON
  or a non-object diagnostics root fails closed instead of silently becoming
  ordinary semantic evidence.
- Parse structured diagnostics before requiring the primary reward. A
  classified non-evaluable trial may legitimately have no primary reward;
  preserve `reportedReward: null`, set score and fitness unavailable, and do
  not synthesize zero. Missing reward without an exception or such a diagnostic
  remains invalid.
- Rank candidates by absolute hard-gated fitness before improvement. A weak
  parent can increase operator credit but cannot penalize a strong child.
- Select only qualified candidate survivors. Penalize failed children in
  operator credit, exclude operators with no qualified children from survivor
  breeding, and never let raw reward compensate for a failed gate.
- Do not compute or reward parent-to-child operator credit when either effective
  fitness is unavailable. Keep unavailable-credit counts and candidate IDs in
  the operator ranking.
- By default, do not credit a child with any development-case regression even
  when its mean improves. Preserve raw improvement and regression IDs for
  diagnosis; set `coevolution.allowCaseRegressionsForCredit: true` only as an
  explicit policy exception.
- Treat `coevolution.minimumOperatorTrials` as a non-compensating establishment
  gate. Keep under-sampled operators and their lineage in diagnostics, but do
  not credit them as established, select them as operator survivors, or use
  them as mutation/crossover parents.
- `coevolution.complementaryRepair` defaults to false. When true and no
  candidate passes every development gate, normal candidate/operator survivors
  remain empty, no fitness or operator credit is awarded, holdout stays closed,
  promotion stays false, and the resulting log is diagnostic-only and cannot
  seed another generation.
- Raw and hard-gated fitness values remain visible as diagnostics in that
  branch, but they are not awarded, selected, credited, or used for breeding.
- A complementary repair candidate must be a fully evaluable generated child
  with complete finite required-reward values and an evaluated parent. It must
  preserve every gate passed by that parent and add at least one. A pair must
  share that exact parent, come from distinct operators, and each side must
  contribute at least one gate absent from the other side.
- Apply `coevolution.minimumOperatorTrials` independently to complementary
  repair evidence. Repair mode never relaxes the normal establishment or
  survivor gates.
- Exclude Harbor exceptions, unavailable fitness, classified external or
  candidate-attributable diagnostics, missing required rewards, and malformed
  diagnostics from repair evidence. Malformed diagnostics still abort analysis.
- Reject two generated children with the same skill digest when they are
  attributed to the same operator. Repeatedly evaluating one unchanged child
  bundle is pseudoreplication, not independent operator evidence.
- Keep holdout tasks disjoint from development by name and checksum. Never use
  holdout rewards for candidate ranking, operator credit, or breeding. Holdout
  cannot promote an unqualified candidate or either side when a configured
  reward or classified non-evaluable diagnostic result is unavailable.
- When the configured holdout is the study's first unseen cohort, treat it as
  independent validation and as consumed after release. It cannot seed another
  coevolution generation.
- Require the same Harbor version and agent/model/attempt/retry/environment/
  timeout profile across development and holdout, and seal that profile across
  generations with `evolution.previousGenerationLog`.
- Holdout identity is not sufficient by itself: the selected development
  record must also be canonical, non-exploratory, and promotion-eligible.
- Holdout path resolution and validation are deferred until after a qualified
  development candidate is selected. `--phase development`,
  `--phase development-chain`, and an all-unqualified complementary-repair
  branch return first. They retain frozen holdout declarations in the input
  schema but never resolve or load them.
- Treat `development-chain` as an explicit strict mode, not an alias for plain
  development. It requires a qualified development winner and a complete normal
  breeding plan. It seals that generation's winner separately and never
  requires the raw holdout candidate ID to predict it. An all-unqualified,
  complementary-repair, or insufficient-operator result cannot become
  chain-eligible.
- For every generation after zero, require the immediate sealed predecessor
  from the same `evolution.id`; require a fresh `generationId`, the exact prior
  breeding-plan operator IDs, origins, parent lineages, and exact sealed
  instruction text, plus an unchanged declared and observed evaluation profile.
- Seal `developmentEvidenceIdentity` and its digest in every newly emitted log.
  For each candidate it binds the job directory, root JobResult UUID/path/
  digest, config and lock digests, and every TrialResult UUID/path/digest along
  with task identity. A successor's generated children must be disjoint from
  every predecessor candidate across job directories, job UUIDs, result paths,
  result digests, trial UUIDs, and trial result paths/digests. Changing only an
  operator label, copying a job tree, or replaying prior result artifacts fails
  before holdout is resolved.
- Permit cross-generation evidence reuse only for an unattributed candidate
  whose candidate ID, skill digest, and complete freshness-identity set are
  unchanged and whose predecessor was either also an unattributed root
  reference or exactly `selectedDevelopment` (not merely another ranked
  survivor). Reject partial/hybrid identity reuse. Fully disjoint fresh
  reevaluations of those roots or the selected winner remain allowed. Never
  apply this exception to a candidate attributed to a current operator.
- Accept a development-only predecessor only when its sealed log records
  `phase: development`, `requestedPhase: development-chain`,
  `chainEligible: true`, a qualified selected candidate, a normal breeding
  plan, false promotion, and an unopened holdout. Validate its development
  profile projection before a successor resolves holdout. Historical full logs
  without phase or chain fields remain recognizable and their historical seal
  shape remains verifiable, but they cannot seed a new generation when they do
  not contain the job/trial identity evidence needed to prove fresh generated
  children. Newly emitted full
  logs use explicit `phase: full`, `requestedPhase: full`,
  `chainEligible: true`, `holdoutOpened: true`, and promotion markers.
- Require every explicit predecessor to seal
  `holdoutUsedForDevelopmentSelection: false`; its selected development record
  must match the first qualified ranking survivor and skill digest. Its normal
  breeding plan must be non-diagnostic and chain-eligible, with an
  `operatorCount` equal to the length of its unique operator list. Every planned
  operator must carry an `exact-text-v1` instruction contract whose digest
  matches the sealed instruction, and the successor must use that text exactly.
- Bind every successful `development-chain` predecessor to a canonical opaque
  schema-v2 holdout declaration and its digest. Canonicalize the raw
  `jobConfig` and `jobDirectory` path strings lexically relative to the
  generation config; do not resolve symlinks, require existence, inspect, or
  load either target. A successor must present the same baseline ID/reference,
  ID-free candidate-slot reference, and promotion policy. Its development
  winner ID may change. Only `full` requires the raw holdout candidate ID to
  equal the current winner, immediately before resolving the frozen candidate
  slot. The full log seals `holdoutReleaseBinding` with that ID and skill
  digest, the declaration/slot digests, and the observed candidate holdout
  job/result/trial identity. Development logs must omit this binding. Legacy
  candidate-bound declaration v1 logs fail closed as predecessors.
- Treat any analyze-only legacy skill basename as exploratory evidence. Keep it
  available for ranking, trace diagnosis, operator credit, and breeding, but
  never mark its identity promotion-eligible or promote it on holdout.
- Preserve native Harbor job directories. Live execution refuses an existing
  job destination instead of resuming or deleting it.
- Keep operator text general and free of benchmark answers or holdout facts.
- Configure `operatorSurvivors` to at least two, and set `nextOperatorCount`
  greater than or equal to it. Full breeding requires that many eligible
  operators; plain `development` may seal a winner without breeding when the
  observed population falls short, while `development-chain` fails closed.

## Output

The output directory contains deterministic JSON strategy artifacts plus a
concise `report.md`. A normal full run writes ranking, breeding, holdout, and
sealed coevolution artifacts and explicitly marks the log as a chain-eligible
full phase with an opened holdout and Boolean promotion decision.
Development-only output records an unopened
holdout. Plain `development` seals the selected candidate/digest with
`chainEligible: false`; successful `development-chain` seals the same
development evidence with `chainEligible: true` in the generation log while
the unopened holdout artifact remains non-chainable. Its evolution profile
contains `holdoutDeclaration` and `holdoutDeclarationDigest`; these commit the
future release identity without observing the referenced jobs.
If the candidate winner exists but the operator population is insufficient,
its breeding plan is diagnostic, empty, and non-chainable.
An all-unqualified opt-in run additionally writes `repair-plan.json`, whose
flags explicitly deny fitness, credit, survival, promotion, and holdout use.
Native Harbor jobs remain at the destinations declared by their job configs.
The report-only executable writes the same core evidence/ranking filenames but
marks them `reportOnly: true`, empties all survivor and breeding outputs, and
keeps holdout unopened. It is suitable for a sanitized terminal `stopped`
publication, never as a predecessor generation.

## Validate the Copied Bundle

These checks use only the copied bundle and its declared runtime dependencies:

~~~powershell
python -m py_compile <skill-root>/scripts/harbor_operator_coevolution.py
uv run <skill-root>/scripts/harbor_operator_coevolution.py --help
~~~
