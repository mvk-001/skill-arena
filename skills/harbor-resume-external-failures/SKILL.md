---
name: harbor-resume-external-failures
description: Safely retry only verified external failures from Harbor 0.18.0 jobs, or apply an explicitly versioned verifier-only recovery after a proven completed-agent/pre-verifier infrastructure failure, with fail-closed evidence classification, immutable call caps, exact task/agent/environment/skill provenance, first-evaluable lineage merging, and model-valid effective jobs for downstream evolvers. Use when a Harbor evaluation contains provider, infrastructure, evaluator, authentication, or environment failures and semantic outcomes must never be rerun or cherry-picked.
---

# Harbor Resume External Failures

Use the bundled script to inspect completed Harbor jobs and create fresh jobs only for trials whose external failure is proven by verifier-owned structured diagnostics or an exact allowlisted exception type/code. The workflow never resumes or deletes a job, never treats a missing reward as sufficient evidence, and never retries semantic failures, context limits, agent timeouts, budget exhaustion, or candidate-caused cancellation.

## Workflow

1. Read [the configuration and artifact contract](references/contract.md).
2. Create a JSON or YAML config with immutable source jobs, output directory, reward key, conservative `requiredEnv` and `requiredPaths`, and `policy.maxExternalRetriesPerTrial`. Authentication/environment entries additionally require `remediationType`, `evidencePath`, and the exact `remediationEvidenceSha256`; evidence contents are never copied. An incomplete or cancelled root is denied unless `policy.optInFailureContracts` names one implemented exact contract. The only current contract is `harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1`; it fixes the cap at one and requires an infrastructure remediation attestation plus live preflight.
3. Run doctor and dry-run first. Both are read-only and execute no preflight or Harbor calls. Doctor prints contract validity plus eligible/excluded counts; dry-run prints the full plan to stdout. Neither mode creates the output directory or persists `resume-plan.json`:

   ```bash
   uv run scripts/resume_external_failures.py resume-config.yaml --doctor
   uv run scripts/resume_external_failures.py resume-config.yaml --dry-run
   ```

4. Inspect every trial's `eligible`, `reason`, `evidence`, `provenanceError`, and planned destination. Expect zero eligibility when evidence conflicts or provenance is incomplete.
5. Run without a mode flag to execute. Authentication and environment failures additionally require a verified remediation evidence digest and successful preflight. A sibling O_EXCL operation lock permits one writer; an active or stale lock fails closed. The script persists a sealed cap-consuming reservation before creating the attempt directory, staging a skill, writing a retry config, or calling Harbor.

   ```bash
   uv run scripts/resume_external_failures.py resume-config.yaml
   ```

6. To recover a retry job left complete by a live engine process that exited after its Harbor call began, list the engine-reserved job in `retryJobs` and use:

   ```bash
   uv run scripts/resume_external_failures.py resume-config.yaml --analyze-only
   ```

   `retryJobs` is recovery input, not a general import or cherry-pick mechanism. The exact final ledger entry must already be a `reserved`, `mode: live` attempt for the same policy, contract, source lineage, and engine-fixed attempt paths; its sealed lifecycle must contain both `configured-before-harbor-call` and `harbor-call-starting`. Analyze-only then verifies the complete retry job and replaces only that reservation. An arbitrary completed job, an unreserved attempt, or a different path is rejected before merge. An empty `retryJobs` list is valid: the first analyze-only run persists the audit/merge and materializes only complete trusted sources. Repeating the same empty import against complete outputs is verified and byte-idempotent. Analyze-only rejects any attempt after the first evaluable retry.

7. If a sealed attempt proves that the agent completed but Harbor failed in its own artifact collection before the verifier started, do not repeat the agent. Read [the verifier-only recovery contract](references/verifier-only-recovery.md). This path is available only for an exact, reviewed, versioned failure shape; it makes zero Harbor/model calls, runs the deterministic verifier exactly twice from one sealed snapshot, and publishes an append-only derived recovery. Run its sealed wrapper with `--doctor` and `--dry-run` before live execution; the wrapper uses the sealed dependency lock with `uv run --offline --frozen`.
8. If that sealed verifier journal reached `completed` but V1 failed later while materializing derived artifacts, do not replay either verifier. Read [the append-only V2 derivation contract](references/verifier-only-derivation-v2.md). V2 accepts only the exact omission of Harbor's `TaskConfig.overwrite: false` default, preserves the entire V1 work tree as evidence, reconstructs from native and sealed run inputs, and adds zero Harbor, agent, model, or verifier calls. Its downstream q003 publisher fsyncs a UUID-owned complete tree and commits it atomically without replacement to one fixed namespace.

