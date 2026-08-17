---
name: harbor-trace-distillation
description: Distill completed Harbor job and trial artifacts into an evidence-cited skill update, validate the candidate on the discovery cohort, then gate it on separate Harbor holdout evidence. Use when Codex needs to normalize Harbor rewards, errors, ATIF trajectories, agent logs, and verifier output; consolidate recurring lessons directly from Harbor; execute optional Harbor discovery, candidate-development, or holdout jobs; or audit that every accepted skill patch has diverse trial and task support.
---

# Harbor Trace Distillation

Use Harbor 0.18.0 as the execution and evidence surface. Keep discovery,
candidate development, and holdout roles explicit, preserve raw Harbor
artifacts, and change only the copied candidate bundle.

Runtime: use uv and Python 3.12 or newer. In commands, `<skill-root>` means
this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Evolution/validation boundary

Before starting distillation, freeze the discovery/development dataset used to
author and check the candidate and a separate optimizer-invisible validation
dataset. Plan the validation stage before evolution starts. In schema 2, the
configured `holdout` inputs normally serve as this bundle's independent
validation dataset; candidate development is a replay gate over evolution
cases and does not satisfy that independence. A study may reserve an additional
holdout after validation.

Freeze and digest-bind the materialized candidate before opening validation.
Never use validation rewards, task identities, diagnostics, or trajectories as
new proposal evidence in the same run. If validation rejects the candidate,
preserve the result; another unbiased attempt requires a new study with fresh
validation.

## Workflow

1. Read
   [references/harbor-trace-contract.md](references/harbor-trace-contract.md)
   before authoring a run.
2. Freeze the baseline skill, Harbor tasks, reward key, pass threshold, any
   non-compensating required reward thresholds, agent, model, and environment.
   Put task answers only in verifiers.
3. Gather completed discovery jobs or trials. Keep holdout paths out of all
   diagnoses and proposals.
4. Validate the plan without creating output or running Harbor:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --dry-run
~~~

5. Check declared credentials and Docker-backed pre-release job configs without
   model calls. Under schema 2, holdout JobConfigs remain deferred until the
   candidate-development gate passes:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --doctor
~~~

6. Import discovery artifacts and evaluate any supplied proposal JSON without
   executing configured jobs or reading candidate-development or holdout
   inputs:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --analyze-only
~~~

   Analyze-only never authors diagnoses or patch text. With an empty proposal
   file, it deliberately produces an unchanged candidate.
7. Add agent-authored diagnoses and patch operations to the proposal JSON.
   Every proposal must cite discovery evidence IDs and target only the skill
   bundle. Reward or error state can identify a weak case, but does not alone
   establish the cause or a safe edit. If bounded trajectory, output, log, or
   verifier evidence does not support a diagnosis, keep the candidate
   unchanged. Re-run analyze-only until the accepted set is coherent.
8. For a promotion-capable run, use config `schemaVersion: 2`. Declare native
   candidate-development artifacts or JobConfigs over the same cases as
   discovery and an explicit minimum pass rate. The runner freezes the
   materialized candidate digest, validates the candidate with metric-only
   evidence, and opens holdout only after that gate passes. Then run:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml>
~~~

9. Inspect `trace-pool.json`, `proposal-state.json`, `consolidation.json`, the
   staged `baseline/skills/<name>/` and `candidate/skills/<name>/` bundles,
   `development-gate.json`, `holdout-gate.json`, and `report.md`. Promote only
   when candidate development passes, the holdout decision is `promote`, and
   ordinary skill validation still passes. The script never overwrites the
   source skill.

## Rules

- Require at least two unique trial IDs and two unique task checksums for every
  accepted patch. Repeated attempts on one task increase trial support, never
  task diversity. The script rejects lower configured thresholds.
- Treat Harbor exceptions as errors. Treat a completed non-error trial with no
  numeric configured primary reward as a non-evaluable evaluator failure, not
  a zero-reward failure. It is ineligible proposal evidence and makes a holdout
  decision `not-evaluable`.
- If present, read bounded classification fields from
  trial- and step-scoped `verifier/diagnostics.json` files. Aggregate every
  classified diagnostic for the trial. A diagnostic classified to the provider or
  infrastructure domain makes that trial non-evaluable: preserve the verifier's
  reported reward for audit, but expose the semantic reward as null. Do not
  require diagnostics from verifiers that do not produce them, and keep Harbor
  exceptions classified as errors. Classify these diagnostics before testing
  primary-reward availability so a provider failure that emitted no reward is
  not mislabeled as an evaluator failure.
- Treat `provider-context-limit` or `context_length_exceeded` as actionable only
  for an `execution-efficiency/context-budget` proposal. Require the ordinary
  two-trial and two-task-checksum support before accepting that operational
  patch. Context-budget evidence cannot support a semantic-improvement domain.
  Quota, rate-limit, authentication, environment, and other external failures
  remain ineligible patch evidence. A context-limit signal is actionable only
  when every classified diagnostic for that trial is a provider context-budget
  failure; any mixed external domain keeps the trial non-actionable.
