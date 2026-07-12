# D3 Example Pattern Recipes

Use this reference when a good gallery example should become reusable skill knowledge, or when adapting an existing gallery pattern into a new SVG, video scene, or example card.

## Pattern Promotion Rule

Promote an example into skill guidance when it solves a recurring visual problem, not only when it looks good. Record the pattern as:

- **Pattern ID:** the stable `d3-*` ID exposed by the card and SVG.
- **Mechanic:** the cause/effect, comparison, sampling, capacity, extraction, or transformation the viewer should infer.
- **Data contract:** the minimal data shape needed to reproduce the pattern.
- **Geometry contract:** the layout, scales, rows, slots, or masks that preserve meaning.
- **Animation contract:** the SVG-native reveal, sweep, path draw, pulse, or replay rule.
- **Semantic color roles:** what each token color means in this pattern.
- **Verification hook:** card count, pattern ID, data attributes, pixel/screenshot check, or browser audit that proves the pattern survived adaptation.

Do not copy an entire renderer when only a helper or geometry idiom is reusable. Keep the semantic role and rewrite local data.

## Document Token Quality

Pattern IDs: `d3-document-token-quality`, `d3-document-token-errors`.

Use for document-quality explanations where the counting unit is text span length rather than row count or token count.

- Build paragraph-like lines from word rectangles with a fixed inter-word gap; spaces remain blank.
- Use neutral page rectangles, row rules, and borders. Encode correct spans with green, filler with gray, and wrong spans with yellow for caution or red for error/risk.
- Preserve requested ratios by accumulated word length. Do not approximate by number of words.
- Reveal row rules and word blocks in writing order: left to right within a row, then top to bottom through the page.
- Add `data-writing-index` and `data-writing-delay` attributes so a browser audit can verify ordering.
- Keep variants identical except for the semantic color of wrong spans.

## Document Extraction Buckets

Pattern ID: `d3-document-token-bins`.

Use when a single source page needs to visibly split into calculated buckets.

- Start from one document page that already contains colored word blocks.
- Group extracted blocks by semantic role, such as filler, correct, and wrong.
- Move blocks into bucket regions with calculated totals, percentages, and block counts.
- Use subtle straight guide lanes from source to bucket. Avoid brace-like or decorative connectors.
- Keep the original page visible enough for the viewer to understand the extraction source.

## Image Partial Covers

Pattern ID: `d3-agent-loop-overlay`.

Use when the source material is an image or screenshot that should remain inspectable while D3 overlays reveal selected regions.

- Keep the raster asset local, small, and committed only if it is an intentional source asset, not a rendered output.
- Put the image in a clipped SVG group. Keep the image visible; overlays should explain selected regions, not erase the source.
- Use translucent covers, sweep lines, outlines, or masks that partially pass over meaningful regions.
- Scope clip IDs and overlay classes to the pattern ID.
- Verify that the page still works from `docs/` without local `node_modules`.

## Asymmetric Task Overlap

Pattern IDs: `d3-task-overlap`, `d3-task-overlap-dense`.

Use when tasks, backlog items, risks, or work units belong to one scope, two shared scopes, or three-or-more overlapping scopes.

- Use fixed asymmetric circle geometry instead of a force simulation so overlap regions remain deterministic and auditable.
- Keep scope circles translucent and draw task leader lines, label backplates, labels, and dots above them.
- Expose circles as `.overlap-circle` with `data-set-id`.
- Expose tasks as `.task-dot` and `.task-label` with `data-task-id`, `data-memberships`, and `data-membership-count`.
- Encode membership count consistently: one scope in blue, two scopes in orange, and three-or-more scopes in red.
- For the default gallery fixture, validate `data-circle-count="9"`, `data-target-count="20"`, 9 circles, 20 task dots, and 20 task labels.
- For the saturated 100-task fixture, regenerate label positions with `scripts/layout_task_overlap_labels.py`, load the generated `task-overlap-layouts.js`, keep labels in external lanes outside the circle field, and validate `data-target-count="100"`, 100 task dots, 100 task labels, and `data-label-overlap-count="0"`.
- Stress the saturated fixture with mixed label lengths and font sizes. Validate `data-label-length-buckets`, at least three distinct `data-label-font-size` values, zero undersized `.task-label-bg` rectangles in both width and height, zero label overlaps against other labels, circles, and dots, and a wide enough presentation for inspection.
- Use direct solid leaders for the saturated fixture when readability benefits from simpler lines. Color leaders from the generated direct-line crossing graph rather than by membership count; expose `data-leader-route="direct"`, `data-leader-color-count`, `data-leader-crossing-count`, and `data-same-color-leader-crossing-count`. Keep colored leaders and white halos semitransparent, do not add an outer SVG frame stroke, and do not add leader anchors or lateral label accents in this simplified variant.

## Venn Overlap Family

Pattern IDs: `d3-venn-3`, `d3-venn-5`, `d3-venn-7`, `d3-overlap-3-rosette`, `d3-overlap-5-rosette`, `d3-overlap-7-flower`, `d3-overlap-3-chain`, `d3-overlap-5-cluster`, `d3-overlap-7-bridge`.

Use when a concept explainer needs reusable overlapping circles rather than a mathematically complete Venn diagram with every possible region.

- Use fixed circle geometry so the intended overlap story is deterministic and replayable.
- Expose every circle as `.venn-circle` with `data-set-id` and `data-set-code`.
- Expose the root SVG with `data-pattern-family="venn-overlap"`, `data-layout`, and `data-circle-count`.
- Keep the card ID, card `data-pattern-id`, and SVG `data-pattern-id` equal to the stable `d3-*` ID.
- Use three visual subfamilies: classic shared-center overlap, rotationally symmetric rosettes, and asymmetric bridge/cluster layouts.
- For asymmetric 7-circle bridge layouts, preserve the 3+1+3 structure: three circles in one block, one bridge circle, and three circles in the second block.
- Animate circle radius and fill-opacity with SVG animation nodes so replay works from the shared gallery button.

## Kanban Assignee Legend Modes

