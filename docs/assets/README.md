# Documentation Assets

README diagrams are stored as reproducible Mermaid triples:

| Diagram | Source | Verification render | README render |
| --- | --- | --- | --- |
| Skill Arena value | `skill-arena-value.mmd` | `skill-arena-value.static.svg` | `skill-arena-value.animated.svg` |
| Evolution strategies | `evolution-strategies.mmd` | `evolution-strategies.static.svg` | `evolution-strategies.animated.svg` |

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

uv run --script $Script docs/assets/evolution-strategies.mmd `
  -o docs/assets/evolution-strategies.animated.svg `
  --static-output docs/assets/evolution-strategies.static.svg `
  --animation auto --duration-ms 300 --stagger-ms 40 `
  --initial-delay-ms 200 --background "#ffffff"
```
