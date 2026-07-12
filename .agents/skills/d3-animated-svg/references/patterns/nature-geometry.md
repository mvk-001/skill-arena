# Natural Math Archetypes

- **Pattern ID:** `d3-nature-geometry`
- **Gallery source ID:** `nature-geometry`
- **Family:** Natural math
- **Use when:** A D3/SVG artifact should connect mathematical archetypes to natural growth, packing, waves, cells, or branching through a triadic contract: invariant, generative rule, and natural expression.
- **Builder:** `scripts/build_natural_math_archetypes.py`

## Research Basis

Use this pattern as a mathematically disciplined shortlist, not as proof that every natural example follows the ideal model exactly.

- Phyllotaxis: use the golden angle `pi * (3 - sqrt(5))`, approximately 137.507764 degrees, for sunflower-like seed packing and rosette placement. Useful sources include D3's phyllotaxis example, phyllotaxis modeling literature, and the sunflower Fibonacci / non-Fibonacci caution in *Royal Society Open Science*.
- L-systems and recursive branching: use deterministic rewriting or explicit recursion for ferns, trees, river networks, roots, and vascular branching. The canonical source is *The Algorithmic Beauty of Plants*.
- Reaction-diffusion: use Turing-style activator/inhibitor dynamics for spots, stripes, and morphogenesis. The original basis is Turing's 1952 paper, *The Chemical Basis of Morphogenesis*.
- Diffusion-limited aggregation: use walker attachment to a seed cluster for dendrites, mineral accretion, coral-like growth, and lightning-like clusters. The classic source is Witten and Sander's 1981 DLA model.
- Hexagonal packing: use hexagons for six-neighbor tiling and circle-packing density `pi / (2 * sqrt(3))`. Treat the honeycomb conjecture, which concerns least perimeter partitions, as related but not the same claim.
- Voronoi cells: use nearest-site partitions for cell fields, proximity territories, and leaf pavement analogies. A 2026 *Nature Communications* paper reports Voronoi-like cell patterning in *Pilea peperomioides*, so cite it with the absolute year when using that biological example.
- Logarithmic spirals: use `r = a * exp(b * theta)` for constant-angle growth. Do not label generic shells as golden spirals unless the growth factor is measured and matches the golden-ratio contract.

Useful source links:

- https://observablehq.com/@d3/phyllotaxis
- https://royalsocietypublishing.org/doi/10.1098/rsos.160091
- https://algorithmicbotany.org/papers/abop/abop.pdf
- https://royalsocietypublishing.org/doi/10.1098/rstb.1952.0012
- https://doi.org/10.1103/PhysRevLett.47.1400
- https://link.springer.com/article/10.1007/s00454-001-0026-3
- https://www.nature.com/articles/s41467-026-37310-3

## Reuse Contract

- Keep the root SVG selector `svg#nature-geometry`.
- Expose `data-pattern-id="d3-nature-geometry"`, `data-pattern-family="natural-math"`, `data-archetype-count="6"`, and `data-theory-of-three="invariant-rule-nature"`.
- Each `.natural-archetype` group must expose `data-archetype-id`.
- Each panel must include the same three readable roles: invariant, rule, and nature.
- Keep formulas as ASCII text in skill resources: use `pi`, `phi`, `sqrt`, and `theta`.
- Use deterministic geometry. Do not use decorative random noise for any archetype.

## Archetype Contracts

### Golden-Angle Phyllotaxis

- Compute `phi = (1 + sqrt(5)) / 2`.
- Compute `goldenAngle = pi * (3 - sqrt(5))`.
- Place seed `n` at `theta = n * goldenAngle` and `r = spacing * sqrt(n)`.
- Expose `.natural-seed`, `data-seed-index`, `data-golden-angle-radians`, and `data-golden-angle-degrees`.

### Pi Circular Wave

- Use concentric rings with circumference metadata `2 * pi * r`.
- Expose `.natural-wave-ring`, `data-radius`, `data-circumference`, and root `data-pi`.
- Use for ripples, tree rings, radial wavefronts, circular scan fields, and orbit-like pulse fronts.

### Logarithmic Spiral Shell

- Use `r = a * exp(b * theta)` with explicit `data-spiral-a` and `data-spiral-b`.
- Use sample points along the curve to show growth increments.
- Phrase as logarithmic or equiangular spiral unless the golden-ratio growth rate is explicitly chosen and audited.

### Fractal Branching

- Use recursive branching, an L-system, or another deterministic self-similar rule.
- Expose `.fractal-branch`, `data-fractal-depth`, `data-branch-count`, and per-branch depth/order metadata.
- Use for ferns, trees, veins, rivers, lightning, dependency branching, and recursive idea growth.

### Hexagonal Packing

- Use a six-neighbor hex grid.
- Expose `.hex-pack-cell`, `data-neighbor-angle-degrees="120"`, and `data-circle-packing-density`.
- Use for honeycomb analogies, efficient tiling, equal-radius cell neighborhoods, and modular packing.

### Voronoi Leaf Cells

- Build each cell from nearest-site boundaries or Delaunay/Voronoi APIs.
- Expose `.voronoi-leaf-cell`, `.voronoi-site`, `data-site-count`, and `data-cell-index`.
- Use for cell fields, territories, leaf pavement cells, service regions, and proximity partitions.

## Validation Hooks

- The root SVG has six `.natural-archetype` groups and six `.archetype-visual` groups.
- Root constants match:
  - `data-pi` equals `Math.PI` or Python `math.pi` within display precision.
  - `data-phi` equals `(1 + sqrt(5)) / 2`.
  - `data-golden-angle-degrees` equals about `137.507764`.
  - `data-hex-circle-packing-density` equals about `0.906899682`.
- Golden-angle seed count is at least 50 in the gallery card and exposes divergence metadata.
- Voronoi has at least 8 sites and matching visible cells.
- Browser capture should show all six panels readable at desktop and mobile gallery widths.

## Standalone Builder

For isolated or user-artifact generation, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_natural_math_archetypes.py natural.html
```

Validate the generated artifact with the self-contained HTML checker and a browser render. The output should not depend on external scripts, fonts, image files, or runtime network access.