Pattern IDs: `d3-kanban-assignees`, `d3-kanban-legend-column`, `d3-kanban-legend-footer`.

Use when a Kanban board needs one-title task cards, bottom-right two-letter assignee dots, and a people legend that can move to fit the available board geometry.

- Model people as `{ id, name, color }` and tasks as `{ col, title, assignees, expectedLines? }`; keep `id` to two letters for dot labels.
- Keep cards content-sized by measured title lines: one-line cards at the smallest height, two-line and three-line titles only adding the vertical space they need.
- Preserve square card and column edges. Do not add rounded corners when the board is meant to read as a dense operational surface.
- Use `legendMode: "top-row"` for maximum task-card width and a compact legend above the columns.
- Use `legendMode: "virtual-column"` when symmetry matters: shrink task columns if needed, add a same-height legend column, and expose legend chips with `data-legend-placement="virtual-column"`.
- Use `legendMode: "distributed-columns"` when spare vertical space exists in the columns: use one unified column height, reserve a footer band below the task stack, and place one legend chip per column with `data-legend-placement="column-footer"`.
- Validate `data-legend-mode`, task card heights, title line counts, 19 task cards, 5 task columns, 5 legend chips, bottom-right assignee dots, and no overlap between legend chips and task cards.

## Pen Label Optimizer

Pattern ID: `d3-pen-label-optimizer`.

Use when many labeled points crowd a pen/scatter-style view and direct labels saturate part of the drawing.

- Generate deterministic candidate rectangles around each point using several directions and offsets.
- Validate with mixed short, medium, and long labels. Measure SVG text widths before candidate generation when a browser is available; use conservative character-width estimates only as fallback.
- Score candidates by overlap area, outside-frame area, and leader-line distance.
- Compare simple radial placement, greedy candidate placement, force/collision relaxation, and simulated annealing.
- Use simulated annealing plus a final priority-ordered visibility pass when it keeps the most readable labels.
- Expose the SVG with `data-pattern-family="label-placement"`, `data-label-count`, `data-best-algorithm`, and per-algorithm readable counts.
- Draw only the readable subset as `.pen-label` groups and keep all source points visible as `.pen-label-point` marks. Expose label text, length, and measured width as data attributes for browser audits.
- Add leader lines from labels to points so displaced labels remain attributable.

## Inline Bar Tables

Pattern ID: `d3-inline-bar-table`.

Use for compact current-data comparisons such as model pricing, latency, quality, or resource cost.

- Curate only current, directly comparable rows with verified values.
- Omit rows with missing values instead of drawing no-data rows.
- Scale each embedded bar against the largest visible value in its own metric column.
- Use solid bars when magnitude comparison is the message.
- Expose `data-metric-key`, `data-value`, `data-column-max`, and `data-bar-width` for ratio audits.

## Sketchy Overlay

Representative IDs: `d3-sketchy-beeswarm`, `d3-sketchy-streamgraph`, `d3-sketchy-treemap`, `d3-sketchy-line-chart`, `d3-sketchy-histogram`, `d3-sketchy-gemma-comparison`.

Use when a hand-rendered style is requested but the data geometry must stay faithful.

- Treat sketchiness as a mark-rendering overlay, not a different chart.
- Keep data positions, areas, ranks, and scales unchanged.
- Use seeded jitter, double strokes, rough rectangles/blobs, and optional hachures.
- Apply roughness to marks, axes, links, tables, and containers. Keep text crisp.
- Reuse repository palette tokens; do not introduce raw sketch colors.

## Model Execution Box

Pattern ID: `d3-mlp-execution`.

Use when a model or processor should read as active work without showing inputs, outputs, or extra explanatory labels.

- Draw a square model frame with a centered primary label or no label when narration carries the name.
- Put a small internal MLP inside the box as the secondary mechanism.
- Pulse nodes and links by layer with soft brand color.
- Avoid generic glow, external arrows, packets, and input/output tokens unless the concept requires them.
- In video scenes, adapt this into a shared helper so model boxes stay visually identical across beats.

## Token Roulette Sampler

Pattern ID: `d3-token-roulette`.

Use when weighted chance and final selection are the concept.

- Keep a probability-weighted wheel, fixed pointer, exterior ticks, and deterministic spin.
- Make the selected wedge land under the pointer in the final state.
- Use bars only when the user wants ranking instead of sampling.
- Keep a compact result mark only if it clarifies the selected token.

## Circuit Signal Traces

Pattern ID: `d3-circuit-signal-traces`.

Use when a circuit-board metaphor needs to show animated propagation, request/acknowledge handshakes, fault isolation, or a fallback route without turning into a generic network graph.

- Keep traces rectilinear on a visible grid. The circuit look comes from orthogonal paths, pads, vias, and layered traces, not from random angled links.
- Model nodes as stable pads with `id`, `label`, `role`, `x`, `y`, and semantic `color`; model traces as ordered point arrays with `signal`, `mode`, `cadence`, and `phase`.
- Use blue for normal data, purple for control or clock signals, green for acknowledgement or healthy delivery, orange for fallback/reroute paths, and red only for faults or blocked segments.
- Draw passive traces before pulses. Use native path drawing for trace reveal and `<animateMotion>` for `.circuit-pulse` marks.
- For `bus-handshake`, show request and acknowledge on separate lanes or distinct phases so directionality is legible.
- For `fault-isolation`, show the red blocked segment first, then draw the orange reroute path after the fault is visible.
- Expose `data-pattern-family="circuit"`, `data-node-count`, `data-trace-count`, `.circuit-trace`, `.circuit-node`, `.circuit-via`, and `.circuit-pulse` for browser audits.
- Prefer `scripts/build_circuit_signal_traces.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Critical Chain Buffer

Pattern ID: `d3-critical-chain-buffer`.

Use when a critical path needs schedule context, feeding dependencies, resource-readiness alerts, consumed buffer, remaining project buffer, a buffer fever view, and deadline risk rather than only a DAG route.

- Keep time horizontal and workstreams as lanes. This avoids implying arbitrary graph structure when duration and sequence are the message.
- Model tasks with `id`, `label`, `lane`, `start`, `duration`, `critical`, and semantic `color`.
- Model dependencies separately with `source`, `target`, `critical`, and optional `feedsCritical`; compute dependency curves from final task boxes.
- Draw context tasks and dependencies first, then draw the critical chain in causal order with stronger red strokes and `.dependency-pulse` markers.
- Use orange for consumed or feeding buffer risk and green for remaining buffer. Reserve red for the controlling chain and deadline risk.
- Use `.resource-buffer` triangle markers for readiness alerts that protect critical tasks, and expose their protected task through `data-task-id`.
- Add `.fever-chart`, `.fever-line`, and `.fever-point` marks when risk status matters; expose `data-chain-complete` and `data-buffer-consumed` on the chart and points.
- Expose `data-pattern-family="critical-chain"`, `data-task-count`, `data-critical-task-count`, `data-dependency-count`, `data-buffer-count`, `data-resource-buffer-count`, `.critical-chain-task`, `.critical-chain-dependency`, `.critical-buffer`, `.critical-dependency`, `.dependency-pulse`, `.resource-buffer`, and `.fever-chart` for audits.
- Prefer `scripts/build_critical_chain_buffer.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Critical Incident Escalation

