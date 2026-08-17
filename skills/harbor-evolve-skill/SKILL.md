---
name: harbor-evolve-skill
description: Evolve a skill's SKILL.md with Harbor trials and GEPA reflective Pareto search, freeze the selected candidate, validate it on an optimizer-invisible dataset, then gate promotion on untouched Harbor holdout tasks. Use when Codex needs evaluation-guided skill improvement from rewards, verifier diagnostics, execution errors, and agent trajectories; needs to enforce evolution/validation/holdout isolation at run start; or needs a reproducible candidate bundle and promotion report without using Skill Arena.
---

# Harbor Evolve Skill

Use Harbor as the execution and evidence layer and GEPA as the reflective
Pareto optimizer. Preserve the source bundle, evolve only its SKILL.md, and
promote only after a separate holdout comparison.

Runtime: use uv and Python 3.12 or newer. The bundled script pins Harbor 0.18.0
and GEPA 0.1.2 in inline metadata. In commands, <skill-root> means this
installed skill directory.

## Evolution/validation boundary

Before the live command starts, schema 2 requires byte-disjoint evolution,
validation, and holdout datasets. Only evolution is optimizer-visible. The
runner freezes one selected candidate by digest before validation, prevents
validation from entering GEPA, and keeps holdout sealed unless validation
passes. A validation failure is terminal for that run; another unbiased attempt
requires fresh validation.

## Method

The script first copies the source into an immutable baseline snapshot under
`baseline-snapshot/skills/<name>` and verifies its Harbor skill digest without
writing to the source. For every development evaluation, it copies that frozen
bundle to `<evaluation>/skills/<name>`, replaces only SKILL.md with the current
candidate, and injects that exact path into a fresh Harbor trial. The physical
basename observed by Harbor therefore equals the frontmatter name even when the
source directory uses an alias.

After each trial, the script binds the candidate to Harbor's config, result,
and lock artifacts by exact source, logical name, and skill digest before using
its reward. It returns verified reward plus bounded verifier, trajectory, and
agent-output evidence to GEPA. GEPA reflects on this evidence, proposes
candidate text, and preserves Pareto-useful candidates across cases.

The `evolution` dataset drives both proposals and candidate selection. GEPA
never receives the independent `validation` dataset. After selection, the
runner freezes the candidate bundle by digest, compares it with the unchanged
baseline on validation, and opens holdout only if that one-way gate passes.
Neither validation nor holdout can become another proposal or selection loop.

## Workflow

1. Read [references/evolution-config.md](references/evolution-config.md)
   completely before authoring or changing a run.
2. Freeze the baseline skill and Harbor tasks. Use three non-overlapping
   datasets: evolution, validation, and holdout. Validation must be semantically
   independent, not just byte-distinct. Keep canonical answers in tests or
   verifier code, never in task instructions or the skill.
3. Write a schema-2 evolution YAML and validate the plan without Docker or
   model calls. Dry-run rejects a missing split or any repeated task identity or
   content before evolution starts:

~~~powershell
uv run <skill-root>/scripts/evolve_skill_with_harbor.py <evolution.yaml> --dry-run
~~~

4. Run the no-token environment preflight. It validates declared credential
   names and Docker/Compose when the selected Harbor environment is docker:

~~~powershell
uv run <skill-root>/scripts/evolve_skill_with_harbor.py <evolution.yaml> --doctor
~~~

5. Execute the bounded evolution:

~~~powershell
uv run <skill-root>/scripts/evolve_skill_with_harbor.py <evolution.yaml>
~~~

Use a new output directory for every run. The script refuses a non-empty
destination and never mutates the source skill.

6. Inspect report.md, run.json, the GEPA run directory, validation gate, and
   failed Harbor trial evidence. Confirm
   `evaluationBoundary.validationOptimizerVisible` is false and that the
   candidate digest before and after validation is identical. Review
   candidate-skill/SKILL.md for benchmark leakage, unnecessary complexity,
   stale links, and consistency with its unchanged bundled resources.
7. Promote candidate-skill only when the holdout decision is promote and all
   ordinary skill validation/tests still pass. Otherwise keep the baseline and
   preserve the run as evidence.

## Guardrails

- Do not edit the skill and benchmark in the same evolution run.
- Do not expose validation or holdout task instructions, verifier output,
  rewards, or trajectories to reflection.
- Use only the evolution dataset for GEPA feedback and selection. Validation is
  a post-selection acceptance gate for one frozen candidate, never optimizer
  input.
- Keep evolution, validation, and holdout disjoint by both task name and
  content, and review them for semantic near-duplicates that byte digests cannot
  detect.
- If validation fails, keep holdout sealed and do not revise or reselect a
  candidate against that result in the same run. A later unbiased attempt needs
  a new output directory and fresh validation dataset.
- Preserve the baseline directory and every bundled resource. This method
  evolves SKILL.md only; use a separately reviewed workflow for scripts,
  references, or assets.
- Require an exact portable frontmatter name: 1-64 lowercase letters, digits,
  or interior hyphens, excluding Windows-reserved basenames. Never sanitize or
  substitute a fallback because that changes the installed skill identity.
- Accept a trial reward only when Harbor's config, result, and lock identify the
  canonical staged path, exact logical name, and matching staged digest. Treat
  missing or mismatched provenance as a fatal evaluation failure.
- Keep candidate and agent execution exceptions visible and score them as zero.
  Abort on recognizable infrastructure, model-compatibility, or authentication
  failures instead of reinterpreting them as candidate quality.
- List required environment-variable names in YAML but never store their
  values. The script checks the host environment and does not serialize those
  values into TrialConfig.
- Disable evaluation caching during search. Use the declared metric-call and
  candidate-proposal budgets.
- Prefer at least two validation and holdout attempts per candidate/task; raise
  the counts when decisions are consequential or agent variance is high.
- Reject candidate frontmatter name changes and SKILL.md files over 500 lines.
- Never call a validation winner promoted until the independent holdout gate
  passes.

## Output

One live run preserves:

~~~text
<output>/
├── baseline-snapshot/
│   └── skills/<name>/
├── candidate-skill/
├── gepa/
├── harbor-trials/
│   ├── development/
│   ├── validation-baseline/
│   ├── validation-candidate/
│   ├── holdout-baseline/
│   └── holdout-candidate/
├── run.json
└── report.md
~~~

Every trial directory contains `skills/<name>` plus `evaluation.json` with the
candidate SKILL.md digest, staged bundle digest, configured sources, locked
name/source/digest, and verification status. `run.json` records exact package
versions, source/snapshot/candidate digests, aggregate provenance counts, split
task names, optimizer counts, validation and holdout release state, every gate
result, per-task regressions, and the promotion decision.

## Validation

After editing this bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/evolve_skill_with_harbor.py
uv run <skill-root>/scripts/evolve_skill_with_harbor.py --help
~~~
