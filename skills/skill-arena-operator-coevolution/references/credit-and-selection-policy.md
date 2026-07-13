# Credit And Selection Policy

## Candidate score

If hard gates pass, use the declared fitness. Otherwise use zero. Candidate
improvement is effective child fitness minus parent fitness.

## Operator score

Aggregate across an operator's children:

- `meanImprovement`: mean child improvement
- `successRate`: fraction with positive improvement
- `bestImprovement`: maximum child improvement
- `trialCount`: number of evaluated children

Rank by mean improvement, success rate, best improvement, trial count, then
operator ID. Do not add an exploration bonus to the published score; expose
trial count so a caller can deliberately reserve exploration slots.

## Survivor policy

Keep two skill candidates and two operators by default. Copy operator survivors
unchanged. Breed remaining operator slots with alternating mutation and
crossover plans. The plans are deterministic orchestration records; an editing
agent must author and validate the actual child instruction.

## Promotion policy

Operator ranking chooses future mutation instructions. It never promotes a
skill. Promote only the final skill candidate that passes the unchanged
development and holdout gates.