Pattern ID: `d3-incident-escalation`.

Use when the critical story is incident response rather than project scheduling: alert, impact confirmation, incident command, escalation, communication cadence, mitigation, validation, recovery, post-incident learning, and SLA pressure.

- Keep time horizontal in minutes from detection; use fixed lanes for signal, command, and mitigation.
- Model events with `id`, `label`, `minute`, `lane`, `severity`, `owner`, and semantic `color`.
- Model escalations separately with `source`, `target`, `kind`, and `critical`; compute paths from final event positions.
- Draw severity phase bands first, then time ticks, event nodes, escalation paths, and `.escalation-pulse` markers.
- Use one `.sla-countdown` and one `.incident-clock` to show the response against the SLA deadline.
- Add `.communication-beat` marks when stakeholder update cadence matters, and keep them in their own row.
- Add `.incident-status-card` marks in a command-state panel for current severity, owner, customer impact, and next update.
- Use red for SEV-1 and breach risk, orange for containment/mitigation pressure, green for recovery, blue for telemetry, and purple for command/comms ownership.
- Expose `data-pattern-family="critical-incident"`, `data-event-count`, `data-escalation-count`, `data-critical-escalation-count`, `data-phase-count`, `data-team-count`, `data-mitigation-count`, `data-communication-count`, `data-status-card-count`, `.critical-incident-event`, `.escalation-link`, `.critical-escalation`, `.escalation-pulse`, `.response-team`, `.mitigation-step`, `.communication-beat`, and `.incident-status-card` for audits.
- Prefer `scripts/build_critical_incident_escalation.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Critical Fault Tree

Pattern ID: `d3-fault-tree`.

Use when a D3/SVG artifact needs a fault tree analysis view for safety, reliability, process, aerospace, nuclear, or operations risk: top event, AND/OR failure gates, basic events, undeveloped events, minimal cut sets, and risk contribution.

- Keep the top event centered and visually dominant; place OR/AND gates directly on the causal path instead of turning the tree into a generic org chart.
- Use recognizable fault-tree marks: rectangular event boxes, OR/AND gate symbols, circular basic events, diamond undeveloped events, and minimal cut badges.
- Use red only for the critical top event and dominant single-event cut, orange for redundant equipment failures, purple for protection logic or bypass failures, and neutral gray for screened context.
- Animate minimal cut evidence upward along hidden motion paths that avoid readable labels.
- Expose `data-pattern-family="fault-tree"`, `data-event-count`, `data-basic-event-count`, `data-gate-count`, `data-minimal-cut-count`, `data-risk-panel-count`, `.fault-event-box`, `.basic-event`, `.undeveloped-event`, `.fault-gate`, `.fault-link`, `.minimal-cut-link`, `.fault-cut-pulse`, and `.fault-risk-card` for audits.
- Prefer `scripts/build_critical_fault_tree.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Critical Bowtie Barrier

Pattern ID: `d3-bowtie-barriers`.

Use when the critical story is barrier management around a top event rather than logic-gate failure decomposition: threats, preventive barriers, top event, mitigative barriers, consequences, degraded barriers, and degradation controls.

- Keep the top event centered; put threats and preventive barriers on the left, mitigative barriers and consequences on the right.
- Model threats and consequences as ordered row records so each scenario has a clean path into or out of the top event.
- Model barriers with `id`, `label`, `side`, `status`, and `criticalGap`; show weak barriers directly on the barrier rather than only in a legend.
- Add `.critical-barrier-gap` badges with leaders to degraded barriers, then add `.degradation-control` cards for audits, proof tests, override reviews, or maintenance actions.
- Use red only for the top event and weak/missing barrier states, orange for incoming threats, blue for preventive controls, purple for outgoing consequence paths, and green for healthy barriers.
- Expose `data-pattern-family="bowtie-barriers"`, `data-threat-count`, `data-preventive-barrier-count`, `data-mitigative-barrier-count`, `data-consequence-count`, `data-barrier-count`, `data-critical-gap-count`, `data-degradation-control-count`, `.bowtie-threat`, `.bowtie-consequence`, `.bowtie-barrier`, `.degraded-barrier`, `.bowtie-link`, `.bowtie-threat-pulse`, `.bowtie-consequence-pulse`, `.critical-barrier-gap`, and `.degradation-control` for audits.
- Prefer `scripts/build_critical_bowtie_barrier.py` for self-contained standalone HTML in isolated workspaces.

## Critical SLO Burn Rate

Pattern ID: `d3-slo-burn-rate`.

Use when the critical story is reliability alerting before or during service degradation: SLO target, remaining error budget, multi-window burn-rate thresholds, page/ticket levels, and time-to-exhaust action.

