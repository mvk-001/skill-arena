---
name: harbor-organize-evaluations
description: Organize append-only Harbor evaluation studies with frozen discovery, development, sealed validation, and holdout dataset manifests; ordered skill-owned stages; SHA-256-bound evidence pointers; explicit validation and holdout release; progressively regenerated status; and a Git-safe allowlist that exposes only publication indexes and reviewed aggregate result tables. Use when Codex needs to initialize or audit a Harbor study, require an independent validation dataset before evolution starts, manage test splits without leaking validation or holdout into evolution, coordinate harbor-run-results and Harbor evolution skills, resume a multi-generation comparison, or keep evaluation artifacts out of GitHub while publishing progress and comparisons.
---

# Harbor Organize Evaluations

Coordinate a complete Harbor study while leaving evaluation, recovery,
candidate realization, evolution, and metric interpretation to their owning
skills. The bundled script uses Python 3.12 standard library only. In commands,
`<skill-root>` means this installed skill directory.

## Workflow

1. Read
   [references/evaluation-study-contract.md](references/evaluation-study-contract.md)
   completely before creating or changing a study.
2. Initialize a new, empty study directory:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py init <study-dir> `
     --study-id <id> `
     --title "<title>" `
     --objective "<objective>" `
     --comparison-profile "<stable profile id>"
   ~~~

3. Register every dataset before execution. `development` is the
   optimizer-visible evolution dataset. `validation` is a mandatory,
   independent post-selection dataset for every evolution and remains sealed;
   `holdout` is an optional additional final gate. The command reads sealed
   task bytes only to create a lock; do not inspect or summarize their content:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id development-v1 --split development --source <dataset-dir>
    python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
      --dataset-id validation-v1 --split validation --source <validation-dir>
    python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
      --dataset-id holdout-v1 --split holdout --source <holdout-dir>
   ~~~

   Registration rejects overlapping source trees, task IDs, or task digests
   across every split. Any later dataset drift makes verification fail.

4. Add stages in execution order. Before an evolution can start, its
   development-only stage and a downstream validation stage that depends on it
   must both exist:

   ~~~powershell
    python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study-dir> `
      --stage-id evolve-g001 `
      --kind evolution `
      --owner-skill harbor-reflective-pareto-search `
      --dataset-id development-v1
    python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study-dir> `
      --stage-id validate-g001 `
      --kind validation `
      --owner-skill harbor-run-results `
      --dataset-id validation-v1 `
      --depends-on evolve-g001
   ~~~

5. Transition the ready stage to `running`, perform the work with its owning
   Harbor skill, and bind the resulting native job, report, candidate, lock,
   or decision by digest. Starting an `evolution` stage fails unless it uses
   only `development`, an independent `validation` dataset is registered, and
   its downstream validation stage is already planned:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py transition <study-dir> `
      --stage-id evolve-g001 --status running
    python <skill-root>/scripts/manage_harbor_evaluations.py record-evidence <study-dir> `
      --evidence-id candidate-g001 `
      --stage-id evolve-g001 `
      --kind candidate --role lineage --visibility private `
      --path <frozen-candidate-bundle>
    python <skill-root>/scripts/manage_harbor_evaluations.py transition <study-dir> `
      --stage-id evolve-g001 --status completed
   ~~~

   Use `blocked` only while external work is genuinely unavailable. Create a
   separate recovery stage owned by `harbor-resume-external-failures`; never
   rewrite the failed stage or ledger history.

6. After the completed evolution records the frozen candidate with evidence
   kind `candidate`, release validation exactly once:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py release-validation <study-dir> `
     --selection-id selected-candidate-v1 `
     --selected-stage evolve-g001 `
     --candidate-evidence <frozen-candidate-bundle>
   ~~~

   Run only the planned validation stage against that digest. Validation may
   accept or reject the candidate, but it cannot mutate, rank, or reselect a
   candidate in the same study. Once released, the dataset is consumed: a
   later evolution requires a new study with fresh sealed validation.

