# Swimlane

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
swimlane-beta LR
  subgraph author [Author]
    draft[Draft source]
    review{Review?}
  end
  subgraph automation [Automation]
    render[Render SVG]
    validate[Validate output]
    publish([Publish])
  end
  draft --> review
  review -->|approved| render --> validate --> publish
  review -->|revise| draft

  classDef focus fill:#fff4cc,stroke:#994a00,color:#333E48,stroke-width:2px;
  class review,validate focus;
```
