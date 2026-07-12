# Railroad

```mermaid
---
config:
  theme: base
  themeVariables:
    fontFamily: "'Open Sans', arial, sans-serif"
    primaryColor: '#cdf3ff'
    primaryTextColor: '#333E48'
    primaryBorderColor: '#007298'
    lineColor: '#45842a'
    secondaryColor: '#fff4cc'
    tertiaryColor: '#dbffcc'
---
railroad-beta
title "Mermaid artifact rule"
root = sequence(
  terminal("source"),
  nonterminal("diagram"),
  choice(terminal("static SVG"), terminal("animated SVG")),
  terminal("validate")
) ;
```
