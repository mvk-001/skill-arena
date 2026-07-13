# Operator Genome Schema

Use this generation document:

```json
{
  "generationId": "generation-001",
  "operators": [
    {
      "operatorId": "operator-00",
      "instruction": "Tighten the exact-output contract without adding task-specific facts.",
      "parentOperatorIds": [],
      "origin": "seed"
    }
  ],
  "candidates": [
    {
      "candidateId": "candidate-00",
      "operatorId": "operator-00",
      "parentCandidateId": "baseline",
      "parentFitness": 0.6,
      "fitness": 0.75,
      "hardGatesPassed": true,
      "complexityDelta": 4,
      "evaluationCost": 4
    }
  ]
}
```

IDs must be unique. Fitness values must be in `0..1`. Each candidate references
one declared operator. Keep the operator instruction general, attributable,
and free of benchmark answers.

