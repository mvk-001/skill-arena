# Critical Rate Limit Token Bucket

- **Pattern ID:** `d3-token-bucket`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain rate limiting, token-bucket throttling, burst limits, request admission control, 429 responses, Retry-After backoff, per-client quotas, API gateway throttling, or backend overload protection before queues and dependencies saturate.
- **Builder:** `scripts/build_critical_rate_limit_token_bucket.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts with the default contract, run the bundled builder rather than hand-authoring a substitute:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_rate_limit_token_bucket.py rate-limit.html
```

- Only diverge from the bundled builder when the user supplies different data, cardinality, labels, or geometry requirements; preserve the same validation hooks when adapting it.
- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, request-pulse motion, token refill animation, throttled-path emphasis, threshold drawing, and policy-card reveal.
- Keep client pressure, gateway admission, token bucket state, refill rate, allowed requests, throttled requests, 429 Retry-After response, backend protection, and rate metrics as separate visual concepts.
- Preserve critical semantics: red is overload or exhausted tokens; orange is throttled or retry-after work; green is allowed/protected backend traffic; blue is normal client traffic; purple is quota key/refill coordination.

## Data Contract

Use explicit records for clients, token bucket state, flow paths, metric samples, status cards, and policy steps:

```js
const clients = [
  { id: "web", label: "Web clients", rate: "2.7k/s", quotaKey: "user", color: "blue" },
  { id: "partner", label: "Partner API", rate: "3.1k/s", quotaKey: "api-key", color: "blue" },
  { id: "bot", label: "Bot spike", rate: "5.4k/s", quotaKey: "ip", color: "red" }
];

const bucket = {
  capacity: 12,
  currentTokens: 3,
  refillRate: "5k/s",
  burstLimit: "12 tokens",
  retryAfterSeconds: 8,
  allowedRate: "5.0k/s",
  throttledRate: "4.4k/s"
};
```

Every client needs `id`, `label`, `rate`, `quotaKey`, and semantic `color`. Every flow needs `id`, `source`, `target`, `kind`, and semantic `color`. Every policy step needs `id`, `label`, `note`, and semantic `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-token-bucket"`.
2. Put clients on the left, one `.api-gateway` before the bucket, the `.token-bucket` in the center, and `.protected-backend` plus `.retry-after-response` on the right.
3. Draw `.rate-limit-flow-path` routes before `.rate-limit-request-pulse` marks. Keep pulses on lanes and away from text.
4. Draw one `.token-bucket` with exactly 12 `.token-slot` marks, where exhausted and available tokens are visually distinct.
5. Draw one `.refill-clock` and one refill path into the bucket so the refill rate is visible.
6. Draw one `.allowed-path` from bucket to backend and one `.throttled-path` from bucket to the Retry-After response.
7. Draw one `.retry-after-response` that explicitly shows `429` and `Retry-After`.
8. Draw `.rate-limit-metric-line`, `.rate-limit-metric-point`, and `.limit-threshold-line` in the metric panel, with incoming traffic crossing the configured limit and allowed traffic staying capped.
9. Draw `.rate-limit-policy-step` cards for set refill rate, cap burst, return 429, and jitter/backoff retries.

## Animation Contract

- Reveal status cards and topology first.
- Draw client-to-gateway paths before bucket admission.
- Reveal token slots before showing the red exhausted-token pressure.
- Draw allowed traffic before the throttled 429 path.
- Draw metric lines before showing policy cards.
- The final frame must retain all clients, gateway, token bucket, token slots, refill clock, allowed path, throttled path, backend, Retry-After response, metric lines/points, pulses, status cards, and policy steps.

## Semantic Color Roles

- Red: exhausted tokens, over-limit incoming rate, abuse spike, and backend overload risk.
- Orange: throttled requests, Retry-After, and warning pressure.
- Green: allowed requests, protected backend, and capped admitted rate.
- Blue: normal client request pressure.
- Purple: quota key, token refill, and admission-control policy.
- Neutral grays: panel shells, grid lines, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-token-bucket"` and `data-pattern-family="critical-rate-limit"`.
- Root counts match rendered marks: `data-client-count`, `data-flow-count`, `data-pulse-count`, `data-token-count`, `data-metric-line-count`, `data-metric-point-count`, `data-policy-step-count`, and `data-status-card-count`.
- Root state attributes include `data-bucket-capacity`, `data-current-tokens`, `data-refill-rate`, `data-burst-limit`, `data-retry-after-seconds`, `data-allowed-rate`, and `data-throttled-rate`.
- The SVG contains `.rate-limit-client`, `.api-gateway`, `.token-bucket`, `.token-slot`, `.refill-clock`, `.rate-limit-flow-path`, `.rate-limit-request-pulse`, `.allowed-path`, `.throttled-path`, `.retry-after-response`, `.protected-backend`, `.rate-limit-metric-line`, `.rate-limit-metric-point`, `.limit-threshold-line`, `.rate-limit-policy-step`, and `.rate-limit-status-card`.
- Every `.rate-limit-client` has `data-client-id`, `data-rate`, and `data-quota-key`.
- Every `.token-slot` has `data-token-index` and `data-state`.
- Every `.rate-limit-flow-path` has `data-flow-id`, `data-source`, `data-target`, and `data-kind`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, visible token exhaustion, visible allowed backend protection, visible throttled 429/Retry-After response, and a metric line where incoming traffic exceeds the limit while allowed traffic stays capped.
