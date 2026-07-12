# Pen Label Optimizer

Pattern ID: `d3-pen-label-optimizer`.

Use this pattern when dense pen-like points or scatter points need direct labels without saturating one area of the frame.

## Data Contract

Use point records with:

- `id`: stable point ID, also used by label groups and leader lines.
- `label`: text to render. Include mixed short, medium, and long labels when validating the pattern.
- `x`, `y`: final point position inside a bounded plot.
- `priority`: numeric priority for the final visibility pass.

## Geometry Contract

1. Generate several candidate rectangles around each point using multiple directions and offsets.
2. Measure each label before candidate generation when running in a browser, using SVG text measurement such as `getComputedTextLength()`. Use a conservative character-width estimate only as a fallback.
3. Penalize overlap area, outside-frame area, and leader-line distance.
4. Run multiple strategies when validating a dense design:
   - radial/direct offset baseline
   - greedy candidate placement
   - force/collision relaxation
   - simulated annealing over candidate indices
5. Select the strategy that keeps the most readable labels. Break ties by shorter mean leader distance.
6. After selecting the best strategy, run a priority-ordered visibility pass and draw only labels with no overlap. This pass should use the measured mixed-width rectangles, not a fixed label width.

## Animation Contract

- Grow source points from small radii.
- Fade leader lines and labels after points appear.
- Keep final label rectangles, text, and leader lines as regular SVG geometry so replay works through the gallery button.

## Verification Hooks

- The SVG exposes `data-pattern-family="label-placement"`.
- The SVG exposes `data-label-count`, `data-variable-labels="true"`, min/max label length and width attributes, `data-best-algorithm`, and per-algorithm readable counts such as `data-anneal-readable`.
- Visible labels are `.pen-label` groups with `data-point-id`.
- Visible labels expose `data-label-text`, `data-label-length`, and `data-label-width`.
- Source points are `.pen-label-point` circles.
- Browser validation should confirm no overlaps among `.pen-label rect` boxes, rendered text fits inside its parent rectangle, label lengths vary, and visible label count matches `data-readable-labels`.
