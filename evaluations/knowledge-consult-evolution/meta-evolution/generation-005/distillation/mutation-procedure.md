# Relevance-first facet-coverage mutation

## Frozen parent and evidence

- Parent candidate: `extractive-one-shot-answer`
- Parent skill tree SHA-256: `cb62d43009dac20f85da7a801ead6c707b83a20787412aa82076642da3974536`
- Feedback scope: the single immutable q018 generation-004 candidate trace
- Private qrels, other forward cases, and holdout cases remain unopened.

## Verified diagnosis

The parent emitted a syntactically and mechanically valid closed response with eight distinct authorities, but only five documents covered the six-document semantic floor. Inspection of the parent code and trace established four connected causes: `per_facet` was not enforced by the planner, alternatives joined by `or` were not decomposed, generic lexical overlaps counted as facet coverage, and source novelty preceded relevance in equal-coverage choices.

## Mutation

1. Copy the frozen parent without changing its canonical skill name.
2. Split explicit alternatives and separate interrogative clauses into bounded facets.
3. Add a fixed domain-neutral intent lexicon for auditability, risk, safety, mitigation, and mechanism language. Do not add corpus entities, case IDs, expected sources, qrels, or evaluator labels.
4. Pass `per_facet` into the support planner. For each facet, seal a distinct-authority floor up to the configured value and available validated authorities.
5. Rank new facet coverage and relevance before source novelty, while preserving deterministic tie breaks and the global source floor.
6. Recheck the effective per-facet floors during finalization.
7. Preserve the single-command terminal contract, read-only bundle behavior, exact evidence bindings, and fail-closed errors.

## Validation boundary

Run syntax checks, skill validation, deterministic synthetic unit tests, the local runtime smoke check, and a content-blind local compiler smoke against q018. These checks consume no model or Harbor calls and do not constitute development or holdout promotion evidence.
