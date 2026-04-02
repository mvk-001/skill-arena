---
name: skill-arena-traced-evolution
description: Evolve an existing skill from success and failure traces gathered under a fixed benchmark. Use when Codex needs to distill repeated trajectory-local lessons into a single transferable skill update through patch proposal, prevalence-based consolidation, conflict filtering, and holdout validation.
---

# Skill Arena Traced Evolution

Improve a skill by distilling many traces into one consolidated update.
Use this skill when the benchmark is fixed, traces can be labeled as successes or failures, and the goal is to promote recurring lessons instead of chasing isolated wins.

This approach is inspired by [Trace2Skill](https://arxiv.org/abs/2603.25158): instead of reacting sequentially to individual trajectories, analyze a diverse pool of executions in parallel, extract trajectory-specific lessons, and hierarchically consolidate them into a unified, conflict-free skill directory via inductive reasoning. The result is a single transferable skill — not a growing bank of episodic memories.

## Evolution Modes

This skill supports two initialization modes:

- **Skill deepening**: start from an existing human-written or validated skill.
  The pipeline refines it by adding failure-specific guidance and reinforcing
  effective strategies observed in success traces.
- **Skill creation**: start from a minimal or parametric-knowledge-only draft.
  The pipeline builds a useful skill from a performance-neutral initialization,
  driven entirely by trajectory evidence.

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

- analyze traces in parallel batches, not sequentially (prevents sequential
  drift where each skill update alters the context for subsequent analysis)
- keep success and failure evidence separate until consolidation
- use asymmetric analysis depth:
  - **failure traces**: use agentic multi-turn analysis when possible (inspect
    files, compare outputs against expected results, iteratively narrow root
    cause before proposing a patch). Agentic error analysis produces more
    transferable patches than single-pass reflection.
  - **success traces**: single-pass analysis is sufficient and efficient (clean
    the trace, identify generalizable behavior patterns, propose patches).
- all analysts operate on a frozen copy of the baseline skill with no
  visibility into other analysts' patches (prevents premature convergence)
- require repeated support before promoting a patch
- prefer one consolidated skill over a growing bank of episodic memories —
  a single portable skill document outperforms retrieval-based per-case experience
- route low-support observations to `references/*` files instead of cluttering
  `SKILL.md` — broad procedural guidance in the main document, case-specific
  heuristics in references, mirroring hierarchical disclosure
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

Use asymmetric analyst design based on trace outcome:

- **Failure traces** (error analysts): use agentic multi-turn analysis when
  possible. The analyst should inspect the full trace, read input and output
  files, compare the agent's answer against expected results, and iteratively
  narrow the root cause before proposing a patch. If the analyst cannot
  establish a verified causal explanation after exhausting its analysis budget,
  exclude the trace from the patch pool rather than guessing. This quality gate
  ensures every failure patch is grounded in a verified failure cause.
- **Success traces** (success analysts): use single-pass analysis. Clean the
  trace, identify generalizable behavior patterns that contributed to the
  correct outcome, and propose patches that preserve and reinforce those
  patterns. Single-pass is both sufficient and efficient for success traces.

All analysts operate on a frozen copy of the baseline skill with no visibility
into other analysts' patches. This independence preserves the full diversity of
per-trajectory observations and prevents premature convergence.

Keep patch proposals narrow, attributable, and file-scoped:

- High-prevalence general rules → `SKILL.md`
- Case-specific heuristics and edge cases → `references/*`
- Deterministic automation → `scripts/*`
- Interface contract changes only → `agents/openai.yaml`

Use `scripts/propose-patches.js`.

### 4. Consolidate by prevalence, not novelty

Consolidation performs inductive reasoning over the full patch pool.
Because each patch derives from a single trajectory, the pool encodes the
distribution of behaviors the agent exhibits across the task set. The
consolidator identifies prevalent patterns — edits appearing consistently
across independent patches — on the grounds that recurring observations
across diverse trajectories are more likely to reflect systematic task
properties and generalize to unseen tasks and different agent models.

- Group proposals by normalized patch id.
- Prefer patches that recur across independent traces.
- Prefer patches supported by both success and failure evidence (`combined`
  support class) over one-sided anecdotes.
- Break ties deterministically (lexicographic patch id).
- Reject low-support patches unless the task explicitly allows speculative consolidation.
- Route low-support but potentially useful observations to `references/*`
  files rather than discarding them entirely — niche quirks belong in reference
  documents, not in the main `SKILL.md`.

When the patch pool is large, use hierarchical merging: group patches into
batches, consolidate each batch, then consolidate the batch results. This
mirrors Trace2Skill's log-depth merge tree and prevents any single merge
step from handling too many patches at once.

Use `scripts/consolidate-patches.js`.
Read [references/patch-consolidation.md](references/patch-consolidation.md) for the selection policy.

### 5. Filter conflicts and out-of-scope edits

Apply three programmatic guardrails before accepting any patch:

1. **Scope guard**: reject patches that target files outside the skill bundle
   (allowed prefixes: `SKILL.md`, `references/`, `scripts/`, `agents/openai.yaml`).
2. **Conflict guard**: reject conflicting patches in the same conflict group
   unless one has clearly stronger support. At most one patch per conflict
   group survives.
3. **Format guard**: validate that the consolidated skill still forms a
   coherent skill directory — `SKILL.md` exists, references are reachable,
   scripts are syntactically valid.

Keep the consolidated skill single and coherent instead of accumulating
fragmented micro-skills. A single comprehensive skill per domain outperforms
a collection of narrow, task-specific fragments.

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

- Distill recurring lessons into a single transferable skill — not a growing
  memory bank or collection of per-task fragments.
- Prefer agentic trace analysis over one-shot reflective summaries: agentic
  error analysis with file access and root-cause verification produces more
  transferable patches than single-LLM-call analysis.
- Do not treat one lucky run as a skill improvement.
- Keep success evidence and failure evidence explicit in the log.
- Favor generalizable rules over task-instance memorization: patches that
  recur across diverse trajectories are more likely to transfer to unseen
  tasks and different models.
- Reject consolidation when support is too thin or conflicts are unresolved.
- Route general procedural guidance to `SKILL.md` and case-specific heuristics
  to `references/*` — the skill should mirror hierarchical disclosure from
  broad principles to on-demand edge-case lookups.
- All analysis happens on a frozen copy of the baseline skill: no analyst sees
  another analyst's patches until the consolidation stage. This prevents
  sequential drift.

## References And Helpers

- `references/trace-schema.md`: trace contract, labeling rules, and recognized tags
- `references/patch-consolidation.md`: prevalence, conflict, and promotion policy
- `references/holdout-validation.md`: how to keep a small validation slice honest
- `assets/decision-tree.md`: choose the shortest path for the current task
- `scripts/init-trace-run.js`: create a traced-evolution run scaffold
- `scripts/import-traces.js`: import trace files and build the pool manifest
- `scripts/propose-patches.js`: derive patch proposals from labeled traces
- `scripts/consolidate-patches.js`: merge repeated proposals into a single patch set
- `scripts/validate-consolidation.js`: reject out-of-scope or conflicting patch sets
