---
name: skill-traced-evolution
description: Evolve an existing skill from success and failure traces gathered under a fixed benchmark. Use when Codex needs to distill repeated trajectory-local lessons into a single transferable skill update through patch proposal, prevalence-based consolidation, conflict filtering, and holdout validation.
---

# Skill Traced Evolution

Improve a skill by distilling many traces into one consolidated update.
Use this skill when the benchmark is fixed, traces can be labeled as successes or failures, and the goal is to promote recurring lessons instead of chasing isolated wins.

## Inputs

Collect these inputs before starting:

- path to the skill being evolved
- fixed workspace, fixture, or benchmark config
- reproducible evaluation command
- trace pool or run artifacts that can be labeled as success or failure
- optional explicit rubric or holdout set

If the task distribution is unstable, do not consolidate anything yet.

## Defaults

Use these defaults unless the task gives a stronger rule:

- analyze traces in parallel batches
- keep success and failure evidence separate until consolidation
- require repeated support before promoting a patch
- prefer one consolidated skill over a growing bank of episodic memories
- validate the consolidated patch set on a holdout slice when available
- reject patches that touch files outside the skill bundle

Prefer user-defined fitness and acceptance rules.
If they are missing, derive the narrowest benchmark-specific rule that can separate improvements from regressions.

## Workflow

### 1. Freeze the benchmark and trace schema

- Confirm the benchmark, workspace, and evaluator are fixed.
- Define the trace schema before analysis.
- Label traces as `success` or `failure`.
- Keep a small holdout slice separate from the consolidation pool if possible.

Read [references/trace-schema.md](references/trace-schema.md) if the trace format is still vague.

### 2. Build the trace pool

- Copy the current skill as the baseline.
- Import traces into one run directory.
- Record the source evaluator, benchmark id, and whether each trace came from a pass or fail.
- Keep traces immutable once imported.

Use `scripts/init-trace-run.js` and `scripts/import-traces.js`.

### 3. Propose trajectory-local patches

- Analyze each trace independently.
- For failure traces, propose patches that prevent repeated failure modes.
- For success traces, propose patches that preserve and generalize strong behavior.
- Keep patch proposals narrow, attributable, and file-scoped.
- Prefer edits to:
  - `SKILL.md`
  - `references/*`
  - `scripts/*`
  - `agents/openai.yaml` only when the interface contract must change

Use `scripts/propose-patches.js`.

### 4. Consolidate by prevalence, not novelty

- Group proposals by normalized patch id.
- Prefer patches that recur across independent traces.
- Prefer patches supported by both success and failure evidence over one-sided anecdotes.
- Break ties deterministically.
- Reject low-support patches unless the task explicitly allows speculative consolidation.

Use `scripts/consolidate-patches.js`.
Read [references/patch-consolidation.md](references/patch-consolidation.md) for the selection policy.

### 5. Filter conflicts and out-of-scope edits

- Reject patches that target files outside the skill bundle.
- Reject conflicting patches in the same conflict group unless one has clearly stronger support.
- Keep the consolidated skill single and coherent instead of accumulating fragmented micro-skills.

Use `scripts/validate-consolidation.js`.

### 6. Validate on holdout before promotion

- Evaluate the consolidated update on the holdout slice when available.
- Promote only if the consolidated update improves or preserves the validated baseline.
- If the holdout disagrees with the consolidation pool, keep the baseline and record why.

### 7. Promote the update cleanly

The final output should identify:

- the baseline skill
- the trace pool used for consolidation
- the accepted consolidated patch set
- the rejected patches and conflict reasons
- the holdout validation result

## Operating Rules

- Distill recurring lessons into a single transferable skill.
- Prefer agentic trace analysis over one-shot reflective summaries.
- Do not treat one lucky run as a skill improvement.
- Keep success evidence and failure evidence explicit in the log.
- Favor generalizable rules over task-instance memorization.
- Reject consolidation when support is too thin or conflicts are unresolved.

## References And Helpers

- `references/trace-schema.md`: suggested trace contract and labeling rules
- `references/patch-consolidation.md`: prevalence, conflict, and promotion policy
- `references/holdout-validation.md`: how to keep a small validation slice honest
- `scripts/init-trace-run.js`: create a traced-evolution run scaffold
- `scripts/import-traces.js`: import trace files and build the pool manifest
- `scripts/propose-patches.js`: derive patch proposals from labeled traces
- `scripts/consolidate-patches.js`: merge repeated proposals into a single patch set
- `scripts/validate-consolidation.js`: reject out-of-scope or conflicting patch sets
