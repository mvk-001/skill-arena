# Critical SLO Burn Rate

- **Pattern ID:** `d3-slo-burn-rate`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A service needs to show SLO error-budget risk, burn-rate alert windows, page/ticket thresholds, projected time-to-exhaust, and operational action before a full incident timeline is needed.
- **Builder:** `scripts/build_critical_slo_burn_rate.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_slo_burn_rate.py slo.html
```

- Keep geometry deterministic. Do not use a live charting library or CDN for the final standalone artifact.
- Use SVG-native animation for path draws, threshold emphasis, and burn pulses.
- Keep burn-rate and budget concepts separate: budget remaining is a percent-over-time line; burn rate is a normalized rate compared to thresholds.
- Preserve alert semantics: red is page-level critical burn, orange is warning or ticket-level pressure, green is safe budget, blue is service telemetry/context, and purple is policy or release-control action.
- Show the current time and exhaustion projection explicitly. Viewers should not need to infer time-to-exhaust from the line slope alone.

## Data Contract

Use explicit records for budget samples, burn-rate windows, thresholds, and action steps:

```js
const budgetPoints = [
  { hour: -6, remaining: 87 },
  { hour: -1, remaining: 66 },
  { hour: 4, remaining: 18 }
];

const burnWindows = [
  { id: "fast-page", label: "5m / 1h", current: 18.2, threshold: 14.4, notification: "page", severity: "critical" },
  { id: "slow-page", label: "30m / 6h", current: 7.1, threshold: 6.0, notification: "page", severity: "critical" },
  { id: "ticket", label: "2h / 24h", current: 2.4, threshold: 2.0, notification: "ticket", severity: "warning" }
];

const actions = [
  { id: "hold-release", label: "Hold release", owner: "SRE + product", state: "active" }
];

const projection = { startHour: 4, startRemaining: 18, endHour: 8, timeToExhaustHours: 4 };
```

Every budget point needs a stable time value and remaining percentage. Every burn-rate window needs `id`, `label`, `current`, `threshold`, `notification`, and `severity`.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 1080 640"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-slo-burn-rate"`.
2. Place the error-budget time series on the left, with threshold bands behind the line.
3. Place multi-window burn-rate rows on the right, using a shared linear scale for current value bars and threshold ticks.
4. Keep page-level rows visually stronger than ticket/watch rows; do not mix notification levels in one undifferentiated legend.
5. Add `.slo-action-step` cards below the chart for release hold, mitigation, and review actions.
6. Add `.burn-rate-pulse` markers that travel along the budget-consumption path without crossing text.
7. Add one `.slo-now-marker` and one `.slo-exhaustion-projection` so the current state and projected exhaustion point are visible.
8. Expose final-state geometry in the static attributes, not only inside animation elements.

## Animation Contract

- Reveal threshold bands first.
- Draw the budget line and budget area next.
- Grow burn-rate bars from zero to their final widths.
- Start `.burn-rate-pulse` motion only after the budget path is visible.
- Pulse threshold markers on critical rows after the bars have reached the threshold.
- The final frame must retain all bands, budget points, burn-rate rows, alert markers, action cards, summary cards, current-time marker, and exhaustion projection.

## Semantic Color Roles

- Red: page-level burn-rate breach, budget exhaustion risk, immediate critical action.
- Orange: warning/ticket-level burn, slowing budget margin, investigation pressure.
- Green: safe remaining budget or validated mitigation.
- Blue: SLO telemetry, normal service signal, neutral chart scaffolding.
- Purple: governance, release policy, or cross-team decision.
- Neutral grays: axes, grid lines, inactive thresholds, panel borders, and supporting labels.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-slo-burn-rate"` and `data-pattern-family="critical-slo"`.
- Root counts match rendered marks: `data-budget-point-count`, `data-window-count`, `data-threshold-band-count`, `data-action-count`, `data-summary-card-count`, `data-pulse-count`, and `data-time-to-exhaust-hours`.
- The SVG contains `.slo-budget-line`, `.slo-budget-point`, `.slo-threshold-band`, `.slo-burn-window`, `.burn-rate-bar`, `.burn-threshold-marker`, `.slo-alert-state`, `.slo-action-step`, `.slo-summary-card`, `.slo-now-marker`, `.slo-exhaustion-projection`, and `.burn-rate-pulse`.
- Every `.slo-burn-window` has `data-window-id`, `data-current-burn`, `data-threshold-burn`, `data-notification`, and `data-severity`.
- A screenshot after about `3s` must show a nonblank dashboard, readable labels, no pulse at `(0,0)`, visible page/ticket distinction, explicit time-to-exhaust projection, and a clear critical action.
