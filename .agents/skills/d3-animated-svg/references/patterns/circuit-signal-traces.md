# Circuit Signal Traces

- **Pattern ID:** `d3-circuit-signal-traces`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Circuit
- **Use when:** A circuit-board visual metaphor should show signals, bus handshakes, diagnostic pulses, blocked segments, or rerouted paths moving through deterministic orthogonal traces.
- **Builder:** `scripts/build_circuit_signal_traces.py`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_circuit_signal_traces.py circuit.html
```

- Keep the board geometry deterministic. Do not run a force simulation or random trace router.
- Use right-angle trace routes on an 8 px or 10 px grid; rounded stroke joins are fine, but avoid decorative diagonal lines unless the domain data requires them.
- Use SVG-native animation (`animate`, `animateMotion`, CSS keyframes, or path draw animation) so extracted SVG output remains animated without JavaScript.
- Keep labels outside active trace corridors. Moving pulses must not cross readable text.

## Data Contract

Use small inline records for nodes and traces:

```js
const nodes = [
  { id: "source", label: "Source", x: 88, y: 108, role: "source", color: "blue" },
  { id: "gate", label: "Gate", x: 384, y: 108, role: "gate", color: "purple" },
  { id: "sink", label: "Sink", x: 648, y: 108, role: "sink", color: "green" }
];

const traces = [
  {
    id: "data-main",
    signal: "data",
    mode: "signal-propagation",
    points: [[110, 108], [244, 108], [244, 188], [384, 188], [384, 108], [626, 108]],
    color: "blue",
    cadence: 2.4,
    phase: 0.15
  }
];
```

Each trace needs a stable `id`, `signal`, `mode`, `points`, `color`, `cadence`, and `phase`. Points are absolute SVG coordinates. The route should begin and end at pad edges, not at label centers.

Supported modes:

- `signal-propagation`: one-way packets move from source to sink along blue or green traces.
- `bus-handshake`: request and acknowledge pulses use separate lanes or phases; control is purple, success is green.
- `fault-isolation`: the blocked segment pulses red, then an orange reroute path draws after the fault is visible.

## Geometry Contract

1. Use a root SVG with `viewBox="0 0 760 440"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-circuit-signal-traces"`.
2. Draw a neutral board surface first, then a faint rectilinear grid or pin field.
3. Draw passive trace paths as `.circuit-trace` with rounded caps and joins. Use `data-trace-id`, `data-signal`, and `data-mode`.
4. Draw vias at corners or branch points as `.circuit-via` rings. Keep them smaller than endpoint pads.
5. Draw endpoint pads as `.circuit-node` groups with `data-node-id` and `data-node-role`.
6. Draw moving packets as `.circuit-pulse` marks that use `<animateMotion>` and `<mpath href="#trace-id">`.
7. Place labels above or below nodes. Use white halos around label text.

## Animation Contract

- Board and passive grid appear first from `0.00s` to `0.35s`.
- Endpoint pads grow from `0.20s` to `0.75s`.
- Trace drawing begins near `0.45s`, with `stroke-dashoffset` moving from full length to `0`.
- Signal pulses begin only after their trace is partially visible. Stagger by `phase` so pulses do not overlap at the same junction.
- For `bus-handshake`, request pulses should precede acknowledge pulses by at least `0.45s`.
- For `fault-isolation`, show the red fault pulse first, then draw the orange reroute path and start reroute pulses.
- Final frame must contain all pads, traces, vias, and labels even if pulses repeat indefinitely.

## Semantic Color Roles

- Blue: primary data or normal propagation.
- Green: confirmed delivery, acknowledgment, or healthy path.
- Purple: control bus, clock, gate, or coordination signal.
- Orange: reroute, fallback, or warning path.
- Red: blocked segment, fault, or rejected route only.
- Neutral grays: board, inactive grid, passive traces, and label halos.

## Minimal D3 Renderer Pattern

Use D3 for data joins and path generation, but keep animation SVG-native:

```js
const color = {
  blue: "#007298",
  green: "#45842a",
  purple: "#652f6c",
  orange: "#e77204",
  red: "#9e1b32",
  gray: "#c9ced3",
  ink: "#333e48"
};

function tracePath(points) {
  return d3.line()
    .x(d => d[0])
    .y(d => d[1])
    .curve(d3.curveLinear)(points);
}

const svg = d3.select("svg")
  .attr("viewBox", "0 0 760 440")
  .attr("data-pattern-id", "d3-circuit-signal-traces")
  .attr("data-pattern-family", "circuit")
  .attr("data-node-count", nodes.length)
  .attr("data-trace-count", traces.length)
  .attr("role", "img");

const paths = svg.append("g")
  .attr("class", "circuit-traces")
  .selectAll("path")
  .data(traces)
  .join("path")
  .attr("id", d => `circuit-trace-${d.id}`)
  .attr("class", "circuit-trace")
  .attr("data-trace-id", d => d.id)
  .attr("data-signal", d => d.signal)
  .attr("data-mode", d => d.mode)
  .attr("d", d => tracePath(d.points))
  .attr("fill", "none")
  .attr("stroke", d => color[d.color])
  .attr("stroke-width", 5)
  .attr("stroke-linecap", "round")
  .attr("stroke-linejoin", "round");

paths.each(function (d, index) {
  const length = this.getTotalLength();
  d3.select(this)
    .attr("stroke-dasharray", `${length} ${length}`)
    .attr("stroke-dashoffset", 0)
    .append("animate")
    .attr("attributeName", "stroke-dashoffset")
    .attr("from", length)
    .attr("to", 0)
    .attr("dur", "1.15s")
    .attr("begin", `${0.45 + index * 0.08}s`)
    .attr("fill", "freeze");
});

const pulses = svg.append("g")
  .attr("class", "circuit-pulses")
  .selectAll("circle")
  .data(traces.filter(d => d.mode !== "fault-hidden"))
  .join("circle")
  .attr("class", "circuit-pulse")
  .attr("data-trace-id", d => d.id)
  .attr("r", 5)
  .attr("fill", d => color[d.color])
  .attr("stroke", "#ffffff")
  .attr("stroke-width", 1.5);

pulses.append("animateMotion")
  .attr("dur", d => `${d.cadence}s`)
  .attr("begin", d => `${0.85 + d.phase}s`)
  .attr("repeatCount", "indefinite")
  .attr("rotate", "auto")
  .append("mpath")
  .attr("href", d => `#circuit-trace-${d.id}`);
```

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-circuit-signal-traces"` and `data-pattern-family="circuit"`.
- Root SVG exposes `data-node-count` and `data-trace-count`; these values match rendered `.circuit-node` and `.circuit-trace` counts.
- Every `.circuit-trace` has a non-empty `d` attribute, `data-trace-id`, `data-signal`, and `data-mode`.
- Every active trace has at least one `.circuit-pulse` with an `<animateMotion>` child.
- The SVG contains at least one `.circuit-via` when a trace has a corner or branch.
- A screenshot after about `2.4s` must show nonblank traces, visible pulses, readable labels, and no pulse crossing a label.
