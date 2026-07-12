# Visual Tokens

Use these tokens for D3 animated examples, replayable galleries, generated SVG assets, and standalone animation-focused artifacts.

## Typography

- Primary font: `"Open Sans", Arial, sans-serif`
- Use the primary font for page text, chart labels, SVG text, controls, captions, and generated visual assets.

## Iconography

- Primary icon font: `"Material Symbols Rounded"`
- Use Material Symbols Rounded for system icons such as replay, reset, play, pause, download, and navigation controls.
- Keep an accessible text label beside icon-only symbols unless the control has a clear `aria-label`.

## Brand Colors

- Brand primary: `#9e1b32`
- Brand neutral: `#333e48`

## Primary Palette

- Red: `#9e1b32`
- Orange: `#e77204`
- Yellow: `#f1c319`
- Green: `#45842a`
- Blue: `#007298`
- Purple: `#652f6c`
- Black: `#000000`
- White: `#ffffff`

## Grays

- Gray 100: `#e7e7e7`
- Gray 200: `#cfcfcf`
- Gray 300: `#b5b5b5`
- Gray 400: `#9c9c9c`
- Gray 500: `#828282`
- Gray 600: `#696969`
- Gray 700: `#4f4f4f`
- Gray 800: `#363636`
- Gray 900: `#1c1c1c`

## Interaction Colors

- Red hover: `#6d1222`
- Orange hover: `#994a00`
- Yellow hover: `#98700c`
- Green hover: `#294d19`
- Blue hover: `#004d66`
- Purple hover: `#431f47`

## Highlight Colors

- Red highlight: `#ffccd5`
- Orange highlight: `#ffe5cc`
- Yellow highlight: `#fff4cc`
- Green highlight: `#dbffcc`
- Blue highlight: `#cdf3ff`
- Purple highlight: `#f9ccff`

## Status Colors

- Error: `#e8002a`
- Warning: `#ff9633`
- Caution: `#ffd332`
- Success: `#36b300`
- Information: `#00ace6`
- Special: `#9e00b3`

## Interface Colors

- Text: `#333e48`
- Link default: `#007298`
- Link hover: `#004d66`
- Disabled: `#cfcfcf`
- Page background: `#f7f7f7`
- Footer background: `#333e48`
- Focus indicator: `#cfcfcf`

## Implementation Notes

- Prefer CSS custom properties named from these tokens in galleries and standalone HTML artifacts.
- For SVG output, set text `font-family` explicitly because extracted SVGs may not inherit page CSS.
- Use the primary palette for categorical charts before using derived colors.
- Use highlight colors for subtle fills, selection states, and replay-running states.
- Use interaction colors for hover, active, and pressed states.
- Preserve source-rendered geometry, but remap editable example palettes to these tokens when the example is not demonstrating a third-party source theme.
