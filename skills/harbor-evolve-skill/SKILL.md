---
name: harbor-evolve-skill
description: Evolve a skill's SKILL.md with Harbor trials and GEPA reflective Pareto search, then gate promotion on untouched Harbor holdout tasks. Use when Codex needs evaluation-guided skill improvement from rewards, verifier diagnostics, execution errors, and agent trajectories; needs to validate train/validation/holdout isolation; or needs a reproducible candidate bundle and promotion report without using Skill Arena.
---

# Harbor Evolve Skill

Use Harbor as the execution and evidence layer and GEPA as the reflective
Pareto optimizer. Preserve the source bundle, evolve only its SKILL.md, and
promote only after a separate holdout comparison.

Runtime: use uv and Python 3.12 or newer. The bundled script pins Harbor 0.18.0
and GEPA 0.1.2 in inline metadata. In commands, <skill-root> means this
installed skill directory.

## Method

For every development evaluation, the script copies the baseline bundle,
replaces only SKILL.md with the current candidate, injects that skill into a
fresh Harbor trial, and returns reward plus bounded verifier, trajectory, and
agent-output evidence to GEPA. GEPA reflects on this evidence, proposes
candidate text, and preserves Pareto-useful candidates across cases.

Training evidence drives proposals. Validation cases select among candidates.
Holdout tasks remain absent from reflection and run only after optimization
against both the unchanged baseline and selected candidate.

## Workflow

1. Read [references/evolution-config.md](references/evolution-config.md)
   completely before authoring or changing a run.
2. Freeze the baseline skill and Harbor tasks. Use three non-overlapping splits:
   train, validation, and holdout. Keep canonical answers in tests or verifier
   code, never in task instructions or the skill.
3. Write an evolution YAML and validate the plan without Docker or model calls:

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

6. Inspect report.md, run.json, the GEPA run directory, and failed Harbor trial
   evidence. Review candidate-skill/SKILL.md for benchmark leakage, unnecessary
   complexity, stale links, and consistency with its unchanged bundled
   resources.
7. Promote candidate-skill only when the holdout decision is promote and all
   ordinary skill validation/tests still pass. Otherwise keep the baseline and
   preserve the run as evidence.

## Guardrails

- Do not edit the skill and benchmark in the same evolution run.
- Do not expose holdout task names, instructions, verifier output, rewards, or
  trajectories to reflection.
- Treat validation as optimizer-visible selection evidence, not holdout.
- Keep train, validation, and holdout disjoint by both task name and content.
- Preserve the baseline directory and every bundled resource. This method
  evolves SKILL.md only; use a separately reviewed workflow for scripts,
  references, or assets.
- Keep candidate and agent execution exceptions visible and score them as zero.
  Abort on recognizable infrastructure, model-compatibility, or authentication
  failures instead of reinterpreting them as candidate quality.
- List required environment-variable names in YAML but never store their
  values. The script checks the host environment and does not serialize those
  values into TrialConfig.
- Disable evaluation caching during search. Use the declared metric-call and
  candidate-proposal budgets.
- Prefer at least two holdout attempts per candidate/task; raise the count when
  decisions are consequential or agent variance is high.
- Reject candidate frontmatter name changes and SKILL.md files over 500 lines.
- Never call a validation winner promoted until the independent holdout gate
  passes.

## Output

One live run preserves:

~~~text
<output>/
├── candidate-skill/
├── gepa/
├── harbor-trials/
│   ├── development/
│   ├── holdout-baseline/
│   └── holdout-candidate/
├── run.json
└── report.md
~~~

run.json records exact package versions, source/candidate digests, split task
names, optimizer counts, every holdout result, per-task regressions, and the
promotion decision.

## Validation

After editing this bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/evolve_skill_with_harbor.py
uv run <skill-root>/scripts/evolve_skill_with_harbor.py --help
~~~
