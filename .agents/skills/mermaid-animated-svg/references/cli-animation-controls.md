# Mermaid Animated SVG CLI Controls

Use this reference only when the task needs CLI option details, timing control, ordering, dwell behavior, or diagram-specific auto behavior. Keep `SKILL.md` focused on the core workflow.

## Contents

- Animation presets
- Auto behavior by diagram type
- Timing controls
- Diagram-specific timing controls
- Ordering controls
- Mermaid CLI passthrough

## Animation Presets

`--animation` accepts:

```text
auto, sequence, organic, ishikawa, mindmap-level, mindmap-branch, fade, draw, pop, slide-up, slide-left, zoom, none
```

Use `auto` unless the user asks for a specific style or the diagram needs a known special mode.

- `sequence`: reveal elements in order. Connector edges use organic grow-arrow strokes with arrowheads visible as the line appears.
- `organic`: use organic grow-arrow strokes for connector edges and pop/fade for other elements.
- `ishikawa`: reveal the fish head and spine first, then one main branch at a time.
- `mindmap-level`: reveal level 0, then each next node level, then radial connector arrows.
- `mindmap-branch`: reveal each top-level branch depth-first before drawing the next branch.
- `none`: render without adding animation.

## Auto Behavior By Diagram Type

`auto` maps Mermaid diagram types to readable construction order:

- Mindmap: `mindmap-level`.
- Ishikawa: branch-first ordering.
- State diagrams: state-flow ordering; connected arrows and labels start after both endpoint states are visible.
- Flowcharts and Swimlanes: flowchart-flow ordering; nodes appear before connected arrows and labels while Swimlane cluster geometry remains visible.
- Venn: reveal set groups first, then union/intersection labels. Use `.venn-sets-*` tokens from `--list-elements`.
- Event Modeling: keep swimlanes visible, reveal boxes in event order, then paired relation arrows.
- Entity Relationship: reveal entities first; relationship lines and labels start after both endpoint entities are visible.
- Class: reveal classes first; relation lines, labels, and cardinality terminals follow visible endpoints.
- Block: reveal blocks first; connection lines and labels follow visible endpoints.
- Architecture: reveal services first; connections start after endpoint services.
- Quadrant Chart: keep quadrants and axes visible, reveal data points by quadrant order.
- Pie Chart: reveal complete segments from smallest to largest, including wedge, label, and legend.
- Radar: reveal frame, axes, labels, title, and legends first, then curves by rendered z-layer.
- Gantt: reveal section rows and labels first, then task bars left to right.
- Journey: reveal each section header with its first task column, then task columns left to right.
- GitGraph: reveal commits left to right; commit points and labels appear before incoming lines.
- Sankey: reveal rendered node columns, then incoming links for each visible target column.
- Timeline: keep title, section titles, and dates visible, then reveal line/connectors/events left to right.
- TreeView: reveal labels by depth; connector lines follow visible child-depth labels.
- Kanban: reveal all columns together, then task cards one by one.
- Cynefin and Railroad: use source directives for semantic layered construction; generic `auto` otherwise falls back to `sequence` because current SVGs expose family-level classes rather than stable item IDs.
- Other diagrams: fall back to `sequence`.

## Timing Controls

- `--duration-ms`: animation duration per element.
- `--stagger-ms`: delay between elements.
- `--initial-delay-ms`: delay before the first element.
- `--total-ms`: derive timing so the reveal fits a target duration when possible. It must not overlap required non-overlapping construction steps for Ishikawa, state-flow, flowchart-flow, connection-staged diagrams, or Venn.
- `--easing`: CSS timing function.
- `--draw-distance`: temporary stroke dash distance for draw and grow-arrow effects.

## Diagram-Specific Timing Controls

Use these only for the matching animation family:

- `--state-dwell-ms`: pause after every state node in state-flow before the next construction step starts.
- `--state-dwell`: state-flow dwell overrides as `selector=value`; repeat or comma-separate entries. Selectors use the same matching as `--order`.
- `--flowchart-dwell-ms`: pause after every flowchart node in flowchart-flow before the next construction step starts.
- `--flowchart-dwell`: flowchart-flow dwell overrides as `selector=value`; repeat or comma-separate entries.
- `--mindmap-radial-wave-ms`: extra delay between same-level mindmap connector arrows.
- `--mindmap-branch-ms`: target total duration for each top-level branch in `mindmap-branch`.
- `--mindmap-branch-durations`: comma-separated values or a JSON array of per-branch durations.
- `--mindmap-branch-gap-ms`: pause between completed mindmap branches.
- `--ishikawa-branch-ms`: target total duration for each main Ishikawa branch.
- `--ishikawa-branch-durations`: comma-separated values or a JSON array of per-branch durations.
- `--ishikawa-branch-gap-ms`: pause between completed Ishikawa branches.

## Ordering Controls

Order tokens may be exact IDs, `#id`, `.class`, `role:node`, `role:edge`, `text:Label`, visible label text, or useful ID/class fragments. Prefer tokens printed by `--list-elements`.

Use direct order for short sequences:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py diagram.mmd -o diagram.animated.svg --order "Start,Collect request,Valid payload,Store event,Done" --animation sequence
```

Use a JSON array or newline-separated file for longer sequences:

```json
["Start", "Collect request", "Valid payload", "Store event", "Done"]
```

Add `--strict-order` when every requested token must match at least one SVG element.

## Mermaid CLI Passthrough

Preserve Mermaid rendering options in both static and animated output:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py diagram.mmd -o diagram.animated.svg --config-file mermaid-config.json --css-file mermaid.css --background transparent --mmdc-arg=--scale --mmdc-arg=2
```
