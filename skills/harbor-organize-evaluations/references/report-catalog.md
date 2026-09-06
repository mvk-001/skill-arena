# Report discovery and skill coverage

Use this procedure when publishing results or when the user wants to find
reports, see evaluated skills, or inspect their metrics. A navigation catalog
may repeat reviewed aggregate values verbatim; it must not score raw trials,
normalize rewards, calculate rankings, or decide promotion.

## Prepare the catalog

1. Locate existing public report indexes and reviewed aggregate tables. For
   historical studies, use their explicitly published summaries. Do not crawl
   ignored native jobs, sealed tasks, private reports, or candidate directories
   to infer results. Inventory only the evidence actually reviewed and state
   the inventory date and scope.
2. Create one project-level Markdown entry point, normally
   `docs/evaluation-reports.md`, linked from the project README and documentation
   index. Preserve original report paths and immutable studies. Use relative
   links so the catalog works in a checkout and on the repository host.
3. Separate evaluated target skills from orchestration/evolution methods. An
   organizer, runner, or optimizer owning a stage does not mean its own quality
   has been evaluated. Installation, tests, candidate creation, protocol sealing,
   and completed execution do not establish a measured improvement.
4. Record a report directory: title, study/date, question, evidence maturity,
   and links to the authoritative report and its published machine-readable
   summary or table. Prefer a single obvious link per report over copied reports.
5. Provide a target-skill view with one row per evaluated variant, dataset and
   split, and a method-coverage view that explicitly marks missing evidence.
   Carry metric names, values, units, direction, sample size and denominator,
   baseline, comparison profile, uncertainty, costs, and acceptance outcome
   exactly as reported. State unavailable fields rather than inferring them.
   Link the source of every numeric block. Reference the report's frozen
   identity/digest; never imply that its score belongs to the current installation.
6. Distinguish planned, exploratory, development-evaluated, independently
   verified, rejected, and unavailable outcomes using the source's actual claim.
   Keep rejected-child results separate from reused baseline results. Failed
   required gates cannot be hidden by a positive diagnostic utility. A single
   task or repeated attempts do not imply independent sample breadth.

## Publication and refresh

For new organizer-managed studies, ask the owning reporter to produce reviewed
aggregate `publication/tables/<id>.table.csv`, `.table.tsv`, or `.table.md` files.
Use the existing `verify --render`, stage, then `verify` workflow to refresh and
check the generated publication indexes. Do not hand-edit generated indexes or
extend the study Git allowlist to include raw reports or a custom dashboard.
The project-level catalog links these publications; it is outside the study.

Before exposing validation/holdout aggregates, finish the frozen acceptance
process and confirm the projection is approved for publication. Even a binary
outcome must not return to the optimizer for another selection in that study.
Do not expose task identifiers, filenames, prompts, responses, reasoning,
diagnostics, private cohort details, credentials, or machine-local paths.
Historical public evidence does not authorize publishing newly private material.

On each publication, update the catalog's date and report/skill rows, retaining
prior versions and links. Do not silently replace a failed run with a later
success. Keep incompatible profiles in separate blocks and avoid a global best
skill or method ranking. Metrics and promotion interpretation remain owned by
the native reporter and protocol.

Verify all links, copied aggregate values, variant identities, split labels,
missing-value handling, and baseline reuse against the source. Check that no
sealed historical evidence changed. Run the project's documentation and bundle
checks. No model calls or new evaluations are needed to organize existing reports.
