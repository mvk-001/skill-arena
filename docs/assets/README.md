# Documentation Assets

README diagrams are stored as reproducible Mermaid triples:

| Diagram | Mermaid source | Static verification | Animated source | README render |
| --- | --- | --- | --- | --- |
| Skill Arena value | `skill-arena-value.mmd` | `skill-arena-value.static.svg` | `skill-arena-value.animated.svg` | `skill-arena-value.gif` |
| Improvement workflows | `improvement-workflows.mmd` | `improvement-workflows.static.svg` | `improvement-workflows.animated.svg` | `improvement-workflows.gif` |

Edit the `.mmd` source, then regenerate both SVGs with the
`mermaid-animated-svg` skill workflow. Keep the static render beside the
animated render so the final animation frame can be compared against Mermaid's
unaltered geometry.

```powershell
$Script = ".agents/skills/mermaid-animated-svg/scripts/animate_mermaid_svg.py"

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
