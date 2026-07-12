# Critical Chain Buffer

- **Pattern ID:** `d3-critical-chain-buffer`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Critical
- **Use when:** A schedule, incident, rollout, or project plan needs to show the controlling chain of work, feeding dependencies, resource-readiness alerts, buffer consumption, and deadline risk.
- **Builder:** `scripts/build_critical_chain_buffer.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_chain_buffer.py critical.html
```

- Keep the layout deterministic. Time is horizontal, workstreams are lanes, and dependency geometry follows the final task positions.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Make the critical chain visibly stronger than context work, but keep context tasks readable enough to explain why buffers exist.
- Reserve red for the critical chain and deadline risk. Use orange for consumed buffers or feeding risk, green for available buffer, blue/purple for context work, and neutral gray for inactive dependencies.
- Include a compact buffer fever panel when the artifact needs executive risk reading: x-axis is critical-chain completion, y-axis is project-buffer consumption.

## Data Contract

Use inline records for lanes, tasks, dependencies, and buffers:

```js
const lanes = [
  { id: "program", label: "Program", y: 108 },
  { id: "build", label: "Build", y: 198 },
  { id: "verify", label: "Verify", y: 288 },
  { id: "release", label: "Release", y: 378 }
];

const tasks = [
  { id: "scope", label: "Scope", lane: "program", start: 0.45, duration: 0.95, critical: true },
  { id: "design", label: "Design", lane: "program", start: 1.65, duration: 1.1, critical: true }
];

const dependencies = [
  { id: "scope-design", source: "scope", target: "design", critical: true },
  { id: "copy-integrate", source: "copy", target: "integrate", critical: false, feedsCritical: true }
];

const buffers = [
  { id: "project", lane: "release", start: 7.9, duration: 0.55, consumed: 0.62, kind: "project" }
];

const resourceBuffers = [
  { id: "api-ready", label: "API env", lane: "build", time: 2.6, for: "api" }
];

const feverPoints = [
  { complete: 0.18, consumed: 0.10 },
  { complete: 0.78, consumed: 0.62 }
];
```

Task times are arbitrary time units, usually weeks or phases. The builder uses a linear scale from `0` to the deadline. Do not silently renormalize task durations if the prompt gives exact values.

## Geometry Contract

1. Use a root SVG with a stable `viewBox`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-critical-chain-buffer"`.
2. Draw lane bands and time ticks before tasks.
3. Render every task as `.critical-chain-task` with `data-task-id`, `data-lane-id`, `data-start`, `data-duration`, and `data-critical`.
4. Render dependencies as `.critical-chain-dependency` paths with `data-dependency-id`, `data-source-id`, `data-target-id`, `data-critical`, and `data-feeds-critical`.
5. Render critical dependencies above context dependencies. Use `.critical-dependency` on critical paths.
6. Render buffers as `.critical-buffer` groups with `data-buffer-id`, `data-buffer-kind`, and `data-consumed`.
7. Render resource readiness warnings as `.resource-buffer` groups with `data-resource-buffer-id` and `data-task-id`.
8. Draw a deadline marker as `.deadline-marker` with `data-deadline`.
9. Keep lane labels left of the plot and task labels centered inside bars or immediately above short bars.
10. If a fever panel is present, expose `.fever-chart`, `.fever-line`, and `.fever-point` marks with numeric completion and buffer-consumption attributes.

## Animation Contract

- Lane bands and time ticks appear from `0.00s` to `0.35s`.
- Context tasks reveal before critical tasks so the viewer understands the full plan.
- Critical tasks reveal in chain order with width expansion.
- Context dependencies draw first at low contrast.
- Critical dependencies draw in causal order, followed by one or more `.dependency-pulse` marks using `<animateMotion>`.
- Buffers reveal after incoming dependencies. Project buffer segments should show available and consumed portions in the final frame.
- Resource buffers reveal before the protected critical task begins.
- The fever chart draws after the critical chain is visible, using the current point as the final visible risk state.
- The final frame must contain all tasks, dependencies, buffers, resource alerts, lane labels, fever marks, and deadline markers even if pulses repeat indefinitely.

