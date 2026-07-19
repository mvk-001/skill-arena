# Closed Harbor Answer Contract

## Authority model

TF-IDF scores, inferred dimensions, opaque source/support handles, ranks, and excerpts are derived
discovery artifacts. They are non-authoritative. Preparation never exposes a source ID, record ID,
path, evidence hash, or locator. The finalizer reopens the exact committed
`semantic/records.jsonl` row and hashes the complete record body selected by the closed locator
`{"kind":"record","target":"record.body"}`.

The bundle remains read-only. The compiler writes only to standard output unless the caller chooses
shell redirection outside the bundle.

## Support pack

`prepare` binds these values into `support_pack_sha256`:

- schema version;
- exact question ID and SHA-256 of the exact normalized question input;
- all retrieval parameters;
- ordered facet text; and
- the question-derived source floor and inferred dimensions; and
- ordered opaque supports, their source handles, dimension coverage, commitments, and bounded excerpts.

Copy the emitted `draft_template`; do not synthesize its binding values. Source and support handles
are opaque. They must not be decoded, shortened, or recreated. Handle equality may be used only to
count distinct sources and choose supports that cover every declared dimension.

## Draft schema

The draft has exactly `question_id`, `question_sha256`, `parameters`, `support_pack_sha256`, `answer`,
and `evidence`. `answer` has exactly `summary` and `claims`. Keep the summary within 450 words and
the claim array within 64 items. Each claim has exactly `statement` and
`evidence_indices`.

The draft `evidence` array contains support ID strings, not evidence objects. List a support at the
position where a claim first needs it. Every listed support must be used, every claim must cite at
least one valid index, and duplicate indices or support IDs are forbidden. The retained handles
must satisfy `breadth_contract.minimum_sources` and cover every declared `dimension_id`; lowering
the draft below either floor fails closed.

## Public result

`finalize` emits exactly:

1. `question_id`;
2. `answer`, with `summary` followed by `claims`; and
3. `evidence` in first-use order.

Each evidence row contains exactly `source_id`, `record_id`, `concept_path`, `source_path`,
`record_sha256`, `locator`, and `text_sha256`. The finalizer is the only component that materializes
the locator object: it verifies the committed ledger row, the non-empty `record.body` target, the
locator's exact keys and values, and the public field order immediately before emission. Do not edit
this output. A hand-transcribed locator, path, or hash invalidates the evidence binding.

## Failure handling

Treat a nonzero exit as a closed gate. Repair the draft or rerun `prepare`; never bypass validation
by assembling public evidence manually. If the question or any retrieval parameter changes,
discard the old draft and support pack. A changed source minimum or dimension phrase changes the
question hash and therefore also invalidates the pack.
