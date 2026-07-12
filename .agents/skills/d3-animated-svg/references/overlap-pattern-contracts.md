# Overlap Pattern Contracts

Read this reference after a `references/patterns/*overlap*.md`, `*rosette*.md`, `*flower*.md`, `*chain*.md`, `*cluster*.md`, or `*bridge*.md` file routes here.

## Shared Output Contract

- Use one `560x420` SVG with a stable `data-pattern-id`, `data-pattern-family="venn-overlap"`, `data-layout`, and `data-circle-count`.
- Add a unique `title`, `desc`, and `aria-labelledby` pair.
- Keep every source set as one `.venn-circle[data-set-id][data-set-code]`. Do not add or remove sets to make the layout more symmetric.
- Draw a neutral frame first, set circles second, the semantic center third, external labels fourth, and the note last.
- Preserve a settled final frame in normal attributes. SVG animation may reveal the circles but must not be required to see their final geometry.

## Geometry and Label Contract

- Use the exact circle centers and radii in the routed pattern file. Quantitative overlap is protected geometry.
- Use translucent token fills with solid token strokes. Keep the white semantic-center disk above overlapping fills.
- External labels use a 15-unit colored code circle, a white two-letter code, and a dark or matching-color label below it.
- Put the semantic center on the stated center coordinate. Keep the note inside `y=382` so it cannot collide with lower labels.
- When a set is already named by the semantic center, mark it `hideExternalLabel: true` instead of duplicating a label over a peer.

## Animation Contract

- Reveal each set by animating `r` from `4` to its fixed radius and `fill-opacity` from `0` to its fixed value.
- Stagger sets by roughly `0.08s`; reveal external labels only after their circles are mostly visible.
- A center pulse may repeat, but it must not move, resize, or obscure any source set.
- Replay must rebuild only the requested SVG and leave circle, label, and animation counts stable.

## Semantic Colors

- Use blue, orange, green, purple, and red for peer sets, then blue-hover, orange-hover, or yellow only when more peers are required.
- Red denotes risk, policy, decoding, or another explicit semantic role; do not use red merely to complete rotational symmetry.
- Use neutral gray only for scaffolding and the repository surface token for the center disk.

## Validation

- Circle count equals the routed pattern's data count.
- Every `.venn-circle` has unique `data-set-id` and `data-set-code` values.
- Browser inspection finds no clipped circles, external labels, or note text at `560x420` and at a `390px` mobile viewport.
- No two visible external label groups overlap; hidden duplicate labels do not count.
- A replay produces the same circle count, label count, and settled coordinates as initial render.
