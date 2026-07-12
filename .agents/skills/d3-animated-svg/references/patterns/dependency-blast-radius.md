# Critical Dependency Blast Radius

- **Pattern ID:** `d3-dependency-blast-radius`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A service, platform component, vendor, queue, database, API, or control plane needs a visual map of critical dependencies, affected surfaces, failover routes, and blast-radius tiers.
- **Builder:** `scripts/build_critical_dependency_blast_radius.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_dependency_blast_radius.py blast.html
```

- Keep geometry deterministic. Do not run a force simulation for the final standalone artifact unless final coordinates are exported and fixed.
- Use SVG-native animation for standalone output; do not leave runtime D3, CDN, remote font, or remote image dependencies in the deliverable.
- Keep labels outside pulse paths. Moving dependency pulses and blast waves must not cross readable text.
- Preserve severity semantics: red is the critical failing dependency, orange is degraded but recoverable impact, green is failover or protected capacity, blue is normal traffic/input, and purple is control/coordination.
- Label the blast-radius tiers directly or in a compact tier panel. A viewer should not need to infer what each ring means from color alone.

## Data Contract

Use explicit records for nodes, links, impact surfaces, failover paths, and rings:

```js
const nodes = [
  { id: "checkout-api", label: "Checkout API", role: "critical", x: 500, y: 284, status: "degraded" },
  { id: "payments", label: "Payments", role: "hard-dependency", x: 330, y: 192, status: "critical" },
  { id: "orders", label: "Orders", role: "storage", x: 344, y: 370, status: "warning" }
];

const links = [
  { id: "payments-checkout", source: "payments", target: "checkout-api", kind: "hard", severity: "critical" },
  { id: "checkout-ordering", source: "checkout-api", target: "ordering", kind: "impact", severity: "warning" }
];

const failovers = [
  { id: "payments-failover", source: "payments", target: "backup-processor", protects: "checkout-api" }
];

const tierLabels = [
  { id: "core", label: "Core failure", note: "hard dependency" },
  { id: "dependency", label: "Direct dependency", note: "checkout degraded" },
  { id: "surface", label: "Surface impact", note: "workflow effects" }
];
```

Every node needs `id`, `label`, `role`, `x`, `y`, and `status`. Every link needs stable source/target IDs and a severity. Keep link direction meaningful: inbound dependencies feed the critical service, outbound links show user-facing impact.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1040 620"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-dependency-blast-radius"`.
2. Place the critical service in the visual center. Put hard dependencies to the left/top-left and affected surfaces to the right/bottom-right.
3. Draw `.blast-radius-ring` marks behind nodes. Use at least three tiers: core failure, direct dependency impact, and user-facing surface impact.
4. Render every service node as `.critical-dependency-node` with `data-node-id`, `data-node-role`, and `data-status`.
5. Render every dependency as `.dependency-link` with `data-link-id`, `data-source-id`, `data-target-id`, `data-kind`, and `data-severity`.
6. Render affected surfaces as `.impact-surface` when they are user-facing or workflow-facing.
7. Render `.failover-path` links with `data-failover-id` and `data-protects` when alternate capacity exists.
8. Add `.dependency-pulse` motion only after the corresponding visible path starts drawing.
9. Render `.blast-tier-label` marks for ring meaning and `.blast-status-card` marks for the current risk/mitigation summary.

## Animation Contract

- Rings and neutral topology reveal first from `0.00s` to `0.50s`.
- Critical dependency links draw before downstream impact links.
- Critical service pulse begins after hard dependencies are visible.
- Blast wave rings expand from the critical service after the critical dependency pulse reaches it.
- Failover paths draw after the blast wave, so the viewer sees the risk before the mitigation.
- The final frame must retain all nodes, links, rings, tier labels, status cards, impact surfaces, and failover routes.

## Semantic Color Roles

- Red: failed or critical hard dependency; breached capacity; highest blast radius.
- Orange: degraded path, warning impact, fallback pressure, or partial availability.
- Green: failover, protected capacity, validated mitigation, or healthy surface.
- Blue: normal traffic, telemetry, or unaffected user input.
- Purple: control plane, routing, policy, or coordination.
- Neutral grays: ring fills, context links, panel borders, and labels.

## Minimal D3 Renderer Pattern

Use D3 only for joins and path construction, then encode portable animation in SVG:

```js
const byId = new Map(nodes.map(d => [d.id, d]));

function linkPath(link) {
  const source = byId.get(link.source);
  const target = byId.get(link.target);
  const dx = Math.max(42, Math.abs(target.x - source.x) * 0.45);
  return `M${source.x},${source.y} C${source.x + dx},${source.y} ${target.x - dx},${target.y} ${target.x},${target.y}`;
}

const svg = d3.select("svg")
  .attr("viewBox", "0 0 1040 620")
  .attr("data-pattern-id", "d3-dependency-blast-radius")
  .attr("data-pattern-family", "critical-dependency")
  .attr("data-node-count", nodes.length)
  .attr("data-link-count", links.length)
  .attr("role", "img");

const paths = svg.append("g")
  .attr("class", "dependency-links")
  .selectAll("path")
  .data(links)
  .join("path")
  .attr("id", d => `dependency-link-${d.id}`)
  .attr("class", d => `dependency-link severity-${d.severity}`)
  .attr("data-link-id", d => d.id)
  .attr("data-source-id", d => d.source)
  .attr("data-target-id", d => d.target)
  .attr("data-kind", d => d.kind)
  .attr("data-severity", d => d.severity)
  .attr("d", linkPath)
  .attr("pathLength", 1)
  .attr("stroke-dasharray", "1 1")
  .attr("stroke-dashoffset", 0);
```

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-dependency-blast-radius"` and `data-pattern-family="critical-dependency"`.
- Root counts match rendered marks: `data-node-count`, `data-link-count`, `data-critical-link-count`, `data-impact-count`, `data-ring-count`, `data-tier-label-count`, `data-failover-count`, and `data-status-card-count`.
- Every `.critical-dependency-node` has `data-node-id`, `data-node-role`, and `data-status`.
- Every `.dependency-link` has source/target/kind/severity data attributes and a non-empty `d`.
- Every critical dependency has at least one matching `.dependency-pulse`.
- The SVG contains `.blast-wave`, `.blast-radius-ring`, `.blast-tier-label`, `.blast-status-card`, `.impact-surface`, and `.failover-path` marks.
- A screenshot after about `3s` must show a nonblank map, readable labels, no pre-start pulse at `(0,0)`, and a visible mitigation path that does not hide the blast radius.
