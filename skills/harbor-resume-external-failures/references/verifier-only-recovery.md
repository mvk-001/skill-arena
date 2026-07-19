# Verifier-only recovery after a completed agent

Use verifier-only recovery only for a sealed native attempt whose agent
completed but whose verifier never started because Harbor failed in its own
post-agent artifact collection. It is an append-only derivation, not a retry or
an in-place job repair.

The only supported contract is:

`harbor-0.18.0.oserror-eio-during-artifact-collection.post-agent.pre-verifier.v1`

It requires all of the following:

- the original selective-resume ledger has exactly one sealed, cap-consuming
  `failed-execution` attempt and no later attempt;
- the failed retry tree and ledger match their complete declared manifests;
- the native retry's exact directory manifest matches, including its expected
  empty `agent/setup`, artifact-log, and verifier directories;
- Harbor recorded a completed agent interval and token result, null verifier,
  verifier result, and step results, plus the exact errno-5 stack in
  `_record_mounted_artifacts_dir` for `artifacts/logs/artifacts`, and the sealed
  `exception.txt` is byte-identical to the `TrialResult` traceback;
- `agent/pi.txt` is an ordinary single-link file with the declared bytes, valid
  JSONL events, a final `stop` assistant answer followed by `agent_end`, and
  token totals that reconstruct exactly to `agent_result`;
- the complete local task tree, its tests, Packager digest, legacy checksum,
  task artifact mapping, verifier Dockerfile, verifier image tag, and immutable
  image ID all match the recovery contract; and
- all executable recovery inputs match their declared SHA-256 seals.

The builder's PEP 723 lock is one of those sealed inputs. Invoke the wrapper,
which uses `uv run --offline --frozen`; recovery must never resolve or download
dependencies from the network.

The live operation makes zero Harbor calls and zero model calls. It executes
the verifier exactly twice successfully from one private, sealed Pi/tests input
snapshot. Each deterministic container uses the immutable image ID with
`--pull never`, `--network none`, a 4096 MiB memory limit, read-only root,
dropped capabilities, `no-new-privileges`, a PID limit, and no auth, knowledge,
or Docker-socket mount. A sealed no-op Python keeper lets the builder execute
the exact `/tests/test.sh` command directly with a 180-second timeout while a
4 MiB private tmpfs remains mounted. The builder requires exactly two regular
files there, extracts each through bounded reads, and drains stdout/stderr
incrementally under fixed limits. Reward, diagnostics, and stdout must be
byte-identical across both successful runs.

Before either call, the operation creates and fsyncs a sibling, self-sealed
call journal. It records `starting` durably before each deterministic container
name can run, conservatively consumes that call slot, and seals the terminal
result afterward. A journal containing a `starting` or failed call is
intentionally not replayable: the bytes do not prove whether that verifier
already executed, so a human must resolve it.

The operation never edits `resume-lock.json` or the native failed retry. It
publishes:

```text
resume-output/
├── resume-lock.json                         # unchanged native ledger
├── retries/.../external-retry-.../          # unchanged native retry
├── verifier-recovery/
│   ├── .verifier-recovery.writer.lock       # persistent advisory lock file
│   ├── attempt-001-verifier-call-journal.json
│   └── attempt-001/
│       ├── input-snapshot/agent/
│       ├── input-snapshot/tests/
│       ├── verifier-runs/run-001/
│       ├── verifier-runs/run-002/
│       ├── recovered-job/
│       ├── recovery-lock.json
│       └── recovery-result.json
└── effective-jobs/<source-key>/effective-job/
    └── resume-manifest.json                 # schema 2
```

The sibling journal binds the immutable native inputs, the staged snapshot,
exactly two calls, their files, and zero Harbor/model calls. Its file hash and
self-digest are bound by `recovery-lock.json`, which also binds the native
ledger and job, trace, task, image, both successful verifier runs, and recovered
job. The schema-2 effective manifest binds that recovery record and preserves
the frozen
`first-evaluable-retry-never-best-of` policy. `recovery-result.json` then binds
the effective manifest and self-seals; this ordering avoids digest cycles.
The recovery lock also binds the exact recovered-job directory manifest. The
final `effective-jobs/` namespace must contain exactly one source-key directory
and that directory must contain only `effective-job` after publication.

`--doctor` and `--dry-run` perform no verifier, Harbor, or model call and make
no writes. `--verify` revalidates existing receipts and derived trees. A live
rerun is idempotent: it verifies the existing recovery instead of executing the
verifier again. Uncertain recovery work is never deleted or retried
automatically. A temporary is reconciled only when the current journal proves
that no call boundary was crossed, or when both calls are already sealed and
the remaining work is a purely derived recovered/effective view. Payloads are
fsynced before receipts, and each phase rejects unrecognized directory nodes.
The final recovery result uses a deterministic staged payload and a no-replace
publish, so a concurrent path can never be overwritten; only a staged payload
that exactly equals the currently derived result can be resumed.
On DrvFS, both file and directory publications use their corresponding Windows
`System.IO` move primitive after path conversion; each rejects an existing
destination and the implementation verifies that the source disappeared and
the destination has the expected ordinary node type.

Reject recovery rather than generalizing when any predicate differs. In
particular, do not use it for provider failures, agent errors, context limits,
timeouts, semantic verifier failures, ambiguous missing rewards, a verifier
that already started, or a different Harbor stack.
