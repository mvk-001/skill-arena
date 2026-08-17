# Harbor Evaluation Study Contract

This contract defines an ordering and provenance layer around native Harbor
work. It does not define a second job format, result model, reward, optimizer,
ranking, or promotion policy.

## Contents

- [Study layout](#study-layout)
- [Dataset registration](#dataset-registration)
- [Stage graph](#stage-graph)
- [Evidence and privacy](#evidence-and-privacy)
- [Git-safe publication](#git-safe-publication)
- [Validation release](#validation-release)
- [Holdout release](#holdout-release)
- [Ledger integrity](#ledger-integrity)
- [Progressive status](#progressive-status)
- [Command examples](#command-examples)

## Study Layout

Initialization refuses a non-empty destination and creates:

~~~text
<study>/
├── .gitignore
├── study.json
├── ledger.jsonl
├── datasets/
│   └── <dataset-id>.lock.json
├── publication/
│   ├── index.json
│   ├── index.md
│   └── tables/
├── status.json
└── status.md
~~~

`study.json` is immutable and records:

- `schemaVersion`
- `studyId`
- `title`
- `objective`
- `comparisonProfile`
- `createdAt`

Use `comparisonProfile` as a stable identity for the declared task cohort,
agent, model, metric, attempts, retry policy, and hard gates. Detailed field
contracts remain in the owning Harbor skill or study protocol.

`ledger.jsonl` and dataset locks are evidence. `status.json` and `status.md` are
derived views regenerated after every accepted mutation. The publication
indexes are separate, source-path-free derived views. The study-local
`.gitignore` makes all files private by default and allowlists only itself,
those two indexes, and reviewed aggregate result tables.

## Dataset Registration

Each dataset source must be a directory containing at least one Harbor task
root identified by `task.toml`. A root with `task.toml` is one task. Otherwise,
each descendant directory containing `task.toml` is one task. Nested task roots
are rejected as ambiguous.

Supported splits are:

| Split | Optimizer visible | Intended use |
| --- | --- | --- |
| `discovery` | Yes | Trace discovery or smoke evidence |
| `development` | Yes | Mutation, diagnosis, or candidate fitness |
| `validation` | No | One-way evaluation of one frozen development winner |
| `holdout` | No | Final unchanged-baseline versus frozen-winner gate |

Registration computes SHA-256 over canonical relative file names, byte sizes,
and file digests. The lock records the source, aggregate tree digest, file and
byte counts, and each task's relative ID and tree digest.

The script rejects:

- a source directory equal to, inside, or containing another dataset source
- a task ID repeated across datasets, ignoring case
- identical task content across datasets
- links, junctions, reparse points, devices, sockets, and non-regular files
- dataset registration after any stage leaves `planned`
- later source, task inventory, file count, byte count, or digest drift

These checks prove byte-level separation under the declared sources. They do
not prove semantic independence between different tasks.

Treat `development` as the evolution dataset. Do not inspect validation or
holdout instructions, tests, verifier output, solutions, task names, or
artifacts while authoring or selecting candidates. Registration hashes their
bytes mechanically. Derived status exposes only dataset IDs, counts, and
aggregate digests.

## Stage Graph

Stages are appended in declared execution order. Dependencies must reference
earlier stages, so the graph is acyclic by construction.

Supported states are:

~~~text
planned -> running -> completed
                  \-> blocked -> running
planned/running/blocked -> stopped
~~~

`completed` and `stopped` are terminal. Completion requires at least one
digest-bound evidence artifact. A stage may run only after all dependencies are
completed. Validation- and holdout-bound stages additionally require their
separate release events.

Use these owner and kind combinations:

| Owner skill | Allowed stage kinds |
| --- | --- |
| `harbor-run-results` | `baseline`, `evaluation`, `validation`, `comparison`, `holdout`, `publication` |
| `harbor-resume-external-failures` | `recovery` |
| `harbor-realize-skill-candidate` | `realization` |
| `harbor-population-search` | `evolution`, `validation`, `holdout` |
| `harbor-trace-distillation` | `evolution`, `validation`, `holdout` |
| `harbor-reflective-pareto-search` | `evolution`, `validation`, `holdout` |
| `harbor-operator-coevolution` | `evolution`, `validation`, `holdout` |
| `harbor-evolve-skill` | `evolution`, `validation`, `holdout` |
| `harbor-metaskill-evolution` | `meta-analysis` |
| `harbor-organize-evaluations` | `promotion`, `publication` |

Dataset rules are:

- `baseline`, `evaluation`, and `meta-analysis` require only discovery or
  development datasets.
- `evolution` requires one or more development datasets and no other split. Its
  ledger record embeds the mandatory independent-validation boundary.
- `validation` requires one or more validation datasets and no other split.
- `holdout` requires one or more holdout datasets and no visible dataset.
- `comparison` requires datasets and may use one side of a sealed boundary,
  never a mixture of validation or holdout with optimizer-visible splits.
- `realization`, `promotion`, and organizer-owned `publication` bind no
  datasets.
- `recovery` may omit a dataset because the recovered job itself binds the
  original task identity.

The organizer owner records that a reviewed promotion or publication decision
exists. It does not choose the winner or authorize installation.

## Evidence and Privacy

`record-evidence` accepts an existing regular file or directory. It stores:

- globally unique evidence ID
- owning stage ID
- kind and role
- `private` or `public` visibility
- local source path
- file or canonical tree digest
- file and byte counts

Evidence kinds are `native-job`, `final-report`, `evolution-report`,
`candidate`, `lock`, `recovery`, `ledger`, `decision`, and `other`.

Evidence roles are `development`, `validation`, `holdout`, `recovery`,
`lineage`, `comparison`, `report`, `decision`, `publication`, and
`diagnostic`.

Raw native Harbor jobs must be marked `private`. Derived status includes IDs,
classification, visibility, digest, and counts but never source paths. The
organizer does not copy evidence into the study, sanitize it, or make it safe
to publish.

`public` visibility adds only digest metadata to the publication index. It
does not make the source artifact trackable or safe to upload.

Record artifacts only while a stage is `running` or `blocked`. Do not append
new evidence to a completed stage; append a new correction or continuation
stage with explicit dependency instead.

Deep verification rehashes every recorded dataset, task, release selection,
and evidence source. Missing or changed sources fail closed. Move a complete
study together with its evidence only after creating an explicit portable
publication contract outside this organizer.

Validation evidence cannot be recorded before validation release. Holdout
evidence cannot be recorded before holdout release. These are ordering gates;
the owning evaluation skill remains responsible for proving that native jobs
used the digest-bound candidate.

## Git-Safe Publication

The generated `.gitignore` is a deny-by-default allowlist. A normal
`git add .` can see only:

- `.gitignore`, as the enforcement control
- `publication/index.json`
- `publication/index.md`
- flat, reviewed tables named
  `publication/tables/<id>.table.csv`,
  `publication/tables/<id>.table.tsv`, or
  `publication/tables/<id>.table.md`

Everything else remains local, including `study.json`, `ledger.jsonl`, dataset
locks and task trees, internal status, native jobs, trials, trajectories,
candidates, reports, diagnostics, answers, reasoning, and credentials.

The publication index contains study identity, ledger head, aggregate
progress, validation and holdout release state, source-path-free metadata for
evidence marked `public`, and digests of reviewed result tables. It excludes
dataset inventories, task names, source paths, and private evidence.

Add only aggregate tables that have been explicitly reviewed for publication.
Do not put raw JSON reports, prompts, responses, task content, traces, or
validation or holdout internals in `publication/tables`. The organizer checks
allowed paths, regular-file structure, exact index derivation, and the Git
index. It cannot prove semantic redaction.

Run `verify --render` after adding or changing a table. Deep verification fails
when the `.gitignore` changes, a publication artifact is unexpected, an index
is stale, or Git tracks any study file outside the allowlist, including a file
added with `git add -f`. After rendering, stage the publication projection and
run `verify` without `--render`; it also rejects tracked publication files whose
Git-index bytes differ from the verified worktree.

## Validation Release

Every evolution stage stores this executable boundary in its ledger event:

~~~json
{
  "evolutionDatasetSplit": "development",
  "validationDatasetSplit": "validation",
  "validationOptimizerVisible": false,
  "candidateFreezeEvidenceKind": "candidate",
  "validationReleasePolicy": "after-completed-evolution",
  "postValidationEvolutionPolicy": "new-study-with-fresh-validation"
}
~~~

Transitioning an evolution stage to `running` requires:

1. only development datasets bound to that stage
2. at least one registered validation dataset
3. a non-stopped downstream validation stage that transitively depends on the
   evolution stage

`release-validation` then requires a completed evolution stage and the exact
candidate file or directory already recorded on that stage with evidence kind
`candidate`. The event digest-binds that frozen candidate and releases
validation once. Validation stages and validation evidence are rejected before
the event.

Release is one-way. No evolution stage may start after validation release in
the same study. A failed validation result may inform a later investigation,
but another unbiased gate requires a new study and a fresh sealed validation
dataset. This prevents repeated candidate tuning against a consumed validation
cohort.

## Holdout Release

Registering a holdout dataset does not release it. `release-holdout` requires:

1. at least one registered holdout dataset
2. for an evolution study, a released validation boundary and completed
   validation stage
3. a selection evidence file or directory already recorded on that stage
4. an exact digest of that selection evidence

For studies without evolution, a completed evaluation or comparison stage may
still supply the selection. The release is a single append-only event.
Releasing twice is rejected. Holdout stages and holdout evidence are rejected
before release.

The release gate proves ordering and byte identity. It does not prove that a
human or external process avoided reading holdout before release.

## Ledger Integrity

Every ledger line is canonical UTF-8 JSON with:

- `schemaVersion`
- one-based `sequence`
- `previousSha256`
- `recordedAt`
- `event`
- object `payload`
- `eventSha256`

`eventSha256` covers every other field. The first event points to 64 zeroes and
binds the immutable `study.json` bytes. Every subsequent event points to the
previous event digest. Blank lines, duplicate JSON keys, non-canonical JSON,
sequence gaps, unknown events, invalid transitions, and broken hashes fail
verification.

Event types are:

- `study_initialized`
- `dataset_registered`
- `stage_added`
- `stage_transitioned`
- `evidence_recorded`
- `validation_released`
- `holdout_released`

Commands take an exclusive local ledger lock while appending. A filesystem or
power failure can still leave a detectable orphan lock or truncated final
line. The script never deletes or repairs such evidence automatically.

## Progressive Status

The derived snapshot reports:

- immutable study identity
- event count and current ledger head
- public dataset summaries
- whether validation and holdout are independently sealed or released
- stage totals by status
- completion and terminal percentages
- ordered stages, dependencies, owners, and evidence IDs
- a source-path-free evidence index
- the running, blocked, or first dependency-ready next action

`completionPercent` counts only completed stages. `terminalPercent` also counts
intentionally stopped stages. Neither is a quality metric.

The separate publication index reports only safe index metadata and reviewed
aggregate table digests. Internal status remains ignored by Git because it
contains operational dataset and stage details.

Metrics, comparisons, confidence, costs, and promotion outcomes remain in the
native reports produced by the owning skills. Register those reports as
evidence instead of copying values into this status layer.

## Command Examples

Plan one development evolution, independent validation, and optional holdout:

~~~powershell
python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study> `
  --stage-id baseline-dev `
  --kind baseline `
  --owner-skill harbor-run-results `
  --dataset-id dev-v1

python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study> `
  --stage-id evolve-g001 `
  --kind evolution `
  --owner-skill harbor-reflective-pareto-search `
  --dataset-id dev-v1 `
  --depends-on baseline-dev

python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study> `
  --stage-id validate-g001 `
  --kind validation `
  --owner-skill harbor-run-results `
  --dataset-id validation-v1 `
  --depends-on evolve-g001

python <skill-root>/scripts/manage_harbor_evaluations.py add-stage <study> `
  --stage-id holdout-gate `
  --kind holdout `
  --owner-skill harbor-run-results `
  --dataset-id holdout-v1 `
  --depends-on validate-g001
~~~

Record a public report while keeping its raw job private:

~~~powershell
python <skill-root>/scripts/manage_harbor_evaluations.py record-evidence <study> `
  --evidence-id evolve-g001-native-job `
  --stage-id evolve-g001 `
  --kind native-job `
  --role development `
  --visibility private `
  --path <native-job-dir>

python <skill-root>/scripts/manage_harbor_evaluations.py record-evidence <study> `
  --evidence-id evolve-g001-report `
  --stage-id evolve-g001 `
  --kind evolution-report `
  --role report `
  --visibility public `
  --path <report.json>
~~~

Before opening validation, record the selected candidate bundle itself and
release that exact digest:

~~~powershell
python <skill-root>/scripts/manage_harbor_evaluations.py record-evidence <study> `
  --evidence-id candidate-g001 `
  --stage-id evolve-g001 `
  --kind candidate `
  --role lineage `
  --visibility private `
  --path <frozen-candidate-bundle>

python <skill-root>/scripts/manage_harbor_evaluations.py release-validation <study> `
  --selection-id selected-g001 `
  --selected-stage evolve-g001 `
  --candidate-evidence <frozen-candidate-bundle>
~~~

Verification is read-only unless `--render` is supplied:

~~~powershell
python <skill-root>/scripts/manage_harbor_evaluations.py verify <study>
python <skill-root>/scripts/manage_harbor_evaluations.py verify <study> --render
~~~

Before publishing, confirm the Git projection:

~~~powershell
git add <study>/.gitignore <study>/publication
python <skill-root>/scripts/manage_harbor_evaluations.py verify <study>
git status --short --untracked-files=all -- <study>
~~~
