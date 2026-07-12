# Critical Idempotency Replay Guard

- **Pattern ID:** `d3-idempotency-guard`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain idempotency keys, safe retries, duplicate request suppression, response replay, request fingerprint checks, idempotency ledgers, payment or order duplicate prevention, concurrent execution guards, TTL windows, or rejecting a changed payload that reuses an existing key.
- **Builder:** `scripts/build_critical_idempotency_replay_guard.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts with the default contract, run the bundled builder rather than hand-authoring a substitute:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_idempotency_replay_guard.py idempotency.html
```

- Only diverge from the bundled builder when the user supplies different data, cardinality, labels, or geometry requirements; preserve the same validation hooks when adapting it.
- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, request-pulse motion, ledger-row reveal, response-replay emphasis, mismatch rejection, TTL markers, and policy-card reveal.
- Keep client retries, gateway guard, idempotency ledger, request fingerprint, one side effect, stored response replay, changed-payload rejection, and metrics as separate visual concepts.
- Preserve critical semantics: red is payload mismatch or duplicate-side-effect risk; orange is retry and suppression pressure; green is the single committed side effect and safe replay; blue is normal client traffic; purple is key/fingerprint/ledger coordination.
- The recipe is based on primary documentation patterns: store and return the first result for a key, compare later parameters/fingerprints, retain keys for a TTL window, and make retries safe by treating the caller-provided request identity as part of the API contract.
- Source anchors: Stripe API idempotent requests documentation, AWS Builders Library "Making retries safe with idempotent APIs", and AWS Lambda Powertools idempotency utility guidance.

## Data Contract

Use explicit records for attempts, ledger rows, metric samples, status cards, and policy steps:

```js
const attempts = [
  { id: "initial", label: "Initial charge", key: "pay_9f3", fingerprint: "hash A", action: "create", color: "blue" },
  { id: "timeout-retry", label: "Timeout retry", key: "pay_9f3", fingerprint: "hash A", action: "replay", color: "orange" },
  { id: "mobile-retry", label: "Mobile retry", key: "pay_9f3", fingerprint: "hash A", action: "replay", color: "orange" },
  { id: "changed-payload", label: "Payload changed", key: "pay_9f3", fingerprint: "hash B", action: "reject", color: "red" }
];

const ledger = {
  key: "pay_9f3",
  ttlHours: 24,
  responseCode: 201,
  sideEffectsCreated: 1,
  duplicateSuppressed: 3
};
```

Every attempt needs `id`, `label`, `key`, `fingerprint`, `action`, and semantic `color`. Every ledger row needs `id`, `key`, `fingerprint`, `outcome`, `detail`, and semantic `color`. Every policy step needs `id`, `label`, `note`, and semantic `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-idempotency-guard"`.
2. Put retrying clients on the left, one `.idempotency-gateway` before the ledger, the `.idempotency-ledger` in the center, and side-effect, stored-response, and rejection outcomes on the right.
3. Draw `.idempotency-flow-path` routes before `.idempotency-request-pulse` marks. Keep pulses on lanes and away from text.
4. Draw one `.duplicate-guard` so the gateway visibly checks `key + fingerprint` before side effects.
5. Draw `.idempotency-ledger-row` entries for first create, same-key replay rows, and one changed-payload reject row.
6. Draw `.idempotency-key` and `.request-fingerprint` text hooks on attempt cards and ledger rows.
7. Draw one `.side-effect-path` from ledger to `.side-effect-target`; its target must show exactly one committed side effect.
8. Draw one `.response-replay-path` to `.stored-response` for same-key retries and one `.mismatch-reject-path` to the rejection outcome for changed payloads.
9. Draw `.ttl-window-marker` near the ledger so retention policy is visible.
10. Pair `.idempotency-metric-line` with `.idempotency-metric-point` samples for attempts, side effects, and duplicate suppression.
11. Add `.idempotency-policy-step` cards for require key, fingerprint payload, store first response, and replay or reject.

## Animation Contract

- Reveal status cards and topology first.
- Draw attempt-to-gateway paths before the ledger check.
- Reveal ledger rows in request order.
- Draw the side-effect path only once, then animate replay and reject paths.
- Draw metric lines before policy cards.
- The final frame must retain all clients, gateway, duplicate guard, ledger rows, TTL marker, side-effect target, stored response, reject outcome, metrics, pulses, status cards, and policy steps.

## Semantic Color Roles

- Red: mismatched payload, duplicate-side-effect risk, and reject response.
- Orange: retried work and duplicate suppression pressure.
- Green: committed side effect, stored response replay, and safe outcome.
- Blue: normal first request or client traffic.
- Purple: idempotency key, fingerprint comparison, ledger coordination, and TTL policy.
- Neutral grays: panel shells, table rules, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-idempotency-guard"` and `data-pattern-family="critical-idempotency"`.
- Root counts match rendered marks: `data-client-count`, `data-retry-count`, `data-duplicate-count`, `data-flow-count`, `data-pulse-count`, `data-ledger-row-count`, `data-side-effect-count`, `data-replay-count`, `data-mismatch-count`, `data-metric-line-count`, `data-metric-point-count`, `data-policy-step-count`, and `data-status-card-count`.
- Root state attributes include `data-idempotency-key`, `data-idempotency-ttl-hours`, `data-duplicate-suppressed`, `data-side-effects-created`, and `data-replayed-response-code`.
- The SVG contains `.idempotency-client`, `.idempotency-gateway`, `.idempotency-ledger`, `.idempotency-ledger-row`, `.idempotency-key`, `.request-fingerprint`, `.duplicate-guard`, `.side-effect-path`, `.response-replay-path`, `.mismatch-reject-path`, `.idempotency-flow-path`, `.idempotency-request-pulse`, `.side-effect-target`, `.stored-response`, `.ttl-window-marker`, `.idempotency-metric-line`, `.idempotency-metric-point`, `.idempotency-policy-step`, and `.idempotency-status-card`.
- Every `.idempotency-client` has `data-client-id`, `data-idempotency-key`, `data-fingerprint`, and `data-action`.
- Every `.idempotency-ledger-row` has `data-row-id`, `data-idempotency-key`, `data-fingerprint`, and `data-outcome`.
- Every `.idempotency-flow-path` has `data-flow-id`, `data-source`, `data-target`, and `data-kind`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, a single green side-effect target, visible same-key response replay, visible red mismatch rejection, a TTL window marker, and metrics where attempts rise while side effects remain at one.
