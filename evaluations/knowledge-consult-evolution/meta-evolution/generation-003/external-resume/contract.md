# Generation 003 selective resume contract

This adapter delegates classification, immutable attempt reservation, new-job execution, and first-evaluable merging to `harbor-resume-external-failures`. It adds only generation-003 domain preparation.

## Fixed decision

- Preserve the completed `extractive-one-shot-answer` trial. Never generate a new job for it.
- Permit at most one new job for `contrast-matrix-one-shot-answer` under `harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1`.
- Require every native lifecycle, trace, token, artifact, task, profile, and skill predicate from the atomic skill. `CancelledError` alone is insufficient.
- Bind the retry to a private infrastructure-remediation attestation. The attestation seals the SHA-256, byte size, and nanosecond mtime of `/mnt/c/Users/villa/.pi/agent/auth.json` without copying its contents. Its mtime must precede the original live extractive job.
- Reject auth drift before staging and again after a timestamp-preserving copy into `/tmp/skill-arena-knowledge-consult-g003-auth`.
- Execute the image/auth/bash/Python/candidate-script/tmp/settings preflight before the generic engine reserves or calls Harbor.
- Keep the original cancelled job unchanged. A retry uses a new job name and output directory and links back to the parent trial and sealed native artifacts.

The prepared attestation and config live under ignored `.tmp/` because the attestation contains a private credential-derived hash. Sanitized publication may expose only `remediationEvidenceSha256` and `remediationAttestationDigest`, never the attestation contents or authentication metadata. `case-contract.json` and `case-contract-v2.json` preserve zero-call diagnostic preparations. `case-contract-v3.json` is the sole live-capable contract: it excludes extractive from the retry engine, aligns the final output path with the generation protocol, and seals the executable engine/adapter/wrapper plus generation resolver/publisher and both prepared receipts.

## No-call preparation

From the repository root:

```bash
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/resume-generation-003.mjs prepare
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/resume-generation-003.mjs doctor
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/resume-generation-003.mjs dry-run
```

`doctor` and `dry-run` require `externalCalls: 0` and `writes: 0` from the atomic engine. They must report exactly one eligible trial: contrast. The adapter stores their private results beside the config as `doctor.json` and `dry-run.json`.

Do not invoke the wrapper without explicit authorization for the single live recovery call. The live entrypoint is:

```bash
bash evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/run-generation-003-resume.sh
```

## Publisher integration

After a successful live recovery, read `.tmp/knowledge-consult-evolution/meta-evolution/generation-003/resume/q003/contrast-matrix-one-shot-answer/merged-result.json.effectiveJobs`. Resolve its sole entry by exact `sourceJob` rather than guessing the content-derived directory name:

- the contrast entry contains the first evaluable retry linked to the cancelled parent;
- extractive never enters the retry engine and remains the separately sealed original job.

The generation-003 publisher must verify the contrast `effectiveJobDigest` and `resume-manifest.json`. It may then combine that effective job with the separately sealed original extractive job and fresh generation-003 baseline. It must not read the private remediation evidence or fall back to the original cancelled contrast root.
