---
name: harbor-trace-distillation
description: Distill completed Harbor job and trial artifacts into an evidence-cited skill update, then gate it on separate Harbor holdout evidence. Use when Codex needs to normalize Harbor rewards, errors, ATIF trajectories, agent logs, and verifier output; consolidate recurring lessons directly from Harbor; execute optional Harbor discovery or holdout jobs; or audit that every accepted skill patch has diverse trial and task support.
---

# Harbor Trace Distillation

Use Harbor 0.18.0 as the execution and evidence surface. Keep discovery and
holdout separate, preserve raw Harbor artifacts, and change only the copied
candidate bundle.

Runtime: use uv and Python 3.12 or newer. In commands, `<skill-root>` means
this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Workflow

1. Read
   [references/harbor-trace-contract.md](references/harbor-trace-contract.md)
   before authoring a run.
2. Freeze the baseline skill, Harbor tasks, reward key, pass threshold, agent,
   model, and environment. Put task answers only in verifiers.
3. Gather completed discovery jobs or trials. Keep holdout paths out of all
   diagnoses and proposals.
4. Validate the plan without creating output or running Harbor:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --dry-run
~~~

5. Check declared credentials and any Docker-backed job configs without model
   calls:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --doctor
~~~

6. Import discovery artifacts and evaluate any supplied proposal JSON without
   executing configured jobs or reading holdout:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --analyze-only
~~~

   Analyze-only never authors diagnoses or patch text. With an empty proposal
   file, it deliberately produces an unchanged candidate.
7. Add agent-authored diagnoses and patch operations to the proposal JSON.
   Every proposal must cite discovery evidence IDs and target only the skill
   bundle. Reward or error state can identify a weak case, but does not alone
   establish the cause or a safe edit. If bounded trajectory, output, log, or
   verifier evidence does not support a diagnosis, keep the candidate
   unchanged. Re-run analyze-only until the accepted set is coherent.
8. Run the full import/execution and separate holdout gate:

~~~powershell
uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml>
~~~

9. Inspect `trace-pool.json`, `proposal-state.json`, `consolidation.json`, the
   copied `candidate-skill/`, `holdout-gate.json`, and `report.md`. Promote only
   when the holdout decision is `promote` and ordinary skill validation still
   passes. The script never overwrites the source skill.

## Rules

- Require at least two unique trial IDs and two unique task checksums for every
  accepted patch. Repeated attempts on one task increase trial support, never
  task diversity. The script rejects lower configured thresholds.
- Treat Harbor exceptions as errors. Treat a completed non-error trial with no
  numeric configured reward as invalid evidence, not a zero-reward failure.
- Use bounded, redacted ATIF messages, agent logs, verifier stdout, and verifier
  stderr for discovery feedback. Preserve raw artifacts by path instead of
  copying them into prompts or reports.
- Accept only patches whose cited evidence is in the discovery pool. Reject
  unknown or holdout evidence, path traversal, out-of-bundle targets, thin
  support, and losing members of a conflict group.
- Do not expose holdout rewards, task names, trajectories, verifier output, or
  errors to the distillation stage. Holdout is read only after the candidate is
  materialized.
- Require matching task checksums, attempts, agent/version/model cells, and
  replay settings for holdout comparison. Missing locks require an explicit
  weak-fairness opt-in and are reported as a limitation.
- Use new output and Harbor job names. Do not resume a job against changed
  skill content.

## Validation

After editing this bundle, run:

~~~powershell
python -m py_compile <skill-root>/scripts/distill_harbor_traces.py
uv run <skill-root>/scripts/distill_harbor_traces.py --help
~~~
