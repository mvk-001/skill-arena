# Critical Circuit Breaker

- **Pattern ID:** `d3-circuit-breaker`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain circuit-breaker resilience, repeated downstream failure, timeout thresholds, fail-fast behavior, fallback responses, half-open probe traffic, retry suppression, or controlled service recovery.
- **Builder:** `scripts/build_critical_circuit_breaker.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts with the default contract, run the bundled builder rather than hand-authoring a substitute:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_circuit_breaker.py breaker.html
```

- Only diverge from the bundled builder when the user supplies different data, cardinality, labels, or geometry requirements; preserve the same validation hooks when adapting it.
- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, request-pulse motion, failure-threshold line drawing, open-state emphasis, half-open probe motion, and mitigation reveal.
- Keep caller pressure, breaker state, downstream failure, fallback path, probe traffic, retry suppression, and recovery metrics as separate visual concepts.
- Preserve critical semantics: red is tripped/open state or downstream failure; orange is timeout pressure or retry budget warning; green is fallback and recovery; blue is normal caller traffic; purple is half-open probes and policy coordination.

## Data Contract

Use explicit records for client sources, flow paths, breaker state, state timeline, metric samples, status cards, and mitigation steps:

```js
const clients = [
  { id: "web", label: "Checkout web", rate: "1.9k/s", color: "blue" },
  { id: "mobile", label: "Mobile app", rate: "1.4k/s", color: "blue" },
  { id: "retry", label: "Retry loop", rate: "900/s", color: "orange" }
];

const breakerState = {
  state: "open",
  failureThreshold: 50,
  currentFailureRate: 78,
  openWindowSeconds: 45,
  timeoutMs: 650,
  retryBudget: "18%",
  probeCount: 2
};

const metrics = [
  { second: -45, failureRate: 12, latencyMs: 210 },
  { second: 0, failureRate: 78, latencyMs: 940 }
];
```

Every client needs `id`, `label`, `rate`, and semantic `color`. Every flow needs `id`, `source`, `target`, `kind`, and semantic `color`. Every state node needs `id`, `label`, `note`, and `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-circuit-breaker"`.
2. Put client sources on the left, caller service and retry guard in the middle-left, the circuit breaker in the center, downstream service on the right, and fallback service below the downstream service.
3. Draw `.breaker-flow-path` routes before `.breaker-request-pulse` marks. Keep pulses on lanes and away from text.
4. Draw one `.circuit-breaker` card with `data-state="open"` and one `.open-circuit-barrier` that visibly blocks direct downstream calls.
5. Draw one `.retry-suppression-gate` between caller traffic and breaker state so retry storm containment is explicit.
6. Draw `.fail-fast-path` and `.fallback-path` toward `.fallback-service` rather than implying all calls keep hitting downstream.
7. Draw `.probe-path` with `.half-open-probe` marks toward downstream to show limited half-open checks.
8. Draw `.breaker-state-node` marks for closed, open, half-open, and closed/recovered.
9. Draw `.breaker-failure-line`, `.breaker-latency-line`, `.breaker-failure-point`, `.breaker-latency-point`, and `.trip-threshold-line` in the metric panel.
10. Draw `.breaker-mitigation-step` cards for set timeout, trip threshold, fail fast, and probe close.

## Animation Contract

- Reveal status cards and topology first.
- Draw normal caller paths before drawing the red open-circuit barrier.
- Start `.breaker-request-pulse` motion only after visible paths exist.
- Reveal `.retry-suppression-gate` before the fail-fast fallback path.
- Reveal half-open probe traffic after the open state is visible.
- Draw metric lines before mitigation cards.
- The final frame must retain all clients, caller, breaker state, downstream state, fallback service, retry gate, open barrier, state nodes, metric lines, pulses, status cards, and mitigation steps.

## Semantic Color Roles

- Red: open breaker, downstream failure, trip threshold breach, and user-facing risk.
- Orange: timeout pressure, retry budget, and degraded transition.
- Green: fallback, fail-fast success, and recovery.
- Blue: normal caller requests and closed-state traffic.
- Purple: half-open probes, policy coordination, and controlled recovery checks.
- Neutral grays: panel shells, grid lines, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-circuit-breaker"` and `data-pattern-family="critical-resilience"`.
- Root counts match rendered marks: `data-client-count`, `data-flow-count`, `data-pulse-count`, `data-state-count`, `data-failure-point-count`, `data-latency-point-count`, `data-mitigation-count`, and `data-status-card-count`.
- Root state attributes include `data-breaker-state`, `data-failure-threshold`, `data-current-failure-rate`, `data-open-window-seconds`, `data-timeout-ms`, `data-retry-budget`, and `data-probe-count`.
- The SVG contains `.breaker-client`, `.caller-service`, `.circuit-breaker`, `.downstream-service`, `.fallback-service`, `.breaker-flow-path`, `.breaker-request-pulse`, `.open-circuit-barrier`, `.retry-suppression-gate`, `.fail-fast-path`, `.fallback-path`, `.probe-path`, `.half-open-probe`, `.breaker-state-node`, `.trip-threshold-line`, `.breaker-failure-line`, `.breaker-latency-line`, `.breaker-failure-point`, `.breaker-latency-point`, `.breaker-mitigation-step`, and `.breaker-status-card`.
- Every `.breaker-client` has `data-client-id` and `data-rate`.
- Every `.breaker-flow-path` has `data-flow-id`, `data-source`, `data-target`, and `data-kind`.
- Every `.breaker-state-node` has `data-state-id` and `data-state`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, visible fail-fast fallback, visible half-open probes, and a failure-rate line crossing the trip threshold.
