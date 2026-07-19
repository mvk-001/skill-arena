# Documentation Assets

Documentation diagrams are stored as reproducible Mermaid sources with static
verification renders and animated SVG counterparts.

## Harbor evolution diagrams

| Diagram | Mermaid source | Static documentation render | Animated render |
| --- | --- | --- | --- |
| Strategy selector | `harbor-evolution/harbor-evolution-selector.mmd` | `harbor-evolution/harbor-evolution-selector.static.svg` | `harbor-evolution/harbor-evolution-selector.animated.svg` |
| Population search | `harbor-evolution/harbor-population-search.mmd` | `harbor-evolution/harbor-population-search.static.svg` | `harbor-evolution/harbor-population-search.animated.svg` |
| Trace distillation | `harbor-evolution/harbor-trace-distillation.mmd` | `harbor-evolution/harbor-trace-distillation.static.svg` | `harbor-evolution/harbor-trace-distillation.animated.svg` |
| Reflective Pareto search | `harbor-evolution/harbor-reflective-pareto-search.mmd` | `harbor-evolution/harbor-reflective-pareto-search.static.svg` | `harbor-evolution/harbor-reflective-pareto-search.animated.svg` |
| Operator coevolution | `harbor-evolution/harbor-operator-coevolution.mmd` | `harbor-evolution/harbor-operator-coevolution.static.svg` | `harbor-evolution/harbor-operator-coevolution.animated.svg` |
| Integrated GEPA evolution | `harbor-evolution/harbor-gepa-evolution.mmd` | `harbor-evolution/harbor-gepa-evolution.static.svg` | `harbor-evolution/harbor-gepa-evolution.animated.svg` |

The sources use `colorset2` so evidence, evaluation, selection, mutation, and
promotion have consistent semantic colors. Restyle and verify before rendering:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$Styler = Join-Path $CodexHome "skills/mermaid-colorset-styler/scripts/style_mermaid_directory.py"

uv run --script $Styler docs/assets/harbor-evolution `
  --colorset colorset2 --write `
  --report .tmp/harbor-evolution-colorset-write.json

uv run --script $Styler docs/assets/harbor-evolution `
  --colorset colorset2 --check `
  --report .tmp/harbor-evolution-colorset-check.json
```

Render every source with `mermaid-animated-svg` while retaining the static SVG
used by Markdown:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$Script = Join-Path $CodexHome "skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py"
$Css = "docs/assets/harbor-evolution/harbor-evolution.css"
$Names = @(
  "harbor-evolution-selector",
  "harbor-population-search",
  "harbor-trace-distillation",
  "harbor-reflective-pareto-search",
  "harbor-operator-coevolution",
  "harbor-gepa-evolution"
)

foreach ($Name in $Names) {
  uv run --script $Script "docs/assets/harbor-evolution/$Name.mmd" `
    -o "docs/assets/harbor-evolution/$Name.animated.svg" `
    --static-output "docs/assets/harbor-evolution/$Name.static.svg" `
    --css-file $Css `
    --animation auto --duration-ms 320 --stagger-ms 45 `
    --initial-delay-ms 180 --background "#ffffff"
}
```

## Historical README diagrams

| Diagram | Mermaid source | Static verification | Animated source | README render |
| --- | --- | --- | --- | --- |
| Skill Arena value | `skill-arena-value.mmd` | `skill-arena-value.static.svg` | `skill-arena-value.animated.svg` | `skill-arena-value.gif` |
| Legacy Skill Arena improvement workflows | `improvement-workflows.mmd` | `improvement-workflows.static.svg` | `improvement-workflows.animated.svg` | `improvement-workflows.gif` |

Edit the `.mmd` source, then regenerate both SVGs with the
`mermaid-animated-svg` skill workflow. Keep the static render beside the
animated render so the final animation frame can be compared against Mermaid's
unaltered geometry.

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$Script = Join-Path $CodexHome "skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py"

uv run --script $Script docs/assets/skill-arena-value.mmd `
  -o docs/assets/skill-arena-value.animated.svg `
  --static-output docs/assets/skill-arena-value.static.svg `
  --animation auto --duration-ms 300 --stagger-ms 40 `
  --initial-delay-ms 200 --background "#ffffff"

uv run --script $Script docs/assets/improvement-workflows.mmd `
  -o docs/assets/improvement-workflows.animated.svg `
  --static-output docs/assets/improvement-workflows.static.svg `
  --animation auto --duration-ms 300 --stagger-ms 40 `
  --initial-delay-ms 200 --background "#ffffff"
```

GitHub does not advance embedded CSS SVG animations consistently, so the README
uses browser-rendered GIFs. Regenerate them from the animated SVG sources:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$GifScript = Join-Path $CodexHome "skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py"

uv run --script $GifScript docs/assets/skill-arena-value.animated.svg `
  -o docs/assets/skill-arena-value.gif `
  --fps 18 --width 1200 --scale 1 --tail-padding 0.6 `
  --background "#ffffff" --browser-channel chrome

uv run --script $GifScript docs/assets/improvement-workflows.animated.svg `
  -o docs/assets/improvement-workflows.gif `
  --fps 18 --width 1200 --scale 1 --tail-padding 0.6 `
  --background "#ffffff" --browser-channel chrome
```
