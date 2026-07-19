# ADR: Generation-003 Native Cohort and Attestation-Preserving Overlay

Date: 2026-07-18

## Status

Accepted

## Context

The generation-003 operator experiment initially treated the completed
generation-001 baseline as comparable fitness evidence. Its Harbor config used
a different ephemeral authentication mount source, and no retained artifact
could prove that the two mount payloads were byte-identical. Normalizing that
difference after execution would overstate comparability.

Generation 003 also has one successful extractive job and one contrast job
interrupted before agent execution. Rerunning the successful job would waste a
model call. Treating the interrupted job as semantic evidence, or choosing a
later/better retry, would bias selection.

The schema-1 generation-003 `prepared` root and its receipt are already bound by
a private external-remediation attestation. Replacing or moving that root would
invalidate the evidence intended to authorize the selective retry.

## Decision

- Treat generation 001 as task, tree, and diagnostic-lineage provenance only.
  Import none of its result, fitness, or operator credit into generation-003
  selection.
- Build the complete comparison cohort inside generation 003: one fresh
  baseline, the immutable successful extractive original, and the manifested
  first evaluable contrast retry.
- Require all three cells to use the exact native generation-003 Harbor profile,
  authentication mount source, task checksum, attempts, and retry policy. Do
  not normalize a generation-001 result into this cohort.
- Preserve the schema-1 `prepared` root, receipt, child configs, clean-Pi
  wrapper, and external-resume v1 attestation byte-for-byte. Keep the existing
  external-resume v1 case as zero-call diagnostic provenance.
- Materialize schema-2 preparation in a sibling `prepared-v2` overlay. Child
  configs continue to reference the preserved schema-1 child bundles; the
  fresh baseline and analysis inputs use the v2 overlay.
- Keep the contrast original immutable. Permit exactly one retry only after the
  exact versioned pre-agent external-failure contract and private remediation
  attestation pass. Select attempt 1 only if it is the first evaluable result,
  and consume it through a complete `resume-manifest.json` effective job.
- Keep the successful extractive original outside the retry engine.
- Seal the exact auth payload privately by bytes, mtime, structural shape,
  wrapper, and original job artifacts. Verify drift before both the contrast
  retry and fresh baseline. Never publish the payload digest or credential
  metadata.
- Run the fresh baseline only after the contrast effective job verifies. Use a
  separate wrapper containing exactly one Harbor call and refusing overwrite.
- Materialize operator-analysis input only after all three effective job roots
  and their exact comparison profile/lock verify.
- Fix completed generation-003 accounting at four Harbor invocations and three
  model executions. Fix cumulative historical accounting at nine Harbor
  invocations and eight model executions.

## Consequences

- Selection no longer depends on an unverifiable cross-generation auth-payload
  equivalence.
- The successful child saves one repeat model call, while the interrupted child
  receives no semantic extra attempt or best-of advantage.
- The original external-remediation attestation remains valid because its
  protocol and schema-1 prepared receipt do not move or change.
- Preparation, verification, evidence resolution, and publication remain
  model-free. Only the one contrast retry and one fresh baseline call remain.
- Publication can prove the exact three-cell cohort and retry lineage without
  exposing private credentials, model text, or evaluator material.
