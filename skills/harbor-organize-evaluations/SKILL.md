---
name: harbor-organize-evaluations
description: Organize Harbor studies with multiple public development and private verification datasets, frozen protocols, leakage controls, ordered stages, and one-way validation gates. Use to prepare or audit evaluation methodology, prevent private feedback and task shortcuts, or organize published reports into a discoverable catalog of evaluated skills and source-linked metrics without implementing another optimizer or scorer.
---

# Harbor Organize Evaluations

Coordinate a complete Harbor study while leaving evaluation, recovery,
candidate realization, evolution, and metric interpretation to their owning
skills. The bundled script uses Python 3.12 standard library only. In commands,
`<skill-root>` means this installed skill directory.

## Study decisions

When organizing existing reports or answering which skills have been evaluated,
follow [Report discovery and skill coverage](references/report-catalog.md).
Maintain a project-level report catalog with source links, reviewed aggregate
metrics per evaluated variant, and explicit missing evidence. Separate target
skill quality from evolution-method observations. Refresh this catalog after
publication; do not infer current-version quality from a historical score.

Choose the smallest lifecycle that answers the question. A report of an
existing job needs no new evolution study. Before an evolution study starts,
record its hypothesis, baseline, primary outcome, hard gates, fixed resource
budget, development stopping rule, and independent acceptance rule in its
private protocol. Reference the owning skill for executable fields.

Read [references/study-design-and-leakage.md](references/study-design-and-leakage.md)
before preparing a new study. It defines the dataset portfolio, method-selection
procedure, curator review, filename and question-pattern controls, and private
verification policy. Request native task roots and review evidence from the
dataset curator; use `harbor-author-evaluation-datasets` when available for that
work. This organizer registers the finished artifacts and does not author tasks
or change the evolution skills.

Each split may contain many separately named datasets. Public means visible to
the optimizer: use `discovery` for smoke or diagnosis and `development` for
training, skill evaluation, method comparison, and candidate selection. Private
means unavailable to that optimizer: use `validation` only to check one frozen
candidate against the unchanged baseline, with optional `holdout` as a further
gate. These are access roles, not permission to publish task files. Register
additional domains, difficulty bands, robustness suites, or transfer cohorts as
new dataset IDs in the appropriate split; do not reduce the study to one public
file and one private file or merge away their identities.

Stage completion records that work finished; it does not establish that the
candidate passed. Have the owning evaluator interpret the frozen acceptance
rule before any optional holdout or promotion decision. A failed or
non-evaluable gate keeps the baseline and preserves the receipt. The organizer
verifies ordering and bytes, not semantic independence, statistical power,
evaluator authority, or the truth of a declared acceptance outcome.

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

3. Register every dataset before execution. Curate independent task families
   before splitting and review the realized filename and question surfaces as
   described in the design reference. `development` is the
   optimizer-visible evolution dataset. `validation` is a mandatory,
   independent post-selection dataset for every evolution and remains sealed;
   `holdout` is an optional additional final gate. The command reads sealed
   task bytes only to create a lock; do not inspect or summarize their content:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id development-a --split development --source <dataset-dir>
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id development-b --split development --source <second-dataset-dir>
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id validation-a --split validation --source <validation-dir>
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id validation-b --split validation --source <second-validation-dir>
   python <skill-root>/scripts/manage_harbor_evaluations.py add-dataset <study-dir> `
     --dataset-id holdout-v1 --split holdout --source <holdout-dir>
   ~~~

   Registration rejects overlapping source trees, task IDs, or task digests
   across every split. Any later dataset drift makes verification fail. Each ID
   identifies a disjoint, immutable cohort. Use neutral IDs for private cohorts.

4. Add stages in execution order. Before an evolution can start, its
   development-only stage and a downstream validation stage that depends on it
   must both exist:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study-dir> `
     --stage-id evolve-g001 `
     --kind evolution `
     --owner-skill harbor-reflective-pareto-search `
     --dataset-id development-a `
     --dataset-id development-b
   python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study-dir> `
     --stage-id validate-g001 `
     --kind validation `
     --owner-skill harbor-run-results `
     --dataset-id validation-a `
     --dataset-id validation-b `
     --depends-on evolve-g001
   python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study-dir> `
     --stage-id holdout-gate --kind holdout --owner-skill harbor-run-results `
     --dataset-id holdout-v1 --depends-on validate-g001
   ~~~

   Omit both holdout registration and its stage when no additional gate is
   needed. Repeat `--dataset-id` to bind multiple datasets; the owning runner
   must support the declared portfolio or supply separate planned native jobs.
   Freeze dataset-specific metrics, weights, repetitions, mandatory gates, and
   a single combined decision in the protocol. Private results cannot choose
   the method, winning dataset, weight, or candidate.

