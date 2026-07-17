---
name: skill-arena-strategy-evaluator
description: Build and run reproducible comparisons of skill-improvement strategies over a real skill corpus. Use when Codex must catalog skills, replay population search, trace distillation, reflective Pareto search, and operator coevolution on shared evidence, aggregate holdout quality, reliability, cost, complexity, and diversity, or publish a decision guide without claiming one universal winner.
---

# Skill Arena Strategy Evaluator

Compare skill-improvement strategies in two separate evidence layers:

1. deterministic mechanism replay, which tests selection behavior on frozen
   candidate, trace, and operator evidence; and
2. optional live Skill Arena evaluation, which tests whether an agent can use
   each strategy skill on identical tasks and workspaces.

Never mix replay scores with live agent pass rates in one headline number.

This skill is intentionally composite: its bundled replay scripts encode the
four named selection policies and run without those sibling skills installed.
Sibling strategy skills are needed only for the optional live-agent layer; if
they are unavailable, complete and report the deterministic replay alone.

Runtime: execute bundled ESM helpers with Node.js 24 or newer. In commands,
`<skill-root>` means this installed skill directory.

## Workflow

1. Freeze the source skill corpus and record its path, revision when available,
   and catalog digest.
2. Run `scripts/catalog-skills.js` to capture skill names, descriptions, line
   counts, and resource counts. Treat the source corpus as read-only.
3. Define representative subjects across size and resource shape. Do not select
   only one easy skill family.
4. Author replay scenarios with development evidence and hidden holdout scores
   using [references/evaluation-protocol.md](references/evaluation-protocol.md).
5. Run `scripts/evaluate-strategies.js`. Inspect per-scenario selections before
   using aggregate rankings.
6. If live evaluation is practical and the strategy skills are installed,
   author one compare config with identical prompts across profiles. Use one
   profile per available strategy skill, at least four prompts across three
   task families, and prompt-specific observable assertions. Otherwise stop at
   replay and label the result accordingly.
7. Validate the compare config and prompt coverage, dry-run it, then execute it.
   Keep replay and live artifacts side by side but labeled separately.
8. Publish the methodology, corpus snapshot, raw inputs, report, limitations,
   and exact rerun commands.

## Metrics

Aggregate at least:

- holdout quality and gain over baseline
- regression-free reliability
- generalization gap between development and holdout
- evaluation cost or candidate count
- selected complexity delta
- archive or operator diversity when the strategy produces it

Use explicit weights only for a named decision profile. Always preserve the
unweighted metrics so another user can choose different tradeoffs.

## Commands

```powershell
node <skill-root>/scripts/catalog-skills.js `
  --root <skills-root> `
  --output evaluations/skill-evolution-strategies/corpus-catalog.json

node <skill-root>/scripts/evaluate-strategies.js `
  --input evaluations/skill-evolution-strategies/replay-scenarios.json `
  --output evaluations/skill-evolution-strategies/replay-results.json `
  --markdown evaluations/skill-evolution-strategies/replay-report.md

node <skill-root>/scripts/analyze-live-results.js `
  --results results/<run>/promptfoo-results.json `
  --replay evaluations/skill-evolution-strategies/replay-scenarios.json `
  --output evaluations/skill-evolution-strategies/live-analysis.json `
  --markdown evaluations/skill-evolution-strategies/live-analysis.md
```

## Decision Rules

- Prefer population search for a stable scalar objective and affordable broad
  evaluation.
- Prefer trace distillation when a diverse labeled trace pool already exists
  and recurring lessons matter more than exploration.
- Prefer reflective Pareto search when case-level feedback is rich and task
  families trade off against one another.
- Prefer operator coevolution after repeated generations show that a fixed
  mutation library has plateaued and operator credit is observable.
- Compose strategies only with an explicit boundary: for example, distill a
  baseline, search refinements, then use reflective Pareto selection. Do not
  change benchmark and skill simultaneously.

## Reporting Guardrails

- Call deterministic results `replay`, not empirical agent quality.
- Call validation or dry-run results by those names; do not call them live
  benchmark passes.
- State corpus revision, subject coverage, request count, model, runtime,
  failures, and unsupported cells for live runs.
- Do not name a universal winner when rankings change by subject or metric.
- Make every generated JSON and Markdown artifact available with rerun
  commands.
