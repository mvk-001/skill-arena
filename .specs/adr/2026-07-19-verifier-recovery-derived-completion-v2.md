# ADR: append-only completion after a completed verifier journal

## Decision

Preserve the original V1 call contract and its completed two-run journal as the
authoritative record of calls. Complete only the failed post-call derivation
through a separately sealed V2 executable and receipt.

V2 may normalize one representational mismatch in memory: Harbor's serialized
retry task omits `overwrite`, while Pydantic materializes its default as
`false`. The normalizer treats only absent and `false` as equivalent for
`TaskConfig`; it never mutates the native, journal, snapshot, or run artifacts.

Before changing the V1 work namespace, V2 copies and seals it as forensic
evidence. The partial recovered job in that copy is explicitly non-input. V2
then invokes the already-sealed V1 materializers under the narrow in-memory
normalizer. A guard makes any new verifier execution fail closed. The resulting
V1-shaped projection remains consumable by the frozen generation-003 reader,
while every V2-aware consumer must also validate the append-only completion
receipt.

The V2-aware q003 publisher passes explicit repository, generation-001, and
knowledge roots to the frozen V1 publisher. It stages `result.json`,
`report.md`, and its V2 receipt together in one invocation-owned UUID sibling,
fsyncs the whole tree, and commits the directory with the sealed Python
`rename_noreplace` primitive. The destination is fixed to the generation
runtime's `publications/q003`; custom output namespaces are rejected.

## Invariants

- V1 recovery contract, eight V1 seals, native retry, resume ledger, call
  journal, snapshots, and verifier runs stay byte-identical.
- Completion adds zero Harbor, model, agent, and verifier calls.
- The final recovered root/trial configs and locks equal the native bytes.
- The unsealed partial V1 recovered job is preserved only as copied evidence.
- Explicit `overwrite: true`, `null`, or any unrelated difference rejects.
- Re-execution after completion verifies only and remains zero-call.
- Publication never replaces an existing q003 directory and never exposes a
  result without its matching report and V2 receipt.
