# Critical Cache Stampede

- **Pattern ID:** `d3-cache-stampede`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A system needs to explain a hot-key cache expiration, thundering herd, dogpile/cache-stampede pressure, origin saturation risk, single-flight locking, stale responses, TTL jitter, or cache warming.
- **Builder:** `scripts/build_critical_cache_stampede.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_cache_stampede.py cache.html
```

- Keep geometry deterministic. Do not use a live D3 runtime, CDN, remote font, or remote image dependency in the final standalone artifact.
- Use SVG-native path drawing, request-pulse motion, line drawing, stampede-wave emphasis, and mitigation reveal.
- Keep cache miss surge, hit-ratio collapse, origin load, single-flight lock, stale response, and TTL policy as separate visual concepts.
- Preserve critical semantics: red is origin saturation or hot-key expiry risk; orange is miss surge or TTL warning; green is protected stale response and recovered hit ratio; blue is normal cache hit traffic; purple is coordination, lock, request coalescing, or cache warming.

## Data Contract

Use explicit records for request sources, flow paths, cache state, hit-ratio samples, origin-load samples, TTL markers, status cards, and mitigation steps:

```js
const requestSources = [
  { id: "web", label: "Web clients", rate: "4.1k/s", color: "blue" },
  { id: "api", label: "Partner API", rate: "3.0k/s", color: "blue" },
  { id: "retry", label: "Retries", rate: "2.8k/s", color: "purple" }
];

const cacheState = {
  key: "product:123",
  state: "expired hot key",
  softTtlSeconds: 30,
  hardTtlSeconds: 90,
  staleWindowSeconds: 60,
  stampedeRate: "11.8k/s",
  coalescedOriginCalls: 1,
  lockState: "single-flight active"
};

const trend = [
  { minute: -5, hitRatio: 96, originLoad: 18 },
  { minute: 0, hitRatio: 18, originLoad: 98 }
];
```

Every request source needs `id`, `label`, `rate`, and semantic `color`. Every flow needs `id`, `source`, `target`, `kind`, and semantic `color`. Every mitigation step needs `id`, `label`, `note`, and semantic `color`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-cache-stampede"`.
2. Put request sources on the left, the cache/hot-key state in the center, and origin services on the right.
3. Draw `.cache-flow-path` routes before `.cache-request-pulse` marks. Keep pulses on lanes and away from text.
4. Draw `.cache-hot-key` inside the cache panel with explicit soft TTL and hard TTL state.
5. Draw one `.stampede-wave` from the expired hot key toward origin so the dangerous fan-out is visible.
6. Draw one `.singleflight-lock` between cache and origin, one `.request-collapse-gate` showing many misses collapsing to one origin call, and one `.origin-shield` around the origin target.
7. Draw `.stale-response-path` routes from cache back to request sources to show stale-while-revalidate protection.
8. Draw `.ttl-marker` marks for soft TTL, hard TTL, and refresh jitter in a compact policy strip.
9. Draw `.hit-ratio-line`, `.hit-ratio-point`, `.origin-load-line`, and `.origin-load-point` in one bottom chart or two coordinated charts.
10. Draw `.cache-mitigation-step` cards for coalesce request, serve stale, refresh one copy, and jitter/warm keys.

## Animation Contract

- Reveal status cards and topology first.
- Draw normal cache-hit paths before the red stampede wave.
- Start `.cache-request-pulse` motion only after visible paths exist.
- Reveal `.singleflight-lock` before showing the green `.stale-response-path`.
- Draw hit-ratio and origin-load lines before showing mitigation cards.
- The final frame must retain all request sources, cache state, lock, origin shield, stampede wave, stale path, TTL markers, trend points, pulses, status cards, and mitigation steps.

## Semantic Color Roles

- Red: hot-key expiry, miss storm, origin saturation, and user-facing risk.
- Orange: TTL warning, miss surge, and partial pressure.
- Green: stale response, recovered hit ratio, and protected origin.
- Blue: normal cache hit traffic and client requests.
- Purple: single-flight lock, request coalescing, refresh coordination, and cache warming.
- Neutral grays: panel shells, grid lines, inactive labels, and structural dividers.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-cache-stampede"` and `data-pattern-family="critical-cache"`.
- Root counts match rendered marks: `data-request-source-count`, `data-cache-flow-count`, `data-cache-pulse-count`, `data-hit-ratio-point-count`, `data-origin-load-point-count`, `data-ttl-marker-count`, `data-mitigation-count`, and `data-status-card-count`.
- Root state attributes include `data-hot-key`, `data-soft-ttl-seconds`, `data-hard-ttl-seconds`, `data-stale-window-seconds`, `data-stampede-rate`, `data-coalesced-origin-calls`, and `data-origin-load-peak`.
- The SVG contains `.cache-request-source`, `.cache-layer`, `.cache-hot-key`, `.cache-flow-path`, `.cache-request-pulse`, `.stampede-wave`, `.singleflight-lock`, `.request-collapse-gate`, `.stale-response-path`, `.origin-shield`, `.ttl-marker`, `.hit-ratio-line`, `.hit-ratio-point`, `.origin-load-line`, `.origin-load-point`, `.cache-mitigation-step`, and `.cache-status-card`.
- Every `.cache-request-source` has `data-source-id` and `data-rate`.
- Every `.cache-flow-path` has `data-flow-id`, `data-source`, `data-target`, and `data-kind`.
- Every `.request-collapse-gate` has `data-input-rate` and `data-origin-calls`.
- A screenshot after about `3s` must show a nonblank topology, readable labels, no pulse at `(0,0)`, visible single-flight protection, visible stale response, and an origin-load spike that is visually mitigated rather than left unbounded.
