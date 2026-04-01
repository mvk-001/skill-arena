# Patch Consolidation

Promote repeated lessons, not isolated anecdotes.

## Selection policy

- Group proposals by normalized patch id.
- Count unique supporting traces, not duplicate mentions inside one trace.
- Prefer patches supported by both `success` and `failure` evidence.
- Require minimum support before promotion unless the task explicitly allows speculative patches.

## Conflict policy

- Use conflict groups to prevent contradictory edits from being promoted together.
- If two patches conflict, keep the one with higher support.
- If support ties, prefer the lexicographically smaller patch id for determinism.

## Promotion policy

- Consolidate into one patch set for one skill.
- Validate that all target paths remain inside the skill bundle.
- Hold out some traces or benchmark rows when possible before promotion.
