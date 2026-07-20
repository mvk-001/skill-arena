# ADR: Harbor-Only Repository Surface

Date: 2026-07-19

## Status

Accepted

## Context

The repository maintained two evaluation surfaces: a Node/Promptfoo Skill
Arena CLI and independently copyable Harbor-native skills. The workflow skills
already deprecated the Skill Arena implementation because Harbor jobs preserve
the task, agent, environment, verifier, rewards, trajectories, costs, and skill
digests required for reporting and evolution. Keeping the CLI, adapters,
duplicate skills, examples, schemas, and tests continued to dominate the
repository despite no longer owning new workflow logic.

The versioned Harbor studies must remain verifiable. In particular, knowledge
consult Q003 generation 003 seals the exact root `package.json` and
`package-lock.json` paths and hashes as part of an eight-file shared TCB.

## Decision

- Make the seven atomic `harbor-*` bundles the only maintained skill surface.
- Remove the public Skill Arena CLI, `src/`, `bin/`, Promptfoo runtime,
  adapters, `skill-arena-*` bundles, `harbor-runner`, and their tests,
  evaluations, and documentation from the maintained tree.
- Preserve every tracked file in `evaluations/harbor-evolution-comparison/`
  and `evaluations/knowledge-consult-evolution/`.
- Preserve the root npm manifests byte-for-byte at their existing paths solely
  because they are sealed historical TCB inputs. They no longer define a
  supported package or CLI contract.
- Keep native reporting fixtures under `test/fixtures/` and retain tests for
  the seven bundles, sealed recovery contracts, and versioned studies.
- Use `README.md` for the shared operating sequence, each `SKILL.md` for exact
  behavior, each study directory for its data and interpretation, and one
  concise research-provenance document. Remove duplicate navigation, playbook,
  CLI, architecture, schema, and completed-plan documents.
- Keep raw native jobs ignored and external to Git because they may contain
  secrets or private execution evidence. Repository cleanup must not delete
  them.

This decision supersedes the single-public-CLI decision and the requirement in
the Skill Arena workflow deprecation decision to keep that CLI supported. It
also supersedes the `harbor-runner` retention clause in the Harbor-native
reporting and evolution ADR.

## Consequences

- New work has one evaluation and evidence surface: native Harbor.
- Repository maintenance focuses on seven portable bundles and their evidence
  contracts instead of adapters and duplicate orchestration.
- Git history remains the migration path for the removed CLI and legacy
  workflows.
- The root npm manifests intentionally contain obsolete package metadata until
  a future append-only evidence migration can relocate their sealed bytes.
- Public sanitized evidence remains reproducible, while raw ignored jobs must
  be backed up separately and never committed.
