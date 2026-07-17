# Harbor Evolver Comparison Plan

Date: 2026-07-16

## Goal

Apply the four Harbor-native evolution strategies to three real skill bundles
found under `C:/Users/villa/dev`, then compare development and unseen holdout
results, operational cost, evidence quality, and failure modes.

## Subjects

- `openapi-integrator`: deterministic generated-code and API-contract work.
- `deepfake-detector`: local tool use, structured output, and calibrated
  reporting from frozen image-analysis behavior.
- `scene-script-planner`: text planning with timing, scope, and evidence
  constraints.

The source bundles remain immutable. Every candidate is a copied bundle with
the same frontmatter name.

## Experimental Controls

- Harbor 0.18.0, Docker, Codex `openai/gpt-5.4-mini` at low reasoning,
  two attempts per task, task checksums, and a zero-retry policy stay fixed
  within each subject.
- Codex web search stays disabled. Task containers use the same public network
  cell because the available WSL kernel cannot start Harbor's nftables egress
  sidecar; pre-agent sidecar failures are excluded from fitness evidence.
- Each subject uses two development tasks and one disjoint holdout task.
- Verifiers are deterministic and emit granular diagnostics; no LLM judge is
  used.
- Development evidence may inform mutation. Holdout artifacts remain hidden
  until each strategy has selected its candidate.
- Population search, trace distillation, reflective Pareto search, and
  operator coevolution receive the same source baseline and validation budget.
- Compare holdout reward first, then development reward, execution errors,
  candidate size, evaluation count, and actionable evidence quality.

## Stages

1. Build and validate the three native Harbor task corpora.
2. Evaluate immutable baselines and preserve their native jobs.
3. Produce strategy-specific candidate copies from development evidence.
4. Evaluate candidates on the frozen development corpus.
5. Run each evolver against the native jobs to select or materialize a winner.
6. Evaluate only the selected winner on the disjoint holdout.
7. Compare outcomes and document each evolver's strengths and weaknesses.
8. Validate all candidate bundles, benchmark assets, result joins, and the
   repository closeout hook.

## Non-Goals

- Claim statistical significance from a small live study.
- Compare model providers or agent implementations.
- Modify or install the source skills.
- Treat the deepfake heuristic as scientific ground truth.

## Verification

Status: complete. The nine canonical task/verifier pairs, frozen corpus and
candidate locks, procedural holdout release, and all strategy decisions were
validated from native Harbor artifacts. The study executed 24 eligible jobs
and 78 trials with zero execution errors or retries. The strict result join
recomputed candidate selection and verified job, trial, task, skill, corpus,
and release-lock identities before writing the machine-readable summary.

The four evolver test files passed 23/23 tests, the summary tamper suite passed
6/6 tests, the combined focal suite passed 24/24 tests, and the complete
repository suite passed 436/436 tests in serial mode. Documentation links,
skill-bundle checks, Ruff, Python byte-compilation, and the required
`run-rust-analyzer-hook.js` closeout also passed. Exact outcomes and artifact
paths are recorded in
`evaluations/harbor-evolution-comparison/results/20260716/report.md`.
