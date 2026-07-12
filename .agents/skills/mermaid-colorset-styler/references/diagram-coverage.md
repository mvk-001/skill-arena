# Mermaid Diagram Coverage

Use `diagram-types.json` as the frozen, machine-readable Mermaid 11.16.0 taxonomy. It is the source of truth for family normalization, current declarations, accepted compatibility aliases, and inline `classDef` capability.

## Coverage Contract

The maintenance fixture must contain exactly one block for every accepted declaration in the manifest:

- 31 public diagram families.
- 40 current documented declarations.
- 8 additional compatibility declarations rendered by Mermaid CLI 11.16.0.
- 48 renderable declarations in total.
- 9 families with documented inline `classDef` support.

Require exact set equality. Fail maintenance validation for a missing, unexpected, or duplicate declaration; a matching count alone is not coverage evidence. Keep the `info` utility diagram and Mermaid's internal error/frontmatter sentinels outside the public content-diagram denominator.

Do not count the `architecture` detector shorthand as accepted coverage. Mermaid CLI 11.16.0 can exit successfully for that header while emitting a syntax-error SVG; only `architecture-beta` is renderable. Inspect rendered SVGs for Mermaid error markers instead of trusting the process exit code alone.

## Class Definition Support

Insert Mermaid `classDef` lines only for the manifest families whose `classDef` value is `true`:

- Flowchart, including `graph` and `flowchart-elk`.
- Swimlane.
- Class, including `classDiagram-v2`.
- State.
- Entity Relationship.
- Quadrant Chart.
- Requirement.
- Block.
- Treemap.

Quadrant Chart uses its own class grammar. Emit `color` and `stroke-color`; generic `fill` and `stroke` properties fail Mermaid parsing. The other class-capable families use the normal generated CSS properties.

For all other declarations, style through base theme variables only. Preserve referenced classes without inventing assignments.

## Minimal Insertion Rule

For each Mermaid block:

1. Use Mermaid YAML frontmatter `config:` for the generated colorset theme.
2. Preserve existing Mermaid frontmatter, merge the generated colorset config into it, and replace only previous generated colorset sections.
3. Preserve existing non-colorset directives. Migrate previous generated colorset `%%{init: ...}%%` directives to YAML frontmatter.
4. Detect the diagram declaration after frontmatter, directives, and comments.
5. Normalize declarations through `diagram-types.json` before selecting family theme variables or class behavior.
6. Detect referenced color classes from `:::class`, `class target className`, and `cssClass "target" className`.
7. Insert definitions only for referenced supported color classes and only when the normalized family supports inline `classDef`.

## Maintenance Validation

Run the bundled test and full rendered approval. The reports must show 100 percent family, current-declaration, and accepted-declaration coverage with no missing, unexpected, or duplicate declarations.
