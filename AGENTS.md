# Harbor Skill Evolution Agent Guide

## Scope

This repository maintains eleven independently copyable Harbor skills and three
versioned studies. It does not maintain the former Skill Arena CLI,
Promptfoo adapters, or `skill-arena-*` workflows.

All repository artifacts must be written in English.

## Sources of truth

1. `README.md` is the project overview; `docs/getting-started.md` defines the shared workflow and `docs/repository-guide.md` defines the repository map.
2. Each `skills/harbor-*/SKILL.md` defines that bundle's executable contract.
3. `evaluations/*/README.md`, protocols, locks, and results define each study.
4. `docs/research-foundations.md` records research provenance and adaptation
   limits.
5. `.specs/adr/*.md` records durable decisions.

Do not duplicate field-level skill contracts in root documentation. Link to the
owning `SKILL.md`.

## Preservation boundaries

- Keep these eleven bundles atomic and self-contained:
  `harbor-organize-evaluations`, `harbor-run-results`,
  `harbor-resume-external-failures`,
  `harbor-population-search`, `harbor-trace-distillation`,
  `harbor-reflective-pareto-search`, `harbor-operator-coevolution`,
  `harbor-evolve-skill`, `harbor-maximize-knowledge-expertise`,
  `harbor-realize-skill-candidate`, and `harbor-metaskill-evolution`.
- Preserve all tracked content under `evaluations/harbor-evolution-comparison/`
  and `evaluations/knowledge-consult-evolution/`, plus sealed results under
  `evaluations/harbor-next-skill-comparison/`. Historical evidence is
  append-only; corrections require a new version and explicit provenance.
- Do not edit or move root `package.json` or `package-lock.json`. Q003
  generation 003 seals their exact paths and hashes as verification TCB inputs.
- Never merge ignored native jobs from `.tmp`. They may contain credentials,
  private verifier inputs, model reasoning, answers, and machine-local paths.
  Never delete those trees as part of repository cleanup.
- Preserve the development/holdout boundary. Do not expose holdout evidence to
  candidate generation or selection.

## Evolution and independent validation

- Before starting a study or run owned by `harbor-population-search`,
  `harbor-trace-distillation`, `harbor-reflective-pareto-search`,
  `harbor-operator-coevolution`, or `harbor-evolve-skill`, read the
  [`harbor-organize-evaluations` contract](skills/harbor-organize-evaluations/SKILL.md),
  the owning evolver's `SKILL.md`, and the
  [independent-validation ADR](.specs/adr/2026-08-01-independent-validation-before-evolution.md).
- At initialization, register and digest-lock disjoint evolution and validation
  datasets and declare the downstream validation stage before evolution may
  run. The organizer calls the optimizer-visible split `development`; schema 2
  of `harbor-evolve-skill` calls it `evolution`. Only that split may drive
  diagnosis, mutation, ranking, merging, or selection.
- Keep validation sealed until one selected candidate is frozen and
  digest-bound. Run validation as a one-way acceptance gate; never feed its
  tasks, rewards, diagnostics, or outcome back into evolution in the same
  study. A failed gate requires a new study and fresh validation for another
  unbiased claim. Holdout, when declared, is a third sealed final gate.

## Contributor rules

- Use native Harbor `JobConfig` inputs and artifacts. Do not recreate a second
  evaluation, normalization, reporting, or evolution layer.
- Keep Harbor built-in retries at zero. Selective recovery may retry only an
  independently proven external failure and must preserve first-evaluable,
  no-best-of semantics.
- Keep target skills and datasets external to generic evolver bundles.
- Never overwrite source skills or prior evidence automatically.
- For new organizer-managed studies, keep datasets, locks, ledgers, native
  jobs, traces, candidates, diagnostics, and internal status out of Git. Track
  only the study `.gitignore`, generated publication indexes, and explicitly
  reviewed aggregate `*.table.csv`, `*.table.tsv`, or `*.table.md` result
  tables. Existing sealed tracked studies remain unchanged.
- Record a durable workflow or evidence-contract change as an ADR.
- Update the owning `SKILL.md`, study README/protocol, and tests in the same
  change when behavior changes.

## Validation

Before declaring work complete, run:

```bash
npm run docs:check
npm run skills:check
npm test
```

Also run the selected bundle's own validation commands and verify that tracked
study locks and public evidence remain unchanged unless the task explicitly
creates a new append-only version. Run `node --test test/audit/*.test.js` only
in the matching WSL/Linux evidence environment; it verifies slow historical
V2–V5 contracts that depend on that runtime.

## Repository organization and documentation

- Keep `README.md` as an overview: purpose, critical boundaries, first useful action, and links into `docs/README.md`.
- Put detailed procedures and reference material in `docs/`; update its index with every addition or move.
- Follow the [repository guide](docs/repository-guide.md) for file placement, validation, and data boundaries.
- Preserve existing canonical specs, ADRs, skill bundles, and evidence paths; do not reorganize sealed or generated data as documentation.
- Preserve prior work, stage explicit paths, and verify links, relevant checks, and the diff before an authorized push.
- Build tools must not delete authored documentation. Keep transient output and credentials outside tracked source.
