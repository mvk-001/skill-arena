# Holdout Validation

Use a small held-out slice to avoid overfitting the consolidation pool.

## Recommended pattern

- Keep the main trace pool for patch discovery.
- Keep a separate holdout slice (at least 20% of traces when possible) for final promotion checks.
- Use the same evaluator on baseline and consolidated skill.
- The holdout traces should be representative of the same task distribution as the discovery pool.

## Promotion rule

- Promote the consolidated patch set only if it improves or preserves the validated baseline on the holdout.
- If the holdout result is worse, keep the baseline and record the failed promotion with the holdout scores.
- When comparing, use the same fitness resolution rules as the evolution skill (see the fitness-design reference in `skill-arena-evolution`).

## When no holdout exists

- Record that the promotion used only the discovery pool.
- Lower confidence in the promoted update.
- Prefer conservative consolidation thresholds (higher `minSupport`).
- Do not claim the update is validated; say it is discovery-only and recommend re-evaluation on fresh traces.

## Decision rules

| Holdout available | Holdout result | Action |
| --- | --- | --- |
| Yes | Improved or equal | Promote the consolidated patch set |
| Yes | Worse | Reject; keep baseline and record failure |
| No | N/A | Promote with discovery-only confidence; raise minSupport |
