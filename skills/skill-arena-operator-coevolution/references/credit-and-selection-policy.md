# Credit And Selection Policy

## Candidate score

If hard gates pass, use the declared fitness. Otherwise use zero. Candidate
improvement is effective child fitness minus parent fitness.

Rank final candidates by:

1. effective child fitness
2. child improvement over parent
3. lower complexity delta
4. lower evaluation cost
5. candidate ID

Do not discount a child because its parent was weak. The weak parent increases
the measured operator improvement; it is not a risk penalty on the child. If
cross-case robustness must affect final selection, encode it in the frozen
fitness rule before the generation starts rather than adding a post-hoc Pareto
or holdout proxy.

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