## Interpret outputs

- Live and analyze-only persist `resume-plan.json`; doctor and dry-run do not. The plan records config-order source indexes/names/labels, candidate/trial/task IDs, source and nested-diagnostic checksums, classifications, reasons, policy digest, cap state, and planned/created jobs.
- `resume-lock.json` is the persistent contract and sealed attempt lifecycle ledger. A live attempt records a durable reservation, its exact generated config, and a `harbor-call-starting` receipt immediately before the one Harbor call. Never edit or replace the ledger to obtain more retries. A lingering sibling `.OUTPUT.resume-operation.lock` means a prior writer may have crashed; audit it rather than deleting it automatically.
- Every attempt links the new job to the parent job/trial and seals the parent TrialResult, source job, task, candidate skill, evaluation profile, failure-contract, and remediation-attestation digests.
- `merged-result.json` preserves original and retry lineage, separates `unresolvedRetryableExternal` from `nonRetryableUnavailable`, and selects the first evaluable retry in attempt order—never the highest reward.
- `effective-jobs/<source>/effective-job/` is emitted only when every source trial has an effective result. It is built and fully verified in a private sibling directory, then published with one atomic rename as a complete Harbor job consumable by existing evolvers in analyze-only mode.
- Each effective job contains `resume-manifest.json`, which seals source/retry lineage, the selected retry artifact digest, every derived file checksum, and `trial_uri` values that name only the final published directory (never the private build path).
- `report.md` summarizes classifications, exclusions, attempts, and unresolved external outcomes.

Treat a null unresolved reward as unresolved. Do not substitute a reported zero from an external failure, and do not materialize or pass an incomplete effective job downstream.

## Safety rules

- Keep Harbor pinned to `0.18.0` and run with Python 3.12 or newer.
- Never generalize verifier-only recovery from an exception message alone. It
  requires the exact native job and directory manifests, matching exception
  artifact and traceback, complete terminal Pi trace and token reconstruction,
  full task tree, null verifier fields, immutable image ID, and an unconsumed
  versioned recovery journal.
- Keep `CancelledError` non-retryable by default. The narrow pre-agent SIGTERM contract additionally requires the exact cancelled root counters, null job tokens/cost, null agent execution/result and verifier execution/result, Harbor's `_handle_sigterm` stack during Pi installation, matching exception/log artifacts, and a failed-and-absent Pi trajectory. One missing or conflicting predicate rejects the whole root before preflight or `Job.create`.
- Accept only canonical skill identity: `SKILL.md` frontmatter name, directory basename, config source, and lock name/source/digest must agree.
- Reject source drift anywhere in the complete Harbor job tree, missing/legacy locks, non-finite numbers, path escape, symlinks, junctions, and reparse points.
- Preserve the Harbor result task checksum, locked task content digest, task selection, full agent profile (including all kwargs, hosts, MCP servers, and env), environment/verifier signatures, Harbor retry policy, and every inherited JobConfig/TrialConfig execution field. Full normalized retry JobConfig and TrialConfig equality permits changes only to engine-generated identity, destination/isolation, and the staged canonical skill source.
- Treat only exact numeric zero rewards/gates as audit placeholders when a single structured external domain exists and no semantic or unknown diagnostic conflicts. Any nonzero reward conflicts with an external classification; otherwise failed gates are semantic and never retried.
- A provider label alone is insufficient. Provider retries require an exact transient rate-limit or HTTP/service-unavailable signal; context limits and timeouts remain absolute denials.
- Combine signals from root and step verifier diagnostic trees. Any denylisted signal, multiple domains, or semantic diagnostic conflict blocks the retry.
- If a policy/source contract or existing destination differs, stop. Never repair it in place.
- Doctor only checks host environment-name presence, required-path existence/link safety, and declarations. It does not prove credential authority, container-visible bind mounts, provider reachability, quota, or remediation preflights; inspect its `readyForLive`, `liveReadiness`, and `hostInputVerification` fields.
