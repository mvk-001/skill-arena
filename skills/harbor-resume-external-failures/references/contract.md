# External retry contract

## Configuration

The configuration is strict; unknown keys are rejected.

```yaml
schemaVersion: 1
sourceJobs:
  - jobDirectory: /absolute/path/to/completed-harbor-job
    candidateId: candidate-00
    label: Baseline candidate
outputDirectory: /absolute/path/to/new-external-retry-output
rewardKey: reward
requiredEnv:
  - PROVIDER_API_KEY
requiredPaths:
  - /absolute/path/to/required-host-bundle
policy:
  maxExternalRetriesPerTrial: 1
  optInFailureContracts:
    - harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1
remediation:
  authentication:
    attested: true
    remediationType: credential-rotation
    evidencePath: /absolute/path/to/non-secret-remediation-record.json
    remediationEvidenceSha256: sha256:<64-lowercase-hex>
    preflightCommand: [python, -c, "import os; assert os.environ.get('PROVIDER_API_KEY')"]
  environment:
    attested: true
    remediationType: docker-daemon-restart
    evidencePath: /absolute/path/to/non-secret-remediation-record.json
    remediationEvidenceSha256: sha256:<64-lowercase-hex>
    preflightCommand: [docker, info]
  infrastructure:
    attested: true
    remediationType: operator-interruption-cleared
    evidencePath: /absolute/path/to/non-secret-continuation-attestation.json
    remediationEvidenceSha256: sha256:<64-lowercase-hex>
    preflightCommand: [bash, /absolute/path/to/domain-preflight.sh]
retryJobs:
  - sourceTrialKey: sha256:...
    attempt: 1
    jobDirectory: /absolute/path/to/completed-retry-job
```

`remediation` is needed for authentication/environment classifications and for any opt-in failure contract that declares it. `infrastructure` remediation is accepted only with the currently supported pre-agent SIGTERM contract. Each evidence file must be a real non-linked regular file whose digest exactly matches the declaration. Its path, type, digest, and derived `remediationAttestationDigest` are sealed; its contents are not copied. Keep secret values out of evidence files, path names, and preflight arguments. If a domain adapter must bind an authentication file, keep its content hash and file metadata in the private remediation evidence and expose only the evidence and attestation digests in sanitized publication.

`retryJobs` is consumed only by `--analyze-only` and can recover only the exact last reservation created by this engine in live mode. The reservation must bind the current policy/contract digests, source-attempt lineage, fixed attempt root, fixed Harbor job directory, fixed retry config path, and any required sealed remediation preflight. Its lifecycle must already contain `durable-before-files`, `configured-before-harbor-call`, and `harbor-call-starting`; the latter is persisted immediately before invoking Harbor. Analyze-only never creates a reservation and never accepts an arbitrary completed job. It verifies the job first, then atomically replaces that one reservation with the completed recovery record. Attempts remain contiguous, one-based, unique, no greater than the immutable maximum, and stop after the first evaluable result.

Each `sourceJobs` item may also be a path string. Use the mapping form when candidate identity or a human label is known; the plan preserves configuration order and reports `sourceJobIndex`, native job name, label, candidate/trial/task IDs, and the opaque hash only as `sourceTrialKey`.

Declare `requiredEnv` conservatively from the credential names required by the selected agent/provider plus environment and verifier integrations. Declare `requiredPaths` for host bundles, mounts, sockets, or files whose absence would make a retry non-comparable. The tool checks environment-name presence and host path existence/link safety only; it never records values and does not prove credential authority, container-visible bind mounts, provider reachability, quota, or service health. Doctor reports these limits explicitly, and authentication/environment preflights run only in live mode.

Doctor and dry-run print JSON to stdout and never create `outputDirectory`, execute preflights, or call Harbor. Live and analyze-only acquire a sibling O_EXCL operation lock before reading or writing persistent state; concurrent and stale locks fail closed. Live and analyze-only persist `resume-plan.json`, `resume-lock.json`, `merged-result.json`, and `report.md`. Analyze-only with an empty `retryJobs` list is a valid audit/merge no-op: the first run may persist/materialize trusted originals, while subsequent identical no-op runs recompute the merge from the verified ledger, verify every effective job and its lineage, and leave all bytes unchanged.

