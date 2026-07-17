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
- Freeze one fitness-resolution rule before evaluating the holdout and apply it
  unchanged to baseline and consolidated skill. Prefer, in order: an explicit
  numeric `fitness`, a numeric `score`, a summary pass or success rate,
  `successes / (successes + failures)`, or the mean of per-result scores or
  success values. Normalize to `0..1` when practical.
- Give any hard-gate failure fitness `0`. For equal primary fitness, prefer the
  simpler bundle, then lower evaluation cost, then a deterministic identifier.
- Use identical evaluator inputs, request counts, cache policy, and runtime
  conditions for both sides. If repeated baseline runs are materially noisy,
  stabilize the evaluator before making a promotion decision.

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
