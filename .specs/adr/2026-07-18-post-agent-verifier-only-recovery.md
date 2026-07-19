# ADR: Append-only post-agent verifier recovery

Date: 2026-07-18

## Status

Accepted

## Context

The generation-003 contrast trial completed its Pi agent execution and wrote a
complete terminal trace, then Harbor 0.18.0 raised `OSError` errno 5 while
recording the mounted artifact directory. The verifier had not started. A
normal retry would repeat a completed model call, while editing or resuming the
native job would violate the selective-resume lineage contract.

## Decision

- Add a second, narrower recovery contract:
  `harbor-0.18.0.oserror-eio-during-artifact-collection.post-agent.pre-verifier.v1`.
- Accept it only when the failed native attempt, append-only retry ledger, full
  retry tree and directory topology, exact Harbor stack, byte-identical
  `exception.txt`/`TrialResult` traceback, full task tree, Pi trace, terminal
  stop, token reconstruction, image ID, and null verifier fields all match
  sealed values.
- Never invoke Harbor, an agent factory, a provider, or a model. The recovery
  mounts no authentication, knowledge bundle, Docker socket, or network.
- Copy the sealed Pi trace and task tests once into a private, verified input
  snapshot. Use that same snapshot for both verifier calls and the recovered
  job so later native-tree drift cannot change the evaluated bytes.
- Run the sealed verifier twice in separate deterministic named containers by
  immutable image ID with `--pull never`. Keep each constrained container alive
  with a sealed no-op Python process, then invoke the exact `/tests/test.sh`
  command directly through `docker exec`. Apply a 180-second verifier timeout,
  4096 MiB memory limit, read-only root, all capabilities dropped,
  `no-new-privileges`, a PID limit, and only read-only snapshot mounts. Put
  verifier files in a 4 MiB private tmpfs, enumerate exactly two regular output
  files, and extract them with bounded reads before stopping the container.
- Drain verifier stdout and stderr incrementally with fixed host-side limits;
  terminate and remove the owned container on timeout or overflow.
- Before either container can start, create and fsync a sibling, self-sealed
  call journal. Durably record each deterministic container name and a
  `starting` state before its call, then seal its result afterward. A
  `starting` or failed call is ambiguous and blocks automatic replay.
- Require both successful runs to produce byte-identical reward, diagnostics,
  and stdout. A durable `starting` row conservatively consumes its call slot:
  if interrupted, it is never represented as successful and can never be
  replayed automatically.
- Preserve `resume-lock.json` and the native failed retry tree byte-for-byte.
  Publish a separate sibling call journal and a
  `verifier-recovery/attempt-001` tree containing the private input snapshot,
  two verifier runs, a self-sealed recovery lock, a derived Harbor-compatible
  recovered job, and a self-sealed recovery result.
- Build a separate schema-2 `effective-job` view with the frozen resume
  engine's pure materializer. The manifest records `completionMode` as
  `verifier-only-recovery`, binds the native failure, recovered job, and
  recovery record, and retains the first-evaluable/no-best-of selection rule.
- Fsync payloads before their receipts and publish derived directories and the
  final result with no-replace semantics. Serialize writers with a persistent
  POSIX advisory lock so process death releases ownership without a stale-lock
  override. Use Linux `renameat2(RENAME_NOREPLACE)` where available. On WSL
  DrvFS, which returns `EINVAL`, fall back to the matching Windows
  `[System.IO.File]::Move` or `[System.IO.Directory]::Move`; these are atomic on
  the backing NTFS volume and reject an existing destination rather than
  replacing it.
- Seal the PEP 723 dependency lock beside the builder and invoke it only with
  `uv run --offline --frozen`, so recovery cannot resolve or download changed
  dependencies. Treat the lock as part of the exact executable input set.
- Never delete or replay uncertain call evidence. Reconcile only a provably
  pre-call temporary/snapshot or a call-free derived build after the journal
  already seals both verifier calls. Exact directory topology is part of every
  publication phase.
- Bind exact directory manifests for the native and recovered Harbor jobs, and
  require `effective-jobs/` to contain exactly the single source-key directory
  whose only final child is `effective-job`.
- Integrate the derived view through a new versioned resolver and publisher.
  Keep the original generation-003 resolver, publisher, adapter, prepared-v2
  receipt, native job, and native resume ledger unchanged.

## Consequences

- The completed agent response is evaluated without another model or Harbor
  call, saving the expensive work that already succeeded.
- The resulting reward is auditable but explicitly not a claim that Harbor
  completed the native retry job.
- Any trace truncation, profile drift, task drift, different exception phase,
  verifier nondeterminism, changed image, unsafe filesystem node, checksum
  mismatch, or ambiguous durable-journal state rejects automatic recovery.
- Recovery is intentionally case-specific. New post-agent failure shapes need
  a new reviewed contract rather than a broader text-message heuristic.