## Opt-in interrupted-root contract

Completed Harbor roots remain the default requirement. `CancelledError` alone never establishes eligibility. The only accepted interrupted-root opt-in is:

`harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1`

It requires `maxExternalRetriesPerTrial: 1` and all of these native predicates:

- one root trial; `finished_at: null`; completed=1, errored=1, cancelled=1, running=0, pending=0, Harbor retries=0;
- root input/cache/output tokens and cost explicitly null; one eval stats row with zero evaluated trials, one error, and `CancelledError` naming that exact trial;
- completed environment and agent-setup timings, but explicit null `agent_execution`, `agent_result`, `verifier`, `verifier_result`, and `step_results`;
- exact `CancelledError` with an empty native message and a Harbor 0.18.0 traceback through CLI `_handle_sigterm`, `_prepare`, `_setup_agent`, and Pi `install`, ending in `asyncio.exceptions.CancelledError`, with no `_run_agent_phase` or `agent.run` frame;
- byte-identical `exception.txt` and traceback, identical job/trial logs, an empty verifier tree, no agent output files, and a native artifact manifest that records `/logs/agent/pi.txt` as failed while `artifacts/pi.jsonl` is absent; and
- the ordinary canonical task, agent, environment, verifier, retry-policy, and skill provenance checks.

The classifier seals the critical native artifact hashes and labels the failure `infrastructure`. A sealed infrastructure remediation attestation and successful live preflight are mandatory. A failed predicate rejects the incomplete root before preflight, output creation, reservation, or `Job.create`.

## Eligibility

Positive evidence is collected conservatively from every verifier-owned `verifier/**/diagnostics.json` and `steps/<step>/verifier/**/diagnostics.json`, or from:

- verifier-owned `verifier/diagnostics.json` with a structured allowlisted failure domain/status/outcome/code; or
- an exact allowlisted `exception_info.exception_type` or error code.

Allowed domains are authentication, environment, evaluator, infrastructure, and provider. Provider eligibility additionally requires an exact transient rate-limit, provider-unavailable, service-unavailable, API-overloaded, or HTTP-5xx structured signal (or the corresponding exact allowlisted exception type); `provider`/`provider-failure` alone is ambiguous. The allowlist and denylist are embedded in the script and sealed into `policyDigest`; messages are never searched for eligibility.

Every diagnostic path and checksum is sealed into the plan, lock, and source manifest. Signals from all scopes are combined: one denylisted signal, multiple external domains, or an external/semantic diagnostic conflict denies the trial.

Eligibility is always denied when any evidence indicates context length/window limits, agent timeout, token/budget exhaustion, or candidate-caused cancellation. It is also denied for a genuinely scored semantic response (a nonzero score, or a finite reward/gate without qualifying structured external evidence), invalid evidence/response, contract failure, ambiguous exception, missing reward without positive evidence, or any external/semantic diagnostic conflict. Exact zero audit placeholders are governed only by the narrow exception below.

Verifier rewards and numeric gates often contain placeholder zeros after a provider or infrastructure failure. A single structured external domain may take precedence only over exact numeric zero placeholders when no semantic, denylisted, unknown, or conflicting diagnostic signal exists; the values remain audit-only and the original semantic reward remains null. A nonzero reward conflicts with external evidence. Without structured external evidence, a finite reward or failed gate is a semantic outcome and is never retried.

Authentication/environment retries and remediation-requiring opt-in contracts require both `attested: true` and a successful preflight in live mode. Doctor and dry-run validate the declaration but execute nothing.

## Provenance verification