- Keep budget remaining as a left-side percent-over-time chart; do not encode budget as another bar in the burn-rate rows.
- Model budget samples with `hour`, `remaining`, and optional `label`.
- Model burn windows with `id`, `label`, `current`, `threshold`, `notification`, `severity`, and semantic `color`.
- Draw `.slo-threshold-band` regions before `.slo-budget-line`, then `.slo-budget-point` marks, `.slo-now-marker`, `.slo-exhaustion-projection`, `.burn-rate-pulse` markers, `.slo-burn-window` rows, and `.slo-action-step` cards.
- Keep page-level critical rows visibly stronger than ticket/watch rows; expose the notification level in `.slo-alert-state`.
- Show current time and projected budget exhaustion explicitly; do not rely on users inferring time-to-exhaust from slope alone.
- Use red for page-level burn breaches and budget exhaustion risk, orange for ticket-level pressure, green for safe budget, blue for telemetry, and purple for release-policy action.
- Expose `data-pattern-family="critical-slo"`, `data-budget-point-count`, `data-window-count`, `data-threshold-band-count`, `data-action-count`, `data-summary-card-count`, `data-pulse-count`, `data-time-to-exhaust-hours`, `.slo-budget-line`, `.slo-budget-point`, `.slo-threshold-band`, `.slo-now-marker`, `.slo-exhaustion-projection`, `.slo-burn-window`, `.burn-rate-bar`, `.burn-threshold-marker`, `.slo-alert-state`, `.slo-action-step`, `.slo-summary-card`, and `.burn-rate-pulse` for audits.
- Prefer `scripts/build_critical_slo_burn_rate.py` for self-contained standalone HTML in isolated workspaces.

## Critical Queue Backpressure

Pattern ID: `d3-queue-backpressure`.

Use when the critical story is overload control rather than incident timeline, dependency mapping, or SLO burn: bounded queue depth, message age, producer throttling, retry pressure, saturated consumers, load shedding, dead-letter/sideline routing, and recovery after backpressure.

- Keep producers on the left, the bounded queue in the center, and competing consumers on the right.
- Model producers with `id`, `label`, `rate`, `priority`, and semantic `color`.
- Model consumers with `id`, `label`, `state`, `capacity`, and semantic `color`.
- Model controls with `id`, `label`, `state`, and semantic `color`; place `.backpressure-gate` controls upstream of the queue.
- Draw `.queue-flow-path` routes before `.queue-message-pulse` marks, and keep pulses away from label text.
- Use `.queue-segment` slots inside `.bounded-queue` to make headroom and saturation visible; pair it with a `.queue-depth-line` trend and `.queue-capacity-marker`.
- Add one `.queue-age-guard` when oldest-message age exceeds useful TTL, and route stale work toward the sideline/dead-letter mark instead of normal workers.
- Use `.load-shed-path` and `.dead-letter-bin` marks for stale or sidelined work; do not hide shedding as a generic failed edge.
- Use red for critical backlog or dropped work, orange for throttling/backpressure, green for healthy drain/recovery, blue for normal ingress/worker flow, and purple for retry or priority shaping.
- Expose `data-pattern-family="critical-queue"`, `data-producer-count`, `data-consumer-count`, `data-queue-segment-count`, `data-control-count`, `data-shed-count`, `data-backlog-point-count`, `data-status-card-count`, `data-pulse-count`, `data-current-depth`, `data-backpressure-threshold`, `data-oldest-message-minutes`, `.producer-source`, `.bounded-queue`, `.queue-segment`, `.queue-flow-path`, `.consumer-worker`, `.backpressure-gate`, `.load-shed-path`, `.dead-letter-bin`, `.queue-age-guard`, `.queue-depth-line`, `.queue-capacity-marker`, `.queue-depth-point`, `.queue-status-card`, and `.queue-message-pulse` for audits.
- Prefer `scripts/build_critical_queue_backpressure.py` for self-contained standalone HTML in isolated workspaces.

## Critical Cache Stampede

Pattern ID: `d3-cache-stampede`.

Use when the critical story is hot-key cache expiry rather than general queue overload or service failover: cache stampede, thundering herd, dogpile effect, stale-while-revalidate, soft TTL, hard TTL, TTL jitter, request coalescing, single-flight refresh, origin shielding, cache warming, hit-ratio collapse, and origin load spike.

- Keep request sources on the left, the cache/hot-key state in the center, and origin services on the right.
- Model request sources with `id`, `label`, `rate`, `kind`, and semantic `color`.
- Model cache state with `key`, `state`, `softTtlSeconds`, `hardTtlSeconds`, `staleWindowSeconds`, `stampedeRate`, `coalescedOriginCalls`, and `lockState`.
- Draw `.cache-flow-path` routes before `.cache-request-pulse` marks. Keep pulses on lanes and away from text.
- Draw one `.cache-hot-key` inside `.cache-layer`, one `.stampede-wave` toward origin, one `.singleflight-lock`, one `.request-collapse-gate`, and one `.origin-shield`.
- Use `.stale-response-path` to show protected stale responses while one refresh proceeds to origin.
- Add `.ttl-marker` marks for soft TTL, hard TTL, and TTL jitter or refresh spread.
- Pair `.hit-ratio-line` with `.origin-load-line` so the miss storm and recovery are visible together.
- Add `.cache-mitigation-step` cards for coalescing, serving stale, refreshing one copy, and jittering or warming hot keys.
- Use red for hot-key expiry and origin saturation, orange for TTL warning and miss pressure, green for stale response and recovery, blue for normal cache traffic, and purple for locks/coalescing/warming.
- Expose `data-pattern-family="critical-cache"`, `data-request-source-count`, `data-cache-flow-count`, `data-cache-pulse-count`, `data-hit-ratio-point-count`, `data-origin-load-point-count`, `data-ttl-marker-count`, `data-mitigation-count`, `data-status-card-count`, `data-hot-key`, `data-soft-ttl-seconds`, `data-hard-ttl-seconds`, `data-stale-window-seconds`, `data-stampede-rate`, `data-coalesced-origin-calls`, `data-origin-load-peak`, `.cache-request-source`, `.cache-layer`, `.cache-hot-key`, `.cache-flow-path`, `.cache-request-pulse`, `.stampede-wave`, `.singleflight-lock`, `.request-collapse-gate`, `.stale-response-path`, `.origin-shield`, `.ttl-marker`, `.hit-ratio-line`, `.hit-ratio-point`, `.origin-load-line`, `.origin-load-point`, `.cache-mitigation-step`, and `.cache-status-card` for audits.
- Prefer `scripts/build_critical_cache_stampede.py` for self-contained standalone HTML in isolated workspaces.

