# Holdout Validation

Use a small held-out slice to avoid overfitting the consolidation pool.

## Recommended pattern

- Keep the main trace pool for patch discovery.
- Keep a separate holdout slice for final promotion checks.
- Use the same evaluator on baseline and consolidated skill.

## Promotion rule

- Promote the consolidated patch set only if it improves or preserves the validated baseline.
- If the holdout result is worse, keep the baseline and record the failed promotion.

## When no holdout exists

- Record that the promotion used only the discovery pool.
- Lower confidence in the promoted update.
- Prefer conservative consolidation thresholds.