Every source and imported retry requires model-valid root `config.json`, `result.json`, and Harbor 0.18.0 `lock.json`, plus model-valid trial result/config and a canonical trial lock. By default, completion counts must agree and no trial may remain pending, running, or cancelled. The sole source-side exception is an explicitly enabled interrupted-root contract whose entire versioned terminal envelope matches; imported retry jobs must always be fully complete and uncancelled.

The verifier binds:

- the result task name and Harbor legacy directory checksum;
- the locked task name, Packager content digest, source, and path;
- the exact root `tasks` or `datasets` selection, side/embedded trial task config, and current task bundle bytes;
- task path in trial config/result/lock;
- every agent field across root/trial/lock/result (including complete kwargs, env, MCP servers, and allowed hosts), plus exact environment and verifier profiles;
- every inherited JobConfig/TrialConfig execution field, root JobConfig/JobLock retry policy, and the one-attempt, one-trial retry-job shape;
- one canonical skill name/source/digest across config and lock.

For a retry, complete normalized JobConfig and TrialConfig profiles are compared against the engine-derived expected documents. Normalization permits only engine-generated job/trial identity, destination/per-trial isolation, and the staged canonical skill source to differ. Unlisted or newly added Harbor fields therefore fail closed instead of escaping a partial allowlist. Equivalent `/mnt/<drive>/...` paths are translated only for host verification on Windows. This does not relax identity or digest checks.

## Persistent state and selection

`resume-lock.json` fixes the policy digest and a deterministic manifest of every regular file in each complete source or retry Harbor job tree. Source rows expose `taskChecksum`, `candidateSkillDigest`, `evaluationProfileDigest`, and `originalJobDigest`; completed attempts expose `retryJobDigest`, and authentication/environment rows expose `remediationAttestationDigest`. Any added, removed, or changed artifact, source edit, policy edit, reordered/changed profile, remediation evidence drift, or modified checksum is rejected.

One sibling O_EXCL writer lock serializes all mutating modes. Each live attempt appends a sealed `reserved` lifecycle event and atomically persists the ledger before creating its attempt directory, stages and seals the exact retry config, then persists `harbor-call-starting` immediately before invoking Harbor. Reserved, failed-setup, and failed-execution records consume the cap. An unresolved reservation without a complete verifiable job blocks further calls because whether the external call occurred cannot be disproved; only the exact reservation-recovery flow above may complete it. A stale writer lock is never removed automatically.

An imported or live retry is evaluable only when it produces a finite primary reward and a semantic terminal outcome. Retry attempts remain ordered. Merging selects the original semantic result or the first evaluable retry. Live mode makes no later call, and analyze-only rejects later imports, after that first evaluable result; higher rewards can never replace it.

## Effective Harbor jobs

For each source job, an `effective-job/` is materialized only if every trial selects an original semantic result or a first evaluable retry. The builder:

1. builds in a random private sibling directory and copies the source root config/lock and selected trial directories without links;
2. substitutes outcome artifacts only for externally failed trials while retaining the exact source task/profile/skill lock;
3. rebuilds Harbor `JobStats` from selected `TrialResult` models, including reward aggregates, token totals, cost, and exception counts;
4. validates `JobConfig`, `JobLock`, `JobResult`, every trial, completion counts, and provenance again;
5. rewrites every selected `TrialResult.trial_uri` to its final published directory, never the random private build directory;
6. writes `resume-manifest.json` with exact source/retry selection lineage, selected artifact digests, and checksums for every derived file; and
7. reconstructs the expected selection from the verified ledger, verifies the complete Harbor model, lineage, auxiliary artifacts, and manifest, then publishes the directory with one atomic rename.

If any trial remains unresolved, no complete effective job directory is created. Build failure removes the private temporary and never exposes a partial final directory. `merged-result.json` separately reports `unresolvedRetryableExternal` and `nonRetryableUnavailable`; `retryDomain` is the sole eligible domain, while `observedExternalDomains` preserves denied/conflicting observations. Pass only a manifested `effective-job/` as `jobDirectory` to downstream population, reflective Pareto, trace-distillation, or operator-coevolution analyze-only workflows.
