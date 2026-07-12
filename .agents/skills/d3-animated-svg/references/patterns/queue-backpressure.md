# Critical Queue Backpressure

- **Pattern ID:** `d3-queue-backpressure`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A service needs to show queue overload, bounded backlog, producer throttling, load shedding, competing consumers, retry pressure, message-age risk, and recovery actions.
- **Builder:** `scripts/build_critical_queue_backpressure.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_queue_backpressure.py queue.html
```

- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, pulse motion, bar growth, and threshold emphasis.
- Keep queue depth, message age, ingress rate, drain capacity, throttling, shedding, and worker scale-out as separate visual concepts.
- Preserve overload semantics: red is critical backlog or dropped work, orange is throttling/backpressure, green is healthy drain/recovery, blue is normal ingress/worker flow, and purple is retry or priority-control behavior.
- Show backpressure before the queue reaches absolute capacity, and show when stale work is no longer useful enough to process.

## Data Contract

Use explicit records for producers, queue segments, consumers, control gates, shed lanes, and backlog samples:

```js
const producers = [
  { id: "api", label: "API ingress", rate: "4.8k/s", priority: "user", color: "blue" },
  { id: "retry", label: "Retry storm", rate: "2.1k/s", priority: "defer", color: "purple" }
];

const consumers = [
  { id: "worker-a", label: "Worker A", state: "busy", capacity: 92 },
  { id: "worker-b", label: "Worker B", state: "busy", capacity: 88 }
];

const controls = [
  { id: "throttle", label: "Throttle producers", state: "active", color: "orange" },
  { id: "shed-old", label: "Shed stale retries", state: "active", color: "red" }
];

const backlog = [
  { minute: 0, depth: 42 },
  { minute: 10, depth: 91 }
];

const ageGuard = {
  oldestMinutes: 11,
  ttlMinutes: 6,
  policy: "sideline stale retries"
};
```

Every producer needs `id`, `label`, `rate`, `priority`, and semantic `color`. Every consumer needs `id`, `label`, `state`, and `capacity`. Every control needs `id`, `label`, `state`, and semantic `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-queue-backpressure"`.
2. Place producers on the left, a bounded queue in the center, and competing consumers on the right.
3. Draw `.queue-segment` slots inside the bounded queue; encode critical backlog with red/orange segments above the safe capacity line.
4. Draw `.queue-flow-path` routes from producers into the queue and from queue to workers.
5. Draw `.backpressure-gate` controls near the producer side so the mitigation is visually upstream of the overload.
6. Draw one `.queue-age-guard` near the bounded queue when oldest-message age exceeds the useful TTL.
7. Draw `.load-shed-path` and `.dead-letter-bin` marks for dropped, stale, or sidelined work.
8. Add a `.queue-depth-line` chart with `.queue-capacity-marker` and `.queue-depth-point` marks.
9. Keep `.queue-message-pulse` marks on lanes, not over text.

## Animation Contract

- Reveal the bounded queue and capacity marker first.
- Draw producer and consumer flow paths next.
- Grow queue segments in depth order.
- Start `.queue-message-pulse` motion only after visible lanes exist.
- Pulse `.backpressure-gate` and `.load-shed-path` after the queue crosses the critical threshold, then reveal the `.queue-age-guard`.
- The final frame must retain all producers, queue segments, consumers, controls, shed lanes, backlog chart, and status cards.

## Semantic Color Roles

- Red: critical backlog, dropped/stale work, dead-letter risk, exhausted queue headroom.
- Orange: backpressure, throttling, warning age, controlled ingress.
- Green: successful drain, healthy workers, recovered throughput.
- Blue: normal producer traffic and worker flow.
- Purple: retry pressure, priority shaping, defer/sideline controls.
- Neutral grays: queue shell, grid lines, labels, inactive paths, and panel borders.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-queue-backpressure"` and `data-pattern-family="critical-queue"`.
- Root counts and thresholds match rendered marks: `data-producer-count`, `data-consumer-count`, `data-queue-segment-count`, `data-control-count`, `data-shed-count`, `data-backlog-point-count`, `data-status-card-count`, `data-pulse-count`, `data-current-depth`, `data-backpressure-threshold`, and `data-oldest-message-minutes`.
- The SVG contains `.producer-source`, `.bounded-queue`, `.queue-segment`, `.queue-flow-path`, `.consumer-worker`, `.backpressure-gate`, `.load-shed-path`, `.dead-letter-bin`, `.queue-age-guard`, `.queue-depth-line`, `.queue-capacity-marker`, `.queue-depth-point`, `.queue-status-card`, and `.queue-message-pulse`.
- Every `.producer-source` has `data-producer-id`, `data-rate`, and `data-priority`.
- Every `.consumer-worker` has `data-consumer-id`, `data-state`, and `data-capacity`.
- Every `.queue-age-guard` has `data-age-minutes` and `data-ttl-minutes`.
- A screenshot after about `3s` must show a nonblank pipeline, readable labels, no pulse at `(0,0)`, visible bounded queue headroom, visible stale-work sideline logic, and a clear mitigation path.
