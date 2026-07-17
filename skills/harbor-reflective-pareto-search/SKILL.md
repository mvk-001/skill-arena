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

Map each completed job only to the exact candidate it evaluated. If legacy
jobs lack lock skill digests, treat the archive as an exploratory performance
summary: it cannot prove candidate provenance or causal improvement, and it
must not support promotion. Prefer live jobs created by this script.

7. Read pareto-archive.json and reflection-plan.json. For each child:

   - cite trial, trajectory, or verifier evidence for every proposed change
   - make no mutation when bounded feedback does not establish a safe edit
   - repair recurring mechanisms rather than copying task answers
   - preserve instructions that support passing cases
   - create a new candidate directory and record its parents and rationale

8. Increment search.generation, add the copied children, and repeat development
   evaluation. Keep the Harbor task set, agent, model, attempts, environment,
   and retry policy fixed.
9. Select one candidate from the development Pareto archive. Do not inspect
   holdout artifacts during reflection. Set selectedCandidate and
   developmentArchive, then run:

~~~powershell
uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml> --phase holdout
~~~

Use --analyze-only only when baseline and selected holdout jobs already exist
and are declared as holdoutJobDirectory values.
10. Promote candidate-skill only when promotion.json says promote and ordinary
    validation and tests for that copied bundle also pass.

## Evidence contract

The script derives case vectors from:

- verifier_result.rewards[rewardKey]
- exception_info
- task checksum, agent, model, and attempts
- agent trajectory and text outputs when present
- every regular verifier output file
- lock skill digests and task/environment provenance when lock.json exists

It rejects incomplete jobs, candidate config drift, lock drift beyond skill
provenance, missing rewards without an exception, mismatched case sets, and
development/holdout checksum overlap.

## Guardrails

- Use one candidate skill per Harbor job. Replace the evaluated agent skill
  list instead of adding hidden capabilities.
- Set Harbor retry.max_retries to zero. Repeated attempts are part of the fixed
  job design; retries must not inflate evidence.
- Keep holdout invisible to reflection and archive selection.
- Treat validation or development as optimizer-visible evidence, never as the
  final promotion claim.
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
