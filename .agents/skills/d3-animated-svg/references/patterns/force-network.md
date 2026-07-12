# Force Network

- **Pattern ID:** `d3-force-network`
- **Gallery source ID:** `force-network`
- **Family:** Simulation
- **Use when:** Clustered topology with collision and link tension.
- **Renderer:** `renderForceNetwork`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.


## Standalone Recipe

Prefer this recipe over the source excerpt when the deliverable is a standalone or offline HTML/SVG artifact. It avoids runtime force simulation and gives label positions that remain readable in screenshot validation.

Use this deterministic data contract:

```js
const nodes = [
  { id: "API", group: "core", x: 280, y: 160, labelDx: 0, labelDy: -26, anchor: "middle" },
  { id: "Auth", group: "core", x: 392, y: 190, labelDx: 26, labelDy: 4, anchor: "start" },
  { id: "Jobs", group: "core", x: 168, y: 190, labelDx: -26, labelDy: 4, anchor: "end" },
  { id: "Search", group: "data", x: 252, y: 88, labelDx: 0, labelDy: -26, anchor: "middle" },
  { id: "Index", group: "data", x: 374, y: 112, labelDx: 24, labelDy: -8, anchor: "start" },
  { id: "Events", group: "data", x: 286, y: 254, labelDx: 0, labelDy: 32, anchor: "middle" },
  { id: "Billing", group: "ops", x: 156, y: 298, labelDx: -22, labelDy: 22, anchor: "end" },
  { id: "Alerts", group: "ops", x: 430, y: 304, labelDx: 24, labelDy: 20, anchor: "start" },
  { id: "Reports", group: "ops", x: 262, y: 346, labelDx: 0, labelDy: 32, anchor: "middle" }
];
const links = [
  ["API", "Auth"], ["API", "Jobs"], ["API", "Search"], ["Auth", "Billing"], ["Jobs", "Events"],
  ["Search", "Index"], ["Events", "Reports"], ["Billing", "Reports"], ["Alerts", "Events"],
  ["Alerts", "Billing"], ["Index", "Reports"]
];
```

Implementation steps:

- Draw the title above the network and keep the network inside `x=120..470`, `y=80..360`.
- Draw links first with final `opacity` around `0.7`; if animated, add SVG `<animate attributeName="opacity" from="0" to="0.7" ... fill="freeze">` while leaving the base opacity visible.
- Draw one group per node at `translate(x,y)`, append a circle with final `r=18`, and optionally animate `r` from `4` to `18`.
- Place labels using each node's `labelDx`, `labelDy`, and `anchor`. Give labels a white stroke halo with `paint-order: stroke`, `stroke: #fff`, `stroke-width: 4`, and `stroke-linejoin: round`.
- Do not run a browser-side force simulation for a standalone deliverable. Use the fixed coordinates above so reduced-motion screenshots and exported SVGs are deterministic.

Validation hooks:

- Root SVG exposes `data-pattern-id="d3-force-network"`.
- Final SVG contains 9 circles, 11 link lines, and 9 readable labels.
- A reduced-motion or static screenshot must still show the links, circles, and labels; no mark may rely on `opacity: 0` plus a disabled animation.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderForceNetwork() {
    const svg = prepareSvg("force-network", "Force network", "D3 force simulation showing clustered topology.");
    const nodes = [
      { id: "API", group: "core" }, { id: "Auth", group: "core" }, { id: "Jobs", group: "core" },
      { id: "Search", group: "data" }, { id: "Index", group: "data" }, { id: "Events", group: "data" },
      { id: "Billing", group: "ops" }, { id: "Alerts", group: "ops" }, { id: "Reports", group: "ops" }
    ];
    const links = [
      ["API", "Auth"], ["API", "Jobs"], ["API", "Search"], ["Auth", "Billing"], ["Jobs", "Events"],
      ["Search", "Index"], ["Events", "Reports"], ["Billing", "Reports"], ["Alerts", "Events"],
      ["Alerts", "Billing"], ["Index", "Reports"]
    ].map(([source, target]) => ({ source, target }));
    const color = new Map([["core", palette.blue], ["data", palette.green], ["ops", palette.orange]]);
    const simNodes = nodes.map(d => ({ ...d }));
    const simLinks = links.map(d => ({ ...d }));
    const simulation = d3.forceSimulation(simNodes)
      .randomSource(d3.randomLcg(0.63))
      .force("link", d3.forceLink(simLinks).id(d => d.id).distance(80).strength(.58))
      .force("charge", d3.forceManyBody().strength(-190))
      .force("collide", d3.forceCollide(25))
      .force("center", d3.forceCenter(width / 2, height / 2 + 12))
      .stop();
    for (let i = 0; i < 220; i += 1) simulation.tick();
    const link = svg.append("g").attr("stroke", palette.gray300).attr("stroke-width", 2)
      .selectAll("line").data(simLinks).join("line")
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    fadeIn(link, .1, .9);
    const node = svg.append("g").selectAll("g").data(simNodes, d => d.id).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = node.append("circle")
      .attr("fill", d => color.get(d.group)).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(circles, "r", 3, 18, .15, .8);
    node.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 35).text(d => d.id);
    fadeIn(node.selectAll("text"), .7, .45);
  }
```
