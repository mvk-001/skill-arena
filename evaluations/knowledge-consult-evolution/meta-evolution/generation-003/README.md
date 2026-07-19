# Harbor operator meta-evolution: generation 003

Generation 003 compares exactly three native q003 evaluations under the same
generation-003 Harbor profile and authentication mount:

1. one fresh baseline;
2. the preserved successful extractive child job; and
3. the first evaluable retry of the interrupted contrast child, exposed only
   through its sealed `effective-job`.

Generation 001 supplies the baseline skill tree, q003 task, and diagnostic
lineage only. Its result, fitness, and operator credit are not imported.
Generation 002 supplies generic diagnostic lessons only; none of its jobs,
fitness, model output, parentage, or operator credit enters the comparison.

[`protocol.json`](protocol.json) is sealed to the candidates, lineage, exact
profile, evidence modes, retry cap, and accounting. Preparation and publication
are model-free.

## Immutable roots and the v2 overlay

The original
`.tmp/knowledge-consult-evolution/meta-evolution/generation-003/prepared`
directory is the schema-1 payload already bound by the external-resume
attestation. It remains byte-for-byte unchanged.

The schema-2 analysis overlay is written separately to `prepared-v2`. It adds
the fresh baseline input/config, three-cell comparison policy, a baseline-only
wrapper, and a receipt. The preserved child configs continue to point at the
schema-1 child bundles so their native jobs remain exactly verifiable.

From the Skill Arena root:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js prepare
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js verify
```

These commands neither call Harbor nor invoke a model. Repeated preparation
verifies both roots and refuses drift.

## Private authentication seal

Before any continuation, seal the exact current `auth.json` payload privately:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js seal-auth --auth-source C:\Users\villa\.pi\agent\auth.json
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js verify-auth-source --auth-source C:\Users\villa\.pi\agent\auth.json
```

The seal binds the payload bytes, mtime, structural shape, historical clean-Pi
wrapper, and both original child job roots. Credential contents and
credential-derived metadata are never printed or published. Any payload drift
stops before Harbor.

## Selective contrast continuation

Only the interrupted contrast trial is retry-eligible. The separate
generation-003 external-resume v2 case must classify the original root through
the exact
`harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1` contract,
verify its private remediation attestation, reserve attempt 1, and make at most
one Harbor call. The successful extractive job is outside the retry engine and
is never rerun.

The continuation is acceptable only when its append-only ledger selects retry
attempt 1 as the first evaluable result and materializes exactly one contrast
`effective-job` under
`.tmp/knowledge-consult-evolution/meta-evolution/generation-003/resume/q003/contrast-matrix-one-shot-answer`.

Verify that evidence without calling Harbor or a model:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003.js verify-resume
```

The verifier rejects a semantic failure contract, a second attempt, best-of
selection, source-job drift, manifest drift, link escapes, or an effective job
whose config and lock are not exact copies of the immutable contrast original.

## Fresh baseline after the retry

The fresh baseline is deliberately a separate one-call stage. Its wrapper
first verifies the complete contrast effective job and the current auth payload,
then performs the exact-image offline preflight, and only then invokes Harbor
once:

```powershell
wsl -e bash -lc 'bash /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003/prepared-v2/run-q003-baseline-clean-pi.sh /mnt/c/Users/villa/.pi/agent/auth.json'
```

The wrapper refuses to overwrite an existing baseline job. It projects only
`auth.json`, pins `semantic-okf-harbor-runtime:1.0` by image ID, uses
`--pull never` and `--network none`, and leaves Harbor retries at zero.

## Publish and analyze

After the effective contrast retry and fresh baseline both exist:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003.js q003
```

Publication verifies all three native configs, locks, task checksums, distinct
skill identities, exact normalized generation-003 profiles, the auth seal, and
the complete resume lineage. It emits only allowlisted metrics, gates, token
counts, accounting, policy fields, and cryptographic provenance. Private model
text and evaluator material are not projected.

Only then is the resolved generation-0 operator input materialized under
`operator-inputs/generation-003`. It binds the fresh baseline, preserved
extractive job, and manifested contrast effective job. Holdout paths remain
unopened until a separately sealed validation stage is authorized.

Completed accounting is fixed at four generation-003 Harbor invocations and
three model executions: extractive success, interrupted contrast, contrast
retry, and fresh baseline. Including generations 001 and 002, historical
accounting is nine Harbor invocations and eight model executions.
