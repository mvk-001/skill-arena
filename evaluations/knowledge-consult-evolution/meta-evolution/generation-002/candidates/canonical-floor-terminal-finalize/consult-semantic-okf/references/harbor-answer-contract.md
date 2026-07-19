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
- all retrieval parameters, including the exact evidence clause and caller's explicit independent-source floor;
- ordered facet text; and
- the explicit source floor and question-derived dimensions; and
- ordered opaque supports, their source handles, dimension coverage, commitments, and bounded excerpts.
- the ordered compiler state, exact UTF-8 pack budget, and effective excerpt allowance.

Copy the emitted `draft_template`; do not synthesize its binding values. Source and support handles
are opaque. They must not be decoded, shortened, or recreated. Handle equality may be used only to
count distinct sources and choose supports that cover every declared dimension.

The semantic question and evidence clause are separate inputs. The compiler parses the exact
evidence clause deterministically, requires an explicit source minimum, and rejects a
`minimum_sources` value that does not equal it. It also refuses to lower any source floor already
present in the semantic question. The clause is committed without appending it to or rewriting the
retrieval question. A support plan must contain `target_sources` distinct source handles or fail.

The state-machine realization admits output only after `loaded`, `contracted`, `ranked`, `planned`,
and `packed` have advanced in order to `sealed`. When capacity remains it plans up to two extra
distinct-source reserves. The byte gate measures the same indented UTF-8 payload written by
`prepare`, including its trailing newline; a larger pack is invalid even if its evidence gates pass.

## Draft schema

The draft has exactly `question_id`, `question_sha256`, `parameters`, `support_pack_sha256`, `answer`,
and `evidence`. `answer` has exactly `summary` and `claims`. Keep the summary within 450 words and
the claim array within 64 items. Each claim has exactly `statement` and
`evidence_indices`.

The draft `evidence` array contains support ID strings, not evidence objects. Every listed support
must be used, every claim must cite at least one valid index, and duplicate indices or support IDs
are forbidden. Claim indices refer to positions in that draft array. The finalizer orders supports
by first use and remaps every claim index deterministically; callers do not hand-reorder the public
result. The retained handles must satisfy `breadth_contract.minimum_sources` and cover every
declared `dimension_id`; lowering the draft below either floor fails closed.

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

Treat a nonzero exit as a closed gate; never bypass validation by assembling public evidence
manually. If the question or any retrieval parameter changes, discard the old draft and support
pack. The exact evidence clause and explicit source minimum are sealed in both `parameters` and
`support_pack_sha256`, so changing either invalidates the old draft even when the semantic question
is unchanged.
