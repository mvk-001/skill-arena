# Rotating Dot Rings

- **Pattern ID:** `d3-rotating-dot-rings`
- **Family:** Radial dot field
- **Use when:** A D3/SVG artifact needs concentric circular bands made from discrete dots, especially subtle hero/background fields inspired by partial dotted circular layouts.
- **Builder:** `scripts/build_rotating_dot_rings.py`

## Reference Basis

Use the Equifax dotted hero background image as a loose visual reference for quiet white space, pale gray dots, concentric circular rhythm, and edge-cropped radial fields. Do not embed, trace, or depend on the remote image.

Reference URL: https://assets.equifax.com/images/us/personal-misc/dot_bkg_hero_white_centered-layouts.png

## Reuse Contract

- Keep the root SVG selector `svg#rotating-dot-rings` for standalone artifacts.
- Expose `data-pattern-id="d3-rotating-dot-rings"`, `data-pattern-family="radial-dot-field"`, `data-ring-count`, `data-dot-count`, and `data-direction-rule="alternating-clockwise-counterclockwise"`.
- Represent each layer as one `.dot-ring` group with `data-ring-index`, `data-direction`, `data-radius`, `data-dot-count`, and `data-duration-seconds`.
- Represent every point as a `.rotating-dot` circle with `data-dot-index`.
- Create deliberate white space by omitting about 7 percent of each ring's source dots from one fixed angular sector. Expose `data-source-dot-count`, `data-gap-dot-count`, `data-gap-percent`, and `data-gap-sector-center-degrees` on the root and on each ring.
- Keep the final visual mostly white and neutral. Use gray token dots by default; reserve saturated color only when the pattern must highlight one selected band.
- Do not rely on remote scripts, fonts, images, or CSS for a self-contained artifact.

## Data Contract

Use 8-14 rings for normal hero or background use. Each ring needs:

```js
{
  index: 0,
  radius: 26.5,
  dotCount: 16,
  direction: "clockwise",
  duration: 30,
  dotRadius: 1.15,
  opacity: 0.14,
  phase: 0,
  gapPercent: 0.07,
  gapCenterDegrees: -48
}
```

Directions must alternate by ring index: even rings clockwise, odd rings counterclockwise. Source dot count should grow with circumference so spacing stays visually consistent. Remove `round(sourceDotCount * 0.07)` dots closest to the chosen sector center, then expose the remaining visible count as `data-dot-count`. Use a deterministic phase offset per ring to avoid radial spokes lining up too perfectly.

## Implementation Steps

1. Create a root SVG with a stable `viewBox`, `<title>`, `<desc>`, and the root data attributes above.
2. Add a white `rect` background so extracted SVGs keep the intended reference style on non-white pages.
3. Add one centered `.dot-ring-field` group and translate it to the center of the viewBox.
4. Compute ring radii from an inner radius near 10 percent of the maximum radius to an outer radius near 43 percent of the shorter SVG dimension.
5. For each ring, compute dot positions with `x = radius * cos(theta)` and `y = radius * sin(theta)`.
6. Remove the 7 percent sector before writing circles. Use angular distance to the sector center, not random deletion, so the white gap is intentional and reproducible.
7. Vary dot radius and opacity slightly with deterministic sine/cosine waves so the field looks organic while remaining reproducible.
8. Animate each `.dot-ring` group with SVG-native `animateTransform type="rotate"` around the field origin. Use `to="360 0 0"` for clockwise layers and `to="-360 0 0"` for counterclockwise layers.
9. Use longer durations for larger radii. Keep motion subtle: roughly 30-85 seconds per revolution works well for background use.
10. Add a reduced-motion fallback that removes or disables only animation elements while keeping all dots visible.

## Animation Contract

- Ring `0` rotates clockwise.
- Ring `1` rotates counterclockwise.
- Continue alternating directions through the outer ring.
- Each ring starts with a visible omitted sector. The omitted sector belongs to that rotating layer, so the gap travels with the layer instead of acting as a fixed mask.
- All rings rotate indefinitely, but slowly enough to read as ambient texture rather than a spinner.
- The first frame and final frame are both valid, complete dotted circles. No mark should depend on opacity reveal to become visible.

## Standalone Builder

For isolated or user-artifact generation, prefer the bundled builder:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_rotating_dot_rings.py rotating-dot-rings.html --d3-renderer-output rotating-dot-rings.d3.js --gap-percent 0.07 --gap-center-degrees -48
```

The optional D3 renderer output exposes `renderRotatingDotRings(target, options)`. It expects D3 v7 as `globalThis.d3` or `options.d3`, computes the same deterministic rings, and appends SVG-native animation nodes through D3 selections.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-rotating-dot-rings"`.
- Root `data-ring-count` matches the number of `.dot-ring` groups.
- Root `data-dot-count` matches the number of `.rotating-dot` circles.
- On every ring, `data-source-dot-count - data-dot-count` equals `data-gap-dot-count`, and `data-gap-dot-count / data-source-dot-count` is close to `0.07` after rounding.
- Adjacent `.dot-ring` groups alternate `data-direction` between `clockwise` and `counterclockwise`.
- Every ring has an `animateTransform` node with a matching positive or negative rotation target.
- A browser screenshot after at least 1 second is nonblank, mostly white, and shows nested dotted circles plus an intentional gap sector with no text overlap or external asset loads.
