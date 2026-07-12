# Cluster Dendrogram

- **Pattern ID:** `d3-cluster-dendrogram`
- **Gallery source ID:** `cluster-dendrogram`
- **Family:** Hierarchy
- **Use when:** Equal-depth leaves reveal the structure of a clustered tree.
- **Renderer:** `renderClusterDendrogram`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderClusterDendrogram() {
    const svg = prepareSvg("cluster-dendrogram", "Cluster dendrogram", "Equal-depth leaves reveal the structure of a clustered tree.");
    const root = d3.hierarchy({
      name: "Root",
      children: [
        { name: "Alpha", children: [{ name: "A1" }, { name: "A2" }, { name: "A3" }] },
        { name: "Beta", children: [{ name: "B1" }, { name: "B2" }] },
        { name: "Gamma", children: [{ name: "G1" }, { name: "G2" }, { name: "G3" }] }
      ]
    });
    d3.cluster().size([300, 410])(root);
    const g = svg.append("g").attr("transform", "translate(68,56)");
    const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);
    const links = g.append("g").attr("fill", "none").attr("stroke", palette.line).attr("stroke-width", 2)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .06, .85);
    const nodes = g.append("g").selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.y},${d.x})`);
    nodes.append("circle").attr("fill", d => d.children ? palette.blue : palette.green).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(nodes.selectAll("circle"), "r", 2, d => d.children ? 6 : 4.5, .18, .45);
    nodes.filter(d => !d.children).append("text").attr("class", "mark-label").attr("x", 10).attr("dy", ".35em").text(d => d.data.name);
  }
```
