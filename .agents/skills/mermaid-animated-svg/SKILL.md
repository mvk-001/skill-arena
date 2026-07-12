---
name: mermaid-animated-svg
description: Generate high-quality animated SVGs from Mermaid diagrams while preserving Mermaid-rendered layout, colors, theme variables, custom CSS, and CLI options. Use when Codex needs to render a Mermaid diagram to a static SVG, post-process it into an animated SVG, tune timing or animation style, inspect detected animation elements, control reveal order with element IDs, classes, labels, or an order file, or design Mermaid-comment animation directives.
---

# Mermaid Animated SVG

## Exact Output Contract

When a task names specific files, treat those names as fixed API values. Before writing files or running commands, make a three-value map from the prompt:

```powershell
$Source = "flow.mmd"
$StaticSvg = "flow.static.svg"
$AnimatedSvg = "flow.animated.svg"
```

Replace the example values with the exact requested paths. Do not substitute descriptive names such as `flowchart.mmd`, `diagram.static.svg`, or `output/flowchart.animated.svg`. After generation, run a literal path check for every requested output and fix the run before responding if any check fails.

For a basic flowchart smoke task, copy `assets/templates/flowchart-flow-smoke.mmd` to the exact requested source path instead of rewriting the diagram from memory.

## Core Workflow

1. Capture any user-provided input and output filenames before running commands. Use those paths exactly in the Mermaid source, static SVG, animated SVG, and validation checks; do not rename them.
2. Render the Mermaid source to a static SVG first. Preserve the same Mermaid CLI config, theme, CSS, background, and raw arguments for static and animated output.
3. Animate the rendered SVG with `scripts/animate_mermaid_svg.py`. Do not recreate Mermaid geometry by hand.
4. Use `--list-elements` when selectors, order, anchors, or generated classes are not obvious.
5. Keep the static SVG beside the animated SVG for verification and regression checks.
6. Verify that the final animated frame matches the static Mermaid rendering: layout, text, markers, colors, and edge styles should settle correctly.
7. Write generated task files to the current workspace or requested artifact directory. Do not write task outputs into the skill directory unless maintaining the skill itself.

## Progressive Disclosure Map

Read only the file needed for the task:

- `references/animation-directives.md`: read when the source contains `%% @animate`, when designing Mermaid-comment animation syntax, or when using targets, groups, points, marks, movement, color, pulse, hide, or orchestration directives.
- `references/diagram-directive-notes.md`: read when choosing selectors or choreography for a specific Mermaid diagram type.
- `references/diagram-family-coverage.json`: read when maintaining canonical Mermaid family fixtures, by-type directive examples, or exact coverage validation.
- `references/cli-animation-controls.md`: read when tuning `--animation`, timing, dwell, branch duration, order tokens, or diagram-specific auto behavior.
- `assets/templates/flowchart-flow-smoke.mmd`: use for isolated smoke tests that need a small `flowchart LR` source with Request, Valid?, Process, Repair, and Done labels.

## Common Commands

Render and animate in one step:

```powershell
$Source = "flow.mmd"
$StaticSvg = "flow.static.svg"
$AnimatedSvg = "flow.animated.svg"
Copy-Item skills/mermaid-animated-svg/assets/templates/flowchart-flow-smoke.mmd $Source
uv run --script skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py $Source -o $AnimatedSvg --static-output $StaticSvg --animation auto --duration-ms 650 --stagger-ms 120
if (!(Test-Path -LiteralPath $Source) -or !(Test-Path -LiteralPath $StaticSvg) -or !(Test-Path -LiteralPath $AnimatedSvg)) { throw "Missing requested Mermaid output path." }
```

Render a Mermaid source that contains `%% @animate` comments:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py .agents/skills/mermaid-animated-svg/assets/examples/mermaid-animation-directives/flowchart-token-routing.mmd -o projects/<project-id>/artifacts/svgs/flowchart-token-routing.animated.svg --static-output projects/<project-id>/artifacts/svgs/flowchart-token-routing.static.svg
```

Use a pre-rendered Mermaid SVG:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py --svg-input diagram.static.svg -o diagram.animated.svg --animation organic
```

Inspect detected elements before ordering or directive work:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py diagram.mmd --list-elements
```

## Selector Discipline

- Prefer IDs, labels, generated classes, and role tokens from `--list-elements` over guessed DOM order.
- Use `--order`, `--order-file`, and `--strict-order` when the reveal order must be exact.
- Prefer overlay marks for moving tokens, cursors, highlights, and callouts so Mermaid layout stays unchanged.
- Treat generated Mermaid SVG as the source of truth. Source notation can normalize into different relationship IDs or selector classes.

## Visual Tokens

Read `references/visual-tokens.md` before creating or updating examples, galleries, custom Mermaid themes, overlay marks, or replay controls. Preserve Mermaid-rendered geometry, but use Open Sans, Material Symbols Rounded system icons, and the documented brand palette for editable theme variables, page chrome, controls, overlays, highlights, and generated gallery UI.

## Pattern Promotion

When a diagram-specific choreography, directive style, selector strategy, or ordering rule proves reusable, update the owning reference before finishing. Use `references/diagram-directive-notes.md` for diagram-type patterns, `references/animation-directives.md` for directive syntax, and `references/cli-animation-controls.md` for timing or order controls. Include the diagram type, trigger, selectors, directive example, validation command, and any Mermaid renderer pitfalls.

## Validation

After changing the skill, scripts, examples, or generated outputs, run the relevant render command and then:

```powershell
uv run --script .agents/skills/mermaid-animated-svg/scripts/validate_mermaid_family_coverage.py --report projects/<project-id>/artifacts/reviews/mermaid-family-coverage.json
uv run --script scripts/validate-skills.py
```
