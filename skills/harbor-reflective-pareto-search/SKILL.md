---
name: harbor-reflective-pareto-search
description: Improve a skill from case-level Harbor rewards, verifier diagnostics, errors, and trajectories while preserving complementary candidates in a Pareto archive. Use when Codex needs to execute or analyze native Harbor jobs, reflect on heterogeneous failures, merge non-dominated skill variants, and gate a selected candidate on an untouched Harbor holdout without using Skill Arena.
---

# Harbor Reflective Pareto Search

Use Harbor as the only evaluation and evidence layer. Keep candidates whose
case-level strengths are not dominated, reflect on their weakest cases, and
promote only after a separate holdout comparison.

Runtime: use uv and Python 3.12 or newer. The bundled executable pins Harbor
0.18.0. In commands, <skill-root> means this installed skill directory.

This is an atomic bundle. Copy the entire directory, not only `SKILL.md`.
Its executable and reference are included here, dependencies are declared in
the executable's PEP 723 metadata, and no Skill Arena repository module is
required.

## Evolution/validation boundary

Before starting generation zero, freeze a development dataset for Pareto
reflection and a disjoint, optimizer-invisible validation dataset. Plan that
validation stage before the evolution stage starts. The configured
`harbor.holdoutJob` normally serves as this bundle's independent validation
dataset; a study may reserve an additional holdout after it. Keep the declared
job and its artifacts unopened until one development archive member and its
skill digest are frozen.

Validation is a one-way acceptance gate. Never use its rewards, task
identities, diagnostics, or trajectories to change, merge, rank, or reselect a
candidate in the same study. If it fails, preserve the candidate and evidence;
another unbiased evolution claim requires a new study with fresh validation.

## Workflow

1. Read [references/search-config.md](references/search-config.md) completely.
2. Freeze the baseline skill, development job, and holdout job. Keep task
   answers in verifier code rather than task instructions or candidate skills.
3. Copy the baseline bundle for each candidate. Change only candidate copies;
   never edit the source baseline during search.
4. Author a config for generation zero and inspect the plan:

~~~powershell
uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml> --dry-run
~~~

5. Run the credential and environment preflight before spending model quota:

~~~powershell
uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml> --doctor
~~~

6. Evaluate every declared candidate in a separate native Harbor job and build
   the case-vector archive:

~~~powershell
uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml>
~~~

For already completed jobs, declare each candidate jobDirectory and add
--analyze-only. The script validates native config.json, lock.json when
present, root result.json, and every trial result.json.

Declare `harbor.requiredRewards` for verifier gates that every trial must
report and meet. Candidates with an execution error, missing required reward,
or below-threshold required reward remain in diagnostic output but are excluded
from the Pareto archive.

When a task optionally emits `verifier/diagnostics.json`, the analyzer reads
`status`, `failure_domain`, `terminal_outcome`, and `error_code`.
Authentication, environment, evaluator, infrastructure, and provider failures
make that trial and candidate non-evaluable and unqualified, whether declared
as the domain or an equivalent terminal/error signal. Reported scores remain
diagnostic evidence; semantic rewards, gated objectives, and aggregate
comparisons are null. Affected candidates cannot enter the Pareto archive or
pass holdout promotion. Generic Harbor tasks do not need to emit diagnostics.

Map each completed job only to the exact candidate it evaluated. If legacy
jobs lack lock skill digests, treat the archive as an exploratory performance
summary: it cannot prove candidate provenance or causal improvement, and it
must not support promotion. Prefer live jobs created by this script.
Analyze-only also retains a factual source mismatch or physical legacy alias
for diagnosis, but marks it exploratory and non-promotable. Canonical-looking
paths do not substitute for the exact declared candidate source.

7. Read pareto-archive.json and reflection-plan.json. For each child:

   - cite trial, trajectory, or verifier evidence for every proposed change
   - make no mutation when bounded feedback does not establish a safe edit
   - repair recurring mechanisms rather than copying task answers
   - preserve instructions that support passing cases
   - create a new candidate directory and record its parents and rationale

8. Increment search.generation, add the copied children, and repeat development
   evaluation. Keep the Harbor task set, agent, model, attempts, environment,
   and retry policy fixed. Set `search.previousGenerationLog` to the immediate
   prior `pareto-archive.json` and cite at least one archived candidate as a
   parent; the runner verifies the sealed profile and lineage before writing
   the next archive.
