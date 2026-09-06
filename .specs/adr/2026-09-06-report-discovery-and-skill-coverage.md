# Report discovery and skill coverage

Date: 2026-09-06

Status: Accepted

## Context

Published reports are spread across immutable studies. Readers need one place
to find evaluated target skills, method observations, metrics, and missing
evidence without mistaking workflow contracts for demonstrated quality.

## Decision

Maintain a project-level navigation catalog at
[`docs/evaluation-reports.md`](../../docs/evaluation-reports.md), linked from the
root README and documentation index. It may transcribe reviewed published
aggregates with source links, exact meaning, and limitations. It does not
compute rewards or replace source reports. Keep target variants, method
observations, and contract-only coverage distinct.

The organizer owns the reusable
[catalog procedure](../../skills/harbor-organize-evaluations/references/report-catalog.md).
New studies retain the existing publication allowlist and generated indexes;
their reviewed aggregate tables are linked from the catalog. Private evidence
and raw jobs are never harvested for report discovery. Historical studies stay
unchanged, and no evolution skill's executable contract changes.

## Consequences

Readers get direct report links, per-variant metrics, and explicit unavailable
results. The catalog is a dated human-maintained view and must be checked against
sources when refreshed; it cannot establish that no unpublished run exists.
Metrics apply only to the evaluated identity and profile, and private final
results cannot become feedback for continued optimization in the same study.
