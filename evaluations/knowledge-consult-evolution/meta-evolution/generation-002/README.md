# Harbor operator meta-evolution: generation 002

Generation 002 evaluates two independent realizations of
`explicit-floor-terminal-finalize` on q003. It reuses the exact completed
generation-001 baseline record as the parent. There is no new baseline Harbor
configuration and no baseline model call in this generation.

The machine-readable seal is [`protocol.json`](protocol.json). It pins the
Knowledge commit, parent bundle, generation-001 publication, preparation
receipt, completed baseline job config/lock/result/trial, q003 checksum, frozen
profile, external pre-agent remediation receipt, operator instruction, both
child manifests and bytewise bundle digests, required gates, and cumulative
call budget.

## Evidence boundary

Preparation reads only:

- the clean commit-pinned Knowledge baseline and read-only reference bundle;
- the already prepared q003 task and canonical baseline artifacts from
  generation 001, plus the sealed diagnostic-only operator log as provenance;
  and
- the two tracked generation-002 child bundles and lineage manifests.

It does not enumerate, copy, or read q007, q018, q024, q030, holdout, hard,
qrels, private tests, or solutions from any later stage. Future task IDs in the
protocol are orchestration labels only. Validation material may be
materialized only after the q003 development gate passes.

The reused q003 `environment/` directory is checked on every prepare/verify:
it must still exist as a real directory and remain empty. Generation 002 points
both child configs at the sealed generation-001 q003 tree instead of copying
task material.

## Prepare without model calls

From the Skill Arena repository root:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/prepare-generation-002.js prepare
node evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/prepare-generation-002.js verify
```

The immutable output is
`.tmp/knowledge-consult-evolution/meta-evolution/generation-002/prepared`:

```text
inputs/
  explicit-floor-terminal-finalize/consult-semantic-okf/
  canonical-floor-terminal-finalize/consult-semantic-okf/
parent-evidence/
  baseline-record.json
  external-remediation-receipt.json
  generation-001-diagnostic-operator-provenance.json
configs/harbor/q003/
  explicit-floor-terminal-finalize.yaml
  canonical-floor-terminal-finalize.yaml
configs/operator/generation-002.yaml
run-q003-same-session.sh
receipt.json
```

Preparation is fail-closed and byte-idempotent. An existing prepared tree is
verified, never replaced. It rejects source, profile, parent-job, task,
manifest, lineage, or digest drift; duplicate child trees; task identifiers in
the child bundles; a missing/non-empty q003 `environment/`; any baseline YAML;
and any copied baseline or task tree.

## Execute exactly two fresh q003 trials

The generated wrapper first parses the selected `auth.json` without printing
any values. Its top-level `openai-codex` entry must be an object with non-empty
string fields `type`, `access`, `refresh`, and `accountId`, plus a finite numeric
`expires`. It copies only that file—never the containing Pi directory—into a
clean bind that must contain exactly `auth.json`; `settings.json` and any
case-insensitive recursive `shellPath` key are forbidden. It then validates
the bind and runtime, runs both children in the same WSL shell session, and
removes the bind on exit. Review the receipt,
then pass either the Pi `auth.json` or its containing Pi auth directory as the
only argument:

```powershell
wsl -e bash -lc 'bash /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-002/prepared/run-q003-same-session.sh /mnt/c/Users/villa/.pi/agent'
```

Before Harbor, the wrapper uses the already-local
`semantic-okf-harbor-runtime:1.0` image and its pinned image ID with
`--pull never --network none --entrypoint /bin/bash`. It proves `bash -lc`,
Python, both candidate compiler imports (`--help`), `/tmp`, and the clean Pi
bind all work inside that exact image; it also creates and removes one sentinel
in the bind. A failed preflight exits before any model call. The wrapper then uses
Harbor 0.18.0, one attempt per child, and `max_retries: 0`. `/knowledge` is
read-only. The authentication bind is writable only for the duration of that
one shell session so Pi can persist a refreshed session. Do not invoke either
YAML separately with a pre-existing stale auth bind.

The Windows Codex auth file at `C:/Users/villa/.codex/auth.json` is not a valid
source for this Pi profile because it lacks the complete provider credential
shape. The wrapper rejects missing, scalar, incomplete, empty, or non-finite
entries before Docker or Harbor. It also rejects
pre-existing canonical child job directories, so failed attempts cannot be
overwritten accidentally.

### Preserve the two pre-model authentication failures

If the earlier invalid auth source has already produced the two zero-token
jobs, preserve them before the corrected run:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/record-auth-remediation.js record
node evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/record-auth-remediation.js verify
```

The recorder verifies the same candidate/task/profile locks used by the
publisher, requires `NonZeroAgentExitCodeError`, the native Pi missing-provider
message, and exactly `0/0/0` tokens for both attempts, then atomically moves
each immutable job tree to an `.external-auth-source-001` name. Its receipt
contains hashes and call accounting only. It does not copy error text, read or
invent verifier diagnostics, award operator credit, or make the attempts
eligible for `harbor-resume-external-failures`; the available native evidence
is unstructured and therefore insufficient for that skill's allowlist.

The external pre-agent generation-001 baseline remediation is provenance, not
a model call: its receipt attests that the candidate, task, and profile did not
change and that the failed environment start consumed zero calls.

## Analyze development only

The operator config contains one reused parent plus the two fresh children.
Both children have the same operator ID, giving two trials; the control
operator intentionally has no children. Holdout paths are invalid unopened
sentinels required only by the schema.

This is an independent generation-zero development receipt with its own
evolution ID. The generation-001 operator log is `diagnosticOnly:true` and
`chainEligible:false`, so its digest, seal, profile digest, and unopened
holdout state are verified only as provenance. It is never supplied as
`evolution.previousGenerationLog` and contributes neither fitness nor operator
credit.

```powershell
wsl -e uv run --script /mnt/c/Users/villa/dev/skill-arena/skills/harbor-operator-coevolution/scripts/harbor_operator_coevolution.py /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-002/prepared/configs/operator/generation-002.yaml --analyze-only --phase development --output-dir /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-002/operator-analysis/generation-002
```

Never omit `--phase development`. This stage must not resolve or open holdout
paths and cannot promote a candidate.

## Publish sanitized q003 evidence

After both fresh jobs finish:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/publish-generation-002.js q003
```

The publisher re-verifies all parent and child provenance. It emits only the
primary metric, required gate values, qualification state, token counts,
cryptographic provenance, and call accounting. Model text and private
evaluation material are never projected.

The development gate passes only when the reused parent and both children are
evaluable, at least one child is exactly `1/1/1` on
`evidence_contract_gate`, `minimum_document_gate`, and
`mechanical_qualification_gate`, and that child's hard-gated effective fitness
is strictly above the exact parent's. Otherwise the process stops without
materializing validation tasks.

## Cumulative budget

| Evidence stage | Fresh calls | Cumulative maximum | Condition |
| --- | ---: | ---: | --- |
| generation-001 q003 | 3 | 3 | already completed |
| external pre-agent remediation receipt | 0 | 3 | provenance only |
| generation-002 q003 children | 2 | 5 | current development gate |
| first validation | 2 | 7 | only after a generation-002 win |
| remaining smoke | 6 | 13 | only after first validation passes |

Harbor retries remain zero throughout. The exact generation-001 baseline is
not charged again in generation 002.
