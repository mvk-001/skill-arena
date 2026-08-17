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

## Evolution/validation boundary

Before any live development generation, freeze two disjoint study inputs: the
development dataset used for mutation and ranking, and an independent
validation dataset that is unavailable to those activities. Plan the
validation stage before starting evolution and record the selected candidate
bundle by digest before opening it. In this bundle, `--holdout-template`
normally supplies that first optimizer-invisible validation dataset; a study
may reserve an additional holdout after it.

Never turn validation rewards, task identities, diagnostics, or trajectories
into another mutation or ranking pass in the same study. A failed gate consumes
that validation cohort. Preserve the result and use a fresh validation dataset
in a new study for another unbiased claim. A development-only invocation is an
intermediate receipt, not a completed evolution methodology.

## Inputs

Require:

- one native Harbor job YAML or JSON template;
- at least two candidate skill directories containing SKILL.md;
- an explicit baseline candidate id;
- a reward key and pass threshold;
- a minimum development pass rate for winner eligibility, if nonzero;
- zero or more non-compensating required reward thresholds;
- a holdout mean-gain threshold and, only when explicitly justified, whether
  per-task regressions may be tolerated;
- an output directory.

Every candidate is a version of the same logical skill, so each SKILL.md must
preserve the same frontmatter `name`. The baseline is the frozen incoming
version of that skill, not a no-skill control or a placeholder bundle.
The name must be an exact portable skill basename: 1-64 lowercase letters,
digits, or interior hyphens, excluding reserved device names. The script fails
closed instead of inventing a sanitized fallback, because Harbor installation
identity must remain equal to the declared logical name.
Candidate bundles must also be self-contained. An in-bundle file symlink is
dereferenced while staging; a broken or escaping symlink and every directory
symlink or Windows junction/reparse directory fails closed before Harbor runs.

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
      --holdout-template harbor-validation.yaml \
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
      --minimum-development-pass-rate 1 \
      --required-reward mechanical_qualification_gate=1 \
      --holdout-template harbor-validation.yaml \
      --output /path/to/search-run

The script freezes every candidate under an isolated
`candidates/<id>/skills/<frontmatter-name>/` path, injects that exact path into
one native JobConfig per candidate, and executes each through Harbor
Job.create() and Job.run(). Consequently the basename Harbor installs is the
logical skill name, never a generic `skill` alias or the population candidate
id. The staging copy contains regular local files rather than dependencies on
the source tree. It then parses the native config.json, optional lock.json, root result.json,
trial result.json, rewards, execution errors, trajectories, verifier files,
agent outputs, and artifact manifests.

Every native JobConfig skill source is reconciled with every available trial
and job lock. A verified job must lock exactly one skill with the candidate
bundle digest and logical name; a digest mismatch or JobConfig/lock source
disagreement fails closed. This binding applies to development and holdout.

When a verifier emits `verifier/diagnostics.json`, the analyzer preserves and
normalizes its status, failure domain, terminal outcome, and error code.
Provider, authentication, environment, evaluator, and infrastructure aliases
are classified across all four fields, including signals such as verifier
errors, invalid credentials, Docker failures, platform failures, quotas, and
context limits. They are not semantic zeros. Their raw verifier reward remains
visible for forensics, but fitness and evaluable mean are `null` and the
candidate cannot survive or promote.

External diagnostics take precedence over reward availability: a provider
failure that emitted no reward remains a provider failure and is not relabeled
as a missing-primary evaluator failure. Only a non-errored trial without an
external failure is marked `missingPrimaryReward`. Both categories are
unavailable rather than invented zero. Every primary and required reward must
also be finite; NaN and infinity fail closed before ranking.

Ranking is deterministic: highest fitness first, then candidate id. Repeat
`--required-reward KEY=MIN` for verifier metrics that every trial must report
and meet. A missing required metric remains explicitly missing, and any
required-metric failure or execution exception makes the candidate unqualified
with fitness zero; an infrastructure failure makes fitness unavailable instead.
The raw mean reward remains visible. The top two evaluable candidates become
survivors; an unavailable result sorts below numeric fitness.

Only an evaluable candidate that passes every configured qualification gate is
a development winner or holdout input. Additionally,
`--minimum-development-pass-rate` requires its primary selected-reward pass
rate to meet the configured 0..1 threshold; the default 0 preserves prior
behavior. A candidate below that threshold can still survive as a mutation or
repair parent, but it is not called a winner and cannot open holdout. When no
candidate is eligible, the run records per-candidate reasons, selects no winner,
and keeps evaluable survivors (or the baseline fallback) available for repair.
Repair-parent selection then greedily preserves complementary required-reward
gates that candidates met across every trial, followed by pass rate, observed
mean reward, and candidate id as deterministic tie-breakers. This never relaxes
promotion; it only retains distinct repair signals for the next generation.
When a qualified winner would otherwise fall outside the top-two survivor set
on a deterministic zero-fitness tie, the winner replaces the lower survivor so
the next generation never loses its selected parent.

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
incomplete jobs, invalid locks, non-finite rewards, candidate digest mismatch,
JobConfig/lock source disagreement, config drift, or task/agent drift. The
template must describe the same benchmark as the completed jobs; reusing one
completed job's config.json is appropriate after confirming that only job
identity, output directory, and candidate skill paths vary.

