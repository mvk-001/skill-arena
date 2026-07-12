# Kanban Assignee Board

- **Pattern ID:** `d3-kanban-assignees`
- **Gallery source ID:** `kanban-assignees`
- **Family:** Diagram
- **Use when:** Five Kanban columns need compact task-title cards with colored two-letter assignee dots and a configurable people legend.
- **Renderer:** `renderKanbanAssigneeBoardVariant`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Use repository palette tokens for assignee colors: blue, orange, green, purple, and cyan.
- Preserve the five-column board geometry, one visible title per task card with one to three wrapped lines, content-sized card heights, square card and column edges, bottom-right floating assignee dots, and a legend mapping each dot color to a person.
- Show the board scaffold first: columns and the assignee legend reveal before task cards.
- Reveal task cards one at a time in left-to-right board order. Expose `data-column-order`, `data-task-order`, `data-reveal-order`, and `data-reveal-begin-ms` on cards so browser checks can audit the sequence.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, final-state geometry, and root attributes for `data-pattern-family`, `data-legend-mode`, `data-column-count`, and `data-assignee-count`.

## Data Contract

Use five columns and five people unless the user explicitly requests another count.

```js
const people = [
  { id: "AM", name: "Avery", color: palette.blue },
  { id: "BR", name: "Blair", color: palette.orange },
  { id: "CL", name: "Chen", color: palette.green },
  { id: "DN", name: "Dana", color: palette.purple },
  { id: "ES", name: "Ellis", color: palette.cyan }
];

const columns = ["Intake", "Ready", "Build", "Review", "Ship"];

const tasks = [
  { col: "Intake", title: "Brief", assignees: ["AM", "BR"] },
  { col: "Intake", title: "Map release\nnotes draft", assignees: ["CL"], expectedLines: 2 },
  { col: "Intake", title: "Risks", assignees: ["DN", "ES"] },
  { col: "Ready", title: "Spec", assignees: ["AM", "CL"] },
  { col: "Ready", title: "Copy", assignees: ["BR"] },
  { col: "Ready", title: "Flow", assignees: ["DN", "AM"] },
  { col: "Ready", title: "API", assignees: ["ES", "CL"] },
  { col: "Build", title: "Data", assignees: ["CL", "ES"] },
  { col: "Build", title: "UI", assignees: ["AM", "DN"] },
  { col: "Build", title: "Reconcile\nmobile check\nstates", assignees: ["BR", "CL", "ES"], expectedLines: 3 },
  { col: "Build", title: "Tests", assignees: ["DN"] },
  { col: "Build", title: "Fixes", assignees: ["AM", "BR"] },
  { col: "Review", title: "QA", assignees: ["ES", "DN"] },
  { col: "Review", title: "Legal", assignees: ["BR"] },
  { col: "Review", title: "Perf", assignees: ["CL", "AM"] },
  { col: "Review", title: "Docs", assignees: ["DN", "BR"] },
  { col: "Ship", title: "Launch", assignees: ["AM", "ES"] },
  { col: "Ship", title: "Monitor", assignees: ["CL", "DN"] },
  { col: "Ship", title: "Retro", assignees: ["BR", "ES", "AM"] }
];
```

## Geometry Contract

- Render exactly one visible task title per card.
- Wrap or hard-break titles into one to three lines; measure text when a browser is available.
- Size cards from actual line count, for example `34 + min(3, lineCount) * 8`, so one-line, two-line, and three-line cards have different heights without extra blank space.
- Place assignee dots inside each card at the bottom-right. Keep dot labels to two letters and reduce dot radius/spacing when the columns are narrow.
- Keep card and column edges square. Do not set `rx` on Kanban cards, task columns, legend columns, or legend chip backgrounds.
- Draw column headers with the column semantic color and task cards on a neutral surface.

## Legend Modes

Choose the legend mode before computing column width and column height.

- `top-row`: keep five full-width task columns and render five legend chips above the board. Use when maximum task-card width matters.
- `virtual-column`: shrink task columns enough to fit a same-height legend column after the five task columns. Use when the board should read as a symmetric six-column layout. Expose legend chips with `data-legend-placement="virtual-column"`.
- `distributed-columns`: keep the five full-width task columns, use one unified column height equal to the tallest task stack plus a footer band, and place one legend chip in each column footer. Use when the board has spare vertical space and the legend should not consume a separate row. Expose legend chips with `data-legend-placement="column-footer"` and `data-column`.

## Animation Contract

- Use a helper like `revealIn(selection, delay, duration)` that sets a visible final opacity and appends SVG `<animate attributeName="opacity">`.
- Reveal legend and column scaffold first.
- Sort task cards by final `x` and then `y` to compute left-to-right board reveal order.
- Delay each card by a small constant gap, and use the same reveal order to delay its assignee-dot grow animations.

## Validation Hooks

- Root SVG exposes `data-pattern-family="kanban-assignees"` and one of `data-legend-mode="top-row"`, `"virtual-column"`, or `"distributed-columns"`.
- The SVG contains 5 `.kanban-assignee-column` groups and 19 `.kanban-assignee-card` groups.
- Every card exposes `data-column`, `data-column-order`, `data-task-order`, `data-reveal-order`, `data-reveal-begin-ms`, `data-task-title`, `data-expected-lines`, `data-card-height`, and `data-assignees`.
- Title text exposes `data-line-count`; expected line counts match actual line counts.
- The default fixture includes card-height buckets for one-line, two-line, and three-line titles.
- The legend contains 5 `.legend-chip` groups with `data-person-id` and `data-legend-placement`.
- In `virtual-column` mode, the legend column sits to the right of all task columns and shares the unified board height.
- In `distributed-columns` mode, every legend chip sits below the last task card in its column footer.
- Browser validation should check for no card/title/dot/legend overlap, no rounded Kanban rectangles, and strictly increasing `data-reveal-order` in left-to-right board order.
