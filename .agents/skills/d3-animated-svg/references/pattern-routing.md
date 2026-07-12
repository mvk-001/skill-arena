# Pattern Routing

Use this file to choose focused D3 pattern references without loading the gallery fixture or unrelated examples.

## Exact Pattern IDs

When the request names exact `d3-*` IDs:

1. Extract the complete unique set of IDs.
2. Strip the `d3-` prefix.
3. Read every matching `references/patterns/<id>.md` before coding.
4. Do not start implementation after reading only the first pattern.

When the request asks for a closest gallery pattern without naming an exact ID, search `references/pattern-index.md`, choose one pattern, and then read only that matching file under `references/patterns/`.

Do not read the gallery fixture for normal pattern generation. Use the gallery only when maintaining that fixture.

## Exact Cardinality Contracts

Read `references/cardinality-generalization.md` before coding when the request asks for:

- fewer or more elements
- small, medium, or large variants
- exact `svg#id` hooks
- exact mark counts, classes, IDs, or data values
- force-network or beeswarm variants generated from a JSON contract

Extract every requested output ID, data count, mark class, and validation hook first. For supported pattern families, prefer `scripts/build_cardinality_variants.ts` and do not read `references/pattern-index.md` or per-pattern references unless the generator cannot satisfy the request.

## Direct Builder Patterns

For standalone HTML requests in these families, read the named pattern reference and prefer the builder script before considering generic charts or diagrams.

| Request mentions | Pattern reference | Preferred script |
| --- | --- | --- |
| circuit boards, PCB traces, signal pulses, bus handshakes, fault isolation, reroutes | `references/patterns/circuit-signal-traces.md` | `scripts/build_circuit_signal_traces.py` |
| P&ID, piping and instrumentation, process equipment, valves, instrument bubbles, control loops, interlocks | `references/patterns/process-control-loop.md` | `scripts/build_process_pid_control_loop.py` |
| SEV incidents, incident response, outage escalation, on-call pages, SLA countdowns, mitigations, recovery | `references/patterns/incident-escalation.md` | `scripts/build_critical_incident_escalation.py` |
| fault tree analysis, FTA, top events, AND/OR failure gates, cut sets, reliability risk decomposition | `references/patterns/fault-tree.md` | `scripts/build_critical_fault_tree.py` |
| bowtie analysis, barrier analysis, threats, top events, consequences, preventive or mitigative barriers, LOPA-style layers | `references/patterns/bowtie-barriers.md` | `scripts/build_critical_bowtie_barrier.py` |
| SLOs, error budgets, burn rate, multi-window alerts, page/ticket thresholds, budget exhaustion | `references/patterns/slo-burn-rate.md` | `scripts/build_critical_slo_burn_rate.py` |
| queue overload, backpressure, bounded queues, retry storms, throttling, load shedding, dead-letter queues | `references/patterns/queue-backpressure.md` | `scripts/build_critical_queue_backpressure.py` |
| cache stampedes, thundering herds, dogpile effects, hot-key expiry, stale-while-revalidate, TTL jitter, single-flight refresh | `references/patterns/cache-stampede.md` | `scripts/build_critical_cache_stampede.py` |
| circuit breakers, fast fail, fallback responses, open/closed/half-open states, failure thresholds, recovery probes | `references/patterns/circuit-breaker.md` | `scripts/build_critical_circuit_breaker.py` |
| bulkheads, resource isolation, noisy-neighbor containment, tenant isolation, cells, isolated queues, concurrency partitions | `references/patterns/bulkhead-isolation.md` | `scripts/build_critical_bulkhead_isolation.py` |
| rate limiting, token buckets, leaky buckets, API throttling, 429 responses, Retry-After, quota keys, burst limits | `references/patterns/token-bucket.md` | `scripts/build_critical_rate_limit_token_bucket.py` |
| idempotency keys, safe retries, duplicate suppression, replay guards, stored responses, side-effect prevention, TTL windows | `references/patterns/idempotency-guard.md` | `scripts/build_critical_idempotency_replay_guard.py` |
| replication lag, failover, leader election, quorum, split-brain avoidance, RPO/RTO, replica promotion, traffic reroute | `references/patterns/replication-failover.md` | `scripts/build_critical_replication_failover.py` |
| service dependencies, blast radius, impact surfaces, failover routes, dependency health, hard-dependency risk maps | `references/patterns/dependency-blast-radius.md` | `scripts/build_critical_dependency_blast_radius.py` |
| critical paths, critical chains, bottleneck schedules, dependency buffers, feeding buffers, deadline risk | `references/patterns/critical-chain-buffer.md` | `scripts/build_critical_chain_buffer.py` |
| organic growth, fractals, phyllotaxis, L-systems, reaction-diffusion, Turing spots, diffusion-limited aggregation, coral, lichen, dendritic growth | `references/patterns/organic-growth.md` | `scripts/build_organic_growth_patterns.py` |
| mathematical archetypes in nature, golden ratio, golden angle, pi rings, logarithmic spirals, honeycomb packing, Voronoi leaf cells, fractal branching | `references/patterns/nature-geometry.md` | `scripts/build_natural_math_archetypes.py` |

## Non-Builder Pattern Shortcuts

- For overlapping scopes, shared task membership, asymmetric circles, or tasks belonging to one, two, or three-or-more sets, read `references/patterns/task-overlap.md`.
- For a Kanban board with assignee dots, people legends, or alternate legend placement, read `references/patterns/kanban-assignees.md`. Choose `legendMode: "top-row"`, `"virtual-column"`, or `"distributed-columns"` before coding so data, dimensions, and validation hooks stay consistent.
- For sketchy rendering, preserve data geometry and roughen marks, axes, links, and containers with seeded jitter, double strokes, and optional hachures while keeping text crisp.
