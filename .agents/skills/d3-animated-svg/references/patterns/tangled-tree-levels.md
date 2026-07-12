# Tangled Tree Levels

- **Pattern ID:** `d3-tangled-tree-levels`
- **Gallery source ID:** `tangled-tree-levels`
- **Family:** Hierarchy
- **Use when:** A multi-parent DAG draws one hierarchy level at a time.
- **Renderer:** `renderTangledTreeLevels`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderTangledTreeLevels() {
    const svg = prepareSvg("tangled-tree-levels", "Tangled tree cascade", "A cascade-style tangled tree uses small node markers and metro-style bundles to reveal multiple inheritance by generation.");
    const generations = [
      [{ id: "Chaos" }],
      [{ id: "Gaea", parents: ["Chaos"] }, { id: "Uranus" }],
      [
        { id: "Oceanus", parents: ["Gaea", "Uranus"] },
        { id: "Tethys", parents: ["Gaea", "Uranus"] },
        { id: "Rhea", parents: ["Gaea", "Uranus"] },
        { id: "Cronus", parents: ["Gaea", "Uranus"] },
        { id: "Coeus", parents: ["Gaea", "Uranus"] },
        { id: "Phoebe", parents: ["Gaea", "Uranus"] },
        { id: "Iapetus", parents: ["Gaea", "Uranus"] }
      ],
      [
        { id: "Doris", parents: ["Oceanus", "Tethys"] },
        { id: "Nereus", parents: ["Oceanus", "Tethys"] },
        { id: "Dione", parents: ["Oceanus", "Tethys"] },
        { id: "Demeter", parents: ["Rhea", "Cronus"] },
        { id: "Hades", parents: ["Rhea", "Cronus"] },
        { id: "Hera", parents: ["Rhea", "Cronus"] },
        { id: "Zeus", parents: ["Rhea", "Cronus"] },
        { id: "Leto", parents: ["Coeus", "Phoebe"] },
        { id: "Atlas", parents: ["Iapetus"] }
      ],
      [
        { id: "Thetis", parents: ["Doris", "Nereus"] },
        { id: "Peleus" },
        { id: "Aphrodite", parents: ["Dione", "Zeus"] },
        { id: "Persephone", parents: ["Demeter", "Zeus"] },
        { id: "Ares", parents: ["Hera", "Zeus"] },
        { id: "Apollo", parents: ["Leto", "Zeus"] }
      ],
      [
        { id: "Achilles", parents: ["Thetis", "Peleus"] },
        { id: "Aeneas", parents: ["Aphrodite"] },
        { id: "Eros", parents: ["Aphrodite", "Ares"] }
      ]
    ];
    const xPositions = [34, 122, 212, 316, 430, 518];
    const generationStartY = [60, 118, 178, 222, 292, 342];
    const rowGap = [0, 34, 20, 18, 18, 22];
    const bundleColors = [palette.blue, palette.orange, palette.purple, palette.green, palette.red, palette.gray700, palette.gold, palette.blueHover];
    const nodeRadius = 4.2;
    const nodes = generations.flatMap((generation, layer) => generation.map((node, index) => ({
      ...node,
      layer,
      index,
      x: xPositions[layer],
      y: generationStartY[layer] + index * rowGap[layer]
    })));
    const byId = new Map(nodes.map(d => [d.id, d]));
    const families = new Map();
    nodes.forEach(node => {
      if (!node.parents) return;
      const key = `${node.layer}:${node.parents.join("+")}`;
      if (!families.has(key)) families.set(key, {
        key,
        layer: node.layer,
        parents: node.parents,
        children: []
      });
      families.get(key).children.push(node);
    });
    const lanesByLayer = new Map();
    const familyList = [...families.values()].map((family, index) => {
      const lane = lanesByLayer.get(family.layer) || 0;
      lanesByLayer.set(family.layer, lane + 1);
      const parentMaxX = d3.max(family.parents.map(parentId => byId.get(parentId)?.x).filter(Number.isFinite));
      const childX = xPositions[family.layer];
      const laneOffsets = [0, -8, 8, -16, 16, -24, 24];
      const bundleX = Math.min(childX - 20, parentMaxX + (childX - parentMaxX) * .66 + laneOffsets[lane % laneOffsets.length]);
      return {
        ...family,
        index,
        lane,
        color: bundleColors[index % bundleColors.length],
        bundleX
      };
    });
    const familyByKey = new Map(familyList.map(family => [family.key, family]));
    const links = [];
    nodes.forEach(node => {
      if (!node.parents) return;
      const family = familyByKey.get(`${node.layer}:${node.parents.join("+")}`);
      node.parents.forEach(parentId => {
        const parent = byId.get(parentId);
        if (parent) links.push({ parent, child: node, family });
      });
    });
    const generationDelay = layer => .16 + layer * .58;
    const linkDelay = layer => Math.max(.06, generationDelay(layer) - .18);
    const waterfallPath = d => {
      const xs = d.parent.x + nodeRadius;
      const ys = d.parent.y;
      const xt = d.child.x - nodeRadius;
      const yt = d.child.y;
      const xb = d.family.bundleX;
      const c = 9;
      const sign = yt >= ys ? 1 : -1;
      return [
        `M${xs},${ys}`,
        `H${xb - c}`,
        `Q${xb},${ys} ${xb},${ys + sign * c}`,
        `V${yt - sign * c}`,
        `Q${xb},${yt} ${xb + c},${yt}`,
        `H${xt}`
      ].join(" ");
    };

    const haloLinks = svg.append("g")
      .attr("fill", "none")
      .selectAll("path.halo-link")
      .data(links)
      .join("path")
      .attr("class", "halo-link")
      .attr("d", waterfallPath)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 4.6)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0);
    const colorLinks = svg.append("g")
      .attr("fill", "none")
      .selectAll("path.color-link")
      .data(links)
      .join("path")
      .attr("class", "color-link")
      .attr("d", waterfallPath)
      .attr("stroke", d => d.family.color)
      .attr("stroke-width", d => d.family.parents.length > 1 ? 2.2 : 1.7)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0);
    svg.selectAll("path.halo-link, path.color-link").each(function (d) {
      const length = this.getTotalLength ? this.getTotalLength() : 180;
      const delay = linkDelay(d.child.layer) + d.child.index * .025;
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", length);
      d3.select(this).append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", ".72s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", this.classList.contains("halo-link") ? .95 : .86)
        .attr("dur", ".2s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });

    const node = svg.append("g").selectAll("g.cascade-node").data(nodes).join("g")
      .attr("class", "cascade-node")
      .attr("opacity", 0);
    node.append("circle")
      .attr("r", nodeRadius)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.surface)
      .attr("stroke", palette.ink)
      .attr("stroke-width", 2);
    node.append("text")
      .attr("class", "tangle-cascade-label")
      .attr("x", d => d.x + 7.5)
      .attr("y", d => d.y - 5.5)
      .attr("font-size", 8.2)
      .attr("font-weight", 700)
      .attr("fill", palette.ink)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text(d => d.id);
    node.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".34s")
        .attr("begin", `${generationDelay(d.layer) + d.index * .018}s`)
        .attr("fill", "freeze");
    });
  }
```