## Critical Circuit Breaker

Pattern ID: `d3-circuit-breaker`.

Use when the critical story is cascading-failure prevention around a degraded dependency rather than a generic service map: circuit breaker, closed/open/half-open states, failure threshold, reset timeout, fast fail, fallback response, retry isolation, and recovery probe.

- Keep clients on the left, the caller service and retry guard in the middle-left, the circuit breaker in the center, and the downstream dependency plus fallback response on the right.
- Model clients with `id`, `label`, `rate`, `kind`, and semantic `color`.
- Model breaker state with `state`, `failureThreshold`, `currentFailureRate`, `openWindowSeconds`, `timeoutMs`, `retryBudget`, and `probeCount`.
- Draw `.breaker-flow-path` routes before `.breaker-request-pulse` marks. Keep pulses on lanes and away from text.
- Draw one `.caller-service`, one `.circuit-breaker`, one `.downstream-service`, one `.fallback-service`, one `.retry-suppression-gate`, one `.open-circuit-barrier`, one `.fallback-path`, one `.fail-fast-path`, and one `.probe-path`.
- Draw `.breaker-state-node` marks for closed, open, half-open, and closed/recovered. Keep the active open state visually dominant.
- Pair `.trip-threshold-line` with `.breaker-failure-line`, `.breaker-latency-line`, `.breaker-failure-point`, and `.breaker-latency-point` samples so the trip is tied to a measured failure window.
- Add `.breaker-mitigation-step` cards for setting a timeout, tripping on threshold, failing fast to fallback, and probing before close.
- Use red for open breaker and downstream failure, orange for timeout pressure and retry budget warning, green for fallback/recovery, blue for normal caller traffic, and purple for half-open probes or coordination.
- Expose `data-pattern-family="critical-resilience"`, `data-client-count`, `data-flow-count`, `data-pulse-count`, `data-state-count`, `data-failure-point-count`, `data-latency-point-count`, `data-mitigation-count`, `data-status-card-count`, `data-breaker-state`, `data-failure-threshold`, `data-current-failure-rate`, `data-open-window-seconds`, `data-timeout-ms`, `data-retry-budget`, `data-probe-count`, `.breaker-client`, `.caller-service`, `.circuit-breaker`, `.downstream-service`, `.fallback-service`, `.breaker-flow-path`, `.breaker-request-pulse`, `.open-circuit-barrier`, `.retry-suppression-gate`, `.fail-fast-path`, `.fallback-path`, `.probe-path`, `.half-open-probe`, `.breaker-state-node`, `.trip-threshold-line`, `.breaker-failure-line`, `.breaker-latency-line`, `.breaker-failure-point`, `.breaker-latency-point`, `.breaker-mitigation-step`, and `.breaker-status-card` for audits.
- Prefer `scripts/build_critical_circuit_breaker.py` for self-contained standalone HTML in isolated workspaces.

## Critical Bulkhead Isolation

Pattern ID: `d3-bulkhead-isolation`.

Use when the critical story is resource isolation rather than a generic dependency outage: bulkheads, isolated cells, noisy-neighbor containment, tenant partitioning, dedicated thread or connection pools, isolated queues, concurrency caps, and overflow shedding.

- Keep clients on the left, a partition router in the middle-left, and isolated resource cells across the center-right.
- Model clients with `id`, `label`, `rate`, `cell`, and semantic `color`.
- Model cells with `id`, `label`, `pool`, `usedSlots`, `totalSlots`, `utilization`, and semantic `color`.
- Draw `.bulkhead-flow-path` routes before `.bulkhead-request-pulse` marks. Keep pulses on lanes and away from text.
- Draw one `.bulkhead-router`, three `.bulkhead-cell` compartments, one `.resource-pool` per cell, and `.pool-slot` marks that make saturation visible.
- Draw `.bulkhead-wall` boundaries between cells and one `.isolation-boundary` around the cell region.
- Use one `.saturation-wave` inside the noisy cell and one `.shed-path` toward `.overflow-shed`; do not imply overflow can consume healthy cells.
- Pair `.cell-health-line` with `.cell-health-point` samples so only the noisy cell crosses capacity while protected cells remain below threshold.
- Add `.bulkhead-policy-step` cards for partitioning by key, capping concurrency, isolating queues, and shedding overflow.
- Use red for saturated/rejected work, orange for shed pressure, green for protected critical capacity, blue for normal isolated traffic, and purple for partition routing.
- Expose `data-pattern-family="critical-bulkhead"`, `data-client-count`, `data-cell-count`, `data-pool-slot-count`, `data-flow-count`, `data-pulse-count`, `data-wall-count`, `data-health-line-count`, `data-health-point-count`, `data-policy-step-count`, `data-status-card-count`, `data-saturated-cell`, `data-shed-rate`, `data-protected-cell-count`, `data-partition-key`, `data-concurrency-limit`, `.bulkhead-client`, `.bulkhead-router`, `.bulkhead-cell`, `.resource-pool`, `.pool-slot`, `.bulkhead-wall`, `.isolation-boundary`, `.bulkhead-flow-path`, `.bulkhead-request-pulse`, `.saturation-wave`, `.shed-path`, `.overflow-shed`, `.cell-health-line`, `.cell-health-point`, `.bulkhead-policy-step`, and `.bulkhead-status-card` for audits.
- Prefer `scripts/build_critical_bulkhead_isolation.py` for self-contained standalone HTML in isolated workspaces.

## Critical Rate Limit Token Bucket

Pattern ID: `d3-token-bucket`.

