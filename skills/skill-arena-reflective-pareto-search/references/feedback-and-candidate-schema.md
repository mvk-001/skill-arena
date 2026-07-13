# Feedback And Candidate Schema

Use one JSON document for one frozen development benchmark.

```json
{
  "benchmarkId": "example-skill-development",
  "cases": [
    { "caseId": "natural", "weight": 1 },
    { "caseId": "boundary", "weight": 1 }
  ],
  "candidates": [
    {
      "candidateId": "baseline",
      "parentIds": [],
      "caseScores": { "natural": 0.8, "boundary": 0.5 },
      "complexityDelta": 0,
      "evaluationCost": 2,
      "feedback": [
        {
          "caseId": "boundary",
          "outcome": "failure",
          "diagnosis": "The output-path rule is ambiguous.",
          "evidence": "The requested file was not created."
        }
      ]
    }
  ]
}
```

Rules:

- Case and candidate IDs must be unique non-empty strings.
- Every candidate must provide every declared case score in `0..1`.
- `complexityDelta` is relative to the baseline and may be negative.
- `evaluationCost` is a nonnegative count or normalized cost.
- Feedback must name a declared case and include non-empty diagnosis and
  evidence strings.
- Keep holdout scores outside this document until the promotion gate. They
  must not influence archive construction or parent selection.

