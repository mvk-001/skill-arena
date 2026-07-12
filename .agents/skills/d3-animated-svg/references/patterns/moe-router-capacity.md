# MoE Router Capacity

- **Pattern ID:** `d3-moe-router-capacity`
- **Gallery source ID:** `moe-router-capacity`
- **Family:** LLM
- **Use when:** Token-level top-k routing fills expert slots and exposes capacity overflow.
- **Renderer:** `renderMoeRouterCapacity`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderMoeRouterCapacity() {
    const svg = prepareSvg("moe-router-capacity", "MoE router capacity", "Sparse mixture-of-experts routing sends tokens to top-k experts while finite capacity creates overflow.");
    const tokenLabels = ["ctx", "retr", "plan", "sql", "tool", "json"];
    const expertIds = ["E0", "E1", "E2", "E3"];
    const tokenY = d3.scalePoint().domain(d3.range(tokenLabels.length)).range([106, 310]);
    const expertY = d3.scalePoint().domain(expertIds).range([104, 304]);
    const experts = expertIds.map((id, i) => ({ id, y: expertY(id), color: colors[i % colors.length] }));
    const tokens = tokenLabels.map((label, i) => ({ id: `T${i}`, label, y: tokenY(i), color: colors[i % colors.length] }));
    const tokenX = 58;
    const matrixX = 176;
    const matrixY = 98;
    const expertX = 382;
    const scoreMatrix = [
      [.72, .12, .18, .08],
      [.10, .64, .25, .12],
      [.09, .57, .11, .29],
      [.16, .08, .68, .22],
      [.12, .49, .32, .19],
      [.18, .16, .24, .58]
    ];
    const links = [
      { token: 0, expert: 0, p: .72, rank: 1 },
      { token: 0, expert: 2, p: .18, rank: 2 },
      { token: 1, expert: 1, p: .64, rank: 1 },
      { token: 1, expert: 2, p: .25, rank: 2 },
      { token: 2, expert: 1, p: .57, rank: 1 },
      { token: 2, expert: 3, p: .29, rank: 2 },
      { token: 3, expert: 2, p: .68, rank: 1 },
      { token: 3, expert: 0, p: .16, rank: 2 },
      { token: 4, expert: 1, p: .49, rank: 1, overflow: true },
      { token: 4, expert: 2, p: .32, rank: 2 },
      { token: 5, expert: 3, p: .58, rank: 1 },
      { token: 5, expert: 2, p: .24, rank: 2 }
    ];

    svg.append("text").attr("class", "mark-label").attr("x", tokenX + 34).attr("y", 72).attr("text-anchor", "middle").text("tokens");
    svg.append("text").attr("class", "mark-label").attr("x", matrixX + 54).attr("y", 72).attr("text-anchor", "middle").text("router scores");
    svg.append("text").attr("class", "mark-label").attr("x", expertX + 74).attr("y", 72).attr("text-anchor", "middle").text("capacity = 2");

    const cell = 17;
    const gap = 4;
    const scoreCells = [];
    scoreMatrix.forEach((row, r) => row.forEach((value, c) => scoreCells.push({ row: r, col: c, value, color: experts[c].color })));
    svg.append("rect").attr("x", matrixX - 14).attr("y", matrixY - 16).attr("width", 124).attr("height", 172).attr("rx", 9).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("rect.moe-score-cell").data(scoreCells).join("rect")
      .attr("class", "moe-score-cell")
      .attr("x", d => matrixX + d.col * (cell + gap))
      .attr("y", d => matrixY + d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => .16 + d.value * .78)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".32s")
      .attr("begin", d => `${.12 + (d.row * expertIds.length + d.col) * .01}s`)
      .attr("fill", "freeze");
    expertIds.forEach((id, i) => {
      svg.append("text").attr("class", "caption").attr("x", matrixX + i * (cell + gap) + cell / 2).attr("y", matrixY - 8).attr("text-anchor", "middle").text(id);
    });

    links.forEach((link, i) => {
      const token = tokens[link.token];
      const expert = experts[link.expert];
      const path = svg.append("path")
        .attr("id", `moe-router-capacity-route-${i}`)
        .attr("d", `M${tokenX + 72},${token.y}C${matrixX - 20},${token.y} ${matrixX + 134},${expert.y} ${expertX - 18},${expert.y}`)
        .attr("fill", "none")
        .attr("stroke", link.overflow ? palette.red : expert.color)
        .attr("stroke-width", link.rank === 1 ? 1.6 + link.p * 4 : 1.2 + link.p * 2.2)
        .attr("stroke-opacity", link.overflow ? .78 : link.rank === 1 ? .48 : .22)
        .attr("stroke-linecap", "round");
      drawPath(path, .42 + i * .035, .9);
      if (link.rank === 1 || link.overflow) {
        const dot = svg.append("circle").attr("r", link.overflow ? 5.4 : 4.6).attr("fill", link.overflow ? palette.red : expert.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${.55 + i * .045}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#moe-router-capacity-route-${i}`);
      }
    });

    const tokenGroups = svg.append("g").selectAll("g.moe-token").data(tokens).join("g")
      .attr("class", "moe-token")
      .attr("transform", d => `translate(${tokenX},${d.y - 16})`);
    tokenGroups.append("rect").attr("width", 68).attr("height", 32).attr("rx", 8).attr("fill", d => d.color).attr("fill-opacity", .82).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    tokenGroups.append("text").attr("class", "reverse-label").attr("x", 34).attr("y", 21).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.label);
    fadeIn(tokenGroups, .08, .35);

    const slots = {
      E0: ["T0", "T3"],
      E1: ["T1", "T2"],
      E2: ["T3", "T4"],
      E3: ["T5", ""]
    };
    const expertGroups = svg.append("g").selectAll("g.moe-expert").data(experts).join("g")
      .attr("class", "moe-expert")
      .attr("transform", d => `translate(${expertX},${d.y - 31})`);
    expertGroups.append("rect").attr("width", 136).attr("height", 62).attr("rx", 9).attr("fill", palette.gray50).attr("stroke", d => d.color).attr("stroke-width", 2);
    expertGroups.append("text").attr("class", "mark-label").attr("x", 20).attr("y", 37).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    expertGroups.each(function (expert) {
      const group = d3.select(this);
      slots[expert.id].forEach((tokenId, slotIndex) => {
        group.append("rect")
          .attr("x", 48 + slotIndex * 30)
          .attr("y", 18)
          .attr("width", 22)
          .attr("height", 22)
          .attr("rx", 5)
          .attr("fill", tokenId ? expert.color : palette.gray100)
          .attr("fill-opacity", tokenId ? .76 : .5)
          .attr("stroke", palette.surface);
        if (tokenId) group.append("text").attr("class", "reverse-label").attr("x", 59 + slotIndex * 30).attr("y", 33).attr("text-anchor", "middle").style("font-size", "9px").text(tokenId);
      });
      if (expert.id === "E1") {
        group.append("text").attr("class", "mark-label").attr("x", 112).attr("y", 18).attr("text-anchor", "middle").style("font-size", "10px").attr("fill", palette.red).text("spill");
        group.append("rect").attr("x", 101).attr("y", 24).attr("width", 22).attr("height", 16).attr("rx", 4).attr("fill", palette.red).attr("fill-opacity", .76);
        group.append("text").attr("class", "reverse-label").attr("x", 112).attr("y", 36).attr("text-anchor", "middle").style("font-size", "8px").text("T4");
      }
    });
    fadeIn(expertGroups, .35, .35);
  }
```
