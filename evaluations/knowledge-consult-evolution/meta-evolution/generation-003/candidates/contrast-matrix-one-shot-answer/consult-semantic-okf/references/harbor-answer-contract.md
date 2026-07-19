# Closed Harbor Answer Contract

## One-shot authority model

`answer` is the only closed-answer subcommand. It validates the published snapshot, ranks bounded
supports, composes a complete draft internally, revalidates the committed ledger rows, and emits
the final public result in one process. There is no model-authored draft on this route.

TF-IDF scores, inferred dimensions, source/support handles, ranks, excerpts, and generated prose
are derived rather than authoritative. For a bounded two-arm request the compiler constructs an
arm-by-dimension matrix and emits paired claims only when both cells have direct record text and
distinct authority identities. Structured text is admitted only when its normalized value occurs
in `record.body`; compact body text is the conservative fallback. A request without a bounded
two-arm comparison, or one whose matrix lacks any positively oriented and non-negated cell pair,
discards every partial pair and uses the same direct-text rule without matrix pairing.

## Verifiable record preference

A record is claim-ready only when `attributes.interpretation` is non-empty and occurs in the body,
`attributes.review_state` is `reviewed`, and `attributes.confidence` is present. The preferred pool
must contain enough distinct authority identities to satisfy the target breadth. Authority identity
is generic and deterministic: `paper_iri`, then `pdf_sha256`, then `source_id`. If the preferred pool
is too small or cannot cover every inferred dimension, planning retries once against all validated
records. The sealed support-pack digest records which policy and fallback reason were used.

## Bound request and evidence

The exact question ID, question hash, exact evidence clause, explicit source minimum, retrieval
parameters, selection policy, inferred matrix cells, and ordered supports are committed in
`support_pack_sha256`. The evidence clause must state an unambiguous positive independent-source
minimum equal to `minimum_sources`; the caller cannot lower a floor present in the question.

The internal draft has exactly `question_id`, `question_sha256`, `parameters`,
`support_pack_sha256`, `answer`, and `evidence`. Every selected support is used. Claims cite valid,
unique indices; first-use order is canonicalized before emission. Distinct authority and matrix-cell
coverage are checked again during finalization. A matrix claim never emits unless every dimension
has both arms; otherwise the compiler atomically switches to the conservative extractive closure.

## Public result and failure handling

Successful stdout has exactly `question_id`, `answer`, and `evidence`. Every evidence row has
exactly `source_id`, `record_id`, `concept_path`, `source_path`, `record_sha256`, `locator`, and
`text_sha256`; the locator is exactly `{"kind":"record","target":"record.body"}` and is
materialized only after its ledger commitment is revalidated.

Successful stdout is terminal. A command or execution-tool failure is also terminal: preserve the
first failure, make no retry or fallback tool call, do not inspect knowledge, and never assemble
public evidence manually.
