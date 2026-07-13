# Pareto And Merge Policy

## Dominance

Candidate A dominates candidate B when A is no worse on every declared case
and strictly better on at least one. When score vectors are identical, prefer
the lower complexity delta, then lower evaluation cost, then candidate ID.

Do not average scores before dominance. Averaging can discard a candidate that
is the only strong stepping stone for one task family.

## Case ownership

For each case, assign ownership to every archive member tied for its best
score. Case ownership explains why a candidate remains useful and supplies the
evidence for complementary merges.

## Robust deployment choice

When one candidate must be deployed, choose from the archive by:

1. highest worst-case score
2. highest mean case score
3. lowest complexity delta
4. lowest evaluation cost
5. lexicographically smallest candidate ID

## Merge planning

Plan a merge only when two candidates jointly own more cases than either owns
alone. Prefer the pair with the largest ownership union, then the least overlap,
then the lowest combined complexity. Record the exact contribution expected
from each parent. A merge is a new candidate and must be evaluated on all cases.