Use when the critical story is admission control before overload rather than queue recovery: token bucket, rate limit, burst cap, API throttling, quota keys, 429 Too Many Requests, Retry-After, allowed vs rejected traffic, and backend protection.

- Keep clients on the left, one API gateway before admission, the token bucket in the center, and backend plus Retry-After response on the right.
- Model clients with `id`, `label`, `rate`, `quotaKey`, and semantic `color`.
- Model bucket state with `capacity`, `currentTokens`, `refillRate`, `burstLimit`, `retryAfterSeconds`, `allowedRate`, and `throttledRate`.
- Draw `.rate-limit-flow-path` routes before `.rate-limit-request-pulse` marks. Keep pulses on lanes and away from text.
- Draw one `.api-gateway`, one `.token-bucket`, exactly 12 `.token-slot` marks for the default contract, one `.refill-clock`, one `.allowed-path`, one `.throttled-path`, one `.protected-backend`, and one `.retry-after-response`.
- Use `.token-slot[data-state="available"]` and `.token-slot[data-state="empty"]` so remaining capacity is explicit.
- Pair `.rate-limit-metric-line` with `.rate-limit-metric-point` samples for incoming, admitted, and rejected traffic; include one `.limit-threshold-line`.
- Add `.rate-limit-policy-step` cards for refill rate, burst cap, 429 response, and jitter/backoff retries.
- Use red for over-limit incoming pressure and exhausted tokens, orange for throttled/Retry-After work, green for admitted/protected backend traffic, blue for normal clients, and purple for quota/refill coordination.
- Expose `data-pattern-family="critical-rate-limit"`, `data-client-count`, `data-flow-count`, `data-pulse-count`, `data-token-count`, `data-metric-line-count`, `data-metric-point-count`, `data-policy-step-count`, `data-status-card-count`, `data-bucket-capacity`, `data-current-tokens`, `data-refill-rate`, `data-burst-limit`, `data-retry-after-seconds`, `data-allowed-rate`, `data-throttled-rate`, `.rate-limit-client`, `.api-gateway`, `.token-bucket`, `.token-slot`, `.refill-clock`, `.rate-limit-flow-path`, `.rate-limit-request-pulse`, `.allowed-path`, `.throttled-path`, `.retry-after-response`, `.protected-backend`, `.rate-limit-metric-line`, `.rate-limit-metric-point`, `.limit-threshold-line`, `.rate-limit-policy-step`, and `.rate-limit-status-card` for audits.
- Prefer `scripts/build_critical_rate_limit_token_bucket.py` for self-contained standalone HTML in isolated workspaces.

## Critical Idempotency Replay Guard

Pattern ID: `d3-idempotency-guard`.

Use when the critical story is safe retry behavior rather than only throttling or queueing: idempotency keys, duplicate suppression, replaying the first stored response, comparing request fingerprints, rejecting changed payloads that reuse a key, retaining keys for a TTL window, and preventing duplicate side effects in payment/order flows.

- Keep retrying clients on the left, one idempotency-aware gateway before side effects, the idempotency ledger in the center, and side-effect, stored-response, and rejection outcomes on the right.
- Model attempts with `id`, `label`, `key`, `fingerprint`, `action`, and semantic `color`.
- Model ledger rows with `id`, `key`, `fingerprint`, `outcome`, `response`, and semantic `color`.
- Draw `.idempotency-flow-path` routes before `.idempotency-request-pulse` marks. Keep pulses on lanes and away from text.
- Draw one `.duplicate-guard` before the ledger and one `.ttl-window-marker` inside or beside the ledger.
- Draw `.idempotency-ledger-row` entries that distinguish the first write, same-fingerprint replays, and one fingerprint mismatch.
- Use `.side-effect-path` for the one committed side effect, `.response-replay-path` for stored response replay, and `.mismatch-reject-path` for changed payload rejection.
- Pair `.idempotency-metric-line` with `.idempotency-metric-point` samples for attempts, side effects, and duplicate suppression so attempts can rise while side effects stay flat.
- Add `.idempotency-policy-step` cards for requiring a key, fingerprinting payloads, storing the first response, and replaying or rejecting later attempts.
- Use red for mismatched payloads and duplicate-side-effect risk, orange for retry/suppression pressure, green for committed side effects and safe replay, blue for normal first traffic, and purple for key/fingerprint/ledger coordination.
- Expose `data-pattern-family="critical-idempotency"`, `data-client-count`, `data-retry-count`, `data-duplicate-count`, `data-flow-count`, `data-pulse-count`, `data-ledger-row-count`, `data-side-effect-count`, `data-replay-count`, `data-mismatch-count`, `data-metric-line-count`, `data-metric-point-count`, `data-policy-step-count`, `data-status-card-count`, `data-idempotency-key`, `data-idempotency-ttl-hours`, `data-duplicate-suppressed`, `data-side-effects-created`, `data-replayed-response-code`, `.idempotency-client`, `.idempotency-gateway`, `.idempotency-ledger`, `.idempotency-ledger-row`, `.idempotency-key`, `.request-fingerprint`, `.duplicate-guard`, `.side-effect-path`, `.response-replay-path`, `.mismatch-reject-path`, `.idempotency-flow-path`, `.idempotency-request-pulse`, `.side-effect-target`, `.stored-response`, `.ttl-window-marker`, `.idempotency-metric-line`, `.idempotency-metric-point`, `.idempotency-policy-step`, and `.idempotency-status-card` for audits.
- Prefer `scripts/build_critical_idempotency_replay_guard.py` for self-contained standalone HTML in isolated workspaces.

## Critical Replication Failover

Pattern ID: `d3-replication-failover`.

Use when the critical story is database or stateful-service failover rather than a generic outage timeline: primary degradation, replication lag, old-writer fencing, quorum, split-brain prevention, RPO exposure, RTO target, promotion candidate, and traffic reroute.

