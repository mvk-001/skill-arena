# ADR: append-only V3 after a failed zero-call V2 derivation

## Decision

Do not modify or rerun the failed V2 derivation. Bind its sealed contract,
owner, complete staging manifest, and exact reproducible error as immutable
parent evidence. Complete the projection with a separately sealed V3 contract.

Harbor 0.18.0 omitted two Pydantic defaults from the native retry JobConfig:
`tasks[0].overwrite: false` and `n_attempts: 1`. V3 permits only those two
absent-versus-default equivalences in memory. It keeps root/trial config and
lock files byte-identical to native and guards every Harbor, model, agent,
Docker, and verifier call surface.

V3 copies the failed V2 owner/staging into its completion evidence but leaves
the originals untouched. It uses the V1 writer lock, independently rebuilds
from native plus the sealed verifier runs, fsyncs its receipt tree, and
publishes with atomic no-replace. Existing V1 and V2 receipts are never
fabricated or rewritten.

## Invariants

- The completed V1 journal still accounts for exactly two verifier calls.
- V2 and V3 completion attempts account for zero additional calls.
- V1 contract/seals, V2 contract/seals, native retry, journal, V1 work, and
  failed V2 owner/staging remain byte-identical.
- Any normalization beyond the two exact default omissions fails closed.
- Downstream publication requires the V3 receipt and still selects the first
  evaluable retry, never the best score.
