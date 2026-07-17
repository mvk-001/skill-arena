# ADR: Minimal and Varied Evaluation Prompts

Date: 2026-07-12

## Status

Accepted

## Context

The repository contained compare-authoring assets that embedded the exact
answer for one historical calendar benchmark. A separate batch-authoring skill
was hard-coded to generate two closely related calendar prompts. Those assets
could make a skill-enabled run succeed by reproducing evaluator knowledge
instead of applying transferable authoring guidance.

Long benchmark prompts also mixed user intent with compare-schema details,
validator expectations, and workflow instructions. Repeating one question with
different output formats provided row count without meaningful task diversity.

## Decision

- Remove benchmark-specific answer cards, recipes, scaffolds, copied overlays,
  and the hard-coded `skill-arena-compare-batch` skill.
- Keep `skill-arena-config-author` generic and self-contained.
- When an authoring skill designs evaluation prompts, start from the smallest
  plausible user request and keep evaluator-only knowledge in fixtures,
  assertions, and coverage metadata.
- Preserve user-named task operations, required terms, source ids, and artifact
  paths verbatim in at least one generated prompt. Minimal wording must not
  erase traceability by replacing a closed-set term with a synonym.
- Keep the core prompt-design workflow in `SKILL.md` and move the complete V1
  schema reference into focused progressive-disclosure references.
- Record prompt case kinds and task families in a sidecar
  `prompt-coverage.json` development artifact.
- Validate authored prompt corpora with a deterministic audit that checks
  prompt count, case kinds, task-family diversity, single-family concentration,
  prompt length, lexical similarity, and common workflow or evaluator leakage
  phrases.
- For a broad skill, default to at least four prompts across at least three task
  families, including naturalistic, generalization, and boundary coverage. A
  narrow deterministic skill may use one contract smoke plus one naturalistic
  case.

The coverage sidecar is a repository development and review artifact. It is not
part of the Skill Arena V1 runtime configuration schema.

## Consequences

- Skill-enabled runs no longer receive the historical benchmark answer through
  the skill bundle or base workspace.
- Maintained evaluations can prove coverage breadth explicitly instead of
  relying on prompt count as a proxy.
- Naturalistic prompts test whether a skill supplies the workflow it promises,
  while contract-smoke prompts remain available for deterministic script and
  exact-path checks.
- Exact task-vocabulary preservation improves evaluator traceability without
  disclosing assertions or prescribing the skill workflow.
- The static audit cannot prove semantic independence, so prompt and assertion
  review remains required.
