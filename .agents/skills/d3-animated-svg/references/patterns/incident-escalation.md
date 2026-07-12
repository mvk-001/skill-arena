# Critical Incident Escalation

- **Pattern ID:** `d3-incident-escalation`
- **Gallery source ID:** `incident-escalation`
- **Family:** Critical
- **Use when:** A SEV response timeline shows detection, command, comms, SLA pressure, mitigation, and recovery.
- **Renderer:** `renderCriticalIncidentEscalation`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
function renderCriticalIncidentEscalation() {
    const chartWidth = 820;
    const chartHeight = 420;
    const svg = prepareSvg(
      "incident-escalation",
      "Critical incident escalation",
      "A SEV response timeline shows detection, command, communications, SLA pressure, mitigation, recovery, and response roles."
    )
      .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
      .attr("data-pattern-family", "critical-incident");

    const left = 132;
    const right = 610;
    const maxMinute = 52;
    const slaMinute = 30;
    const currentMinute = 27;
    const x = d3.scaleLinear().domain([0, maxMinute]).range([left, right]);
    const lanes = [
      { id: "signal", label: "Signal", y: 150 },
      { id: "command", label: "Command", y: 216 },
      { id: "mitigation", label: "Mitigation", y: 282 }
    ];
    const laneY = new Map(lanes.map(d => [d.id, d.y]));
    const phases = [
      { id: "detect", label: "Detect", start: 0, end: 7, status: "sev1", color: palette.red, fill: palette.redHighlight },
      { id: "coordinate", label: "Coordinate", start: 7, end: 18, status: "command", color: palette.purple, fill: palette.purpleHighlight },
      { id: "contain", label: "Contain", start: 18, end: 32, status: "warning", color: palette.orange, fill: palette.orangeHighlight },
      { id: "recover", label: "Recover", start: 32, end: 52, status: "stable", color: palette.green, fill: palette.greenHighlight }
    ];
    const events = [
      { id: "alert", label: ["Alert", "fires"], minute: 0, lane: "signal", severity: "sev1", owner: "monitoring", color: palette.blue, fill: palette.blueHighlight, lx: 0, ly: -28, anchor: "middle" },
      { id: "impact", label: ["Impact", "confirmed"], minute: 4, lane: "signal", severity: "sev1", owner: "on-call", color: palette.red, fill: palette.redHighlight, lx: 0, ly: 36, anchor: "middle" },
      { id: "ic", label: ["IC", "assigned"], minute: 7, lane: "command", severity: "sev1", owner: "incident-commander", color: palette.purple, fill: palette.purpleHighlight, lx: -16, ly: -8, anchor: "end" },
      { id: "bridge", label: ["Bridge", "open"], minute: 11, lane: "command", severity: "sev1", owner: "incident-commander", color: palette.purple, fill: palette.purpleHighlight, lx: 11, ly: 35, anchor: "start" },
      { id: "comms", label: ["Stakeholder", "update"], minute: 16, lane: "command", severity: "warning", owner: "comms-lead", color: palette.purple, fill: palette.purpleHighlight, lx: 0, ly: -34, anchor: "middle" },
      { id: "failover", label: ["Failover", "starts"], minute: 23, lane: "mitigation", severity: "warning", owner: "ops-lead", color: palette.orange, fill: palette.orangeHighlight, lx: -10, ly: -46, anchor: "end" },
      { id: "contained", label: ["Impact", "contained"], minute: 29, lane: "mitigation", severity: "warning", owner: "ops-lead", color: palette.orange, fill: palette.orangeHighlight, lx: 10, ly: -46, anchor: "start" },
      { id: "recovered", label: ["Service", "healthy"], minute: 39, lane: "mitigation", severity: "stable", owner: "sre", color: palette.green, fill: palette.greenHighlight, lx: 0, ly: -35, anchor: "middle" },
      { id: "postmortem", label: ["Postmortem", "queued"], minute: 49, lane: "mitigation", severity: "stable", owner: "incident-commander", color: palette.green, fill: palette.greenHighlight, lx: 0, ly: -35, anchor: "middle" }
    ];
    const escalations = [
      { id: "alert-impact", source: "alert", target: "impact", kind: "detect", critical: true, color: palette.red },
      { id: "impact-ic", source: "impact", target: "ic", kind: "page", critical: true, color: palette.red },
      { id: "ic-bridge", source: "ic", target: "bridge", kind: "command", critical: true, color: palette.purple },
      { id: "bridge-comms", source: "bridge", target: "comms", kind: "coordinate", critical: true, color: palette.purple },
      { id: "comms-failover", source: "comms", target: "failover", kind: "handoff", critical: true, color: palette.orange },
      { id: "failover-contained", source: "failover", target: "contained", kind: "mitigate", critical: true, color: palette.orange },
      { id: "contained-recovered", source: "contained", target: "recovered", kind: "verify", critical: true, color: palette.green },
      { id: "recovered-postmortem", source: "recovered", target: "postmortem", kind: "learn", critical: false, color: palette.green }
    ];
    const communicationBeats = [
      { id: "first-update", minute: 16, label: "First update", color: palette.purple, fill: palette.purpleHighlight },
      { id: "sla-update", minute: 31, label: "SLA update", color: palette.orange, fill: palette.orangeHighlight },
      { id: "recovery-update", minute: 46, label: "Recovery update", color: palette.green, fill: palette.greenHighlight }
    ];
    const mitigations = [
      { id: "freeze", minute: 18, label: "Freeze deploys", status: "contain", color: palette.orange, fill: palette.orangeHighlight },
      { id: "failover", minute: 23, label: "Route failover", status: "mitigate", color: palette.orange, fill: palette.orangeHighlight },
      { id: "verify", minute: 39, label: "Verify SLOs", status: "validate", color: palette.green, fill: palette.greenHighlight },
      { id: "review", minute: 49, label: "Postmortem", status: "learn", color: palette.green, fill: palette.greenHighlight }
    ];
    const teams = [
      { id: "incident-commander", label: "Incident commander", status: "owns state", color: palette.purple, fill: palette.purpleHighlight },
      { id: "ops-lead", label: "Ops lead", status: "changes prod", color: palette.orange, fill: palette.orangeHighlight },
      { id: "comms-lead", label: "Comms lead", status: "updates", color: palette.blue, fill: palette.blueHighlight },
      { id: "scribe", label: "Scribe", status: "keeps log", color: palette.green, fill: palette.greenHighlight }
    ];
    const statusCards = [
      { id: "severity", label: "Severity", value: "SEV-1 contained", color: palette.red, fill: palette.redHighlight },
      { id: "owner", label: "Owner", value: "IC: Rivera", color: palette.purple, fill: palette.purpleHighlight },
      { id: "impact", label: "Impact", value: "partial -> low", color: palette.orange, fill: palette.orangeHighlight },
      { id: "next", label: "Next update", value: "+15m cadence", color: palette.blue, fill: palette.blueHighlight }
    ];
    const eventById = new Map(events.map(d => [d.id, d]));
    const criticalEscalations = escalations.filter(d => d.critical);

    svg
      .attr("data-event-count", events.length)
      .attr("data-escalation-count", escalations.length)
      .attr("data-critical-escalation-count", criticalEscalations.length)
      .attr("data-phase-count", phases.length)
      .attr("data-team-count", teams.length)
      .attr("data-mitigation-count", mitigations.length)
      .attr("data-communication-count", communicationBeats.length)
      .attr("data-status-card-count", statusCards.length);

    function pointFor(event) {
      return { x: x(event.minute), y: laneY.get(event.lane) };
    }

    function pathFor(link) {
      const source = pointFor(eventById.get(link.source));
      const target = pointFor(eventById.get(link.target));
      const dx = Math.max(32, Math.abs(target.x - source.x) * .42);
      const sameLaneBend = source.y === target.y ? 16 : 0;
      return `M${source.x},${source.y} C${source.x + dx},${source.y - sameLaneBend} ${target.x - dx},${target.y + sameLaneBend} ${target.x},${target.y}`;
    }

    function stackedText(parent, lines, x0, y0, attrs = {}) {
      const text = parent.append("text")
        .attr("x", x0)
        .attr("y", y0)
        .attr("class", attrs.className || "mark-label")
        .attr("text-anchor", attrs.anchor || "middle")
        .attr("font-size", attrs.fontSize || 8.7)
        .attr("font-weight", attrs.weight || 850);
      lines.forEach((line, index) => {
        text.append("tspan")
          .attr("x", x0)
          .attr("dy", index ? attrs.lineHeight || 10 : 0)
          .text(line);
      });
      return text;
    }

    svg.append("rect")
      .attr("x", 18)
      .attr("y", 18)
      .attr("width", chartWidth - 36)
      .attr("height", chartHeight - 26)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200);
    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 34)
      .attr("y", 42)
      .attr("font-size", 17)
      .attr("font-weight", 900)
      .text("Critical incident escalation");
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 34)
      .attr("y", 60)
      .attr("font-size", 9.7)
      .attr("font-weight", 760)
      .text("SEV response timeline with SLA pressure, command state, communications, mitigation, recovery, and learning.");

    const phaseGroups = svg.append("g")
      .attr("class", "severity-bands")
      .selectAll("g")
      .data(phases)
      .join("g")
      .attr("class", "severity-band")
      .attr("data-phase-id", d => d.id)
      .attr("data-status", d => d.status)
      .attr("transform", d => `translate(${x(d.start)},70)`);
    phaseGroups.append("rect")
      .attr("width", d => x(d.end) - x(d.start) - 2)
      .attr("height", 18)
      .attr("rx", 5)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.1);
    phaseGroups.append("text")
      .attr("class", "caption")
      .attr("x", d => (x(d.end) - x(d.start) - 2) / 2)
      .attr("y", 12)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.2)
      .attr("font-weight", 860)
      .text(d => d.label);
    fadeIn(phaseGroups, .04, .32);

    const tickGroups = svg.append("g")
      .attr("class", "incident-axis")
      .selectAll("g")
      .data(d3.range(0, 53, 10))
      .join("g")
      .attr("class", "incident-tick")
      .attr("data-minute", d => d);
    tickGroups.append("line")
      .attr("x1", d => x(d))
      .attr("x2", d => x(d))
      .attr("y1", 104)
      .attr("y2", 304)
      .attr("stroke", palette.gray200)
      .attr("stroke-dasharray", "2 6");
    tickGroups.append("text")
      .attr("class", "caption")
      .attr("x", d => x(d))
      .attr("y", d => d === 0 ? 316 : 119)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.5)
      .text(d => `${d}m`);
    fadeIn(tickGroups, .1, .35);

    const deadlineX = x(slaMinute);
    const currentX = x(currentMinute);
    const sla = svg.append("g")
      .attr("class", "sla-countdown")
      .attr("data-sla-minutes", slaMinute)
      .attr("data-current-minute", currentMinute);
    sla.append("line")
      .attr("x1", left)
      .attr("x2", deadlineX)
      .attr("y1", 106)
      .attr("y2", 106)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 6)
      .attr("stroke-linecap", "round");
    const pressure = sla.append("line")
      .attr("x1", left)
      .attr("x2", currentX)
      .attr("y1", 106)
      .attr("y2", 106)
      .attr("stroke", palette.orange)
      .attr("stroke-width", 6)
      .attr("stroke-linecap", "round");
    pressure.append("animate")
      .attr("attributeName", "x2")
      .attr("from", left)
      .attr("to", currentX)
      .attr("dur", "1.05s")
      .attr("begin", ".18s")
      .attr("fill", "freeze");
    sla.append("line")
      .attr("class", "incident-clock")
      .attr("data-minute", slaMinute)
      .attr("x1", deadlineX)
      .attr("x2", deadlineX)
      .attr("y1", 96)
      .attr("y2", 304)
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.7)
      .attr("stroke-dasharray", "5 5");
    sla.append("text").attr("class", "caption").attr("x", deadlineX + 16).attr("y", 101).attr("text-anchor", "start").attr("font-size", 8.3).attr("font-weight", 850).text("30m SLA");
    sla.append("text").attr("class", "caption").attr("x", currentX - 16).attr("y", 101).attr("text-anchor", "end").attr("font-size", 8.2).attr("font-weight", 850).attr("fill", palette.orangeHover).text("3m guardrail");

    const laneGroups = svg.append("g")
      .attr("class", "incident-lanes")
      .selectAll("g")
      .data(lanes)
      .join("g")
      .attr("class", "incident-lane")
      .attr("data-lane-id", d => d.id);
    laneGroups.append("rect")
      .attr("x", left - 10)
      .attr("y", d => d.y - 26)
      .attr("width", right - left + 20)
      .attr("height", 52)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("fill-opacity", .9);
    laneGroups.append("line")
      .attr("x1", left)
      .attr("x2", right)
      .attr("y1", d => d.y)
      .attr("y2", d => d.y)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.1);
    laneGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", left - 18)
      .attr("y", d => d.y + 3)
      .attr("text-anchor", "end")
      .attr("font-size", 9)
      .attr("font-weight", 850)
      .text(d => d.label);

    const linkPaths = svg.append("g")
      .attr("class", "escalation-links")
      .selectAll("path")
      .data(escalations)
      .join("path")
      .attr("id", d => `incident-escalation-link-${d.id}`)
      .attr("class", d => `escalation-link${d.critical ? " critical-escalation" : ""}`)
      .attr("data-escalation-id", d => d.id)
      .attr("data-source-id", d => d.source)
      .attr("data-target-id", d => d.target)
      .attr("data-kind", d => d.kind)
      .attr("data-critical", d => String(d.critical))
      .attr("d", pathFor)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.critical ? 2.7 : 1.6)
      .attr("stroke-opacity", d => d.critical ? .88 : .55)
      .attr("stroke-linecap", "round")
      .attr("pathLength", 1)
      .attr("stroke-dasharray", "1 1")
      .attr("stroke-dashoffset", 0);
    linkPaths.each(function (_, index) {
      const delay = .62 + index * .09;
      const key = delay / (delay + .55);
      d3.select(this).append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("values", "1;1;0")
        .attr("keyTimes", `0;${key.toFixed(3)};1`)
        .attr("dur", `${(delay + .55).toFixed(2)}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
    });

    const eventGroups = svg.append("g")
      .attr("class", "incident-events")
      .selectAll("g")
      .data(events)
      .join("g")
      .attr("class", "critical-incident-event")
      .attr("data-event-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("data-lane-id", d => d.lane)
      .attr("data-severity", d => d.severity)
      .attr("data-owner", d => d.owner)
      .attr("transform", d => {
        const point = pointFor(d);
        return `translate(${point.x},${point.y})`;
      });
    const eventShells = eventGroups.append("circle")
      .attr("r", 14)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2);
    eventShells.each(function (_, index) {
      const delay = .34 + index * .09;
      const node = d3.select(this);
      node.append("animate")
        .attr("attributeName", "r")
        .attr("values", "5;16;14")
        .attr("dur", ".45s")
        .attr("begin", `${delay.toFixed(2)}s`)
        .attr("fill", "freeze");
      node.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1")
        .attr("dur", ".2s")
        .attr("begin", `${delay.toFixed(2)}s`)
        .attr("fill", "freeze");
    });
    eventGroups.append("circle")
      .attr("r", 5)
      .attr("fill", d => d.severity === "stable" ? palette.green : d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2);
    eventGroups.each(function (event) {
      stackedText(d3.select(this), event.label, event.lx, event.ly, {
        className: "event-label mark-label",
        anchor: event.anchor,
        fontSize: 8.4,
        lineHeight: 9.4
      });
    });

    const pulses = svg.append("g")
      .attr("class", "escalation-pulses")
      .selectAll("circle")
      .data(criticalEscalations)
      .join("circle")
      .attr("class", "escalation-pulse")
      .attr("data-escalation-id", d => d.id)
      .attr("r", 4.3)
      .attr("fill", d => d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0);
    pulses.each(function (d, index) {
      const begin = 1.1 + index * .14;
      const key = begin / (begin + .12);
      const pulse = d3.select(this);
      pulse.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;0;1")
        .attr("keyTimes", `0;${key.toFixed(3)};1`)
        .attr("dur", `${(begin + .12).toFixed(2)}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
      pulse.append("animateMotion")
        .attr("dur", "2.2s")
        .attr("begin", `${begin.toFixed(2)}s`)
        .attr("repeatCount", "indefinite")
        .attr("rotate", "auto")
        .append("mpath")
        .attr("href", `#incident-escalation-link-${d.id}`);
    });

    const beats = svg.append("g")
      .attr("class", "communication-beats")
      .selectAll("g")
      .data(communicationBeats)
      .join("g")
      .attr("class", "communication-beat")
      .attr("data-beat-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("transform", d => `translate(${x(d.minute)},318)`);
    beats.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -14).attr("y2", -5).attr("stroke", d => d.color).attr("stroke-width", 1.2);
    beats.append("rect").attr("x", -36).attr("y", -5).attr("width", 72).attr("height", 20).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    beats.append("text").attr("class", "caption").attr("x", 0).attr("y", 8).attr("text-anchor", "middle").attr("font-size", 7.8).attr("font-weight", 850).text(d => d.label);
    fadeIn(beats, 1.28, .32);

    const mitigationGroups = svg.append("g")
      .attr("class", "mitigation-steps")
      .selectAll("g")
      .data(mitigations)
      .join("g")
      .attr("class", "mitigation-step")
      .attr("data-step-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("data-status", d => d.status)
      .attr("transform", (d, i) => `translate(${x(d.minute)},${i % 2 ? 366 : 344})`);
    mitigationGroups.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -18).attr("y2", -6).attr("stroke", d => d.color).attr("stroke-width", 1.2);
    mitigationGroups.append("rect").attr("x", -38).attr("y", -6).attr("width", 76).attr("height", 18).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    mitigationGroups.append("text").attr("class", "caption").attr("x", 0).attr("y", 6.5).attr("text-anchor", "middle").attr("font-size", 7.4).attr("font-weight", 850).text(d => d.label);
    fadeIn(mitigationGroups, 1.44, .35);

    const panel = svg.append("g")
      .attr("class", "incident-command-panel")
      .attr("transform", "translate(636,82)");
    panel.append("rect")
      .attr("width", 160)
      .attr("height", 206)
      .attr("rx", 7)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.1);
    panel.append("text").attr("class", "mark-label").attr("x", 12).attr("y", 22).attr("font-size", 11.5).attr("font-weight", 900).text("Command post");
    panel.append("text").attr("class", "caption").attr("x", 12).attr("y", 38).attr("font-size", 8.3).attr("font-weight", 760).text("live incident state");
    const cards = panel.selectAll("g.incident-status-card")
      .data(statusCards)
      .join("g")
      .attr("class", "incident-status-card")
      .attr("data-status-id", d => d.id)
      .attr("transform", (_, i) => `translate(12,${54 + i * 34})`);
    cards.append("rect").attr("width", 136).attr("height", 27).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    cards.append("circle").attr("cx", 11).attr("cy", 13.5).attr("r", 4.3).attr("fill", d => d.color);
    cards.append("text").attr("class", "caption").attr("x", 22).attr("y", 11).attr("font-size", 7.6).attr("font-weight", 850).text(d => d.label);
    cards.append("text").attr("class", "mark-label").attr("x", 22).attr("y", 22).attr("font-size", 8.3).attr("font-weight", 900).text(d => d.value);
    const gaugeWidth = 136;
    panel.append("rect").attr("x", 12).attr("y", 190).attr("width", gaugeWidth).attr("height", 6).attr("rx", 3).attr("fill", palette.gray100);
    panel.append("rect").attr("x", 12).attr("y", 190).attr("width", gaugeWidth * currentMinute / slaMinute).attr("height", 6).attr("rx", 3).attr("fill", palette.orange);
    panel.append("line").attr("x1", 12 + gaugeWidth).attr("x2", 12 + gaugeWidth).attr("y1", 185).attr("y2", 201).attr("stroke", palette.red).attr("stroke-width", 1.5);
    fadeIn(panel, .36, .42);

    const teamGroups = svg.append("g")
      .attr("class", "response-teams")
      .selectAll("g")
      .data(teams)
      .join("g")
      .attr("class", "response-team")
      .attr("data-team-id", d => d.id)
      .attr("transform", (_, i) => `translate(${34 + i * 192},388)`);
    teamGroups.append("rect").attr("width", 176).attr("height", 24).attr("rx", 6).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1.1);
    teamGroups.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 4.4).attr("fill", d => d.color);
    teamGroups.append("text").attr("class", "mark-label").attr("x", 23).attr("y", 10.5).attr("font-size", 8.1).attr("font-weight", 900).text(d => d.label);
    teamGroups.append("text").attr("class", "caption").attr("x", 23).attr("y", 20).attr("font-size", 7.1).attr("font-weight", 820).text(d => d.status);
    fadeIn(teamGroups, 1.6, .35);
  }
```