9. Select one candidate from the development Pareto archive. Do not inspect
   holdout artifacts during reflection. Set selectedCandidate and
   developmentArchive, then run:

~~~powershell
uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml> --phase holdout
~~~

Use --analyze-only only when baseline and selected holdout jobs already exist
and are declared as holdoutJobDirectory values.
The holdout command rejects an archive from another search or generation, any
development/holdout evaluation-profile drift, and any change to the selected
bundle since its `skillDigest` was recorded in the archive.
It also requires canonical locked provenance for the selected development and
both holdout jobs, plus an observed development job signature that exactly
matches the declared `harbor.developmentJob` profile.
10. Promote candidate-skill only when promotion.json says promote and ordinary
    structural validation and tests for that copied bundle also pass.

## Evidence contract

The script derives case vectors from:

- verifier_result.rewards[rewardKey]
- verifier_result.rewards for every configured requiredRewards key
- optional verifier/diagnostics.json classification and availability counts
- exception_info
- task checksum, agent, model, and attempts
- agent trajectory and text outputs when present
- every regular verifier output file
- lock skill digests and task/environment provenance when lock.json exists

It rejects incomplete jobs, candidate config drift, lock drift beyond skill
provenance, missing selected rewards without an exception, mismatched case
sets, and development/holdout name or checksum overlap. It rejects zero-trial
jobs and binds every TrialResult configured task/name, agent, model, skill,
runtime setting, observed identity, attempt count, and lock entry. Harbor 0.18's
deprecated `TrialResult.task_checksum` dirhash and its Packager-derived
`TrialLock.task.digest` are distinct algorithms and must not be equated. The
analyzer binds result task IDs and configured task declarations to the
corresponding per-trial/root locks, while canonical lock comparison preserves
the durable task digests across candidates. A symbolic or omitted Git commit
and a non-digest package ref require a complete set of adjacent per-trial locks;
Harbor's root lock alone does not preserve enough information to prove which
mutable declaration produced a resolved commit or digest. Root-only association
uses the full runtime identity, allows identical duplicate locks only as exact
multiplicity, and rejects ambiguous non-identical matches. Missing required
rewards remain explicitly null and make the candidate ineligible rather than
becoming numeric zeros. Provider and infrastructure failures preserve
`reportedReward`, but use null for the semantic `reward`, affected means, and
holdout gain when the corresponding comparison is unavailable. The development
archive also seals the search id, generation, Harbor job profiles, reward/gate
policy, promotion rules, baseline digest, selected-candidate digest, and case
names/checksums reconstructed from `candidateResults` before holdout.

## Guardrails

- Use one candidate skill per Harbor job. Replace the evaluated agent skill
  list instead of adding hidden capabilities.
- Require a portable `frontmatter.name`. For live jobs, the runner freezes each
  candidate under an isolated path whose exact basename is that logical name;
  it never substitutes the arbitrary source-directory basename. Source,
  staged, and Harbor lock digests must agree before results are accepted.
- Require every source, staged, and promoted bundle root to be self-contained.
  Reject a root that is itself a symbolic link, junction, or reparse point, as
  well as links nested inside the bundle, before copying.
- Require finite primary rewards, `passThreshold`, required-reward thresholds,
  and `minimumMeanGain`; reject NaN and infinity before archive construction.
- Set Harbor retry.max_retries to zero. Repeated attempts are part of the fixed
  job design; retries must not inflate evidence.
- Keep holdout invisible to reflection and archive selection.
- Treat only development as optimizer-visible evidence. Never relabel an
  optimizer-visible cohort as independent validation.
- Keep diagnostic excerpts bounded and review artifacts for secrets before
  sharing them.
- Reject name changes and validate copied bundles after every mutation or
  merge.
- Prefer a smaller candidate when vectors and errors tie.
- Never overwrite the source skill or install a candidate automatically.

## Outputs

A development generation writes:

~~~text
<output>/development/generation-NNN/
├── harbor-jobs/
├── pareto-archive.json
└── reflection-plan.json
~~~

The holdout phase writes:

~~~text
<output>/holdout/
├── harbor-jobs/
├── candidate-skill/
├── promotion.json
└── report.md
~~~

## Validation

After editing this bundle, run:

~~~powershell
python -m py_compile <skill-root>/scripts/harbor_reflective_pareto.py
uv run <skill-root>/scripts/harbor_reflective_pareto.py --help
~~~
