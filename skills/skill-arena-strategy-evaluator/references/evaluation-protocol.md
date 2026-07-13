# Evaluation Protocol

## Evidence layers

Keep three claims separate:

1. **Contract tests** prove scripts implement their declared deterministic
   policies.
2. **Mechanism replay** shows which candidate each policy selects on a frozen
   evidence landscape and reveals contextual strengths or failure modes.
3. **Live agent evaluation** measures end-to-end task performance with repeated
   executions, isolated profiles, and observable assertions.

## Corpus sampling

Stratify subjects by:

- small, medium, and large `SKILL.md`
- no-script, script-light, and script-heavy bundles
- reference-led and asset-led bundles
- deterministic conversion, evaluative, generative, and orchestration tasks

Record excluded subjects and the reason. A catalog is not itself an evaluation.

## Replay schema

Each scenario declares a real corpus subject plus a controlled evidence
landscape:

```json
{
  "scenarioId": "converter-scalar",
  "subjectId": "animated-svg-to-gif",
  "baselineCandidateId": "baseline",
  "minTraceSupport": 2,
  "traces": [{ "traceId": "t1", "tags": ["exact-output"] }],
  "candidates": [
    {
      "candidateId": "baseline",
      "devScore": 0.7,
      "holdoutScore": 0.68,
      "caseScores": { "natural": 0.7, "boundary": 0.6 },
      "operatorId": "control",
      "parentFitness": 0.7,
      "patchTags": [],
      "complexityDelta": 0,
      "evaluationCost": 2
    }
  ]
}
```

The evidence landscape is a test fixture for strategy behavior. It is not a
claim that the listed candidate scores were produced by the source repository
unless linked raw live artifacts prove that fact.

## Live comparison

- Keep prompts identical across profiles.
- Use at least four prompts across at least three task families for broad
  strategy skills.
- Repeat cells when quota permits; one execution is a smoke, not reliability
  evidence.
- Separate development cases from final holdout prompts.
- Report pass rate, token use, latency, errors, and prompt-level breakdown.

## Ranking

Publish per-metric tables first. A weighted score is acceptable only when the
weights are declared and normalized. Include a sensitivity note when a small
weight change can alter the winner.

