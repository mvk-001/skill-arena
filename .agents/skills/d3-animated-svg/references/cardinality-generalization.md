# Cardinality Generalization

Read this when the task asks a D3 pattern to work with fewer elements, more elements, explicit small/medium/large variants, exact mark counts, or validation hooks such as `svg#id`, `data-target-count`, `.node`, `.link`, or `.dot`.

## Non-Negotiable Contract

1. Extract the requested output contract before choosing a design:
   - exact output file path
   - every requested `svg#id`
   - pattern IDs
   - target counts
   - required mark classes
   - required metadata attributes
2. If every requested pattern is supported by `scripts/build_cardinality_variants.ts`, use the generator path and skip `references/pattern-index.md` plus per-pattern references; the generator already encodes the required deterministic geometry for those pattern families.
3. If the prompt names exact `d3-*` IDs that are not fully covered by the generator path, extract the complete unique set and read every matching `references/patterns/<id>.md` file before implementation. Do not stop after the first pattern, do not search the pattern index first, and do not switch to a different chart family.
4. If the prompt asks for one SVG per variant, create separate `<svg>` roots with the exact requested IDs. Do not collapse them into one combined chart unless the prompt explicitly allows it.
5. Preserve the requested classes on the countable marks. If validation will count `.node`, put `class="node"` on every node mark. If validation will count `.dot`, put `class="dot"` on every observation mark.
6. Add `data-pattern-id`, `data-size`, and `data-target-count` on each generated SVG when the task asks for machine-verifiable variants.
7. For self-contained output, inline final-state geometry. Do not leave an empty SVG that depends on runtime D3, CDN scripts, or external assets.
8. Treat requested `svg#id` values as a validation interface. Copy them exactly; do not rename them to a theme, chart title, or generalized family name.
9. If every requested pattern is supported by `scripts/build_cardinality_variants.ts`, create a small workspace-local variants JSON file and run `node skills/d3-animated-svg/scripts/build_cardinality_variants.ts <variants.json> <artifact.html>` instead of hand-writing the SVG. The generator currently supports `d3-force-network` and `d3-beeswarm`.
10. Before the final response, create a small workspace-local `svg-contract.json` and run `node skills/d3-animated-svg/scripts/check_svg_contract.ts <artifact.html> svg-contract.json`. Fix every finding before replying.

## Force Network Scaling

Use this when adapting `d3-force-network` to multiple node counts.

Data contract:

- Generate exactly the requested number of nodes.
- Generate at least the requested number of links.
- Assign deterministic groups such as `core`, `data`, `ops`, and `edge`.
- Keep labels readable by labeling all nodes for small variants, representative nodes for medium variants, and cluster hubs or group summaries for large variants.

Geometry contract:

- Use fixed final coordinates rather than a browser-side force simulation for portable output.
- For small variants, place nodes on one loose ring around a center hub.
- For medium variants, use two rings or three grouped arcs.
- For large variants, use three or four clusters with local rings and hub links.
- Keep links under nodes. Use `class="link"` on each link line/path and `class="node"` on each node circle or node group, whichever is the primary countable mark.
- Reduce node radius and label density as the count grows instead of letting marks overlap.

If the generator path is unavailable, use a ring or clustered-ring layout: one hub plus ring for small counts, three clusters for medium counts, and four clusters with hub links for large counts. Build links deterministically from a chain plus additional skip links until the requested minimum is reached.

## Beeswarm Scaling

Use this when adapting `d3-beeswarm` to multiple observation counts.

Data contract:

- Generate exactly the requested number of observations.
- Use three deterministic groups unless the prompt says otherwise.
- Use `class="dot"` on every observation mark.

Geometry contract:

- Use a shared horizontal score scale for every variant so the small, medium, and large swarms remain comparable.
- Use lane centers for groups and deterministic vertical jitter or stacked offsets to prevent overlap.
- For large variants, use smaller radius and label only group names, axis ticks, and representative annotations.

If the generator path is unavailable, create deterministic observations with three groups, a shared score scale, group lanes, and count-dependent vertical offsets. Reduce dot radius as the count grows.

## Generator Path For Supported Patterns

For force-network and beeswarm cardinality variants, prefer the bundled generator. The variants file must repeat the exact requested primary mark count in both `targetCount` and `marks.node.equals` or `marks.dot.equals`; this prevents approximate sizes from passing silently. Example variants file:

```json
{
  "title": "D3 Cardinality Generalization",
  "subtitle": "Each SVG keeps the same visual grammar while changing only the requested number of marks.",
  "svgs": [
    {
      "id": "force-small",
      "patternId": "d3-force-network",
      "size": "small",
      "targetCount": 5,
      "marks": {
        "node": { "equals": 5 },
        "link": { "min": 5 }
      }
    },
    {
      "id": "force-medium",
      "patternId": "d3-force-network",
      "size": "medium",
      "targetCount": 12,
      "marks": {
        "node": { "equals": 12 },
        "link": { "min": 16 }
      }
    },
    {
      "id": "force-large",
      "patternId": "d3-force-network",
      "size": "large",
      "targetCount": 36,
      "marks": {
        "node": { "equals": 36 },
        "link": { "min": 45 }
      }
    },
    {
      "id": "beeswarm-small",
      "patternId": "d3-beeswarm",
      "size": "small",
      "targetCount": 9,
      "marks": {
        "dot": { "equals": 9 }
      }
    },
    {
      "id": "beeswarm-medium",
      "patternId": "d3-beeswarm",
      "size": "medium",
      "targetCount": 30,
      "marks": {
        "dot": { "equals": 30 }
      }
    },
    {
      "id": "beeswarm-large",
      "patternId": "d3-beeswarm",
      "size": "large",
      "targetCount": 90,
      "marks": {
        "dot": { "equals": 90 }
      }
    }
  ]
}
```

Run:

```powershell
node skills/d3-animated-svg/scripts/build_cardinality_variants.ts variants.json d3-generalization-cardinality.html
```

Then validate with `check_svg_contract.ts`.

## Validation Before Final Response

When the prompt contains exact IDs or countable classes, create a contract file and run the bundled checker before replying:

```powershell
node skills/d3-animated-svg/scripts/check_svg_contract.ts artifact.html svg-contract.json
```

Example contract shape:

```json
{
  "requireReducedMotion": true,
  "forbidRemote": true,
  "svgs": [
    {
      "id": "force-small",
      "patternId": "d3-force-network",
      "size": "small",
      "targetCount": 5,
      "marks": {
        "node": { "equals": 5 },
        "link": { "min": 5 }
      }
    },
    {
      "id": "beeswarm-large",
      "patternId": "d3-beeswarm",
      "size": "large",
      "targetCount": 90,
      "marks": {
        "dot": { "equals": 90 }
      }
    }
  ],
  "monotonic": [
    { "ids": ["force-small", "force-medium", "force-large"], "mark": "node" },
    { "ids": ["beeswarm-small", "beeswarm-medium", "beeswarm-large"], "mark": "dot" }
  ]
}
```

The checker verifies:

- every requested `svg#id` exists
- each SVG has `viewBox`, `<title>`, `<desc>`, and requested `data-*` metadata
- `.node`, `.link`, or `.dot` counts match the requested cardinality or permitted range
- small, medium, and large variants increase monotonically in mark count
- reduced-motion rendering keeps marks visible

If any requested ID, class, or count is missing, fix the artifact instead of explaining the mismatch.
