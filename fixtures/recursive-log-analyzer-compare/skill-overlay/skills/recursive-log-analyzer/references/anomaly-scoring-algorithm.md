# Anomaly Scoring Algorithm

The analyzer computes a deterministic weighted score using regex keyword counts.

## Signals and regex patterns

- `error`: `\\berror\\b`
- `warning`: `\\bwarn(?:ing)?\\b`
- `exception`: `\\bexception\\b`
- `traceback`: `\\btraceback\\b`
- `failure`: `\\bfail(?:ed|ure)?\\b`
- `timeout`: `\\btime(?:d)?\\s*out\\b|\\btimeout\\b`

Matching is case-insensitive and evaluated against normalized lowercase segment text.

## Weights

- `error`: 4
- `warning`: 2
- `exception`: 5
- `traceback`: 6
- `failure`: 4
- `timeout`: 3

## Score formula

For each segment:
`anomaly_score = sum(pattern_counts[signal] * weight[signal])`

## Recursive behavior

- A leaf score is computed directly from that leaf's text.
- A parent node score is recomputed from merged child `pattern_counts`.
- `summary.total_anomaly_score` is the sum of leaf node scores.

## Interpretation guidance

- High score + narrow `line_count` usually indicates concentrated failures.
- High score + broad `line_count` often indicates repeated systemic issues.
- Use `pattern_counts` to route ownership:
  - `traceback`/`exception`: likely code-path defects.
  - `timeout`: performance or dependency bottlenecks.
  - `warning`: lower urgency unless volume is large.
