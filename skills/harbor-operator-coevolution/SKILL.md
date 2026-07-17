---
name: harbor-operator-coevolution
description: Coevolve skill candidates and the mutation instructions that produce them from native Harbor jobs. Use when repeated skill-improvement generations need parent-to-child operator credit derived from Harbor rewards, errors, verifier diagnostics, trajectories, and locked skill digests, with an untouched Harbor holdout promotion gate and no Skill Arena runtime.
---

# Harbor Operator Coevolution

Use one native Harbor job per skill candidate. Rank skill candidates by absolute
development fitness, credit mutation operators by improvement over each
candidate's evaluated parent, breed the next operator population, and apply a
separate holdout gate only after development selection.

Runtime: use `uv` and Python 3.12 or newer. The bundled executable pins Harbor
0.18.0. In commands, `<skill-root>` means this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Workflow

1. Read [references/config-and-artifacts.md](references/config-and-artifacts.md)
   completely before authoring a generation.
2. Freeze the Harbor tasks, agent, model, attempts, reward rule, operators, and
   holdout before creating children. Give every child exactly one operator and
   one evaluated parent.
   Use at least two candidates and two operators. Every candidate is a version
   of the baseline skill and must preserve its SKILL.md frontmatter `name`;
   include at least one generated child.
3. Create one native Harbor job config per development candidate and one per
   side of the final holdout comparison. Each job must install exactly one
   local candidate skill.
4. Validate the coevolution structure, native JobConfig schemas, paths, skill
   digests, and breeding constraints without running agents:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --dry-run
~~~

   Dry-run does not prove that a dataset contains runnable Harbor tasks.
5. Check declared credentials and Docker when applicable:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml --doctor
~~~

6. Run the generation through Harbor's `Job` and `JobConfig` APIs:

~~~powershell
uv run <skill-root>/scripts/harbor_operator_coevolution.py generation.yaml
~~~

   To analyze already completed native jobs without launching agents, provide
   `jobDirectory` for every development entry and both holdout sides, then add
   `--analyze-only`.
7. Inspect `candidate-ranking.json`, `operator-ranking.json`,
   `breeding-plan.json`, `holdout-promotion.json`, and
   `operator-coevolution-log.json`. Realize each mutation or crossover plan as
   a new, attributable operator instruction before the next generation.
8. Promote only when `holdout-promotion.json` says `promote`. The script never
   installs a candidate or replaces the source skill.

## Rules

- Derive fitness, hard-gate failures, and operator credit from Harbor artifacts;
  never copy declared scores into the generation config.
- Require complete jobs, matching resolved locks except for skill provenance,
  identical task checksums, attempts, agent versions, and models.
- Verify every local candidate bundle against Harbor's locked skill digest.
- Give an errored candidate zero effective fitness when `requireNoErrors` is
  enabled. Keep verifier and agent diagnostics visible in the evidence file.
- Rank candidates by absolute hard-gated fitness before improvement. A weak
  parent can increase operator credit but cannot penalize a strong child.
- Keep holdout tasks disjoint from development by name and checksum. Never use
  holdout rewards for candidate ranking, operator credit, or breeding.
- Preserve native Harbor job directories. Live execution refuses an existing
  job destination instead of resuming or deleting it.
- Keep operator text general and free of benchmark answers or holdout facts.
- Keep at least two operator survivors, and set nextOperatorCount greater than
  or equal to operatorSurvivors. These are hard configuration constraints, not
  search recommendations.

## Output

The output directory contains deterministic JSON strategy artifacts plus a
concise `report.md`. Native Harbor jobs remain at the destinations declared by
their job configs.

## Validate the Copied Bundle

These checks use only the copied bundle and its declared runtime dependencies:

~~~powershell
python -m py_compile <skill-root>/scripts/harbor_operator_coevolution.py
uv run <skill-root>/scripts/harbor_operator_coevolution.py --help
~~~