## Semantic Color Roles

- Red: critical chain tasks, critical dependency spine, and deadline risk.
- Orange: consumed buffer, feeding risk, or fallback capacity.
- Green: remaining project buffer or healthy slack.
- Blue: normal build or data work.
- Purple: program, governance, or review work.
- Purple triangles: resource buffer or readiness alert before a protected critical task.
- Neutral grays: lane bands, ticks, context dependencies, and task shadows.

## Minimal D3 Renderer Pattern

Use D3 to scale time, join records, and compute dependency paths:

```js
const width = 900;
const height = 520;
const left = 118;
const right = 820;
const deadline = 8.5;
const x = d3.scaleLinear().domain([0, deadline]).range([left, right]);
const laneY = new Map(lanes.map(d => [d.id, d.y]));
const byId = new Map(tasks.map(d => [d.id, d]));

function taskBox(task) {
  const x0 = x(task.start);
  const x1 = x(task.start + task.duration);
  const y = laneY.get(task.lane) - 17;
  return { x: x0, y, width: x1 - x0, height: 34, cx: (x0 + x1) / 2, cy: y + 17 };
}

function dependencyPath(dep) {
  const source = taskBox(byId.get(dep.source));
  const target = taskBox(byId.get(dep.target));
  const x0 = source.x + source.width;
  const y0 = source.cy;
  const x1 = target.x;
  const y1 = target.cy;
  const mx = x0 + Math.max(34, (x1 - x0) * 0.48);
  return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
}

const svg = d3.select("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("data-pattern-id", "d3-critical-chain-buffer")
  .attr("data-pattern-family", "critical-chain")
  .attr("data-task-count", tasks.length)
  .attr("data-critical-task-count", tasks.filter(d => d.critical).length)
  .attr("data-resource-buffer-count", resourceBuffers.length)
  .attr("role", "img");

const deps = svg.append("g")
  .attr("class", "critical-chain-dependencies")
  .selectAll("path")
  .data(dependencies)
  .join("path")
  .attr("id", d => `critical-chain-dependency-${d.id}`)
  .attr("class", d => `critical-chain-dependency${d.critical ? " critical-dependency" : ""}`)
  .attr("data-dependency-id", d => d.id)
  .attr("data-source-id", d => d.source)
  .attr("data-target-id", d => d.target)
  .attr("data-critical", d => String(d.critical))
  .attr("data-feeds-critical", d => String(Boolean(d.feedsCritical)))
  .attr("d", dependencyPath)
  .attr("fill", "none");
```

Use `pathLength="1"` on dependency paths and animate `stroke-dashoffset` from `1` to `0`. Add `<animateMotion>` pulses only after the matching dependency path has started drawing.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-critical-chain-buffer"` and `data-pattern-family="critical-chain"`.
- `data-task-count`, `data-critical-task-count`, `data-dependency-count`, and `data-buffer-count` match rendered mark counts.
- Every task exposes `data-task-id`, `data-lane-id`, `data-start`, `data-duration`, and `data-critical`.
- Every dependency path has a non-empty `d` attribute and source/target data attributes.
- Every critical dependency has `.critical-dependency` and at least one matching `.dependency-pulse`.
- At least one `.critical-buffer` exposes a numeric `data-consumed` value between `0` and `1`.
- Every `.resource-buffer` has a target task through `data-task-id`.
- If present, `.fever-chart` exposes `data-chain-complete` and `data-buffer-consumed`; every `.fever-point` exposes matching numeric values.
- A screenshot after about `2.6s` must show a nonblank schedule, readable task labels, visible critical chain, visible buffer state, visible fever panel, and no moving pulse crossing task or lane text.