- Configure `harbor.requiredRewards` when verifier metrics are qualification
  gates rather than compensating fitness terms. Every trial must report every
  required metric at or above its finite threshold. Missing values remain null,
  and missing or below-threshold values are reported with distinct reasons.
- Use bounded, redacted ATIF messages, agent logs, verifier stdout, and verifier
  stderr for discovery feedback. Preserve raw artifacts by path instead of
  copying them into prompts or reports.
- Accept only patches whose cited evidence is in the discovery pool. Reject
  unknown or holdout evidence, path traversal, out-of-bundle targets, thin
  support, and losing members of a conflict group.
- Require the baseline bundle root and every materialized bundle to be
  self-contained. Reject a root that is itself a symbolic link, junction, or
  other filesystem reparse point as well as links nested inside the bundle;
  resolve every proposal destination inside the copied candidate bundle.
- Config schema 1 remains the legacy direct discovery-to-holdout contract and
  cannot contain a `development` block. Config schema 2 requires candidate
  development and fails closed before holdout. This version boundary prevents
  an older runner from silently ignoring the new gate.
- Candidate development must reuse the exact discovery task/checksum,
  agent/version/model, attempt, TrialConfig, artifact-config, and TrialLock
  multisets while locking the frozen candidate digest instead of the baseline
  digest. It must nevertheless consist of physically and evidentially new
  attempts: job directories and IDs, evidence IDs, trial UUIDs/names/URIs,
  result and lock paths, raw result artifacts, and label-independent attempt
  fingerprints must be disjoint from discovery. Copying or relabeling discovery
  artifacts is not candidate validation. Weak fairness is never accepted for
  this phase.
- Under schema 2, every supplied or executed discovery, candidate-development,
  baseline-holdout, and candidate-holdout JobConfig must use Harbor built-in
  `max_retries: 0`. Imported evidence must be a whole job artifact whose root
  JobLock records every retry field, matches the JobConfig retry policy, and
  reports zero actual retries. Paired phases require matching canonical retry
  digest multisets. A lone trial artifact cannot prove this contract. Holdout
  retry inputs remain unopened until candidate development passes.
- Keep candidate-development normalization metric-only and outside the trace
  pool and proposal state. Do not use the candidate's reevaluation as another
  patch opportunity inside the same run.
- Treat the post-freeze holdout phase as independent validation when it is the
  first optimizer-invisible cohort. Do not feed its result back into proposal
  authoring, consolidation, or candidate development.
- A candidate passes development only when every trial is evaluable and
  qualified, no trial errors, every required reward is present and at or above
  threshold, and the primary-reward pass rate meets the configured minimum. A
  provider/infrastructure or missing-primary-reward outcome makes the aggregate
  pass rate null and the gate `not-evaluable`.
- Do not expose holdout rewards, task names, trajectories, verifier output, or
  errors to the distillation stage. In schema 2, holdout artifacts and
  JobConfigs, including their retry policies, are read only after the frozen
  candidate passes development.
- Require matching task checksums, attempts, agent/version/model cells, and
  replay settings for holdout comparison. Missing locks require an explicit
  weak-fairness opt-in and are reported as a limitation.
- Compare lock, TrialConfig, and artifact signatures as sorted multisets, not
  sets. Repeated signatures retain their multiplicity, so `A,A,B` cannot pass
  as equivalent to `A,B,B`.
- Require holdout to be disjoint from both baseline discovery and candidate
  development by task name and checksum, and require the exact development
  agent/version/model profile on holdout.
- Promotion always requires every discovery trial to have canonical verified
  lock provenance. `requireDiscoveryLocks: false` keeps older unlocked evidence
  inspectable in analyze-only mode; it does not make that evidence promotable.
- Require `SKILL.md` frontmatter `name` to be an exact portable lowercase
  basename. Stage every live baseline and candidate job-config bundle at
  `<output>/<role>/skills/<name>` so Harbor's physical basename matches its
  logical name. Locked live artifacts must use that exact name as both lock
  name and source basename. Analyze-only may import legacy discovery locks that
  used a physical alias, but marks that evidence and its consolidation
  non-promotable; live discovery and every holdout reject such aliases.
- Do not promote a candidate when any candidate holdout trial errors or fails a
  required reward gate, or when either holdout side omits a required metric.
  With an empty `requiredRewards` mapping, no additional verifier metrics are
  required.
- Require finite numeric `harbor.passThreshold`, holdout `minimumMeanGain`,
  primary rewards, and required-reward thresholds. Reject NaN and infinities
  before scoring or serializing artifacts.
- Mark the holdout `not-evaluable` rather than treating a missing primary
  reward or provider/infrastructure failure as semantic reward zero. Keep
  unaffected side means visible and report the affected mean and gain as null.
- Use new output and Harbor job names. Do not resume a job against changed
  skill content.

## Validation

After editing this bundle, run:

~~~powershell
python -m py_compile <skill-root>/scripts/distill_harbor_traces.py
uv run <skill-root>/scripts/distill_harbor_traces.py --help
~~~