5. Seal the design before any stage runs. Use the curator's private review
   directory containing `review.json` and its supporting evidence; the exact
   receipt is defined in the design reference. Hash it mechanically without
   displaying sealed task identities or reading private review findings into
   the optimizer's context:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py seal-design <study-dir> `
     --protocol <private-protocol-file> `
     --baseline <unchanged-baseline-artifact> `
     --review <private-curator-review-directory>
   ~~~

   New studies use study schema 2. Execution requires this one-time seal, exact
   review coverage of all locked tasks, disjoint declared independence groups,
   six supported quality checks, and planned gates covering every private
   dataset. Baseline, protocol, and review drift fail verification. Schema 1
   studies remain auditable with their legacy guarantees; never rewrite their
   evidence to imply a retrospective review.

6. Transition the ready stage to `running`, perform the work with its owning
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

7. After the completed evolution records the frozen candidate with evidence
   kind `candidate`, release validation exactly once:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py release-validation <study-dir> `
     --selection-id selected-candidate-v1 `
     --selected-stage evolve-g001 `
     --candidate-evidence <frozen-candidate-bundle>
   ~~~

   Run all planned validation gates against that same digest and the sealed
   baseline. All gates must descend from the frozen selection. Validation may
   accept or reject the candidate, but it cannot mutate, rank, or reselect a
   candidate in the same study. Once released, the dataset is consumed: a
   later evolution requires a new study with fresh sealed validation. A binary
   pass/fail or progress signal is feedback too; never inspect it after each
   generation and then tune again. Keep raw private results in the evaluator's
   isolated context and publish only the reviewed final aggregate decision.

8. If the study declares an additional holdout, release it only after every
   planned validation gate completes and the joint acceptance decision passes:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py release-holdout <study-dir> `
     --selection-id selected-candidate-v1 `
     --selected-stage validate-g001 `
     --selection-evidence <validation-report>
   ~~~

   The validation evidence must already be recorded on the selected stage. No
   holdout stage can run and no holdout evidence can be recorded before this
   event.

9. Inspect the regenerated `status.md` or print the current snapshot:

   ~~~powershell
   python <skill-root>/scripts/manage_harbor_evaluations.py status <study-dir> `
     --format markdown
   python <skill-root>/scripts/manage_harbor_evaluations.py verify <study-dir> --render
   ~~~

10. Publish only the generated `publication/index.json`,
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
- Do not parse raw Harbor rewards, normalize, average, rank, or reinterpret
  scores here. Register the report produced by the owning skill. A report
  catalog may transcribe already reviewed published aggregates with source
  links and their original meaning, without calculating new metrics.
- Do not add datasets after any stage starts. Evolution stages bind only
  `development`. Validation stages bind only `validation` and cannot run before
  the selected candidate bundle is digest-bound and explicitly released.
- For schema 2, do not add datasets or private evaluation/comparison gates
  after design sealing. Selective external-failure recovery may append a stage
  under its existing owner contract and must explicitly bind the original
  split. It does not authorize another evaluable attempt or a new candidate.
- Treat filename distributions, prompt skeletons, answer ordering, fixtures,
  and reference solutions as possible shortcuts. Byte disjointness and opaque
  group labels are checks on declared evidence, not proof of semantic quality.
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
