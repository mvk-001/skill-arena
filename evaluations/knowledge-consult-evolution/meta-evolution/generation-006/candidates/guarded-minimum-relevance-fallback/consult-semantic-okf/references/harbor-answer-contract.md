# Closed Harbor Answer Contract

## One-shot authority model

`answer` is the only closed-answer subcommand. It validates the published snapshot, ranks bounded
supports, composes a complete draft internally, revalidates the committed ledger rows, and emits
the final public result in one process. There is no model-authored draft on this route.

TF-IDF scores, inferred dimensions, source/support handles, ranks, excerpts, and generated prose
are derived rather than authoritative. Every claim statement is extractive: the compiler first
uses `attributes.interpretation`, `attributes.summary`, or `attributes.description` only when the
normalized text occurs in `record.body`; otherwise it uses bounded text directly from that body or
the committed excerpt. The bundle remains read-only, and the compiler writes only to stdout.

## Verifiable record preference

A record is claim-ready only when `attributes.interpretation` is non-empty and occurs in the body,
`attributes.review_state` is `reviewed`, and `attributes.confidence` is present. The preferred pool
must contain enough distinct authority identities to satisfy the target breadth. Authority identity
is generic and deterministic: `paper_iri`, then `pdf_sha256`, then `source_id`. If the preferred pool
is too small or cannot cover every inferred dimension, planning retries once against all validated
records. The sealed support-pack digest records which policy and fallback reason were used.

## Bound request and evidence

The exact question ID, question hash, exact evidence clause, explicit source minimum, retrieval
parameters, selection policy, inferred dimensions, and ordered supports are committed in
`support_pack_sha256`. The evidence clause must state an unambiguous positive independent-source
minimum equal to `minimum_sources`; the caller cannot lower a floor present in the question.

For an explicit multi-source floor, the planner treats the stated count as a lower bound rather
than an assumed retrieval target. It retains the extractive parent's dimension-first,
positive-score ranking and adds a proportional reserve of distinct authorities, bounded by the
existing support limit. This reserve cannot displace or reorder the core selection and introduces
no task, corpus, or evaluator vocabulary; it only guards the mechanical floor against weak lexical
matches among otherwise valid authorities.

The internal draft has exactly `question_id`, `question_sha256`, `parameters`,
`support_pack_sha256`, `answer`, and `evidence`. Every selected support is used. Claims cite valid,
unique indices; first-use order is canonicalized before emission. Distinct authority and dimension
coverage are checked again during finalization.

## Public result and failure handling

Successful stdout has exactly `question_id`, `answer`, and `evidence`. Every evidence row has
exactly `source_id`, `record_id`, `concept_path`, `source_path`, `record_sha256`, `locator`, and
`text_sha256`; the locator is exactly `{"kind":"record","target":"record.body"}` and is
materialized only after its ledger commitment is revalidated.

Successful stdout is terminal. A command or execution-tool failure is also terminal: preserve the
first failure, make no retry or fallback tool call, do not inspect knowledge, and never assemble
public evidence manually.
