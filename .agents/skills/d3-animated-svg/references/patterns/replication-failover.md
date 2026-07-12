# Critical Replication Failover

- **Pattern ID:** `d3-replication-failover`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain database replication lag, primary failure, write fencing, quorum, RPO/RTO exposure, replica promotion, and traffic rerouting.
- **Builder:** `scripts/build_critical_replication_failover.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_replication_failover.py failover.html
```

- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, pulse motion, line drawing, vote emphasis, and step reveal.
- Keep replication lag, write fencing, quorum confidence, RPO gap, RTO target, promotion candidate, and traffic reroute as separate visual concepts.
- Preserve critical semantics: red is failed primary, stale replica, or data-loss exposure; orange is warning lag or transition pressure; green is healthy promotion and reroute; blue is normal replication; purple is quorum or control-plane decision.
- Make split-brain prevention visible before showing the promotion path. A promoted replica should never imply that the old primary is still accepting writes.

## Data Contract

Use explicit records for nodes, replication links, lag samples, quorum votes, status cards, and failover steps:

```js
const nodes = [
  { id: "primary-us-east", label: "Primary", role: "primary", state: "degraded", lag: 0, color: "red" },
  { id: "replica-us-west", label: "Replica us-west", role: "replica", state: "candidate", lag: 2.4, color: "green" },
  { id: "witness", label: "Witness", role: "quorum", state: "voting", color: "purple" }
];

const links = [
  { id: "primary-to-west", source: "primary-us-east", target: "replica-us-west", kind: "wal", lag: 2.4 },
  { id: "primary-to-witness", source: "primary-us-east", target: "witness", kind: "quorum" }
];

const lagSamples = [
  { minute: -9, lag: 1.2 },
  { minute: 0, lag: 2.4 }
];

const failoverControl = {
  writeFence: "active",
  rpoEventsAtRisk: 8,
  rtoTargetSeconds: 60,
  rerouteTarget: "writer-endpoint"
};
```

Every node needs `id`, `label`, `role`, `state`, and semantic `color`. Replicas should also include `lag`. Every link needs `id`, `source`, `target`, `kind`, and a final path from a node edge to another node edge.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-replication-failover"`.
2. Place the degraded primary on the left, replicas in a vertical middle column, and witness/control-plane quorum on the right.
3. Draw `.replication-link` paths behind node cards from the primary to each replica and to the witness.
4. Draw one `.promotion-path` from the selected low-lag replica toward quorum/traffic routing. Keep it visually distinct from normal replication.
5. Draw `.replication-node` cards with role-specific classes: `.primary-node`, `.replica-node`, and `.witness-node`.
6. Draw a `.write-fence` mark near the failed primary before promotion to show that the old writer is no longer allowed to accept writes.
7. Draw `.quorum-vote` marks in a compact vote row or panel. Include at least one rejected or stale vote so split-brain risk is explicit.
8. Draw one `.traffic-reroute` with a `.traffic-reroute-path` and endpoint card after quorum is established.
9. Draw a lag chart with `.lag-threshold-band`, one `.lag-chart-line`, and `.lag-sample-point` marks. Add `.rpo-gap` to call out unreplayed writes or exposure.
10. Draw `.failover-step` cards for freeze writes, verify quorum, promote replica, and reroute traffic.
11. Keep `.replication-pulse` marks on lanes, not over readable text.

## Animation Contract

- Reveal the topology container and node cards first.
- Draw `.replication-link` paths before starting `.replication-pulse` motion.
- Draw the lag line and sample points before revealing `.rpo-gap`.
- Reveal `.write-fence` before drawing the `.promotion-path`.
- Pulse `.quorum-vote` marks after links exist, then draw the `.promotion-path` and `.traffic-reroute-path`.
- Reveal `.failover-step` cards in operational order.
- The final frame must retain all nodes, links, pulses, lag bands, lag points, quorum votes, status cards, RPO/RTO annotations, and failover steps.

## Semantic Color Roles

- Red: failed/degraded primary, stale replica, rejected vote, and RPO exposure.
- Orange: lag warning, incomplete catch-up, or transition pressure.
- Green: promotion candidate, healthy replication, successful quorum, and traffic reroute.
- Blue: normal write-ahead log shipping and replication telemetry.
- Purple: witness, quorum, control-plane decision, and promotion authority.
- Neutral grays: panel shells, grid lines, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-replication-failover"` and `data-pattern-family="critical-replication"`.
- Root counts and targets match rendered marks: `data-node-count`, `data-replication-link-count`, `data-lag-sample-count`, `data-quorum-vote-count`, `data-failover-step-count`, `data-status-card-count`, `data-pulse-count`, `data-rpo-events-at-risk`, `data-rto-target-seconds`, `data-write-fence-count`, and `data-traffic-reroute-count`.
- The SVG contains `.replication-node`, `.primary-node`, `.replica-node`, `.witness-node`, `.replication-link`, `.replication-pulse`, `.lag-chart-line`, `.lag-threshold-band`, `.lag-sample-point`, `.quorum-vote`, `.write-fence`, `.failover-step`, `.promotion-path`, `.traffic-reroute`, `.traffic-reroute-path`, `.rpo-gap`, and `.replication-status-card`.
- Every `.replication-node` has `data-node-id`, `data-role`, and `data-state`.
- Every `.replication-link` has `data-link-id`, `data-source`, `data-target`, and `data-kind`.
- Every `.write-fence` has `data-fenced-node` and `data-fence-state`.
- Every `.traffic-reroute` has `data-source`, `data-target`, and `data-rto-seconds`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, visible lag thresholds, a clear promotion candidate, an old-writer fence, and a failover path that does not imply two primaries can accept writes.
