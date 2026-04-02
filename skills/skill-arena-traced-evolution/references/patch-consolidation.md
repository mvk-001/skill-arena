# Patch Consolidation

Promote repeated lessons, not isolated anecdotes.

Consolidation performs inductive reasoning over the patch pool: it mines
generalizable patterns from experience-specific patches, building a high-level
understanding of the domain. Recurring observations across diverse trajectories
are more likely to reflect systematic task properties and generalize to unseen
tasks. Conversely, edits appearing in only one or few patches are treated as
potentially idiosyncratic.

## Selection policy

- Group proposals by normalized patch id (format: `<kind>:<slugified-tag>`).
- Count unique supporting traces, not duplicate mentions inside one trace.
- Prefer patches supported by both `success` and `failure` evidence (`supportClass: "combined"`) over single-kind evidence.
- Require minimum support before promotion unless the task explicitly allows speculative patches.

## Minimum support

The default `minSupport` is `2`. This means a patch must be supported by at least
two independent traces before it is eligible for consolidation.

When to adjust:

- Raise `minSupport` when the trace pool is large (50+) and you want only high-confidence patches.
- Lower to `1` only when the trace pool is very small (under 5) and the task explicitly allows speculative consolidation.
- Keep at `2` for most workflows to avoid promoting one-off observations.

Pass `--min-support <N>` to `scripts/consolidate-patches.js` to override.

## Hierarchical merging

When the patch pool is large, use hierarchical merging instead of flat
aggregation. Group patches into batches, consolidate each batch, then
consolidate the batch results. The depth of the merge tree is
`ceil(log_B(|patches|))` where `B` is the merge batch size.

This mirrors Trace2Skill's log-depth merge approach, which:

- prevents any single merge step from handling too many patches
- enables the consolidator to deduplicate and abstract at each level
- produces better results than flat single-pass aggregation at scale

For small pools (under 50 patches), flat aggregation is sufficient.

## Conflict policy

- Use conflict groups to prevent contradictory edits from being promoted together.
- Each patch template declares a `conflictGroup` (e.g., `output-contract`, `scope-discipline`).
- If two patches share the same conflict group, keep the one with higher support.
- If support ties, prefer the lexicographically smaller patch id for determinism.
- A conflict group can have at most one winner in the accepted set.

## Routing policy

- High-prevalence general rules belong in `SKILL.md`.
- Low-support but potentially useful observations belong in `references/*` files.
- Niche quirks, edge cases, and format-specific heuristics are not discarded
  but routed into supplementary reference documents. This mirrors established
  skill-design practice: procedural guidance flows from general to case-specific.

## Promotion policy

- Consolidate into one patch set for one skill.
- Validate that all target paths remain inside the skill bundle (allowed prefixes: `SKILL.md`, `references/`, `scripts/`, `agents/openai.yaml`).
- Hold out some traces or benchmark rows when possible before promotion.
- The final consolidated set should be small and coherent, not an exhaustive catalog of every observed pattern.
