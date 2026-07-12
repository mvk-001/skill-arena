# Critical Bulkhead Isolation

- **Pattern ID:** `d3-bulkhead-isolation`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain bulkhead isolation, cell-based fault boundaries, noisy-neighbor containment, tenant or workload partitioning, dedicated resource pools, thread or connection pool isolation, concurrency caps, or overflow shedding.
- **Builder:** `scripts/build_critical_bulkhead_isolation.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts with the default contract, run the bundled builder rather than hand-authoring a substitute:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_bulkhead_isolation.py bulkhead.html
```

- Only diverge from the bundled builder when the user supplies different data, cardinality, labels, or geometry requirements; preserve the same validation hooks when adapting it.
- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, request-pulse motion, saturation-wave emphasis, threshold drawing, and policy-card reveal.
- Keep client pressure, routing, isolated cells, resource pools, bulkhead walls, saturated compartment, overflow shedding, healthy compartments, and utilization trend as separate visual concepts.
- Preserve critical semantics: red is saturated or rejected work; orange is overload warning or shed pressure; green is protected critical capacity; blue is normal isolated traffic; purple is routing, partition key, or coordination.

## Data Contract

Use explicit records for clients, cells, flow paths, utilization samples, status cards, and policy steps:

```js
const clients = [
  { id: "critical", label: "Checkout critical", rate: "1.8k/s", cell: "cell-a", color: "green" },
  { id: "search", label: "Search traffic", rate: "2.4k/s", cell: "cell-b", color: "blue" },
  { id: "noisy", label: "Tenant spike", rate: "4.6k/s", cell: "cell-c", color: "red" }
];

const cells = [
  { id: "cell-a", label: "Cell A", pool: "checkout pool", usedSlots: 3, totalSlots: 6, utilization: 48, color: "green" },
  { id: "cell-b", label: "Cell B", pool: "search pool", usedSlots: 4, totalSlots: 6, utilization: 63, color: "blue" },
  { id: "cell-c", label: "Cell C", pool: "tenant pool", usedSlots: 6, totalSlots: 6, utilization: 97, color: "red" }
];
```

Every client needs `id`, `label`, `rate`, `cell`, and semantic `color`. Every cell needs `id`, `label`, `pool`, `usedSlots`, `totalSlots`, `utilization`, and semantic `color`. Every policy step needs `id`, `label`, `note`, and semantic `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-bulkhead-isolation"`.
2. Put clients on the left, one routing layer in the middle-left, and isolated cell compartments across the center-right.
3. Draw `.bulkhead-flow-path` routes before `.bulkhead-request-pulse` marks. Keep pulses on lanes and away from text.
4. Draw one `.bulkhead-router` and three `.bulkhead-cell` compartments with separate `.resource-pool` sections.
5. Draw `.pool-slot` marks inside each cell so reserved capacity and saturation are visible.
6. Draw `.bulkhead-wall` boundaries between cells and one `.isolation-boundary` around the cell region.
7. Draw one `.saturation-wave` inside the overloaded cell and one `.shed-path` from that cell to rejected overflow.
8. Draw `.cell-health-line` and `.cell-health-point` samples so the noisy cell crosses capacity while other cells remain below threshold.
9. Draw `.bulkhead-policy-step` cards for partition by key, cap concurrency, isolate queues, and shed overflow.

## Animation Contract

- Reveal status cards and topology first.
- Draw client-to-router paths before routing into cells.
- Reveal bulkhead walls before showing the saturated cell wave.
- Draw healthy cell traffic before the red overflow shed path.
- Draw utilization lines before showing policy cards.
- The final frame must retain all clients, router, cells, resource pools, pool slots, bulkhead walls, isolation boundary, saturation wave, shed path, utilization points, pulses, status cards, and policy steps.

## Semantic Color Roles

- Red: saturated compartment, noisy tenant pressure, rejected overflow, and cascading-risk signal.
- Orange: warning utilization, queued work, and shed pressure.
- Green: protected critical capacity and healthy isolated traffic.
- Blue: normal isolated traffic.
- Purple: routing, partition keys, and coordination.
- Neutral grays: panel shells, grid lines, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-bulkhead-isolation"` and `data-pattern-family="critical-bulkhead"`.
- Root counts match rendered marks: `data-client-count`, `data-cell-count`, `data-pool-slot-count`, `data-flow-count`, `data-pulse-count`, `data-wall-count`, `data-health-line-count`, `data-health-point-count`, `data-policy-step-count`, and `data-status-card-count`.
- Root state attributes include `data-saturated-cell`, `data-shed-rate`, `data-protected-cell-count`, `data-partition-key`, and `data-concurrency-limit`.
- The SVG contains `.bulkhead-client`, `.bulkhead-router`, `.bulkhead-cell`, `.resource-pool`, `.pool-slot`, `.bulkhead-wall`, `.isolation-boundary`, `.bulkhead-flow-path`, `.bulkhead-request-pulse`, `.saturation-wave`, `.shed-path`, `.overflow-shed`, `.cell-health-line`, `.cell-health-point`, `.bulkhead-policy-step`, and `.bulkhead-status-card`.
- Every `.bulkhead-client` has `data-client-id`, `data-rate`, and `data-target-cell`.
- Every `.bulkhead-cell` has `data-cell-id`, `data-utilization`, `data-used-slots`, and `data-total-slots`.
- Every `.bulkhead-flow-path` has `data-flow-id`, `data-source`, `data-target`, and `data-kind`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, visible walls, visible isolated healthy cells, visible saturated noisy cell, visible shed path, and a utilization line crossing the capacity threshold only for the noisy cell.
