# Category Burst

- **Pattern ID:** `d3-category-burst`
- **Gallery source ID:** `category-burst`
- **Family:** Network
- **Use when:** A primary category should reveal subcategories as spokes that float outward from one central circle and settle into a readable concept map.
- **Renderer:** `renderCategoryBurst`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_category_burst.py category-burst.html
```

- Keep the central category visible first, then draw outward links, then move subcategory nodes from the center into final positions.
- Keep final geometry deterministic. Do not run a live force simulation for a standalone artifact unless the simulation is pre-ticked and exported to fixed coordinates.
- Use SVG-native animation (`animate`, `animateTransform`, or CSS keyframes) so extracted SVG output remains animated without JavaScript.
- Labels must remain readable in the settled frame. Put labels outside the satellite circles with white halos when needed.

## Data Contract

Use one root record and 6-10 subcategory records. Each subcategory needs:

```js
{
  id: "scope",
  label: "Scope",
  angle: 0,
  distance: 132,
  color: "#007298",
  fill: "#cdf3ff",
  r: 22
}
```

Angles are degrees around the root, with `0` at the top and clockwise positive. Distances are pixel radii from the root in a `560x420` viewBox. Use the repository token palette for `color` and highlight fills.

## Implementation Steps

1. Create a root SVG with `viewBox="0 0 560 420"`, a `<title>`, a `<desc>`, and `data-pattern-id="d3-category-burst"` when delivered outside the gallery.
2. Place the root at `{ x: 280, y: 214 }`.
3. Convert each subcategory angle with `(degrees - 90) * Math.PI / 180`, then compute final `x/y` from `root + unitVector * distance`.
4. Draw a subtle guide ring first, then animate the root circle radius from `0` to about `36`.
5. Draw one curved path per subcategory from the root to the final node. Use path drawing by animating `stroke-dashoffset` from total path length to `0`, with small per-spoke delays.
6. Draw one `<g>` per subcategory with final `transform="translate(x,y)"`, then add `animateTransform type="translate"` values from the root position to a tangential float midpoint and finally to the fixed destination.
7. Grow each satellite circle from about `5` to its final radius while the group is moving.
8. Reveal labels after each node is near its final position. For top and bottom nodes, center labels above/below the circle; for side nodes, anchor labels outward.

## Animation Contract

- Root appear: `0.00s` to `0.60s`.
- Link drawing: begin near `0.50s`, stagger by `0.06s` to `0.08s`.
- Node float-settle: begin near `0.72s`, stagger by subcategory index, duration about `1.65s`.
- Label reveal: begin after the node has moved most of the way outward.
- Final frame must be static: all nodes, links, and labels settled with no indefinite floating motion.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-category-burst"`.
- Final SVG contains exactly one root node, 6-10 subcategory nodes, one visible link per subcategory, and one readable label per subcategory.
- Each subcategory node should expose stable IDs/classes such as `data-subcategory-id`.
- A screenshot after about `2.5s` must show a nonblank radial map with no label overlap and no moving mark crossing readable text.
