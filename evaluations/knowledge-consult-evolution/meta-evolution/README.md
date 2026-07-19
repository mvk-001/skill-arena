# Harbor Operator Meta-evolution

This experiment tests one concrete mutation operator by evaluating its exact
parent and two independently realized children on the frozen Knowledge consult
benchmark. It is intentionally narrower than a strategy ranking: the claim is
only that the sealed operator did or did not produce a target bundle that
improves on `00-baseline` under the staged protocol.

The machine-readable contract is [`protocol.json`](protocol.json). The operator
identity and instruction, parent lineage, candidate manifests and tree digests,
Knowledge commit, q003 task digest, Harbor/Pi/model profile, required gates,
call budget, and stop policy are all immutable inputs.

## Evidence boundary

`q003` is the only task material read or copied by the preparation script. It
is design/development evidence. The script does not enumerate or read q007,
the remaining smoke tasks, holdout, hard tasks, task answers, or private
evaluation data. q007, q018, q024, and q030 appear in the protocol only as
future task identifiers that define the stop sequence.

The two source candidates remain tracked outside runtime output. Preparation
checks their `candidate-manifest.json` and `operator-realization.json`, verifies
that both name the same exact parent and operator, recomputes every tree digest
bytewise, and then copies the bundles to an ignored runtime directory under the
canonical `consult-semantic-okf` basename. The Knowledge checkout is a clean,
commit-pinned, read-only input and is never modified.

## Prepare q003 without model calls

Run from the Skill Arena repository root:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js prepare
node evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js verify
```

Preparation publishes an immutable directory at
`.tmp/knowledge-consult-evolution/meta-evolution/generation-001/prepared`.
Repeating `prepare` verifies the existing bytes and does not replace them. It
contains:

```text
inputs/<candidate-id>/consult-semantic-okf/
tasks/q003/
configs/harbor/q003/{baseline,bounded-verified-breadth,state-machine-verified-breadth}.yaml
configs/operator/generation-001.yaml
receipt.json
```

Every Harbor config uses one attempt, zero retries, the frozen Pi/model profile,
and one q003 task. `/knowledge` is strictly read-only. Authentication uses the
same dedicated temporary mount for every variant and remains writable because
Pi/Codex may persist refreshed session state; its host directory must use mode
700 and its files mode 600, and it must be removed after the run. Job output is
deliberately outside the immutable preparation directory.

## Execute the three live q003 jobs

Preparation and publication never invoke Harbor or a model. The following are
the explicit live-spend boundary. Run them in WSL only after reviewing the
receipt and ensuring the isolated Pi authentication directory exists:

```powershell
wsl -e bash -lc 'uvx --from harbor==0.18.0 harbor run --config /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-001/prepared/configs/harbor/q003/baseline.yaml --yes'
wsl -e bash -lc 'uvx --from harbor==0.18.0 harbor run --config /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-001/prepared/configs/harbor/q003/bounded-verified-breadth.yaml --yes'
wsl -e bash -lc 'uvx --from harbor==0.18.0 harbor run --config /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-001/prepared/configs/harbor/q003/state-machine-verified-breadth.yaml --yes'
```

The protocol spends exactly three calls at this stage. Harbor retry remains
zero. A failed, incomplete, or drifted job is not silently replaced.

## Publish only safe evidence

After all three jobs finish:

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/scripts/publish-meta-evolution.js q003
```

The publisher re-verifies the preparation and all native config/lock/result
provenance. It rejects task, skill identity, candidate digest, Harbor version,
agent version, model, thinking, attempt, retry, mount, or task-checksum drift.
Its JSON and Markdown contain only the primary metric, the three required gate
values, qualification state, input/cache/output token counts, and
cryptographic provenance. Model text, qrels, reasoning, trajectories, private
diagnostics, solutions, and private verifier inputs are never projected.

q003 advances only if all three records are evaluable, at least one child is
fully qualified, and the winning child's hard-gated effective fitness is
strictly above the exact parent. An evaluable semantic parent that fails a gate
has effective fitness zero; this allows the experiment to prove a repair rather
than requiring the broken parent to pass. External, null, malformed, or drifted
evidence remains non-comparable. The deterministic tie-break is candidate ID.
Failure stops the experiment before q007.

## Development-only operator analysis

The prepared operator config consumes the already completed q003 job
directories. It declares missing holdout paths solely because the evolver
schema requires a holdout block. Development phase must not resolve, validate,
read, or execute those paths.

After the updated `harbor-operator-coevolution` CLI is present, analyze it with:

```powershell
wsl -e uv run --script /mnt/c/Users/villa/dev/skill-arena/skills/harbor-operator-coevolution/scripts/harbor_operator_coevolution.py /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-001/prepared/configs/operator/generation-001.yaml --analyze-only --phase development --output-dir /mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-001/operator-analysis/generation-001
```

Do not omit `--phase development`. This experiment does not open holdout. Its
configured `complementaryRepair: true` path may emit a diagnostic repair plan
when no candidate qualifies; such a plan is not promotion evidence and cannot
enter a later generation as a sealed winner.

## Stop gates and budget

The maximum fully successful path is eleven model calls:

| Stage | Variants | Tasks | Calls | Gate |
| --- | --- | --- | ---: | --- |
| q003 | baseline + two children | q003 | 3 | Every record evaluable; one fully qualified child strictly improves hard-gated fitness |
| first validation | baseline + selected child | q007 | 2 | Both evaluable; child qualified and no hard-gated regression |
| remaining smoke | baseline + selected child | q018, q024, q030 | 6 | Every pair evaluable; child qualified, no hard-gated regression, and positive aggregate validation gain |

Any failed gate stops immediately. q003 is never reused as validation evidence,
only one child advances, and no holdout or hard task is opened by this harness.
