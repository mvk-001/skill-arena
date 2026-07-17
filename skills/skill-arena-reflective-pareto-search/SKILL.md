---
name: skill-arena-reflective-pareto-search
description: Improve a skill from per-case execution feedback while preserving complementary candidates on a Pareto archive. Use when Codex has a fixed multi-case benchmark, textual diagnoses or traces for individual failures, and wants feedback-guided edits without collapsing heterogeneous task performance into one scalar score.
---

# Skill Arena Reflective Pareto Search

Improve one skill through feedback-guided candidate updates and a deterministic
Pareto archive. Keep the benchmark fixed and preserve candidates that are best
on different cases instead of selecting only the highest mean score.

Runtime: execute bundled ESM helpers with Node.js 24 or newer. In commands,
`<skill-root>` means this installed skill directory. The bundle runs without
any sibling skill installed.

This workflow adapts the high-level mechanisms in
[GEPA](https://arxiv.org/abs/2507.19457): reflect on execution feedback, retain
case-complementary candidates, and plan merges from the archive. The bundled
scripts provide deterministic orchestration; they do not reproduce the paper's
prompts, models, or reported experiments.

## Inputs

Collect:

- the baseline skill bundle
- a frozen benchmark with stable case IDs
- candidate case scores in `0..1`
- case-local feedback with evidence and a diagnosis
- a separate holdout set for final promotion when possible

Use a scalar population loop when only one reliable fitness exists. Use a
trace-consolidation workflow when there is a large labeled trace pool but no
candidate archive; neither alternative is required by this bundle.

## Workflow

1. Freeze the benchmark, case IDs, scoring rules, and holdout before editing.
2. Normalize candidate scores and feedback with the schema in
   [references/feedback-and-candidate-schema.md](references/feedback-and-candidate-schema.md).
3. Run `scripts/rank-pareto.js` to compute the non-dominated archive and record
   which benchmark cases keep each candidate alive.
4. Select the weakest covered case and one archive parent that has direct
   evidence for it. Run `scripts/plan-reflection.js` to produce a narrow,
   evidence-backed reflection plan.
5. Ask the editing agent to change only the skill bundle. Keep the diagnosis,
   proposed rule, target file, and expected behavioral effect explicit.
6. Evaluate the child on every frozen development case. Do not score only the
   case that triggered the edit.
7. Recompute the archive. Discard a child that is dominated, breaks a hard
   gate, or adds complexity without gaining case coverage.
8. When two archive members own complementary cases, plan one attributable
   merge and reevaluate it. Read
   [references/pareto-and-merge-policy.md](references/pareto-and-merge-policy.md)
   before merging.
9. Promote only after the selected candidate preserves or improves the
   baseline on holdout. Keep the baseline when holdout regresses.

## Operating Rules

- Keep per-case feedback separate from evaluator answers and hidden holdout
  knowledge.
- Require a verified diagnosis before turning failure feedback into a rule.
- Preserve every candidate that is non-dominated on the declared case scores;
  use complexity only as a deterministic tie-break for identical score vectors.
- Prefer the archive member with the best worst-case score for a single robust
  deployment candidate.
- Merge at most two candidates at a time and list the exact cases contributed
  by each parent.
- Never edit the benchmark during a search run.
- Record evaluation count, archive size, case coverage, selected parent,
  rejected candidates, holdout result, and final promotion decision.

## Commands

```powershell
node <skill-root>/scripts/rank-pareto.js `
  --input run/candidates.json `
  --output run/pareto-archive.json

node <skill-root>/scripts/plan-reflection.js `
  --input run/candidates.json `
  --output run/reflection-plan.json
```

The input file is read-only. Both scripts write deterministic JSON except for
an optional caller-supplied run timestamp.

## Final Output

Report the archive, uncovered or weak cases, reflection applied, merge parents
if any, development and holdout scores, complexity delta, and promotion
decision. Do not call a development-only winner validated.

