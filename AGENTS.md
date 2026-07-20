# Harbor Skill Evolution Agent Guide

## Scope

This repository maintains seven independently copyable Harbor skills and two
versioned evolution studies. It does not maintain the former Skill Arena CLI,
Promptfoo adapters, or `skill-arena-*` workflows.

All repository artifacts must be written in English.

## Sources of truth

1. `README.md` defines the shared workflow and repository map.
2. Each `skills/harbor-*/SKILL.md` defines that bundle's executable contract.
3. `evaluations/*/README.md`, protocols, locks, and results define each study.
4. `docs/research-foundations.md` records research provenance and adaptation
   limits.
5. `.specs/adr/*.md` records durable decisions.

Do not duplicate field-level skill contracts in root documentation. Link to the
owning `SKILL.md`.

## Preservation boundaries

- Keep these seven bundles atomic and self-contained:
  `harbor-run-results`, `harbor-resume-external-failures`,
  `harbor-population-search`, `harbor-trace-distillation`,
  `harbor-reflective-pareto-search`, `harbor-operator-coevolution`, and
  `harbor-evolve-skill`.
- Preserve all tracked content under `evaluations/harbor-evolution-comparison/`
  and `evaluations/knowledge-consult-evolution/`. Historical evidence is
  append-only; corrections require a new version and explicit provenance.
- Do not edit or move root `package.json` or `package-lock.json`. Q003
  generation 003 seals their exact paths and hashes as verification TCB inputs.
- Never merge ignored native jobs from `.tmp`. They may contain credentials,
  private verifier inputs, model reasoning, answers, and machine-local paths.
  Never delete those trees as part of repository cleanup.
- Preserve the development/holdout boundary. Do not expose holdout evidence to
  candidate generation or selection.

## Contributor rules

- Use native Harbor `JobConfig` inputs and artifacts. Do not recreate a second
  evaluation, normalization, reporting, or evolution layer.
- Keep Harbor built-in retries at zero. Selective recovery may retry only an
  independently proven external failure and must preserve first-evaluable,
  no-best-of semantics.
- Keep target skills and datasets external to generic evolver bundles.
- Never overwrite source skills or prior evidence automatically.
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
