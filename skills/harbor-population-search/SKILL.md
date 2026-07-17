---
name: harbor-population-search
description: Evaluate and rank a population of candidate skill bundles with native Harbor jobs, preserve a baseline, and gate the selected winner on disjoint holdout tasks. Use when Codex has a native Harbor JobConfig template plus candidate skill paths and needs scalar-reward population search, offline analysis of completed Harbor artifacts, or staged mutation generations without any external evaluation harness.
---

# Harbor Population Search

Run one evidence-complete generation at a time. Let Harbor execute tasks and
write native job directories; let the bundled script validate, summarize, and
rank those artifacts. Semantic mutation remains agent work so every child has
an explicit hypothesis.

Runtime: Python 3.12+ through uv. The script pins harbor==0.18.0. In commands,
<skill-root> means this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Inputs

Require:

- one native Harbor job YAML or JSON template;
- at least two candidate skill directories containing SKILL.md;
- an explicit baseline candidate id;
- a reward key and pass threshold;
- an output directory.

Every candidate is a version of the same logical skill, so each SKILL.md must
preserve the same frontmatter `name`. The baseline is the frozen incoming
version of that skill, not a no-skill control or a placeholder bundle.

Use a separate native Harbor template for holdout tasks. Never include holdout
trials in development ranking. Read
[references/harbor-artifacts.md](references/harbor-artifacts.md) when reviewing
raw artifacts, diagnosing validation failures, or defining a holdout.

## Validate Before Spending

Run the dependency and input check without writing output:

    uv run <skill-root>/scripts/search_harbor_population.py \
      --job-template harbor-development.yaml \
      --candidate baseline=/path/to/baseline-skill \
      --candidate candidate-01=/path/to/candidate-skill \
      --baseline baseline \
      --output /path/to/search-run \
      --doctor

Replace --doctor with --dry-run to print the exact candidate job plan. Both
modes validate the native JobConfig and candidate bundles without creating a
Harbor Job.

## Execute One Generation

Run live evaluation by omitting the mode flag:

    uv run <skill-root>/scripts/search_harbor_population.py \
      --job-template harbor-development.yaml \
      --candidate baseline=/path/to/baseline-skill \
      --candidate candidate-01=/path/to/candidate-skill \
      --baseline baseline \
      --generation 0 \
      --reward-key reward \
      --pass-threshold 1 \
      --output /path/to/search-run

The script freezes every candidate, creates one native JobConfig per candidate,
and executes each through Harbor Job.create() and Job.run(). It then parses the
native config.json, optional lock.json, root result.json, trial result.json,
rewards, execution errors, trajectories, verifier files, agent outputs, and
artifact manifests.

Ranking is deterministic: highest fitness first, then candidate id. A candidate
with any execution exception receives fitness zero; its raw mean reward remains
visible. The top two candidates become survivors.

## Analyze Existing Harbor Jobs

Use completed native Harbor job directories without launching agents:

    uv run <skill-root>/scripts/search_harbor_population.py \
      --job-template harbor-development.yaml \
      --candidate baseline=/path/to/baseline-skill \
      --candidate candidate-01=/path/to/candidate-skill \
      --job baseline=/path/to/baseline-job \
      --job candidate-01=/path/to/candidate-job \
      --baseline baseline \
      --output /path/to/search-run \
      --analyze-only

Provide exactly one --job mapping per candidate. Analysis fails closed on
incomplete jobs, invalid locks, missing rewards, config drift, or task/agent
drift. The template must describe the same benchmark as the completed jobs;
reusing one completed job's config.json is appropriate after confirming that
only job identity, output directory, and candidate skill paths vary.

Map each job only to the exact skill version it evaluated. A legacy job
without lock skill digests can support exploratory ranking, but it cannot by
itself prove candidate provenance or causality; do not use such a result for a
promotion claim. Prefer jobs created by this script, which freeze and inject
each candidate before Harbor execution.

## Gate on Holdout

For a live run, add --holdout-template. Harbor evaluates only the preserved
baseline and the development winner after selection.

For offline analysis, also provide:

    --holdout-template harbor-holdout.yaml
    --holdout-job baseline=/path/to/holdout-baseline-job
    --holdout-job winner=/path/to/holdout-winner-job

The gate rejects development/holdout task overlap, job drift, errors, or reward
gain below --minimum-holdout-gain. Without holdout evidence, the result is
explicitly staged and is not marked promoted.

## Continue the Search

Read generation-NNN/ranking.json and candidate-result.json files. Give each new
child one focused hypothesis, keep the original baseline as an unchanged
control candidate, create mutation or crossover directories from the two
survivors, then rerun with the next --generation value. Do not change the
Harbor template, reward rule, task set, agent, or model mid-search.

Stop after a validated success or a declared plateau. Never overwrite the
incoming baseline; baseline-skill is immutable across generations.

## Outputs

The output directory contains:

- baseline-skill/: preserved control bundle;
- generation-NNN/generation.json: frozen population manifest;
- generation-NNN/ranking.json: development-only ranking and survivors;
- candidate-result.json per candidate: raw-Harbor-derived evidence;
- population-search-log.json: idempotent generation history;
- run.json and report.md: selected winner, holdout state, and next stage.

Do not invoke another benchmark CLI, consume a foreign report schema, or import
scripts from sibling skills.

## Validate the Copied Bundle

These checks use only the copied bundle and its declared runtime dependencies:

~~~powershell
python -m py_compile <skill-root>/scripts/search_harbor_population.py
uv run <skill-root>/scripts/search_harbor_population.py --help
~~~