- Keep the degraded primary on the left, replicas in a middle vertical column, and witness/quorum or routing control on the right.
- Model nodes with `id`, `label`, `role`, `state`, `lag`, `color`, `x`, and `y`.
- Model replication links separately with `id`, `source`, `target`, `kind`, `lag`, and semantic `color`; compute edge-to-edge paths from final node cards.
- Draw `.replication-link` paths before `.replication-pulse` marks. Keep pulses on lanes and away from text.
- Add one `.write-fence` mark before promotion so the old primary is visibly prevented from accepting writes.
- Use one `.promotion-path` for the selected lowest-lag replica; do not imply that the old primary and promoted replica both accept writes.
- Draw `.traffic-reroute` and `.traffic-reroute-path` from quorum/control-plane toward the writer endpoint after promotion.
- Add `.lag-threshold-band`, `.lag-chart-line`, `.lag-sample-point`, and `.rpo-gap` marks so the data-loss exposure is explicit.
- Add `.quorum-vote` marks for accepted and rejected votes, including stale replicas or frozen writers.
- Add `.failover-step` cards for freeze writes, verify quorum, promote replica, and reroute traffic.
- Use red for degraded primary, stale replica, rejected vote, and RPO exposure; orange for warning lag and transition pressure; green for the promotion candidate and restored route; blue for normal replication; purple for quorum/control-plane decisions.
- Expose `data-pattern-family="critical-replication"`, `data-node-count`, `data-replication-link-count`, `data-lag-sample-count`, `data-quorum-vote-count`, `data-failover-step-count`, `data-status-card-count`, `data-pulse-count`, `data-rpo-events-at-risk`, `data-rto-target-seconds`, `data-write-fence-count`, `data-traffic-reroute-count`, `.replication-node`, `.primary-node`, `.replica-node`, `.witness-node`, `.replication-link`, `.replication-pulse`, `.lag-chart-line`, `.lag-threshold-band`, `.lag-sample-point`, `.quorum-vote`, `.write-fence`, `.failover-step`, `.promotion-path`, `.traffic-reroute`, `.traffic-reroute-path`, `.rpo-gap`, and `.replication-status-card` for audits.
- Prefer `scripts/build_critical_replication_failover.py` for self-contained standalone HTML in isolated workspaces.

## Critical Dependency Blast Radius

Pattern ID: `d3-dependency-blast-radius`.

Use when the critical story is architecture impact rather than project schedule or incident timeline: central service, hard dependencies, affected surfaces, failover routes, and blast-radius tiers.

- Keep the critical service centered; put hard dependencies left/top-left and affected surfaces right/bottom-right.
- Model nodes with `id`, `label`, `role`, `x`, `y`, `status`, and semantic `color`.
- Model links with `source`, `target`, `kind`, `severity`, and optional `critical`; compute curves from final node positions.
- Draw `.blast-radius-ring` tiers before links, then nodes, then `.dependency-pulse` markers and `.blast-wave`.
- Use `.failover-path` dashed green routes for protected capacity; reveal them after the blast wave so the risk is visible before the mitigation.
- Add `.blast-tier-label` marks so ring meaning is visible, and `.blast-status-card` marks for the current critical input, blast radius, and mitigation.
- Expose `data-pattern-family="critical-dependency"`, `data-node-count`, `data-link-count`, `data-critical-link-count`, `data-impact-count`, `data-ring-count`, `data-tier-label-count`, `data-failover-count`, `data-status-card-count`, `.critical-dependency-node`, `.dependency-link`, `.critical-dependency-link`, `.dependency-pulse`, `.blast-radius-ring`, `.blast-tier-label`, `.blast-wave`, `.impact-surface`, `.failover-path`, and `.blast-status-card` for audits.
- Prefer `scripts/build_critical_dependency_blast_radius.py` for self-contained standalone HTML in isolated workspaces.

## Organic Growth Patterns

Pattern IDs: `d3-organic-growth`, `d3-phyllotaxis-seed-head`, `d3-lsystem-canopy`, `d3-reaction-diffusion-field`, `d3-diffusion-limited-aggregation`.

Use when a D3/SVG artifact needs organic, botanical, cellular, coral-like, lichen-like, mineral, or dendritic form without becoming decorative random noise.

- Pick the mathematical rule before drawing: phyllotaxis for packed radial growth, L-systems for recursive branching, reaction-diffusion for spots/stripes/activator fields, or DLA for accretive random-walk clusters.
- Keep every variant deterministic through formulas, grammar iterations, fixed simulation parameters, or a seeded random generator.
- Expose the root as `data-pattern-id="d3-organic-growth"` and each variant as an `.organic-variant` with its exact `d3-*` ID.
- Use `.organic-seed`, `.organic-branch`, `.organic-rd-cell`, `.organic-aggregate-particle`, and `.organic-dla-link` hooks so browser audits can prove the intended model survived adaptation.
- Animate growth in model order: seed index, grammar path order, field sweep, or DLA attachment order.
- Prefer `scripts/build_organic_growth_patterns.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Natural Math Archetypes

Pattern ID: `d3-nature-geometry`.

Use when a concept explainer needs mathematically defensible archetypes from nature organized around the theory-of-three contract: invariant, generative rule, and natural expression.

- Keep one panel per archetype. The current reusable set is golden-angle phyllotaxis, pi circular waves, logarithmic spirals, fractal branching, hexagonal packing, and Voronoi cell fields.
- Expose root constants for audits: `data-phi`, `data-pi`, `data-golden-angle-degrees`, and `data-hex-circle-packing-density`.
- Avoid popular but weak claims. Do not imply all shells are golden spirals, all plants follow Fibonacci counts, or honeycomb perimeter optimality is the same as circle-packing density.
- Draw every archetype from a deterministic formula or construction. Use no decorative random blobs.
- Keep the three readable roles consistent across panels: invariant, rule, and nature.
- Expose `.natural-archetype`, `.archetype-visual`, `.natural-seed`, `.natural-wave-ring`, `.natural-log-spiral`, `.fractal-branch`, `.hex-pack-cell`, `.voronoi-leaf-cell`, and `.voronoi-site` hooks.
- Prefer `scripts/build_natural_math_archetypes.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Process P&ID Control Loop

