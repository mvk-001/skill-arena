# Saturated Task Overlap

- **Pattern ID:** `d3-task-overlap-dense`
- **Gallery source ID:** `task-overlap-dense`
- **Family:** Set Overlap
- **Use when:** Nine asymmetric scope circles hold 100 task dots with external labels and direct color-optimized leader lines.
- **Renderer:** `renderAsymmetricTaskOverlapSaturated`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderAsymmetricTaskOverlapSaturated() {
    const layout = window.D3_TASK_OVERLAP_LAYOUTS && window.D3_TASK_OVERLAP_LAYOUTS.saturated;
    const svg = prepareSvg("task-overlap-dense", "Saturated task overlap", "Nine asymmetric scope circles with 100 task dots, external collision-audited labels, and direct leader lines colored to reduce same-color crossings.");
    if (!layout) {
      svg.append("text")
        .attr("class", "mark-label")
        .attr("x", 36)
        .attr("y", 70)
        .text("Missing generated task-overlap layout.");
      return;
    }

    const svgWidth = layout.width || width;
    const svgHeight = layout.height || height;
    svg
      .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
      .attr("data-target-count", layout.targetCount)
      .attr("data-circle-count", layout.circleCount)
      .attr("data-label-count", layout.tasks.length)
      .attr("data-label-algorithm", layout.labelAlgorithm)
      .attr("data-label-overlap-count", layout.labelOverlapCount)
      .attr("data-label-circle-overlap-count", layout.labelCircleOverlapCount)
      .attr("data-label-dot-overlap-count", layout.labelDotOverlapCount)
      .attr("data-label-leader-overlap-count", layout.labelLeaderOverlapCount)
      .attr("data-label-leader-underpass-count", layout.labelLeaderOverlapCount)
      .attr("data-label-nonlabel-overlap-count", (layout.labelCircleOverlapCount || 0) + (layout.labelDotOverlapCount || 0))
      .attr("data-label-placement", "external-lanes")
      .attr("data-label-clearance-policy", "no-label-label-circle-dot-overlap")
      .attr("data-leader-route", layout.leaderRoute || "direct")
      .attr("data-leader-style-count", 1)
      .attr("data-leader-color-count", (layout.leaderColorKeys || []).length)
      .attr("data-leader-crossing-count", layout.leaderCrossingCount)
      .attr("data-same-color-leader-crossing-count", layout.sameColorLeaderCrossingCount)
      .attr("data-membership-buckets", Object.entries(layout.membershipBuckets).map(([key, value]) => `${key}:${value}`).join(" "))
      .attr("data-label-length-buckets", Object.entries(layout.labelLengthBuckets || {}).map(([key, value]) => `${key}:${value}`).join(" "))
      .attr("data-label-font-range", layout.labelFontRange ? `${layout.labelFontRange.min}-${layout.labelFontRange.max}` : layout.labelFontSize)
      .attr("data-longest-label", layout.longestLabel || "");

    const circles = layout.circles.map(circle => ({
      ...circle,
      fillColor: palette[circle.fill] || circle.fill,
      strokeColor: palette[circle.stroke] || circle.stroke
    }));
    const tasks = layout.tasks;
    const dotColor = d => d.membershipCount === 1 ? palette.blue : d.membershipCount === 2 ? palette.orange : palette.red;
    const leaderColor = d => palette[d.leaderColorKey] || dotColor(d);
    const labelEdgeX = d => d.labelEdgeX ?? (d.labelX < d.x ? d.labelX + d.labelWidth : d.labelX);
    const labelEdgeY = d => d.labelEdgeY ?? (d.labelY + d.labelHeight / 2);

    svg.append("rect")
      .attr("x", 8)
      .attr("y", 18)
      .attr("width", svgWidth - 16)
      .attr("height", svgHeight - 28)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", "none");

    const overlapCircles = svg.append("g")
      .attr("class", "overlap-circle-layer")
      .selectAll("circle.overlap-circle")
      .data(circles)
      .join("circle")
      .attr("class", "overlap-circle")
      .attr("data-set-id", d => d.id)
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("fill", d => d.fillColor)
      .attr("fill-opacity", .18)
      .attr("stroke", d => d.strokeColor)
      .attr("stroke-width", 1.7)
      .attr("stroke-opacity", .78);
    grow(overlapCircles, "r", 4, d => d.r, .05, .7);

    const circleLabels = svg.append("g")
      .attr("class", "overlap-circle-label-layer")
      .selectAll("text.overlap-circle-label")
      .data(circles)
      .join("text")
      .attr("class", "caption overlap-circle-label")
      .attr("x", d => d.lx)
      .attr("y", d => d.ly)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.5)
      .attr("font-weight", 800)
      .attr("fill", palette.gray700)
      .text(d => d.label);
    fadeIn(circleLabels, .22, .42);

    const leaderLayer = svg.append("g")
      .attr("class", "task-leader-layer")
      .attr("stroke-linecap", "round");

    const leaderHalos = leaderLayer.selectAll("line.task-leader-halo")
      .data(tasks)
      .join("line")
      .attr("class", "task-leader-halo")
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", labelEdgeX)
      .attr("y2", labelEdgeY)
      .attr("stroke", palette.surface)
      .attr("stroke-opacity", .42)
      .attr("stroke-width", 1.8);
    fadeIn(leaderHalos, .26, .38);

    const leaders = leaderLayer.selectAll("line.task-leader")
      .data(tasks)
      .join("line")
      .attr("class", "task-leader")
      .attr("data-task-id", d => d.id)
      .attr("data-membership-count", d => d.membershipCount)
      .attr("data-leader-style", "solid")
      .attr("data-leader-color-key", d => d.leaderColorKey)
      .attr("data-leader-conflict-degree", d => d.leaderConflictDegree)
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", labelEdgeX)
      .attr("y2", labelEdgeY)
      .attr("stroke", leaderColor)
      .attr("stroke-opacity", .46)
      .attr("stroke-width", .82);
    fadeIn(leaders, .28, .4);

    const dots = svg.append("g")
      .attr("class", "task-dot-layer")
      .selectAll("circle.task-dot")
      .data(tasks)
      .join("circle")
      .attr("class", "task-dot")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.membershipCount)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", dotColor)
      .attr("stroke", palette.surface)
      .attr("stroke-width", .9);
    dots.append("title").text(d => `${d.id}: ${d.memberships.join(", ")}`);
    grow(dots, "r", .7, layout.dotRadius, .42, .5);

    const labelGroups = svg.append("g")
      .attr("class", "task-label-layer")
      .selectAll("g.task-label-group")
      .data(tasks)
      .join("g")
      .attr("class", "task-label-group")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.membershipCount)
      .attr("data-label-lane", d => d.labelLane)
      .attr("data-label-side", d => d.labelSide)
      .attr("data-label-length-bucket", d => d.labelLengthBucket)
      .attr("data-label-font-size", d => d.labelFontSize || layout.labelFontSize);

    const labelBoxes = labelGroups.append("rect")
      .attr("class", "task-label-bg")
      .attr("x", d => d.labelX)
      .attr("y", d => d.labelY)
      .attr("width", d => d.labelWidth)
      .attr("height", d => d.labelHeight)
      .attr("rx", 3.6)
      .attr("fill", palette.surface)
      .attr("fill-opacity", .96)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", .65);
    fadeIn(labelBoxes, .5, .42);

    const labels = labelGroups.append("text")
      .attr("class", "task-label mark-label")
      .attr("x", d => d.labelX + (d.labelTextPaddingX || 4.4))
      .attr("y", d => d.labelY + d.labelHeight / 2 + (d.labelFontSize || layout.labelFontSize) * .36)
      .attr("font-size", d => d.labelFontSize || layout.labelFontSize)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .style("font-size", d => `${d.labelFontSize || layout.labelFontSize}px`)
      .style("font-weight", 800)
      .text(d => d.label);
    fadeIn(labels, .56, .42);

    const legend = [
      { label: "1 scope", fill: palette.blue },
      { label: "2 scopes", fill: palette.orange },
      { label: "3+ scopes", fill: palette.red }
    ];
    const legendGroup = svg.append("g").attr("transform", `translate(${svgWidth - 438},${svgHeight - 22})`);
    const legendItems = legendGroup.selectAll("g").data(legend).join("g").attr("transform", (_, i) => `translate(${i * 66},0)`);
    legendItems.append("circle").attr("r", 3.6).attr("cx", 0).attr("cy", 0).attr("fill", d => d.fill).attr("stroke", palette.surface).attr("stroke-width", 1.1);
    legendItems.append("text").attr("class", "caption").attr("x", 7).attr("y", 3.5).attr("font-size", 8.4).text(d => d.label);
    fadeIn(legendItems, .76, .42);

    svg.append("text")
      .attr("class", "caption")
      .attr("x", svgWidth - 470)
      .attr("y", svgHeight - 22)
      .attr("text-anchor", "end")
      .attr("font-weight", 800)
      .text("100 tasks, direct leaders, 0 label collisions");
  }
```
