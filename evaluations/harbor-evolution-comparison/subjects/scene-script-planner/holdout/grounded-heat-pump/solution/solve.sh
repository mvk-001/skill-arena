#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"

cat > "$APP_DIR/scene_plan.md" <<'EOF'
# Heat Takes a Round Trip

Status: Spike
Target runtime: 32 seconds
Audience: Homeowners who understand a thermostat but not refrigeration cycles.
Core idea: A heat pump moves heat across a building boundary rather than creating heat at the indoor coil.
Learning outcome: The viewer can trace heat flow in heating mode and recognize that the path can reverse.

## Research Summary

Heat pumps transfer heat between a building and the outdoors and can provide heating or cooling [SRC-HP-01]. They use electricity and a refrigeration cycle to move heat, with performance depending on system and operating conditions [SRC-HP-02].

## Visual Language

A white house outline divides a blue outdoor reservoir from an amber indoor reservoir. Heat appears as three orange dots moving along a teal loop. Solid arrowheads show the active direction; ghosted arrowheads preview the reverse direction. Labels stay limited to "outdoor," "indoor," and "heat moves."

## Timeline

| Time | Beat | Visuals | Narration or on-screen text | Transition |
| --- | --- | --- | --- | --- |
| 0:00-0:06 | Establish the boundary | Draw the house boundary between blue outdoor and amber indoor reservoirs. | "Heating is a movement problem." | The boundary rises while both reservoirs fade in. |
| 0:06-0:13 | Collect outdoor heat | Orange heat dots gather outside and enter the teal loop. | "The cycle collects heat outdoors." | Dots pulse, then follow the first solid arrow. |
| 0:13-0:21 | Move heat indoors | The dots cross the house boundary and spread through the indoor reservoir. | "Electricity powers the transfer indoors." | The loop brightens across the boundary, then the room warms. |
| 0:21-0:27 | Reveal the cycle | The complete refrigeration loop closes while source labels remain visible. | "The loop keeps moving heat." | A return path draws beneath the main arrow. |
| 0:27-0:32 | Reverse the path | Solid arrows soften and the opposite ghosted arrows become solid. | "Reverse the cycle for cooling." | Arrowheads flip while the heat dots pause at the boundary. |

## Component Candidates

- Candidate: Reversible heat-flow loop
  Reason: The solid-to-ghosted arrow swap could explain other reversible transfer systems.
  Proposed folder: components/animations/
  Approval status: Candidate only

## Implementation Notes

Keep the house boundary fixed so direction changes remain comparable. Preserve the distinction between energy that powers the cycle and the heat markers being moved. Do not display a universal efficiency multiplier.
EOF

cat > "$APP_DIR/research.md" <<'EOF'
# Research Notes

## Claims Used

- Claim: A heat pump transfers heat between a building and the outdoors and can provide heating and cooling.
  Source: SRC-HP-01
  Confidence: High
  Notes: This grounds the boundary crossing and reversal beats.
- Claim: A heat pump uses electricity and a refrigeration cycle to move heat, and performance varies with conditions.
  Source: SRC-HP-02
  Confidence: High
  Notes: This grounds the powered loop without assigning a universal multiplier.
- Claim: All heat pumps have one universal efficiency advantage over all furnaces.
  Source: SRC-HP-GAP
  Confidence: Unsupported
  Notes: No supporting source was supplied, so this claim is excluded from narration and on-screen text.

## Sources Checked

- Title: Heat Pump Systems
  URL: https://www.energy.gov/energysaver/heat-pump-systems
  Why it matters: It supports transfer across the building boundary and reversible operation.
- Title: Heat pumps
  URL: https://www.iea.org/energy-system/buildings/heat-pumps
  Why it matters: It supports the refrigeration-cycle mechanism and conditional performance.
EOF
