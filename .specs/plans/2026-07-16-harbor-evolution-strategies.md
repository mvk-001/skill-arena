# Harbor Evolution Strategy Skills Plan

Date: 2026-07-16

## Goal

Create one Harbor-native skill for each existing evolution strategy so the
workflow can execute or inspect Harbor evaluations and improve a skill from
native rewards, errors, verifier diagnostics, and trajectories without using
Skill Arena.

## Scope

- Add Harbor population search, trace distillation, reflective Pareto search,
  and operator coevolution bundles.
- Give every bundle a pinned Harbor executable, concise workflow instructions,
  a focused config and artifact reference, and UI metadata.
- Preserve native Harbor jobs and use a disjoint baseline-versus-candidate
  holdout gate.
- Document the runtime boundary and research adaptation.
- Add deterministic artifact-driven tests that do not launch agents.

## Acceptance Criteria

1. Every bundle passes the official skill validator and repository independence
   gate from an isolated copy.
2. No new bundle imports or invokes Skill Arena, sibling skills, or repository
   runtime modules.
3. Scripts validate completed Harbor jobs and reject relevant config, lock,
   task, attempt, or split drift.
4. Population ranking, trace support, Pareto preservation, and operator credit
   are derived from native trial rewards and errors.
5. Trajectory and verifier evidence remains attributable and bounded.
6. Holdout evidence cannot enter development selection, and no source skill is
   overwritten or installed automatically.
7. Focused tests, the full suite, coverage, documentation checks, and the
   required closeout hook pass.

## Non-Goals

- Add Harbor commands or schemas to the public Skill Arena CLI.
- Replace Skill Arena strategy replay or cross-runtime comparison.
- Run paid live agent evolution in the automated suite.
- Claim that a deterministic strategy adaptation reproduces a research paper's
  optimizer or empirical results.

## Verification

Status: completed.

- Skill Creator `quick_validate.py` passed for all four bundles.
- `uvx ruff check` passed for all four Harbor scripts.
- The focused Harbor suite passed 23/23 tests, including live-plan,
  analyze-only, artifact-drift, holdout-isolation, and deterministic strategy
  cases.
- Fresh-agent forward tests exercised every bundle. Their findings clarified
  shared skill names, baseline semantics, offline provenance limits, empty
  feedback behavior, support floors, coevolution minimums, and dry-run scope.
- A Windows analyze-only event-loop initialization stall found during the
  operator forward test was removed; the operator suite then passed 7/7 and
  the normal parallel repository suite passed.
- `npm test` passed 429/429 tests.
- `npm run test:coverage` passed with 95.61% statements, 85.82% branches,
  97.23% functions, and 95.61% lines.
- `npm run docs:check` passed for 10 files and 107 local links.
- `npm run skills:check` passed the independence check for all 14 bundles.
- Scoped whitespace and final-newline checks passed.
- `node scripts/run-rust-analyzer-hook.js` completed and wrote 120 JSON
  artifacts for `src`, `test`, `bin`, and `scripts`.

No paid model, Docker-backed task, or live Harbor evaluation was launched by
the automated suite. Live execution is implemented through Harbor's native
`Job` and `JobConfig` APIs; deterministic tests use native-format fixtures.
