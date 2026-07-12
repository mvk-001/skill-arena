# Critical Fault Tree

- **Pattern ID:** `d3-fault-tree`
- **Gallery source ID:** `fault-tree`
- **Use when:** The user needs a safety, reliability, aerospace, nuclear, process, or operations risk diagram that explains how lower-level failures combine into a critical top event.
- **Standalone builder:** `scripts/build_critical_fault_tree.py`

## Source Basis

Fault tree analysis usually starts with a top event, decomposes it through logic gates, and terminates in basic or undeveloped events. Keep the visual vocabulary recognizable: rectangular event boxes, OR/AND gate symbols, circular basic events, diamond undeveloped events, and minimal cut-set highlights.

## Geometry Contract

1. Put the critical top event at the top center.
2. Place the first OR gate directly beneath it so the viewer sees that any major branch can cause the top event.
3. Use second-level intermediate event boxes for major fault modes.
4. Put AND gates under fault modes that require combined failures, and OR gates under fault modes where one basic event is sufficient.
5. Keep basic events in a bottom row with enough spacing for labels and probabilities.
6. Use orthogonal connectors for the tree, with stronger strokes on minimal cut-set paths.
7. Reserve a right or bottom panel for risk contribution so the tree stays readable.

## Semantic Color Roles

- Red: critical top event and dominant single-event cut.
- Orange: redundant equipment train failures.
- Purple: protection logic, trip, or bypass failures.
- Neutral gray: screened, undeveloped, or non-dominant context.
- White or light token fills: event boxes and symbols so labels stay readable.

## Animation Contract

- Reveal the tree from top event to gates to basic events.
- Draw connectors before or with the dependent event marks.
- Animate compact pulses upward along minimal cut-set paths. Do not let pulses cross through text labels.
- Keep the final static frame complete and inspectable if animation is disabled.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-fault-tree"` and `data-pattern-family="fault-tree"`.
- Root counts match rendered marks: `data-event-count`, `data-basic-event-count`, `data-gate-count`, `data-minimal-cut-count`, and `data-risk-panel-count`.
- Render event boxes as `.fault-event-box`, basic events as `.basic-event`, undeveloped events as `.undeveloped-event`, gates as `.fault-gate`, tree links as `.fault-link`, minimal cut paths as `.minimal-cut-link`, moving evidence as `.fault-cut-pulse`, and contribution summaries as `.fault-risk-card`.
- Every basic event has `data-event-code`, `data-probability`, and `data-minimal-cut`.

## Builder Command

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_fault_tree.py fault-tree.html
```
