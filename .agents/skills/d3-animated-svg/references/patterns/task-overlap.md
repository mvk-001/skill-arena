# Asymmetric Task Overlap

- **Pattern ID:** `d3-task-overlap`
- **Gallery source ID:** `task-overlap`
- **Family:** Set Overlap
- **Use when:** A task backlog or work plan needs to show items that belong to one scope, two shared scopes, or three-or-more overlapping scopes across many asymmetric sets.
- **Renderer:** `renderAsymmetricTaskOverlap`

## Reuse Contract

- Use exactly one root SVG with `data-pattern-id="d3-task-overlap"` when recreating this pattern outside the gallery.
- Keep the scope geometry deterministic: use fixed circle centers and radii rather than a runtime force simulation.
- Draw circles first, then task leaders, label backplates, labels, and dots so tasks remain readable over translucent overlaps.
- Expose each circle as `.overlap-circle` with `data-set-id`.
- Expose each task as `.task-dot` and `.task-label` with `data-task-id`, `data-memberships`, and `data-membership-count`.
- For the nine-circle default, expose `data-circle-count="9"` and `data-target-count="20"` on the root SVG.

## Data Contract

Use nine asymmetric scope circles:

```js
const circles = [
  { id: "backlog", label: "Backlog" },
  { id: "ux", label: "UX" },
  { id: "api", label: "API" },
  { id: "security", label: "Security" },
  { id: "docs", label: "Docs" },
  { id: "data", label: "Data" },
  { id: "qa", label: "QA" },
  { id: "release", label: "Release" },
  { id: "ops", label: "Ops" }
];
```

Use 20 task records. Include at least one task in each single scope and include shared tasks across two and three-or-more scopes:

```js
const tasks = [
  { id: "T01", label: "T01 Intake", memberships: ["backlog"] },
  { id: "T02", label: "T02 Copy", memberships: ["ux"] },
  { id: "T03", label: "T03 API", memberships: ["api"] },
  { id: "T04", label: "T04 Dataset", memberships: ["data"] },
  { id: "T05", label: "T05 Smoke", memberships: ["qa"] },
  { id: "T06", label: "T06 Cutover", memberships: ["release"] },
  { id: "T07", label: "T07 FAQ", memberships: ["docs"] },
  { id: "T08", label: "T08 Threat", memberships: ["security"] },
  { id: "T09", label: "T09 Runbook", memberships: ["ops"] },
  { id: "T10", label: "T10 UX copy", memberships: ["backlog", "ux"] },
  { id: "T11", label: "T11 Schema", memberships: ["api", "data"] },
  { id: "T12", label: "T12 Test seed", memberships: ["data", "qa"] },
  { id: "T13", label: "T13 Ops QA", memberships: ["qa", "ops"] },
  { id: "T14", label: "T14 Release doc", memberships: ["docs", "release"] },
  { id: "T15", label: "T15 Auth risk", memberships: ["api", "security"] },
  { id: "T16", label: "T16 QA gate", memberships: ["data", "qa", "release"] },
  { id: "T17", label: "T17 Criteria", memberships: ["backlog", "ux", "data"] },
  { id: "T18", label: "T18 Migration", memberships: ["api", "data", "qa"] },
  { id: "T19", label: "T19 Notes", memberships: ["docs", "data", "release"] },
  { id: "T20", label: "T20 Drill", memberships: ["data", "qa", "ops"] }
];
```

## Geometry Contract

- Keep all circles in one 560 by 420 viewBox.
- Use translucent token highlight fills and solid token strokes for circles.
- Use compact white label backplates for task labels so labels remain readable across overlaps.
- Estimate label backplate width conservatively; the white background must be wider than the rendered text for every `.task-label`.
- If `.task-label` also uses the shared `.mark-label` class, set the intended label `font-size` with inline style or a more-specific CSS rule so the global gallery label size does not outgrow the backplate calculation.
- Route thin neutral leader lines from dots to labels when labels are offset from dense intersections.
- Encode task membership count with dot color: one scope in blue, two scopes in orange, and three-or-more scopes in red.
- Use `d3-task-overlap-dense` when the same visual language needs 100 task dots and audited non-overlapping direct labels.

## Validation Hooks

- `.overlap-circle` count equals 9.
- `.task-dot` count equals 20.
- `.task-label` count equals 20.
- Every `.task-dot` has non-empty `data-task-id`, `data-memberships`, and numeric `data-membership-count`.
- At least one task has `data-membership-count="1"`, at least one has `"2"`, and at least one has `"3"` or greater.
- Browser validation should confirm each `.task-label-bg` is at least as wide as its paired `.task-label` text.
