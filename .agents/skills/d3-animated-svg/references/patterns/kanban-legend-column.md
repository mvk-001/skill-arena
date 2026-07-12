# Kanban Virtual Legend

- **Pattern ID:** `d3-kanban-legend-column`
- **Gallery source ID:** `kanban-legend-column`
- **Family:** Diagram
- **Use when:** A Kanban board needs assignee dots and the people legend should read as a same-height virtual column that preserves board symmetry.
- **Renderer:** `renderKanbanAssigneeBoardVirtualLegend`

## Reuse Contract

- Use the Kanban assignee data contract: people as `{ id, name, color }`, columns as ordered status names, and tasks as `{ col, title, assignees, expectedLines? }`.
- Keep five task columns unless the user requests a different count, then add one final legend column after the task columns.
- Shrink task columns only as much as needed to fit the virtual legend column in the viewBox.
- Keep task-card heights content-sized by title line count; do not give one-line cards the same height as three-line cards.
- Keep all Kanban rectangles square edged.
- Expose root `data-legend-mode="virtual-column"` and legend chips with `data-legend-placement="virtual-column"`.

## Geometry Contract

- Compute task column x positions from a shared `colW` and small fixed gap.
- Set the legend column x position to `leftX + columnCount * (colW + gap)`.
- Give all task columns and the legend column the same display height, at least the tallest task stack height.
- Draw the legend column with a neutral body, a dark neutral header, and five vertical legend chips.
- Keep assignee dots bottom-right inside task cards; reduce dot radius and spacing if the task columns become narrow.

## Validation Hooks

- The SVG contains 5 `.kanban-assignee-column` groups, one `.kanban-assignee-legend-column`, 19 `.kanban-assignee-card` groups, and 5 `.legend-chip` groups.
- The legend column's left edge is to the right of every task column.
- The legend column and every task column expose the same `data-display-height`.
- No legend chip overlaps a task card.
- Expected and actual title line counts match for the two-line and three-line task examples.