7. If the study declares an additional holdout, release it only after the
   completed validation gate is digest-bound:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py release-holdout <study-dir> `
     --selection-id selected-candidate-v1 `
     --selected-stage validate-g001 `
     --selection-evidence <validation-report>
   ~~~

   The validation evidence must already be recorded on the selected stage. No
   holdout stage can run and no holdout evidence can be recorded before this
   event.

8. Inspect the regenerated `status.md` or print the current snapshot:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py status <study-dir> `
     --format markdown
   python <skill-root>/scripts/manage_harbor_evaluations.py verify <study-dir> --render
   ~~~

9. Publish only the generated `publication/index.json`,
   `publication/index.md`, and explicitly reviewed aggregate tables named
   `publication/tables/<id>.table.csv`, `.table.tsv`, or `.table.md`. After
   adding a table, refresh and verify:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py verify <study-dir> --render
   git add <study-dir>/.gitignore <study-dir>/publication
   python <skill-root>/scripts/manage_harbor_evaluations.py verify <study-dir>
   git status --short --untracked-files=all -- <study-dir>
   ~~~

   The study-local `.gitignore` denies everything else. `verify` also rejects
   raw artifacts already tracked or force-added to Git, and detects a staged
   publication index or table that differs from its verified worktree bytes.

## Route Each Stage

- Use `harbor-run-results` for baseline, ordinary evaluation, independent
  validation, comparison, holdout reporting, and final native reports.
- Use `harbor-resume-external-failures` only for independently proven external
  failure recovery.
- Use `harbor-realize-skill-candidate` after a mutation is chosen but before a
  complete child bundle exists.
- Choose exactly one of `harbor-population-search`,
  `harbor-trace-distillation`, `harbor-reflective-pareto-search`,
  `harbor-operator-coevolution`, or `harbor-evolve-skill` for a declared
  development evolution stage and, when supported, its separate validation
  stage. A bundle's internally named `holdout` phase may serve as this
  independent validation gate when it is the first optimizer-invisible cohort.
- Use `harbor-metaskill-evolution` only after repeated, comparable,
  development-only branch evidence exists.
- Use this skill itself only for promotion-decision bookkeeping and
  publication indexing. It never makes the promotion decision.

## Boundaries

- Treat `ledger.jsonl` and `datasets/*.lock.json` as append-only evidence. A
  correction requires a new event, stage, dataset version, or study directory.
- Treat `status.json` and `status.md` as replaceable derived views, not evidence.
- Keep datasets, locks, ledgers, status views, native jobs, trials,
  trajectories, candidates, verifier diagnostics, answers, reasoning, and
  credentials outside Git. Never use `git add -f` to bypass the study allowlist.
- Treat evidence visibility `public` as permission to include only its
  source-path-free digest metadata in the generated publication index. It does
  not make the underlying report or job versionable.
- Publish a result table only after reviewing it as an aggregate projection
  that contains no task content, prompts, responses, traces, secrets, or
  holdout internals. The organizer verifies structure and Git tracking, not
  semantic redaction.
- Do not copy, parse, normalize, average, rank, or reinterpret Harbor rewards
  here. Register the report produced by the owning skill.
- Do not add datasets after any stage starts. Evolution stages bind only
  `development`. Validation stages bind only `validation` and cannot run before
  the selected candidate bundle is digest-bound and explicitly released.
- Never feed validation results into mutation, candidate ranking, or reselection
  in the same study. After release, treat that validation dataset as consumed;
  use a new study and a fresh validation dataset for another unbiased claim.
- Never use holdout in discovery, development, validation, baseline, or
  meta-analysis stages.
- Do not delete or repair missing evidence automatically. Verification must
  fail closed on ledger, lock, dataset, or artifact drift.

## Validation

After changing this copied bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/manage_harbor_evaluations.py
python <skill-root>/scripts/manage_harbor_evaluations.py --help
~~~
