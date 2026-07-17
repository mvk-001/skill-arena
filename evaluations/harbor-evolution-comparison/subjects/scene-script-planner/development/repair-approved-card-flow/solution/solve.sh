#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"

cat > "$APP_DIR/scene_plan.md" <<'EOF'
# Card Flow

Status: Approved
Target runtime: 18 seconds
Audience: Product designers reviewing a fictional card-sorting interaction.
Core idea: A crowded stack of cards makes its constraint legible by reorganizing into three clear lanes.
Learning outcome: The viewer can identify how spacing and grouping reveal the constraint.

## Research Summary

No research is required because this scene is an abstract designed metaphor with no factual claims.

## Visual Language

Blue cards sit on charcoal with amber outlines marking constraints. Crowding uses slight overlap and uneven offsets; the resolved state uses three evenly spaced lanes. Motion follows short curved paths so each card remains traceable.

## Timeline

| Time | Beat | Visuals | Narration or on-screen text | Transition |
| --- | --- | --- | --- | --- |
| 0:00-0:05 | Show the conflict | Six cards overlap in one narrow stack while an amber boundary closes around them. | "One space. Too many cards." | Cards enter with staggered offsets; the boundary draws last. |
| 0:05-0:11 | Reveal the constraint | Three faint lanes appear behind the stack and matching edge marks identify three card groups. | "The constraint suggests groups." | Lane guides grow outward from the boundary. |
| 0:11-0:16 | Reflow the cards | Cards follow separate arcs into three evenly spaced lanes without changing order. | "Spacing makes the structure visible." | The stack fans into the lane centers. |
| 0:16-0:18 | Hold the result | The guides soften while the three card lanes remain crisp. | "Three clear lanes." | Amber marks fade, leaving the grouped cards. |

## Component Candidates

- Candidate: Lane reflow motion
  Reason: Traceable arcs and temporary lane guides could support other regrouping scenes.
  Proposed folder: components/animations/
  Approval status: Candidate only

## Implementation Notes

Preserve card order during the reflow. Keep the amber boundary above the cards in layer order, and leave the final layout visible for the full last two seconds.
EOF