Pattern ID: `d3-process-control-loop`.

Use when a D3/SVG artifact needs a process-engineering P&ID style diagram: process equipment, pipe runs, valves, instrument bubbles, dashed control signals, safety interlocks, and utility lines.

- Build around a stable left-to-right process pipe; place control logic above or near the controlled equipment instead of turning the diagram into a generic flowchart.
- Use simplified but recognizable P&ID symbols: vertical vessels/tanks, pump circles with impeller wedges, exchanger bodies with coils, bowtie valve symbols, and round instrument bubbles with tag plus loop number.
- Keep color mostly functional: blue process flow, orange utility/temperature duty, green level control, purple flow control, red only for high-high trip or safety shutdown, and neutral grays for equipment shells.
- Preserve dash semantics. Do not run a path-draw helper that replaces dashed signal-line stroke patterns unless the final dash pattern is restored.
- Expose `.pid-equipment`, `.pid-valve`, `.pid-instrument`, `.pid-process-line`, `.pid-signal-line`, `.pid-trip-line`, `.pid-flow-pulse`, and count attributes for audits.
- Prefer `scripts/build_process_pid_control_loop.py` for a self-contained standalone HTML starting point in isolated workspaces.

## Parabolic Arcs For SDLC Tasks

Pattern ID: `d3-parabolic-arcs`.

Use when ordered SDLC phases or milestones need cross-phase dependency links, handoffs, or task flows. The baseline represents lifecycle order; arc height represents dependency strength, risk, effort, or coordination cost.

Recommended SDLC data contract:

```js
const phases = ["Discover", "Design", "Build", "Test", "Release", "Operate"];
const links = [
  { from: "Discover", to: "Build", label: "Backlog clarification", value: 72, kind: "dependency" },
  { from: "Design", to: "Test", label: "Acceptance criteria", value: 96, kind: "quality" },
  { from: "Build", to: "Release", label: "CI/CD packaging", value: 64, kind: "delivery" }
];
```

Geometry contract:

- Use a single horizontal baseline with one endpoint per SDLC phase.
- Use `d3.scalePoint().domain(phases).range([left, right])` so phase spacing remains stable.
- Draw each task link as a quadratic curve: `M x0,baseline Q mid,baseline - height x1,baseline`.
- Derive `height` from `value` with a bounded linear scale. Keep the shortest visible arc tall enough to distinguish from the baseline.
- If `from` is after `to`, draw the arc in the opposite direction but keep endpoints on the same baseline; do not reorder the data silently.
- Label phases on the baseline. Label tasks only when there is enough space; otherwise expose labels through `<title>` or a compact legend.

Semantic color roles:

- Use blue for dependencies or normal handoffs.
- Use green for quality, validation, or acceptance work.
- Use orange for release, delivery, or operational coordination.
- Use red only for high-risk or blocking work.
- Use purple for discovery, architecture, or cross-team planning.

Animation contract:

- Draw the baseline first.
- Draw arcs with a path-draw animation (`stroke-dasharray` and `stroke-dashoffset`) in task order or by descending `value`.
- Grow endpoint dots after arcs begin so the viewer sees the lifecycle anchors.
- Keep final path attributes complete; the SVG must still show all links after animation ends.

Minimal standalone renderer:

```js
const width = 760;
const height = 430;
const baseline = 330;
const left = 70;
const right = width - 70;
const x = d3.scalePoint().domain(phases).range([left, right]);
const heightFor = d3.scaleLinear()
  .domain(d3.extent(links, d => d.value))
  .range([56, 138]);

function arcPath(link) {
  const x0 = x(link.from);
  const x1 = x(link.to);
  const mid = (x0 + x1) / 2;
  return `M${x0},${baseline}Q${mid},${baseline - heightFor(link.value)} ${x1},${baseline}`;
}

const svg = d3.select("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("data-pattern-id", "d3-parabolic-arcs")
  .attr("role", "img");

svg.append("line")
  .attr("x1", left - 18)
  .attr("x2", right + 18)
  .attr("y1", baseline)
  .attr("y2", baseline)
  .attr("stroke", palette.gray300)
  .attr("stroke-width", 2);

const paths = svg.append("g")
  .attr("fill", "none")
  .selectAll("path")
  .data(links)
  .join("path")
  .attr("d", arcPath)
  .attr("stroke", d => colorForKind[d.kind] ?? palette.blue)
  .attr("stroke-width", d => 2 + heightFor(d.value) / 55)
  .attr("stroke-linecap", "round")
  .attr("opacity", 0.9);

paths.each(function (_, index) {
  const length = this.getTotalLength();
  d3.select(this)
    .attr("stroke-dasharray", `${length} ${length}`)
    .attr("stroke-dashoffset", 0)
    .append("animate")
    .attr("attributeName", "stroke-dashoffset")
    .attr("from", length)
    .attr("to", 0)
    .attr("dur", "1.05s")
    .attr("begin", `${0.08 + index * 0.08}s`)
    .attr("fill", "freeze");
});
```

Verification hooks:

- The root SVG or card must expose `data-pattern-id="d3-parabolic-arcs"`.
- Every path should have a non-empty `d` attribute containing one `Q` command.
- Endpoint count should match the number of phases.
- Browser validation should confirm nonblank rendered pixels and at least one animated path.
- In an isolated skill-only test, copy only `d3-animated-svg/` plus a new empty workspace; do not read the gallery fixture.

## Adaptation Checklist

Before committing an adapted pattern:

- Search `references/pattern-index.md` for the source pattern ID and read the matching `references/patterns/<id>.md` file.
- Read the gallery fixture only when changing or validating the gallery fixture itself.
- Copy only the required helpers, data shape, and geometry.
- Preserve semantic roles for shapes, colors, and motion.
- Add or update the stable `d3-*` ID if it becomes a gallery card.
- Run `npm run verify --prefix .agents/skills/d3-animated-svg/assets/examples/d3-animated-svg` for gallery changes.
- For served or Pages behavior, verify through HTTP so CDN/local asset assumptions are tested.
