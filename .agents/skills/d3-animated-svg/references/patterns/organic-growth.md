# Organic Growth Patterns

- **Pattern IDs:** `d3-organic-growth`, `d3-phyllotaxis-seed-head`, `d3-lsystem-canopy`, `d3-reaction-diffusion-field`, `d3-diffusion-limited-aggregation`
- **Gallery source ID:** standalone pattern recipe
- **Family:** Organic growth
- **Use when:** A D3/SVG artifact should look botanical, cellular, coral-like, fungal, mineral, or fractal while still being driven by deterministic mathematics instead of decorative noise.
- **Builder:** `scripts/build_organic_growth_patterns.py`

## Research Basis

- Phyllotaxis: seed placement uses a golden-angle divergence near 137.5 degrees, as shown in Mike Bostock's D3 phyllotaxis example and botanical phyllotaxis literature.
- L-systems: branching uses bracketed string rewriting from Lindenmayer systems, following the modeling approach described in *The Algorithmic Beauty of Plants*.
- Reaction diffusion: the field uses Gray-Scott-style activator/inhibitor dynamics, grounded in Turing morphogenesis and later computational reaction-diffusion demonstrations.
- Diffusion-limited aggregation: walkers stick to a cluster when adjacent to occupied particles, following Witten and Sander's DLA model.

Useful source links:

- https://observablehq.com/@d3/phyllotaxis
- https://algorithmicbotany.org/papers/abop/abop.pdf
- https://algorithmicbotany.org/papers/colonization.egwnp2007.html
- https://www.karlsims.com/rd.html
- https://royalsocietypublishing.org/doi/10.1098/rstb.1952.0012
- https://doi.org/10.1103/PhysRevLett.47.1400

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- For standalone HTML artifacts, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_organic_growth_patterns.py organic.html
```

- Keep every organic effect deterministic. Use fixed formulas, a seeded random generator, or precomputed simulation steps.
- Expose a stable root `svg#organic-growth` with `data-pattern-id="d3-organic-growth"` and one `.organic-variant` group per mathematical rule.
- Do not use random decorative blobs. Every visible mark should come from a model parameter: angle, grammar depth, reaction concentration, particle order, or parent relationship.
- Keep text labels outside dense fields and use short captions. Organic marks should carry the visual story.

## Variant Contracts

### Phyllotaxis Seed Head

- Pattern ID: `d3-phyllotaxis-seed-head`.
- Data contract: an integer seed count, a divergence angle, a radial spacing coefficient, and optional semantic color groups.
- Geometry: for seed `i`, compute `theta = i * goldenAngle` and `r = spacing * sqrt(i)`, then place the seed at `center + [r cos(theta), r sin(theta)]`.
- Animation: grow seeds in index order or by radial distance. Expose `.organic-seed`, `data-seed-index`, and `data-divergence-degrees`.
- Use for sunflower heads, pinecones, rosettes, packed token fields, radial queues, and any growth process where local packing should read as natural.

### L-system Canopy

- Pattern ID: `d3-lsystem-canopy`.
- Data contract: an axiom, rewrite rules, iteration count, turn angle, and turtle step length.
- Geometry: expand the grammar, then interpret `F` as draw-forward, `+` and `-` as turns, and `[` / `]` as stack push/pop for branch state.
- Animation: draw `.organic-branch` paths in grammar order with path-draw animation, then reveal optional `.organic-leaf` marks at high or terminal branches.
- Use for vines, roots, vascular trees, dendrites, decision-tree metaphors, and recursive dependency growth.

### Reaction Diffusion Field

- Pattern ID: `d3-reaction-diffusion-field`.
- Data contract: grid size, step count, feed rate, kill rate, diffusion rates, and initial seed regions.
- Geometry: simulate a bounded Gray-Scott grid or precompute the scalar concentration field, then render rectangular cells, contours, or sampled points from the final concentration.
- Animation: fade the field in with a sweep, threshold reveal, or contour draw. Expose `.organic-rd-cell`, `data-row`, `data-col`, and `data-concentration`.
- Use for spots, stripes, coral surfaces, skin-like textures, regional activation fronts, and morphogenesis metaphors.

### Diffusion-limited Aggregation

- Pattern ID: `d3-diffusion-limited-aggregation`.
- Data contract: particle count, seed, walker launch radius, movement directions, and sticking rule.
- Geometry: start with one occupied seed. Launch walkers from outside the cluster, move them with seeded random steps, and stick a walker when it reaches an occupied neighbor. Store each particle's parent.
- Animation: draw `.organic-dla-link` paths from parent to child and grow `.organic-aggregate-particle` marks in attachment order.
- Use for lightning-like branches, mineral accretion, coral growth, lichen edges, dependency accretion, and network percolation metaphors.

## Semantic Color Roles

- Blue: primary growth field, early stage, or model baseline.
- Green: biological growth, healthy branch tips, or accepted attachment.
- Purple: chemical concentration, morphogen intensity, or dense interaction.
- Orange: late-stage accretion, active sweep, or threshold front.
- Red: reserved for pathological growth, blocked growth, or failure state; avoid it in neutral organic examples.
- Neutral grays: panel frames, inactive guide rings, parent links, and label halos.

## Minimal D3 Renderer Patterns

Phyllotaxis placement:

```js
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const seeds = d3.range(seedCount).map(i => {
  const r = spacing * Math.sqrt(i);
  const theta = i * goldenAngle;
  return { i, x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
});

svg.selectAll("circle.organic-seed")
  .data(seeds)
  .join("circle")
  .attr("class", "organic-seed")
  .attr("data-seed-index", d => d.i)
  .attr("cx", d => d.x)
  .attr("cy", d => d.y)
  .attr("r", seedRadius);
```

L-system expansion:

```js
function expand(axiom, rules, iterations) {
  let current = axiom;
  for (let i = 0; i < iterations; i += 1) {
    current = Array.from(current, symbol => rules[symbol] ?? symbol).join("");
  }
  return current;
}
```

DLA particles should expose parent links:

```js
links.selectAll("path.organic-dla-link")
  .data(particles.filter(d => d.parent != null))
  .join("path")
  .attr("class", "organic-dla-link")
  .attr("data-particle-index", d => d.order)
  .attr("data-parent-index", d => d.parent)
  .attr("d", d => `M${points[d.parent].x},${points[d.parent].y}L${d.x},${d.y}`);
```

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-organic-growth"`, `data-pattern-family="organic-growth"`, and `data-variant-count="4"`.
- The artifact contains four `.organic-variant` groups with the expected variant pattern IDs.
- Phyllotaxis exposes at least 100 `.organic-seed` marks and a fixed `data-divergence-degrees`.
- L-system exposes `data-grammar`, `data-iteration-count`, and `.organic-branch` marks.
- Reaction diffusion exposes `data-model="gray-scott"`, feed/kill rates, grid size, and `.organic-rd-cell` marks.
- DLA exposes `data-particle-count`, `data-seed`, `.organic-aggregate-particle`, and parent-index links.
- Browser capture should show nonblank marks in all four panels, readable captions, and animation nodes in the captured SVG.