Map each job only to the exact skill version it evaluated. Analyze-only accepts
a digest-matching legacy installed alias or a lock without complete skill
records only as `exploratory`; such evidence can support diagnostic ranking but
is always non-promotable. A digest mismatch is never a legacy exception.
Prefer jobs created by this script, which freeze and inject each candidate
before Harbor execution.

## Gate on Independent Validation / Holdout

For a live run, declare `--holdout-template` before development starts. Harbor
keeps it deferred and evaluates only the preserved
baseline and the development winner after selection. Each role is copied to
`holdout/generation-NNN/attempt-NNN/<role>/skills/<frontmatter-name>/` before
its native JobConfig is written, preserving the same installed identity and
isolating holdout inputs. Every invocation gets a new attempt directory. Its
immutable `attempt.json` seals the generation, selected winner id and content
digest, baseline digest, evaluation fingerprints, and promotion policy before
Harbor runs; its `result.json` is created once after analysis. A failed or
non-evaluable attempt therefore remains inspectable while a retry or later
generation uses a new path instead of overwriting it.

For offline analysis, also provide:

    --holdout-template harbor-holdout.yaml
    --holdout-job baseline=/path/to/holdout-baseline-job
    --holdout-job winner=/path/to/holdout-winner-job

The gate rejects development/holdout task overlap, job drift, errors, missing
required rewards, unverified provenance, an unqualified winner, development
pass rate below the configured minimum, reward gain below
`--minimum-holdout-gain`, or any matched task-signature reward regression.
`--allow-task-regressions` is an explicit opt-in that relaxes only the final
condition; the default is no regressions. `run.json` and `report.md` enumerate
every task comparison, regressed task, and promotion blocker. Without holdout
evidence, the result is explicitly staged and is not marked promoted.

A selected winner whose content digest equals the preserved baseline is a
no-op even when it has a different candidate id. Record `baseline-retained`
with blocker `no-skill-change`, do not spend holdout calls, and continue with a
content-changing repair generation. It can never be marked promoted merely
because the configured minimum gain is zero.

## Continue the Search

Read generation-NNN/ranking.json and candidate-result.json files. Give each new
child one focused hypothesis, keep the original baseline as an unchanged
control candidate, create mutation or crossover directories from the two
survivors, then rerun with the next --generation value. Do not change the
Harbor template, reward rule, task set, agent, or model mid-search.

Stop after a validated success or a declared plateau. Never overwrite the
incoming baseline; baseline-skill is immutable across generations.

The first executed generation writes an immutable `search-contract.json` that
binds the baseline digest, logical skill, normalized development JobConfig,
reward key, thresholds, qualification gates, and promotion policy. Every later
generation in the same output directory must match it exactly.
`development-signatures.json` additionally binds the observed task checksum,
agent, model, and attempt multiset so mutable local task paths cannot drift
behind an unchanged JobConfig. The first provided holdout template similarly
writes `holdout-contract.json`, and the first completed release writes
`holdout-signatures.json`; use a new output directory to change any contract.
Holdout attempts remain append-only beneath their generation, so a provider
failure can be retried and a later generation can evaluate a different winner
without replacing earlier manifests, native configs, candidate results, or
release decisions.

## Outputs

The output directory contains:

- baseline-skill/skills/<frontmatter-name>/: preserved control bundle;
- generation-NNN/generation.json: frozen population manifest;
- generation-NNN/ranking.json: development-only ranking and survivors;
- candidate-result.json per candidate: raw-Harbor-derived evidence;
- holdout/generation-NNN/attempt-NNN/: immutable attempt.json, role-specific
  native configs/results, and one result.json decision;
- population-search-log.json: latest summary per generation plus the append-only
  index of all holdout attempts;
- search-contract.json, development-signatures.json, and optional
  holdout-contract.json/holdout-signatures.json: immutable benchmark and
  release bindings across generations;
- run.json and report.md: selected winner, holdout state, and next stage.

Do not invoke another benchmark CLI, consume a foreign report schema, or import
scripts from sibling skills.

## Validate the Copied Bundle

These checks use only the copied bundle and its declared runtime dependencies:

~~~powershell
python -m py_compile <skill-root>/scripts/search_harbor_population.py
uv run <skill-root>/scripts/search_harbor_population.py --help
~~~
