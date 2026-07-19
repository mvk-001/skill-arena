# q018 trace distillation

This directory records a narrow, development-only response to the immutable q018 failure trace from generation 004. It preserves `extractive-one-shot-answer` in `../pareto-state.json` and realizes one child, `relevance-first-facet-coverage`, with the same canonical skill name, `consult-semantic-okf`.

The child is not promoted. The generated trace run uses `minSupport=1` only as speculative discovery evidence. Fresh evaluation must rerun the child across every frozen development case before archive ranking, and a separate unopened holdout is still required for promotion.

The patch is corpus-neutral: the skill bundle contains no case IDs, expected document identities, qrels, evaluator labels, or answer constants. It makes the existing `per_facet` option effective, splits explicit alternatives, adds a small generic intent lexicon, and ranks facet relevance before source novelty while retaining deterministic tie breaks and the terminal one-command contract.
