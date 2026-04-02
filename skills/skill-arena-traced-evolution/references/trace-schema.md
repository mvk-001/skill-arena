# Trace Schema

Use one JSON file per trace.

## Required fields

- `traceId`: unique string identifier for this trace
- `outcome`: `success` or `failure`
- `issues`: array of normalized issue tags (may be empty)
- `strengths`: array of normalized strength tags (may be empty)

## Optional fields

- `benchmarkId`: the benchmark config that produced this trace
- `promptId`: the specific prompt row within the benchmark
- `notes`: free-form string with human-readable observations
- `filesTouched`: array of file paths the agent modified
- `score`: numeric score in the range `0..1` when available

## Example

```json
{
  "traceId": "run-2026-03-15-codex-mini-prompt-01",
  "outcome": "failure",
  "benchmarkId": "skill-arena-config-author",
  "promptId": "scaffold-compare",
  "issues": ["missing-output-contract", "scope-drift"],
  "strengths": ["strong-scope-discipline"],
  "notes": "Agent produced valid YAML but omitted the evaluation.assertions section entirely.",
  "filesTouched": ["deliverables/compare.yaml"],
  "score": 0.33
}
```

## Tag guidelines

- Keep issue and strength tags short and reusable across traces.
- Use kebab-case normalized tags such as `missing-output-contract` or `strong-scope-discipline`.
- Tags are slugified on import: spaces, capitals, and special characters are normalized automatically.
- Empty strings and whitespace-only tags are silently dropped during normalization.
- Treat traces as immutable once imported into a run.
- Keep holdout traces in a separate folder or mark them explicitly before import.

## Asymmetric analysis

Trace2Skill uses different analysis strategies for different trace outcomes:

- **Failure traces**: benefit from agentic multi-turn analysis. The analyst
  should inspect files, compare outputs, and iteratively narrow the root cause.
  If no verified causal explanation is found, the trace is excluded from the
  patch pool. This quality gate ensures failure patches are grounded in
  verified failure causes, not surface-level guesses.
- **Success traces**: single-pass analysis is sufficient. Clean the trace,
  identify behavior patterns, and propose reinforcement patches. No interactive
  diagnosis is needed because the outcome is already correct.

This asymmetry is motivated by the observation that errors are substantially
harder to diagnose than successes. Agentic error analysis produces more
transferable patches because it anchors each patch to a verified failure
mechanism rather than over-attributing surface symptoms.

## Known issue and strength tags

The patch library recognizes these tags with targeted patch templates:

Issues: `missing-output-contract`, `weak-baseline`, `scope-drift`, `missing-holdout`, `missing-trace-schema`, `shallow-error-analysis`, `verbose-skill-md`, `missing-hard-gates`, `flaky-benchmark-tolerance`

Strengths: `strong-scope-discipline`, `strong-output-contract`, `strong-holdout-validation`, `strong-trace-labeling`, `strong-baseline-preservation`, `strong-deterministic-ordering`

Unrecognized tags still generate generic patch proposals; they just lack targeted templates.
