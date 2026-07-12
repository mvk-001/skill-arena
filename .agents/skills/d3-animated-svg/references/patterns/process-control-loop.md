# Process P&ID Control Loop

- **Pattern ID:** `d3-process-control-loop`
- **Gallery source ID:** `process-control-loop`
- **Family:** Process engineering
- **Use when:** A task asks for a P&ID, piping and instrumentation diagram, process equipment, valves, instrument bubbles, dashed signal lines, interlocks, or process/utility flow through a controlled unit operation.

## Standalone Builder

For standalone HTML artifacts with the default contract, run the bundled builder rather than hand-authoring a substitute:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_process_pid_control_loop.py pid.html
```

## Data Contract

Model the diagram with explicit records:

- `equipment`: process units with `id`, `tag`, `label`, `kind`, `x`, `y`, and optional dimensions.
- `processLines`: orthogonal or gently curved pipe runs with `id`, `kind`, `points`, `colorRole`, and optional `dash`.
- `valves`: inline valve symbols with `id`, `tag`, `kind`, `x`, `y`, and the controlled line.
- `instruments`: bubbles with `id`, `tag`, `loop`, `x`, `y`, `colorRole`, and a controlled target.
- `signals`: dashed control or safety signal paths with `id`, `source`, `target`, `points`, and `kind`.

Use deterministic inline data for gallery fixtures. Keep process line geometry stable; do not let a force layout move technical symbols.

## Geometry Contract

1. Use a left-to-right process spine as the primary reading path.
2. Draw tanks/vessels, pumps, exchangers, and valves with recognizable simplified P&ID symbols.
3. Draw instrument bubbles above or beside the equipment they observe or control.
4. Use dashed lines for control/signal connections and reserve red dashed paths for safety trips or interlocks.
5. Keep the process pipe behind equipment and labels. Moving flow pulses must travel on pipe centerlines, not across text.
6. Keep all text short: equipment tags, instrument tags, loop numbers, and one compact legend.

## Color Roles

- Neutral ink and grays: equipment shells, diagram frame, non-emphasis linework.
- Blue: primary process pipe and normal process flow.
- Orange: heating/utility path or temperature-control duty.
- Green: level-control loop or healthy inlet control.
- Purple: flow-control signal or controlled outlet behavior.
- Red: high-high trip, shutdown, or safety interlock only.

## Animation Contract

- Reveal the main process pipe first.
- Fade utility and drain lines without destroying their dash pattern.
- Grow instrument bubbles after the equipment appears.
- Fade dashed signal lines after the relevant instruments are visible.
- Add small `animateMotion` pulses on process and utility lines. Pulses should never cross readable labels.
- The final frame must contain all equipment, valves, instrument bubbles, signal lines, interlock, legend, and flow paths.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-process-control-loop"` and `data-pattern-family="process-engineering"`.
- Root count attributes include `data-equipment-count`, `data-valve-count`, `data-instrument-count`, `data-signal-line-count`, and `data-process-line-count`.
- The SVG contains `.pid-equipment`, `.pid-vessel`, `.pid-pump`, `.pid-heat-exchanger`, `.pid-reactor`, `.pid-valve`, `.pid-instrument`, `.pid-process-line`, `.pid-signal-line`, `.pid-trip-line`, `.pid-flow-pulse`, `.pid-utility-pulse`, `.pid-safety-interlock`, and `.pid-legend`.
- Every `.pid-signal-line` has `data-signal-id`, `data-source`, and `data-target`.
- Every `.pid-process-line` has `data-line-id` and `data-line-kind`.
- Browser validation should confirm the SVG is nonblank, labels fit, dashed signal lines remain dashed in the final frame, and moving pulses avoid text.
