# ADR: Four-Strategy Skill Evolution Framework

Date: 2026-07-12

## Status

Accepted

## Context

Skill Arena implemented population search for scalar candidate fitness and
trace distillation for recurrent lessons in labeled trajectories. Those methods
did not cover two evidence regimes documented in related research: rich
case-local feedback with complementary candidate strengths, and repeated search
where the mutation instructions themselves should improve.

A fair comparison also needs to separate deterministic algorithm contracts from
end-to-end agent performance. Combining fixture replay and live pass rates in
one score would overstate what either layer proves.

## Decision

- Add `skill-arena-reflective-pareto-search`, inspired by GEPA's reflection and
  Pareto mechanisms but implemented as deterministic local orchestration over
  declared case scores and feedback.
- Add `skill-arena-operator-coevolution`, inspired by Promptbreeder's
  self-referential mutation-prompt evolution but implemented as deterministic
  parent-to-child operator credit and breeding plans.
- Add `skill-arena-strategy-evaluator` to catalog a real skill corpus, replay
  all four strategies over shared evidence, aggregate transparent metrics, and
  render a decision report.
- Keep deterministic mechanism replay and live Skill Arena comparison as
  separate evidence layers. Replay artifacts must not be described as live
  agent-quality results.
- Use a four-subject stratified snapshot from `$HOME/dev/skills` for the
  maintained evaluation and provide a refresh script plus corpus digest.
- Keep holdout values out of strategy selection and reveal them only after a
  candidate is selected.

## Consequences

- Users can choose a workflow based on available evidence rather than treating
  every improvement problem as scalar search.
- The repository gains reproducible scripts, tests, replay inputs, generated
  results, a live compare config, and a documented decision guide.
- Operator coevolution and reflective Pareto search remain narrower than their
  research inspirations; documentation must preserve those adaptation
  boundaries.
- The maintained replay demonstrates mechanism fit but cannot replace repeated
  live evaluation on real agent outputs.
