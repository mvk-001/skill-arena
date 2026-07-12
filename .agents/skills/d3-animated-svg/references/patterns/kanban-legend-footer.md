# Kanban Distributed Legend

- **Pattern ID:** `d3-kanban-legend-footer`
- **Gallery source ID:** `kanban-legend-footer`
- **Family:** Diagram
- **Use when:** A Kanban board needs assignee dots and the people legend should be distributed through spare footer space in the columns instead of taking a separate row or column.
- **Renderer:** `renderKanbanAssigneeBoardDistributedLegend`

## Reuse Contract

- Use the Kanban assignee data contract: people as `{ id, name, color }`, columns as ordered status names, and tasks as `{ col, title, assignees, expectedLines? }`.
- Keep five full-width task columns when possible.
- Use one unified column height equal to the tallest task stack plus a compact footer band.
- Place one legend chip per column footer, or distribute chips evenly across available footer slots when the people count differs from the column count.
- Keep task-card heights content-sized by title line count.
- Keep all Kanban rectangles square edged.
- Expose root `data-legend-mode="distributed-columns"` and legend chips with `data-legend-placement="column-footer"` plus `data-column`.

## Geometry Contract

- Draw task cards first using the same y-offset stack rules as the normal Kanban board.
- Reserve the footer band below the tallest task stack so even the tallest column has room for its legend chip.
- Place each legend chip below the last task card in its assigned column. Do not let a chip float over a card.
- Keep assignee dots bottom-right inside task cards, with dot labels centered in each circle.
- Use neutral column bodies and semantic colored headers.

## Validation Hooks

- The SVG contains 5 `.kanban-assignee-column` groups, 19 `.kanban-assignee-card` groups, and 5 `.legend-chip` groups.
- The 5 legend chips expose 5 unique `data-column` values in the default fixture.
- Every legend chip's rendered top is below the rendered bottom of the last task card in the same column.
- Expected and actual title line counts match for the two-line and three-line task examples.
- Browser validation should confirm no overlap among legend chips, task cards, assignee dots, and title text.
